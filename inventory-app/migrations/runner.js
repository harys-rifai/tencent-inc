const { query } = require('../db');
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = __dirname;

async function ensureMigrationsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS invschema.schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      name    TEXT NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrations() {
  const res = await query('SELECT version FROM invschema.schema_migrations ORDER BY version');
  return res.rows.map(row => row.version);
}

async function applyMigration(filePath, version, name) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = sql.split(';').filter(s => s.trim());

  for (const stmt of statements) {
    if (stmt.trim()) {
      await query(stmt);
    }
  }

  await query(
    'INSERT INTO invschema.schema_migrations (version, name) VALUES ($1, $2)',
    [version, name]
  );

  console.log(`✓ Applied migration: ${name} (${version})`);
}

async function runMigrations() {
  try {
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();

    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const version = file.split('-')[0];
      if (!applied.includes(version)) {
        const name = file.replace('.sql', '').split('-').slice(1).join('-');
        const filePath = path.join(MIGRATIONS_DIR, file);
        await applyMigration(filePath, version, name);
      }
    }

    console.log('All migrations applied successfully');
  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  }
}

module.exports = { runMigrations };
