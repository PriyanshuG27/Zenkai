/**
 * clearTestData.js
 * One-time dev script — deletes ALL Firebase Auth users + their Firestore docs.
 * Run: node scripts/clearTestData.js
 *
 * Requires: serviceAccountKey.json in the project root
 * Install:  npm install firebase-admin --save-dev
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();
const db   = admin.firestore();

async function clearAllUsers() {
  console.log('\n🔥 FitDesi — Clear Test Data\n');

  // 1. List all Auth users
  const listResult = await auth.listUsers();
  const users = listResult.users;

  if (users.length === 0) {
    console.log('✅ No users found. Nothing to delete.');
    process.exit(0);
  }

  console.log(`Found ${users.length} user(s):`);
  users.forEach(u => console.log(`  - ${u.email || u.uid}`));

  // 2. Delete Firestore docs first
  console.log('\nDeleting Firestore documents...');
  await Promise.all(
    users.map(async (u) => {
      try {
        await db.collection('users').doc(u.uid).delete();
        console.log(`  ✅ Firestore doc deleted: ${u.uid}`);
      } catch (err) {
        console.log(`  ⚠️  No Firestore doc for ${u.uid} (skipped)`);
      }
    })
  );

  // 3. Delete Auth accounts
  console.log('\nDeleting Auth accounts...');
  const uids = users.map(u => u.uid);
  const deleteResult = await auth.deleteUsers(uids);
  console.log(`  ✅ ${deleteResult.successCount} account(s) deleted`);
  if (deleteResult.failureCount > 0) {
    deleteResult.errors.forEach(e => console.error('  ❌', e.error.message));
  }

  console.log('\n🎉 Done. Firebase is clean.\n');
  process.exit(0);
}

clearAllUsers().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
