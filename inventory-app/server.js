const express = require('express');
const path = require('path');
const { query } = require('./db');
const { connectRedis, setCache, getCache, deleteCache, deleteCachePattern } = require('./cache');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

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

// ── CSV export helper ─────────────────────────────────────────────────────────
const toCSV = (rows) => {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const csvRows = [];
  csvRows.push(headers.join(','));
  for (const row of rows) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    });
    csvRows.push(values.join(','));
  }
  return csvRows.join('\n');
};

// ── Error logging helper ──────────────────────────────────────────────────────
const logError = async (err, context = {}) => {
  try {
    await query(`
      INSERT INTO invschema.error_logs
        (level, message, stack, source, route, method, user_id, ip_address, user_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      context.level || 'error',
      context.message || err.message || String(err),
      context.stack || (err.stack || null),
      context.source || 'server',
      context.route || null,
      context.method || null,
      context.user_id || null,
      context.ip_address || null,
      context.user_agent || null,
      context.metadata ? JSON.stringify(context.metadata) : null
    ]);
  } catch (logErr) {
    console.error('Failed to log error:', logErr);
  }
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
const { runMigrations } = require('./migrations/runner');

const initDB = async () => {
  try {
    // Run migrations instead of hardcoded table creation
    await runMigrations();
    console.log('Database initialized with migrations');
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
     res.status(500).json({ error: 'Internal server error' });
   }
});

// POST /inventory
app.post('/inventory', async (req, res) => {
  try {
    const { type, appreff, ip, port, version, active, stage, note, user_name, password } = req.body;
    const errors = validateInventory(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      'INSERT INTO invschema.inventory (type,appreff,ip,port,version,active,stage,note,user_name,password) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [type, appreff, ip, port, version, active, stage || 'dev', note || null, user_name, password]
    );
    await deleteCache('inv_stats');
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    await logError(err, {
      source: 'inventory',
      route: req.path,
      method: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent')
    });
     res.status(500).json({ error: 'Internal server error' });
   }
 });

 // PUT /inventory/:id
app.put('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, appreff, ip, port, version, active, stage, note, user_name, password } = req.body;
    const errors = validateInventory(req.body);
    if (errors.length > 0) return res.status(400).json({ errors });

    const result = await query(
      `UPDATE invschema.inventory SET
        type=$1, appreff=$2, ip=$3, port=$4, version=$5,
        active=$6, stage=$7, note=$8, user_name=$9, password=$10,
        updated_at=NOW()
       WHERE id=$11 RETURNING *`,
      [type, appreff, ip, port, version, active, stage || 'dev', note || null, user_name, password, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Item not found' });

    await deleteCache(`inv_item_${id}`);
    await deleteCache('inv_stats');
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    await logError(err, {
      source: 'inventory',
      route: req.path,
      method: req.method,
      ip_address: req.ip || req.connection.remoteAddress,
      user_agent: req.get('User-Agent')
    });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
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
    await deleteCachePattern('users_*');
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
    await deleteCachePattern('users_*');
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
   }
 });

 // ════════════════════════════════════════════════════════════════════════════
//  CSV EXPORT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /export/:table — export any table to CSV
app.get('/export/:table', async (req, res) => {
  try {
    const { table } = req.params;
    const allowedTables = ['inventory', 'tasks', 'users', 'menu_items', 'error_logs'];
    if (!allowedTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table name' });
    }

    // Special handling for inventory to avoid schema_migrations conflicts
    let queryText;
    if (table === 'inventory') {
      queryText = 'SELECT * FROM invschema.inventory ORDER BY id';
    } else if (table === 'tasks') {
      queryText = 'SELECT * FROM invschema.tasks ORDER BY id';
    } else if (table === 'users') {
      queryText = 'SELECT * FROM invschema.users ORDER BY id';
    } else if (table === 'menu_items') {
      queryText = 'SELECT * FROM invschema.menu_items ORDER BY order_index, id';
    } else if (table === 'error_logs') {
      queryText = 'SELECT * FROM invschema.error_logs ORDER BY created_at DESC';
    } else {
      queryText = `SELECT * FROM invschema.${table} ORDER BY id`;
    }

    const result = await query(queryText);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No data found' });
    }

    const csv = toCSV(result.rows);
    const fileName = `${table}_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err) {
    console.error('Error exporting CSV:', err);
    await logError(err, {
      source: 'export',
      route: req.path,
      method: req.method,
      ip_address: req.ip || req.connection.remoteAddress
    });
    res.status(500).json({ error: 'Export failed' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  MENU ROUTES
// ════════════════════════════════════════════════════════════════════════════

// GET /menu — return active menu items for sidebar
app.get('/menu', async (req, res) => {
  try {
    const result = await query(`
      SELECT id, label, icon, href, parent_id
      FROM invschema.menu_items
      WHERE active = true
      ORDER BY order_index, id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /admin/menu — full menu data (for admin editing)
app.get('/admin/menu', async (req, res) => {
  try {
    const result = await query(`
      SELECT * FROM invschema.menu_items
      ORDER BY order_index, id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /admin/menu — create menu item
app.post('/admin/menu', async (req, res) => {
  try {
    const { label, icon, href, order_index, active, parent_id } = req.body;
    const result = await query(`
      INSERT INTO invschema.menu_items (label, icon, href, order_index, active, parent_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [label, icon, href, order_index || 0, active !== false, parent_id]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /admin/menu/:id — update menu item
app.put('/admin/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { label, icon, href, order_index, active, parent_id } = req.body;
    const result = await query(`
      UPDATE invschema.menu_items
      SET label = $1, icon = $2, href = $3, order_index = $4, active = $5, parent_id = $6, updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `, [label, icon, href, order_index, active, parent_id, id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Menu item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /admin/menu/:id — delete menu item
app.delete('/admin/menu/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM invschema.menu_items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ message: 'Menu item deleted' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ERROR LOG ROUTES
// ════════════════════════════════════════════════════════════════════════════

// POST /errors — log an error
app.post('/errors', async (req, res) => {
  try {
    const { level, message, stack, source, route, method, user_id, ip_address, user_agent, metadata } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await query(`
      INSERT INTO invschema.error_logs
        (level, message, stack, source, route, method, user_id, ip_address, user_agent, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      level || 'error',
      message,
      stack || null,
      source || null,
      route || null,
      method || null,
      user_id || null,
      ip_address || null,
      user_agent || null,
      metadata ? JSON.stringify(metadata) : null
    ]);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error logging error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /errors — retrieve error logs (with optional filters)
app.get('/errors', async (req, res) => {
  try {
    const { level, source, route, limit = 100, offset = 0 } = req.query;

    const conditions = [];
    const params = [];
    let paramCount = 0;

    if (level) {
      paramCount++;
      conditions.push(`level = $${paramCount}`);
      params.push(level);
    }
    if (source) {
      paramCount++;
      conditions.push(`source = $${paramCount}`);
      params.push(source);
    }
    if (route) {
      paramCount++;
      conditions.push(`route = $${paramCount}`);
      params.push(route);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*) FROM invschema.error_logs ${where}`, params),
      query(
        `SELECT id, level, message, stack, source, route, method, user_id, ip_address, created_at
         FROM invschema.error_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
        [...params, parseInt(limit), parseInt(offset)]
      )
    ]);

    res.json({
      data: dataRes.rows,
      total: parseInt(countRes.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Error fetching error logs:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /errors/:id — get single error log
app.get('/errors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('SELECT * FROM invschema.error_logs WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Error log not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching error log:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /errors/:id — delete an error log
app.delete('/errors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM invschema.error_logs WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Error log not found' });
    res.json({ message: 'Error log deleted' });
  } catch (err) {
    console.error('Error deleting error log:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════════════════

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
     await logError(err, {
       source: 'inventory',
       route: req.path,
       method: req.method,
       ip_address: req.ip || req.connection.remoteAddress,
       user_agent: req.get('User-Agent')
     });
     res.status(500).json({ error: 'Internal server error' });
   }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));