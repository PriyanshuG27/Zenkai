'use strict';

const { adminDb } = require('./firebaseAdmin');
const { sendPushNotification } = require('./fcmSender');

/**
 * Checks all checked-in user presences across all squads.
 * Sends Personal Gym Reminders and Teammate Gym Reminders exactly 1 hour before scheduled time.
 */
async function processGymReminders() {
  const now = new Date();
  
  // Define a 10-minute window centered around 1 hour from now (55 to 65 minutes)
  const rangeStart = new Date(now.getTime() + 55 * 60 * 1000);
  const rangeEnd = new Date(now.getTime() + 65 * 60 * 1000);

  try {
    // Query all presence subcollection documents across all squads in this window
    const presenceSnap = await adminDb.collectionGroup('presence')
      .where('targetTimestamp', '>=', rangeStart)
      .where('targetTimestamp', '<=', rangeEnd)
      .get();

    if (presenceSnap.empty) {
      return;
    }

    console.log(`[reminderScheduler] Processing ${presenceSnap.size} check-ins for 1-hour reminders...`);

    for (const docSnap of presenceSnap.docs) {
      const data = docSnap.data();
      const docRef = docSnap.ref;
      const uid = data.uid || docSnap.id;
      const name = data.name || 'A teammate';
      const time = data.time;
      const squadCode = docRef.parent.parent.id;

      // 1. Personal Workout Reminder (1 hour prior)
      if (!data.personalNotified) {
        console.log(`[reminderScheduler] Sending Personal Gym Reminder to ${name} (${uid}) for ${time}`);
        await sendPushNotification({
          recipientUids: [uid],
          title: 'Gym Time Reminder! 🏋️‍♂️',
          body: `Your gym session starts in 1 hour at ${time}. Gear up!`,
          data: { url: '/squad' }
        });
        await docRef.update({ personalNotified: true });
      }

      // 2. Teammate Workout Reminder (1 hour prior)
      if (!data.teammatesNotified) {
        console.log(`[reminderScheduler] Sending Teammate Gym Reminder to squad ${squadCode} for ${name}'s session at ${time}`);
        const squadSnap = await adminDb.doc(`shared_squads/${squadCode}`).get();
        
        if (squadSnap.exists) {
          const squadData = squadSnap.data();
          const memberUids = squadData.memberUids || [];
          const teammateUids = memberUids.filter(mUid => mUid !== uid);

          if (teammateUids.length > 0) {
            await sendPushNotification({
              recipientUids: teammateUids,
              title: 'Teammate Gym Reminder! 🏋️‍♂️',
              body: `${name} is hitting the gym in 1 hour at ${time}!`,
              data: { url: '/squad' }
            });
          }
        }
        await docRef.update({ teammatesNotified: true });
      }
    }
  } catch (err) {
    console.error('[reminderScheduler] Error processing reminders:', err);
  }
}

/**
 * Registers a 5-minute interval check for gym time reminders.
 */
function initReminderScheduler() {
  const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
  
  setInterval(async () => {
    await processGymReminders();
  }, CHECK_INTERVAL);

  console.log('[reminderScheduler] Background 1-hour gym reminder scheduler initialized (5-minute checks).');
}

module.exports = {
  processGymReminders,
  initReminderScheduler
};
