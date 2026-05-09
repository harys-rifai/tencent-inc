const db = require("/invdb/inventory-app/db");

(async () => {
  // Test login with default password "Password09"
  const result = await db.query(
    "SELECT * FROM invschema.users WHERE username=$1 AND password=$2 AND active = true",
    ["harysr", "Password09"]
  );
  console.log("Login with Password09:", result.rows.length, "rows");
  if (result.rows.length > 0) {
    console.log("User:", result.rows[0]);
  }

  // Test with actual stored password
  const result2 = await db.query(
    "SELECT * FROM invschema.users WHERE username=$1 AND active = true",
    ["harysr"]
  );
  console.log("User without password check:", result2.rows.length, "rows");
  if (result2.rows.length > 0) {
    console.log("DB password:", result2.rows[0].password);
  }
  process.exit(0);
})();