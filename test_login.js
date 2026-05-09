const db = require("/invdb/inventory-app/db");

(async () => {
  try {
    const result = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'invschema' AND table_name = 'users' ORDER BY ordinal_position");
    console.log("Users table columns:");
    result.rows.forEach(c => console.log("  ", c.column_name, c.data_type));
  } catch(e) {
    console.error("Schema query error:", e.message);
  }

  try {
    const result2 = await db.query("SELECT * FROM invschema.users WHERE username=$1 AND active = true", ["harysr"]);
    console.log("User found:", result2.rows.length);
    if (result2.rows.length > 0) {
      console.log("User data:", result2.rows[0]);
      console.log("Password in DB:", JSON.stringify(result2.rows[0].password));
      console.log("Password length:", result2.rows[0].password ? result2.rows[0].password.length : "null");
    }
  } catch(e) {
    console.error("User query error:", e.message);
  }

  process.exit(0);
})();