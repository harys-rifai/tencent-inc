const express = require('express');
const path = require('path');
const { query } = require('./db');
const { connectRedis, setCache, getCache, deleteCache } = require('./cache');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// ── Validation ──────────────────────────────────────────────────────────────
const validateInventory = (data) => {
  const errors = [];
  if (data.port && (isNaN(data.port) || data.port < 1 || data.port > 65535))
    errors.push('Port must be a valid number between 1 and 65535');
  if (data.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip))
    errors.push('IP must be a valid IPv4 address');
  return errors;
};

const validateTask = (data) => {
  const errors = [];
  if (!data.title || !data.title.trim()) errors.push('Title is required');
  if (data.status && !['todo','in-progress','done'].includes(data.status))
    errors.push('Status must be todo, in-progress, or done');
  if (data.priority && !['low','medium','high'].includes(data.priority))
    errors.push('Priority must be low, medium, or high');
  return errors;
};

// ── Pagination helper ────────────────────────────────────────────────────────
const paginate = (req) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

const paginatedResult = (rows, total, page, limit) => ({
  data:  rows,
  total: parseInt(total),
  page,
  limit,
  pages: Math.ceil(parseInt(total) / limit)
});

// ── Cache key helpers (clear all inventory pages on mutation) ────────────────
const INV_CACHE_PREFIX = 'inv_';
const invCacheKey = (page, limit) => `${INV_CACHE_PREFIX}p${page}_l${limit}`;

// ── Redis connect ────────────────────────────────────────────────────────────
connectRedis().catch(console.error);

