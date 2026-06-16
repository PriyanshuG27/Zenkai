import { create } from 'zustand';
import { db } from '../lib/firebase';
import { doc, collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';

export const useSquadStore = create((set, get) => {
  // Store unsubscribers outside state to avoid unnecessary React re-renders or circularity
  let squadUnsub = null;
  let subscribedSquadCode = null;
  let memberUnsubs = {}; // { squadCode: unsubFn }
  let activityUnsub = null;
  let presenceUnsub = null;
  let pollsUnsub = null;

  return {
    squadId: null,
    squadName: '',
    members: [], // [{ uid, displayName, streak, xpThisWeek }]
    weeklyXPMultiplier: 1.0,
    dailyCheckIns: {}, // { [uid]: boolean }
    loading: false,
    error: null,

    // Active squad states
    activeSquad: null,
    activeSquadCode: null,
    activeSquadMembers: [],
    activityList: [],
    presenceList: [],
    pollsList: [],
    
    // Leaderboard state
    leaderboard: [],
    leaderboardLoading: false,
    leaderboardError: null,
    leaderboardCache: {}, // { [gymId]: { timestamp: number, data: [...] } }

    setSquadData: (squadDoc) =>
      set({
        squadId: squadDoc?.id ?? null,
        squadName: squadDoc?.squadName ?? '',
        members: squadDoc?.members ?? [],
        weeklyXPMultiplier: squadDoc?.weeklyXPMultiplier ?? 1.0,
        dailyCheckIns: squadDoc?.dailyCheckIns ?? {},
        error: null,
      }),

    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),
    
    clearSquad: () => {
      get().unsubscribeAll();
      set({
        squadId: null,
        squadName: '',
        members: [],
        weeklyXPMultiplier: 1.0,
        dailyCheckIns: {},
        activeSquad: null,
        activeSquadCode: null,
        activeSquadMembers: [],
        activityList: [],
        presenceList: [],
        pollsList: [],
        loading: false,
        error: null,
      });
    },

    unsubscribeAll: () => {
      if (squadUnsub) { squadUnsub(); squadUnsub = null; }
      subscribedSquadCode = null;
      Object.values(memberUnsubs).forEach(unsub => unsub());
      memberUnsubs = {};
      if (activityUnsub) { activityUnsub(); activityUnsub = null; }
      if (presenceUnsub) { presenceUnsub(); presenceUnsub = null; }
      if (pollsUnsub) { pollsUnsub(); pollsUnsub = null; }
    },

    subscribeSquad: (squadCode, uid) => {
      if (!squadCode || !uid) return;
      if (subscribedSquadCode === squadCode && squadUnsub) {
        // Already listening to this squad code
        return;
      }

      get().unsubscribeAll();
      subscribedSquadCode = squadCode;
      set({ activeSquadCode: squadCode, loading: true });

      const squadRef = doc(db, 'shared_squads', squadCode);
      squadUnsub = onSnapshot(squadRef, (snap) => {
        if (!snap.exists()) {
          set({ activeSquad: null, activeSquadMembers: [], loading: false });
          return;
        }

        const active = snap.data();
        set({ activeSquad: active });

        const membersList = [...(active.members || [])];
        const activeSquadCodes = new Set(membersList.map(m => m.squadCode).filter(Boolean));

        // Cleanup unsubs for members who left the squad
        Object.keys(memberUnsubs).forEach(code => {
          if (!activeSquadCodes.has(code)) {
            memberUnsubs[code]();
            delete memberUnsubs[code];
          }
        });

        // Initialize/update activeSquadMembers locally
        set((state) => {
          const currentMembersMap = {};
          state.activeSquadMembers.forEach(m => {
            currentMembersMap[m.squadCode] = m;
          });

          const initialMembers = membersList.map(m => {
            const existing = currentMembersMap[m.squadCode] || {};
            let memberName = m.name;
            if (m.uid === uid && !memberName.endsWith(' (You)')) {
              memberName = `${memberName} (You)`;
            }
            return {
              ...m,
              ...existing,
              name: memberName
            };
          });

          return { activeSquadMembers: initialMembers };
        });

        // Set up real-time listener for each member's squad_codes
        membersList.forEach((m) => {
          if (!m.squadCode || memberUnsubs[m.squadCode]) return;

          const codeRef = doc(db, 'squad_codes', m.squadCode);
          memberUnsubs[m.squadCode] = onSnapshot(codeRef, (memberSnap) => {
            if (memberSnap.exists()) {
              const fresh = memberSnap.data();
              let memberName = fresh.name || m.name;
              if (fresh.uid === uid || m.uid === uid) {
                if (!memberName.endsWith(' (You)')) {
                  memberName = `${memberName} (You)`;
                }
              }

              set((state) => {
                const nextMembers = [...state.activeSquadMembers];
                const idx = nextMembers.findIndex(item => item.squadCode === m.squadCode);
                if (idx !== -1) {
                  nextMembers[idx] = {
                    ...nextMembers[idx],
                    ...fresh,
                    uid: nextMembers[idx].uid,
                    name: memberName,
                    checkIn: (fresh.streak || 0) > 0,
                    updatedAt: fresh.updatedAt ? (fresh.updatedAt.toDate ? fresh.updatedAt.toDate() : new Date(fresh.updatedAt)) : new Date(0),
                  };
                } else {
                  nextMembers.push({
                    ...m,
                    ...fresh,
                    uid: m.uid,
                    name: memberName,
                    checkIn: (fresh.streak || 0) > 0,
                    updatedAt: fresh.updatedAt ? (fresh.updatedAt.toDate ? fresh.updatedAt.toDate() : new Date(fresh.updatedAt)) : new Date(0),
                  });
                }

                // Recalculate XP multiplier whenever member stats update
                const activeCount = nextMembers.filter(memb => memb.checkIn).length;
                const mult = Math.min(1.5, 1.0 + activeCount * 0.06);

                return { 
                  activeSquadMembers: nextMembers,
                  squadId: active.squadCode,
                  squadName: active.squadName,
                  members: nextMembers,
                  weeklyXPMultiplier: parseFloat(mult.toFixed(2))
                };
              });
            }
          }, (err) => {
            console.warn('[useSquadStore] Member sync failed:', m.name, err);
          });
        });

        // Initialize calculation for multiplier on first load
        const currentMembers = get().activeSquadMembers;
        const activeCount = currentMembers.filter(memb => memb.checkIn).length;
        const mult = Math.min(1.5, 1.0 + activeCount * 0.06);
        set({
          squadId: active.squadCode,
          squadName: active.squadName,
          members: currentMembers,
          weeklyXPMultiplier: parseFloat(mult.toFixed(2)),
          loading: false
        });

      }, (err) => {
        console.error('[useSquadStore] Active squad listener error:', err);
        set({ loading: false, error: err.message });
      });

      // Subscriptions to presence, polls, activity feed
      get().subscribePresenceAndPolls(squadCode, uid);
      get().subscribeActivityFeed(squadCode);
    },

    subscribePresenceAndPolls: (squadCode, uid) => {
      if (!squadCode) return;
      
      const presenceRef = collection(db, 'shared_squads', squadCode, 'presence');
      presenceUnsub = onSnapshot(presenceRef, (snap) => {
        const list = [];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const createdTime = data.createdAt?.toDate 
            ? data.createdAt.toDate().getTime() 
            : (data.createdAt || Date.now());

          if (createdTime >= todayStart.getTime()) {
            list.push({ id: docSnap.id, ...data });
          }
        });
        set({ presenceList: list });
      }, (err) => {
        console.error('[useSquadStore] Error syncing presence:', err);
      });

      const pollsRef = collection(db, 'shared_squads', squadCode, 'polls');
      pollsUnsub = onSnapshot(pollsRef, (snap) => {
        const list = [];
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        snap.forEach((docSnap) => {
          const data = docSnap.data();
          const createdTime = data.createdAt?.toDate 
            ? data.createdAt.toDate().getTime() 
            : (data.createdAt || Date.now());

          if (createdTime >= todayStart.getTime()) {
            list.push({ id: docSnap.id, ...data });
          }
        });
        set({ pollsList: list });
      }, (err) => {
        console.error('[useSquadStore] Error syncing polls:', err);
      });
    },

    subscribeActivityFeed: (squadCode) => {
      if (!squadCode) return;

      const activityRef = collection(db, 'shared_squads', squadCode, 'activity_feed');
      const q = query(activityRef, orderBy('createdAt', 'desc'), limit(20));

      activityUnsub = onSnapshot(q, (snap) => {
        const list = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        set({ activityList: list });
      }, (err) => {
        console.error('[useSquadStore] Error syncing activity feed:', err);
      });
    },

    fetchLeaderboard: async (gymId, force = false) => {
      if (!gymId) return;

      const now = Date.now();
      const cache = get().leaderboardCache[gymId];

      if (!force && cache && (now - cache.timestamp < 900000)) {
        set({ leaderboard: cache.data, leaderboardLoading: false, leaderboardError: null });
        return;
      }

      set({ leaderboardLoading: true, leaderboardError: null });
      try {
        const usersRef = collection(db, 'users');
        const q = query(
          usersRef,
          where('gymId', '==', gymId),
          orderBy('xp', 'desc'),
          limit(20)
        );

        const querySnapshot = await getDocs(q);
        const usersData = [];
        querySnapshot.forEach((docSnap) => {
          usersData.push(docSnap.data());
        });

        usersData.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        set((state) => {
          const nextCache = {
            ...state.leaderboardCache,
            [gymId]: {
              timestamp: now,
              data: usersData
            }
          };
          return {
            leaderboard: usersData,
            leaderboardCache: nextCache,
            leaderboardLoading: false
          };
        });
      } catch (err) {
        console.error('[useSquadStore] Error fetching leaderboard:', err);
        set({ leaderboardLoading: false, leaderboardError: 'Could not load leaderboard.' });
      }
    }
  };
});
