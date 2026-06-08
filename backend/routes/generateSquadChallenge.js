'use strict';

const authGuard = require('../middleware/authGuard');
const { adminDb } = require('../lib/firebaseAdmin');
const { validateUID } = require('../lib/validators');
const { generateChallengeForSquad } = require('../lib/challengeGenerator');

module.exports = [authGuard, async (req, res) => {
  const uid = req.user.uid;
  const squadCode = req.body?.squadCode;
  const isRegen = req.body?.isRegen === true;

  if (!squadCode) {
    return res.status(400).json({ error: 'Squad Code is required.' });
  }

  try {
    validateUID(uid);

    // 1. Fetch the squad document
    const squadRef = adminDb.doc(`shared_squads/${squadCode}`);
    const squadSnap = await squadRef.get();
    if (!squadSnap.exists) {
      return res.status(404).json({ error: 'Squad not found' });
    }

    const squadData = squadSnap.data();
    const memberUids = squadData.memberUids || [];
    if (!memberUids.includes(uid)) {
      return res.status(403).json({ error: 'You are not a member of this squad' });
    }

    // 2. If it is a regeneration request, perform checks
    if (isRegen) {
      const hasRegen = squadData.hasRegeneratedThisWeek || false;
      if (hasRegen) {
        return res.status(400).json({ error: 'You can only regenerate the weekly challenge once.' });
      }

      const votes = squadData.regenerationVotes || [];
      const membersCount = squadData.members?.length || 1;
      
      // Needs strictly > 50% of members to agree (e.g. at least Math.floor(membersCount / 2) + 1)
      const requiredVotes = Math.floor(membersCount / 2) + 1;
      if (votes.length < requiredVotes) {
        return res.status(400).json({ 
          error: `More than 50% of the squad members must vote to regenerate. (Current: ${votes.length}/${membersCount}, Required: ${requiredVotes})` 
        });
      }
    }

    // 3. Generate and save the challenge
    const activeChallenge = await generateChallengeForSquad(squadCode);

    return res.status(200).json({ success: true, activeChallenge });

  } catch (error) {
    console.error('[generateSquadChallenge] error:', error.message);
    return res.status(500).json({ error: 'Squad challenge generation failed. Please try again.' });
  }
}];
