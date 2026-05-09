const express = require('express');
const path = require('path');
const { query } = require('./db');
const { connectRedis, setCache, getCache, deleteCache } = require('./cache');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;

// Input validation helper
const validateInventory = (data) => {
  const errors = [];
  if (data.port && (isNaN(data.port) || data.port < 1 || data.port > 65535)) {
    errors.push('Port must be a valid number between 1 and 65535');
  }
  if (data.ip && !/^(\d{1,3}\.){3}\d{1,3}$/.test(data.ip)) {
    errors.push('IP must be a valid IPv4 address');
  }
  return errors;
};

// Initialize Redis connection
connectRedis().catch(console.error);

// Create tables
const initDB = async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS invschema.inventory (
        id SERIAL PRIMARY KEY,
        type VARCHAR(100),
        appreff VARCHAR(100),
        ip INET,
        port INTEGER,
        version VARCHAR(50),
        active BOOLEAN DEFAULT TRUE,
        user_name VARCHAR(100),
        password VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS invschema.users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE,
        password VARCHAR(100),
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialized');
  } catch (err) {
    console.error('Error initializing database:', err);
  }
};

initDB();

// GET all inventory items with caching
app.get('/inventory', async (req, res) => {
  try {
    const cached = await getCache('inventory_all');
    if (cached) {
      return res.json(cached);
    }

    const result = await query('SELECT * FROM invschema.inventory ORDER BY id');
    await setCache('inventory_all', result.rows, 300); // Cache for 5 minutes
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET single inventory item by ID with caching
app.get('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const cached = await getCache(`inventory_${id}`);
    if (cached) {
      return res.json(cached);
    }

    const result = await query('SELECT * FROM invschema.inventory WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await setCache(`inventory_${id}`, result.rows[0], 300); // Cache for 5 minutes
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create new inventory item
app.post('/inventory', async (req, res) => {
  try {
    const { type, appreff, ip, port, version, active, user_name, password } = req.body;
    
    const errors = validateInventory(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const result = await query(
      'INSERT INTO invschema.inventory (type, appreff, ip, port, version, active, user_name, password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [type, appreff, ip, port, version, active, user_name, password]
    );

    // Clear relevant caches
    await deleteCache('inventory_all');
    await deleteCache(`inventory_${result.rows[0].id}`);

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update inventory item by ID
app.put('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, appreff, ip, port, version, active, user_name, password } = req.body;
    
    const errors = validateInventory(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }
    
    const result = await query(
      'UPDATE invschema.inventory SET type = $1, appreff = $2, ip = $3, port = $4, version = $5, active = $6, user_name = $7, password = $8, updated_at = CURRENT_TIMESTAMP WHERE id = $9 RETURNING *',
      [type, appreff, ip, port, version, active, user_name, password, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Clear relevant caches
    await deleteCache('inventory_all');
    await deleteCache(`inventory_${id}`);

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE inventory item by ID
app.delete('/inventory/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM invschema.inventory WHERE id = $1 RETURNING *', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    // Clear relevant caches
    await deleteCache('inventory_all');
    await deleteCache(`inventory_${id}`);

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Users routes
app.get('/users', async (req, res) => {
  try {
    const result = await query('SELECT id, username, role, created_at FROM invschema.users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const result = await query(
      'INSERT INTO invschema.users (username, password, role) VALUES ($1, $2, $3) RETURNING id, username, role, created_at',
      [username, password, role || 'user']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await query('SELECT * FROM invschema.users WHERE username = $1 AND password = $2', [username, password]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});