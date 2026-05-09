const { runMigrations } = require('./migrations/runner');
const { query } = require('./db');

async function test() {
  console.log('Testing migrations...');
  try {
    await runMigrations();
    console.log('Migrations completed successfully');

    // Verify inventory table structure
    const res = await query('SELECT column_name FROM information_schema.columns WHERE table_name = \'inventory\' AND table_schema = \'invschema\' ORDER BY ordinal_position');
    console.log('Inventory columns:');
    res.rows.forEach(col => console.log(' -', col.column_name));

    // Verify stage and note columns exist
    const stageCol = res.rows.find(c => c.column_name === 'stage');
    const noteCol = res.rows.find(c => c.column_name === 'note');
    if (stageCol && noteCol) {
      console.log('✓ stage and note columns exist');
    } else {
      console.log('✗ Missing columns:', !stageCol ? 'stage ' : '', !noteCol ? 'note' : '');
    }

    // Verify menu_items and error_logs tables
    const menuRes = await query("SELECT table_name FROM information_schema.tables WHERE table_name = 'menu_items' AND table_schema = 'invschema'");
    const errRes = await query("SELECT table_name FROM information_schema.tables WHERE table_name = 'error_logs' AND table_schema = 'invschema'");
    console.log('menu_items table exists:', menuRes.rows.length > 0 ? '✓' : '✗');
    console.log('error_logs table exists:', errRes.rows.length > 0 ? '✓' : '✗');

    // Test insert into inventory with stage and note
    const ins = await query("INSERT INTO invschema.inventory (type, appreff, ip, port, stage, note) VALUES ('test','REF-TEST','10.0.0.1',8080,'dev','test note') RETURNING *");
    console.log('Insert test:', ins.rows[0].stage === 'dev' && ins.rows[0].note === 'test note' ? '✓' : '✗');
    await query('DELETE FROM invschema.inventory WHERE id = $1', [ins.rows[0].id]);

    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

test();
