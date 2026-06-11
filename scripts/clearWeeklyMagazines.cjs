const { adminDb } = require('../backend/lib/firebaseAdmin');

function getISOWeek(date) {
  const tempDate = new Date(date.valueOf());
  tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
  const yearStart = new Date(tempDate.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((tempDate - yearStart) / 86400000) + 1) / 7);
  return `${tempDate.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

async function clearWeeklyMagazines() {
  console.log('--- CLEARING WEEKLY MAGAZINE CACHES ---');
  try {
    const weekId = getISOWeek(new Date());
    console.log(`Current Week ID: ${weekId}`);

    const usersSnap = await adminDb.collection('users').get();
    console.log(`Found ${usersSnap.size} user(s).`);

    for (const userDoc of usersSnap.docs) {
      const uid = userDoc.id;
      const magazineRef = adminDb.doc(`users/${uid}/weekly_magazines/${weekId}`);
      const doc = await magazineRef.get();
      if (doc.exists) {
        console.log(`Deleting weekly magazine cache for user ${uid} (${weekId})`);
        await magazineRef.delete();
      } else {
        console.log(`No weekly magazine cache found for user ${uid} (${weekId})`);
      }
    }
    console.log('Done!');
  } catch (error) {
    console.error('Error clearing magazine caches:', error);
  }
}

clearWeeklyMagazines();
