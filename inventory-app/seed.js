const { query } = require('./db');

async function insertTestData() {
  try {
    for (let i = 1; i <= 100; i++) {
      await query(
        'INSERT INTO invschema.inventory (type, appreff, ip, port, version, active, user_name, password) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          ['server', 'router', 'switch', 'firewall'][Math.floor(Math.random() * 4)],
          `REF-${1000 + i}`,
          `192.168.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`,
          Math.floor(Math.random() * 65535) + 1,
          ['1.0', '2.0', '3.0'][Math.floor(Math.random() * 3)],
          Math.random() > 0.2,
          'admin',
          'Password09'
        ]
      );
    }
    console.log('Inserted 100 test records');
  } catch (err) {
    console.error(err);
  }
}

insertTestData();