'use strict';

const authGuard = require('../middleware/authGuard');
const activeTimeouts = require('../lib/activeRestTimers');

module.exports = [
  authGuard,
  async (req, res) => {
    const uid = req.user.uid;
    if (activeTimeouts.has(uid)) {
      clearTimeout(activeTimeouts.get(uid));
      activeTimeouts.delete(uid);
      return res.status(200).json({ success: true, message: 'Notification cancelled.' });
    }
    return res.status(200).json({ success: true, message: 'No notification scheduled.' });
  }
];
