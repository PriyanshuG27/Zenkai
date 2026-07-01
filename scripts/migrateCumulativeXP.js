require('dotenv').config({ path: '../backend/.env' });
const { adminDb, FieldValue } = require('../backend/lib/firebaseAdmin');
const { deriveLevelFromXP } = require('../backend/lib/workoutHelpers');

async function migrateCumulativeXP() {
  console.log('Starting Cumulative XP Migration...');
  
  let totalProcessed = 0;
  let totalUpdated = 0;
  let hasMore = true;
  let lastVisible = null;
  const limit = 500;

  try {
    while (hasMore) {
      let query = adminDb.collection('users').orderBy('__name__').limit(limit);
      if (lastVisible) {
        query = query.startAfter(lastVisible);
      }

      const snapshot = await query.get();
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batch = adminDb.batch();
      let batchCount = 0;

      for (const doc of snapshot.docs) {
        const uid = doc.id;
        const data = doc.data();
        totalProcessed++;

        // Calculate XP from xpLog
        const xpLogSnap = await adminDb.collection(`users/${uid}/xpLog`).get();
        let calculatedCumulative = 0;
        xpLogSnap.forEach(logDoc => {
          calculatedCumulative += (logDoc.data().amount || 0);
        });

        const currentXP = data.xp || 0;
        const finalCumulative = Math.max(currentXP, calculatedCumulative);
        
        const derived = deriveLevelFromXP(finalCumulative);

        // Update if missing or mismatched
        if (
          data.cumulativeXP === undefined ||
          data.cumulativeXP < currentXP ||
          data.cumulativeXP !== finalCumulative ||
          data.level !== derived.level ||
          data.levelName !== derived.levelName
        ) {
          batch.update(doc.ref, {
            cumulativeXP: finalCumulative,
            level: derived.level,
            levelName: derived.levelName
          });
          batchCount++;
          totalUpdated++;
          console.log(`Prepared update for user ${uid}: cumulativeXP -> ${finalCumulative}, Level -> ${derived.level}`);
        }
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} updates.`);
      }

      lastVisible = snapshot.docs[snapshot.docs.length - 1];
      console.log(`Processed ${totalProcessed} users so far...`);
    }

    console.log(`\nMigration Complete! Processed: ${totalProcessed}, Updated: ${totalUpdated}`);
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrateCumulativeXP();
