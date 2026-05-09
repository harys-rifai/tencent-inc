const { query } = require("/invdb/inventory-app/db");

(async () => {
  try {
    await query("ALTER TABLE invschema.users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE");
    console.log("Column active added successfully");
    // Verify
    const result = await query("SELECT column_name FROM information_schema.columns WHERE table_schema = 'invschema' AND table_name = 'users' ORDER BY ordinal_position");
    console.log("Users columns now:", result.rows.map(r => r.column_name));
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
})();