// ── DB init ──────────────────────────────────────────────────────────────────
const initDB = async () => {
  try {
    // Tables
    await query(`
      CREATE TABLE IF NOT EXISTS invschema.inventory (
        id         SERIAL PRIMARY KEY,
        type       VARCHAR(100),
        appreff    VARCHAR(100),
        ip         INET,
        port       INTEGER,
        version    VARCHAR(50),
        active     BOOLEAN DEFAULT TRUE,
        user_name  VARCHAR(100),
        password   VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS invschema.users (
        id         SERIAL PRIMARY KEY,
        username   VARCHAR(100) UNIQUE,
        password   VARCHAR(100),
        role       VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS invschema.tasks (
        id          SERIAL PRIMARY KEY,
        title       VARCHAR(255) NOT NULL,
        description TEXT,
        status      VARCHAR(20)  DEFAULT 'todo',
        priority    VARCHAR(20)  DEFAULT 'medium',
        due_date    DATE,
        assigned_to VARCHAR(100),
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes — inventory
    await query(`CREATE INDEX IF NOT EXISTS idx_inv_ip      ON invschema.inventory(ip)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inv_type    ON invschema.inventory(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inv_active  ON invschema.inventory(active)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inv_appreff ON invschema.inventory(appreff)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_inv_created ON invschema.inventory(created_at DESC)`);

    // Indexes — tasks
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_status   ON invschema.tasks(status)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_priority ON invschema.tasks(priority)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_due      ON invschema.tasks(due_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_tasks_created  ON invschema.tasks(created_at DESC)`);

    // Indexes — users
    await query(`CREATE INDEX IF NOT EXISTS idx_users_username ON invschema.users(username)`);

    console.log('Database initialized with indexes');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDB();

// ════════════════════════════════════════════════════════════════════════════
//  INVENTORY ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /inventory/stats  (dashboard counters — no pagination)
app.get('/inventory/stats', async (req, res) => {
  try {
    const cached = await getCache('inv_stats');
    if (cached) return res.json(cached);

    const r = await query(`
      SELECT
        COUNT(*)                          AS total,
        COUNT(*) FILTER (WHERE active)    AS active,
        COUNT(*) FILTER (WHERE NOT active) AS inactive
      FROM invschema.inventory
    `);
    const stats = {
      total:    parseInt(r.rows[0].total),
      active:   parseInt(r.rows[0].active),
      inactive: parseInt(r.rows[0].inactive)
    };
    await setCache('inv_stats', stats, 120);
    res.json(stats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /inventory?page&limit
app.get('/inventory', async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const cacheKey = invCacheKey(page, limit);

    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [countRes, dataRes] = await Promise.all([
      query('SELECT COUNT(*) FROM invschema.inventory'),
      query('SELECT * FROM invschema.inventory ORDER BY id LIMIT $1 OFFSET $2', [limit, offset])
    ]);

    const result = paginatedResult(dataRes.rows, countRes.rows[0].count, page, limit);
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /inventory/:id
app.get('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cached = await getCache(`inv_item_${id}`);
    if (cached) return res.json(cached);

    const result = await query('SELECT * FROM invschema.inventory WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    await setCache(`inv_item_${id}`, result.rows[0], 300);
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /inventory
app.post('/inventory', async (req, res) => {
  try {
    const { type, appreff, ip, port, version, active, user_name, password } = req.body;
    const errors = validateInventory(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      'INSERT INTO invschema.inventory (type,appreff,ip,port,version,active,user_name,password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [type, appreff, ip, port, version, active, user_name, password]
    );
    await deleteCache('inv_stats');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /inventory/:id
app.put('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, appreff, ip, port, version, active, user_name, password } = req.body;
    const errors = validateInventory(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      'UPDATE invschema.inventory SET type=$1,appreff=$2,ip=$3,port=$4,version=$5,active=$6,user_name=$7,password=$8,updated_at=NOW() WHERE id=$9 RETURNING *',
      [type, appreff, ip, port, version, active, user_name, password, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    await deleteCache(`inv_item_${id}`);
    await deleteCache('inv_stats');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /inventory/:id
app.delete('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM invschema.inventory WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    await deleteCache(`inv_item_${id}`);
    await deleteCache('inv_stats');
    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  TASK ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /tasks?page&limit&status&priority
app.get('/tasks', async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const { status, priority } = req.query;

    const cacheKey = `tasks_p${page}_l${limit}_s${status||''}_pr${priority||''}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const conditions = [];
    const params     = [];
    if (status)   { params.push(status);   conditions.push(`status = $${params.length}`); }
    if (priority) { params.push(priority); conditions.push(`priority = $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM invschema.tasks ${where}`, params),
      query(
        `SELECT * FROM invschema.tasks ${where} ORDER BY
           CASE status WHEN 'in-progress' THEN 1 WHEN 'todo' THEN 2 ELSE 3 END,
           due_date ASC NULLS LAST, id
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      )
    ]);

    const result = paginatedResult(dataRes.rows, countRes.rows[0].count, page, limit);
    await setCache(cacheKey, result, 60);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /tasks/board  — all tasks grouped by status (no pagination, for kanban)
app.get('/tasks/board', async (req, res) => {
  try {
    const cached = await getCache('tasks_board');
    if (cached) return res.json(cached);

    const r = await query(`SELECT * FROM invschema.tasks ORDER BY due_date ASC NULLS LAST, id`);
    const board = { todo: [], 'in-progress': [], done: [] };
    r.rows.forEach(t => { if (board[t.status]) board[t.status].push(t); });
    await setCache('tasks_board', board, 60);
    res.json(board);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /tasks/timeline  — all tasks with due_date, ordered by due_date
app.get('/tasks/timeline', async (req, res) => {
  try {
    const cached = await getCache('tasks_timeline');
    if (cached) return res.json(cached);

    const r = await query(`
      SELECT * FROM invschema.tasks
      ORDER BY due_date ASC NULLS LAST, created_at DESC
    `);
    await setCache('tasks_timeline', r.rows, 60);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /tasks
app.post('/tasks', async (req, res) => {
  try {
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const errors = validateTask(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      `INSERT INTO invschema.tasks (title,description,status,priority,due_date,assigned_to)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [title, description, status || 'todo', priority || 'medium', due_date || null, assigned_to || null]
    );
    await deleteCache('tasks_board');
    await deleteCache('tasks_timeline');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /tasks/:id
app.put('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status, priority, due_date, assigned_to } = req.body;
    const errors = validateTask(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      `UPDATE invschema.tasks
       SET title=$1, description=$2, status=$3, priority=$4, due_date=$5, assigned_to=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title, description, status, priority, due_date || null, assigned_to || null, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    await deleteCache('tasks_board');
    await deleteCache('tasks_timeline');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /tasks/:id
app.delete('/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM invschema.tasks WHERE id=$1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Task not found' });

    await deleteCache('tasks_board');
    await deleteCache('tasks_timeline');
    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  USER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /users?page&limit
app.get('/users', async (req, res) => {
  try {
    const { page, limit, offset } = paginate(req);
    const cacheKey = `users_p${page}_l${limit}`;
    const cached = await getCache(cacheKey);
    if (cached) return res.json(cached);

    const [countRes, dataRes] = await Promise.all([
      query('SELECT COUNT(*) FROM invschema.users'),
      query('SELECT id,username,role,created_at FROM invschema.users ORDER BY id LIMIT $1 OFFSET $2', [limit, offset])
    ]);

    const result = paginatedResult(dataRes.rows, countRes.rows[0].count, page, limit);
    await setCache(cacheKey, result, 300);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const result = await query(
      'INSERT INTO invschema.users (username,password,role) VALUES ($1,$2,$3) RETURNING id,username,role,created_at',
      [username, password, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM invschema.users WHERE id=$1', [id]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Auth ─────────────────────────────────────────────────────────────────────
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await query(
      'SELECT * FROM invschema.users WHERE username=$1 AND password=$2', [username, password]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));