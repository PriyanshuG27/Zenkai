'use strict';

const authGuard = require('../middleware/authGuard');
const { sendPushNotification } = require('../lib/fcmSender');
const activeTimeouts = require('../lib/activeRestTimers');

module.exports = [
  authGuard,
  async (req, res) => {
    const uid = req.user.uid;
    const { seconds } = req.body;

    if (typeof seconds !== 'number' || seconds <= 0) {
      return res.status(400).json({ error: 'seconds must be a positive number' });
    }

    // Clear any existing timer for this user
    if (activeTimeouts.has(uid)) {
      clearTimeout(activeTimeouts.get(uid));
      activeTimeouts.delete(uid);
    }

    const timerId = setTimeout(async () => {
      activeTimeouts.delete(uid);
      try {
        await sendPushNotification({
          recipientUids: [uid],
          title: 'Zenkai Rest Timer',
          body: 'Rest over! Time for your next set. 💪',
          data: {
            url: '/home',
            type: 'rest-timer'
          }
        });
      } catch (err) {
        console.error('[scheduleRestNotification] Failed to send push:', err);
      }
    }, seconds * 1000);

    activeTimeouts.set(uid, timerId);

    return res.status(200).json({ success: true, message: `Notification scheduled in ${seconds}s.` });
  }
];
