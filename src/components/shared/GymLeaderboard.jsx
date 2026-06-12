import React, { useEffect, useState } from 'react';
import { Trophy, Dumbbell, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSquadStore } from '../../stores/useSquadStore';
import { getAvatarStyle, isTitleActive } from '../../lib/xpHelpers';

const RENTED_TITLES = {
  'PR Demon': 'pr_demon',
  'Titan Hunter': 'titan_hunter'
};

const isTitleExpired = (titleName, powerUps) => {
  const key = RENTED_TITLES[titleName];
  if (!key) return false;
  return !isTitleActive(key, powerUps);
};

export const GymLeaderboard = ({ gymId = '', gymName = '' }) => {
  const { user } = useAuthStore();
  const leaderboard = useSquadStore((state) => state.leaderboard);
  const loading = useSquadStore((state) => state.leaderboardLoading);
  const error = useSquadStore((state) => state.leaderboardError);
  const fetchLeaderboard = useSquadStore((state) => state.fetchLeaderboard);
  const leaderboardCache = useSquadStore((state) => state.leaderboardCache);

  const [timeRemaining, setTimeRemaining] = useState('');

  useEffect(() => {
    const cacheEntry = leaderboardCache[gymId];
    if (!cacheEntry?.timestamp) {
      setTimeRemaining('');
      return;
    }

    const updateTimer = () => {
      const elapsed = Date.now() - cacheEntry.timestamp;
      const ttl = 900000; // 15 mins
      const remaining = ttl - elapsed;

      if (remaining <= 0) {
        setTimeRemaining('');
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [leaderboardCache, gymId]);

  useEffect(() => {
    if (gymId) {
      fetchLeaderboard(gymId);
    }
  }, [gymId, fetchLeaderboard]);

  if (!gymId) {
    return (
      <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,1)] text-center select-none font-sans border-dashed">
        <Dumbbell className="mx-auto text-[var(--text-muted)] w-10 h-10 mb-3" />
        <h3 className="font-display font-extrabold text-sm uppercase text-white tracking-wider">
          Compete at your Home Gym
        </h3>
        <p className="text-xs text-[var(--text-secondary)] mt-2 max-w-xs mx-auto leading-relaxed">
          You haven't tagged a home gym yet! Tag your gym in your Profile settings to unlock local leaderboards.
        </p>
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-4 font-sans select-none w-full">
      {/* Header */}
      <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono text-[var(--secondary)] uppercase tracking-wider font-bold">
            Home Gym Arena
          </span>
          <h3 className="font-display font-black text-lg text-white uppercase tracking-tight truncate max-w-[200px] mt-0.5">
            {gymName || 'Local Gym'}
          </h3>
        </div>
        <div className="p-2 rounded bg-yellow-400/10 border border-yellow-400 text-yellow-400">
          <Trophy size={18} />
        </div>
      </div>

      {/* Status Bar / Cache Countdown */}
      {gymId && !error && leaderboard.length > 0 && (
        <div className="flex justify-between items-center bg-[var(--bg-elevated)] border border-[var(--border)] px-3 py-1.5 rounded-xl font-mono text-[10px] text-[var(--text-secondary)]">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${loading ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
            <span>
              {loading 
                ? 'Syncing leaderboard...' 
                : timeRemaining 
                  ? `Refreshes in ${timeRemaining}` 
                  : 'Live data'
              }
            </span>
          </div>
          <button
            onClick={() => fetchLeaderboard(gymId, true)}
            disabled={loading}
            className="p-1 rounded hover:bg-[var(--surface)] text-[var(--text-muted)] hover:text-white transition-all disabled:opacity-50 flex items-center justify-center"
            title="Force Sync"
          >
            <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2.5 py-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-12 w-full bg-[var(--bg-elevated)] border border-[var(--border)] rounded-xl animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <p className="text-xs text-red-400 text-center py-4 font-mono uppercase">{error}</p>
      ) : leaderboard.length === 0 ? (
        <p className="text-xs text-[var(--text-secondary)] text-center py-4">No trainers found at this gym yet.</p>
      ) : (
        <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
          {leaderboard.map((trainer, index) => {
            const isCurrentUser = trainer.uid === user?.uid;
            const rank = index + 1;

            let rankBadge = `${rank}`;
            if (rank === 1) rankBadge = '🥇';
            else if (rank === 2) rankBadge = '🥈';
            else if (rank === 3) rankBadge = '🥉';

            return (
              <div
                key={trainer.uid}
                className={`flex items-center justify-between p-3 rounded-xl border-2 transition-all ${
                  isCurrentUser
                    ? 'border-[var(--accent-xp)] bg-[#b5ff2d0c] shadow-[2px_2px_0px_rgba(181,255,45,0.1)]'
                    : 'border-black bg-[var(--bg-elevated)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Rank */}
                  <span className="font-mono text-sm font-bold text-[var(--text-secondary)] w-5 text-center shrink-0">
                    {rankBadge}
                  </span>
                  
                  {/* Avatar */}
                  <div 
                    className="w-7 h-7 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden shrink-0 border"
                    style={getAvatarStyle(trainer.aura, trainer.level || 1, trainer.powerUps)}
                  >
                    {trainer.avatarUrl ? (
                      <img src={trainer.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                      <span className="font-display font-extrabold text-[9px] text-white">
                        {trainer.name?.slice(0, 2).toUpperCase() || 'ZK'}
                      </span>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className={`text-xs font-bold truncate ${isCurrentUser ? 'text-[var(--accent-xp)]' : 'text-white'}`}>
                        {trainer.name || 'Anonymous Lifter'}
                      </span>
                      {trainer.activeTitle && !isTitleExpired(trainer.activeTitle, trainer.powerUps) && (
                        <span className="text-[8px] font-mono text-amber-400 border border-amber-500/30 bg-amber-950/20 px-1 py-0.2 rounded uppercase tracking-wider shrink-0 leading-none">
                          {trainer.activeTitle}
                        </span>
                      )}
                      {trainer.streak >= 7 && <span title="7+ Day Streak" className="text-[10px] shrink-0">🔥</span>}
                    </div>
                    <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase mt-0.5">
                      Lvl {trainer.level || 1} • {trainer.levelName || 'Rookie'}
                    </span>
                  </div>
                </div>

                {/* Score */}
                <div className="flex flex-col items-end shrink-0">
                  <span className="font-mono text-xs font-black text-white">
                    {trainer.xp || 0}
                  </span>
                  <span className="text-[8px] font-mono text-[var(--text-muted)] uppercase">
                    XP
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
