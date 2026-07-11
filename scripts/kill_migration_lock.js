'use strict';

const db = require('../src/api/services/mysqlClient');

(async () => {
  console.log('=== PPOS Lock Recovery Utility ===');
  
  const lockName = 'ppos-control-plane:migrations';
  
  // 1. Query holding connection ID
  const rows = await db.query('SELECT IS_USED_LOCK(?) AS thread_id', [lockName]);
  const threadId = rows[0]?.thread_id;
  
  if (!threadId) {
    console.log('No active session is holding the migration lock. It is already free!');
    process.exit(0);
  }
  
  console.log(`Lock is held by MySQL Thread ID: ${threadId}`);
  
  // 2. Terminate the connection holding the lock
  console.log(`Executing KILL ${threadId}...`);
  await db.query(`KILL ${threadId}`).catch(err => {
    // In some cases, KILL might return connection lost error itself, which is normal
    console.log(`KILL query finished (Error info if any: ${err.message})`);
  });
  
  // 3. Confirm lock is free
  const verify = await db.query('SELECT IS_USED_LOCK(?) AS thread_id', [lockName]);
  if (!verify[0]?.thread_id) {
    console.log('Success: The migration lock has been released!');
  } else {
    console.log(`Warning: Lock is still held by Thread ID: ${verify[0].thread_id}`);
  }
  
  process.exit(0);
})().catch(err => {
  console.error('Failed to run lock recovery utility:', err.message);
  process.exit(1);
});
