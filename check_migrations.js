const { query } = require("/invdb/inventory-app/db");

(async () => {
  try {
    const result = await query("SELECT version FROM invschema.schema_migrations ORDER BY version");
    console.log("Applied migrations:", result.rows.map(r => r.version));
  } catch(e) {
    console.error("Error:", e.message);
  }
  process.exit(0);
})();