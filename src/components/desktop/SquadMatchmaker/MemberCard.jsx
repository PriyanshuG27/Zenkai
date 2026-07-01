import React from 'react';
import { Award, Key, Flame, Trash2 } from 'lucide-react';

export const MemberCard = ({
  mbr,
  idx,
  uid,
  isCreator,
  isLifting,
  avatarStyle,
  isTitleActive,
  handleMemberClick,
  handleRescueStreak,
  handleKickMember,
  hoursSinceLastWorkout
}) => {
  const isStreakExpiring = hoursSinceLastWorkout > 24 && (mbr.streak || 0) > 0 && !(mbr.powerUps?.streakShield > 0);

  return (
    <div key={idx} className="border border-neutral-850 bg-neutral-900/10 p-3.5 rounded-xl flex items-center justify-between hover:border-neutral-700/60 hover:bg-neutral-900/20 transition-all duration-300 shadow-md text-xs font-mono">
      <div 
        className="flex items-center gap-3 cursor-pointer hover:bg-neutral-850 p-1.5 rounded-xl transition-all"
        onClick={() => handleMemberClick(mbr)}
        title="Click to view profile & stats"
      >
        <div className="relative shrink-0">
          <div 
            className={`w-9 h-9 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden transition-all duration-300 ${
              isLifting ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-black animate-pulse' : ''
            }`}
            style={avatarStyle}
          >
            {mbr.avatarUrl ? (
              <img src={mbr.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-[10px] text-white">
                {mbr.name?.slice(0, 2).toUpperCase() || 'ZK'}
              </span>
            )}
          </div>
          {isLifting && (
            <span className="absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full bg-green-500 ring-1 ring-black animate-ping" />
          )}
        </div>

        <div className="flex flex-col text-left">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-white font-bold">{mbr.name}</span>
            {isLifting && (
              <span className="text-[7px] bg-green-500/20 text-green-400 border border-green-500/30 px-1 rounded uppercase font-bold animate-pulse">
                🟢 Active Lifter
              </span>
            )}
          </div>
          {mbr.activeTitle && (() => {
            const isDemo = mbr.activeTitle === 'PR Demon' && isTitleActive('pr_demon', mbr.powerUps);
            const isTitan = mbr.activeTitle === 'Titan Hunter' && isTitleActive('titan_hunter', mbr.powerUps);
            if (!isDemo && !isTitan) return null;
            return (
              <span className="text-[8px] text-[var(--accent-xp)] font-bold uppercase tracking-wider mt-0.5">
                {mbr.activeTitle}
              </span>
            );
          })()}
          <div className="flex items-center gap-2 mt-0.5">
            {mbr.badges && mbr.badges.length > 0 && (
              <span className="text-[7px] text-[var(--accent-xp)] border border-[var(--accent-xp)]/20 px-1 rounded uppercase font-bold flex items-center gap-0.5">
                <Award size={8} />
                <span>{mbr.badges.length} Trophies</span>
              </span>
            )}
            {mbr.powerUps?.bossFightKey > 0 && (
              <span className="text-[7px] text-[var(--primary)] border border-[var(--primary)]/20 px-1 rounded uppercase font-bold flex items-center gap-0.5">
                <Key size={8} />
                <span>{mbr.powerUps.bossFightKey} Keys</span>
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-[var(--text-secondary)]">
        <span>Streak: <strong className="text-white">{mbr.streak || 0}d</strong></span>
        <span>Volume: <strong className="text-white">{Math.round(mbr.volume || 0)}kg</strong></span>
        {isStreakExpiring && mbr.uid !== uid && (
          <button
            onClick={() => handleRescueStreak(mbr)}
            className="bg-orange-500 hover:bg-orange-600 text-black font-display font-black text-[8px] px-2 py-0.5 border border-black rounded shadow-[1px_1px_0px_black] uppercase cursor-pointer flex items-center gap-0.5 active:translate-x-[0.5px] active:translate-y-[0.5px] active:shadow-none transition-all"
            title="Gift teammate a Streak Shield to protect their streak (costs 50 XP)!"
          >
            <Flame size={8} className="text-black" />
            <span>Rescue (50 XP)</span>
          </button>
        )}
        {isCreator && mbr.uid !== uid && (
          <button
            onClick={() => handleKickMember(mbr.uid)}
            className="text-red-500 hover:text-red-400 cursor-pointer p-1"
            title="Kick member"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  );
};
