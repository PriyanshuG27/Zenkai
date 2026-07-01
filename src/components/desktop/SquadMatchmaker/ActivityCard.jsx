import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export const ActivityCard = ({
  activity,
  uid,
  memberInfo,
  avatarStyle,
  avatarUrl,
  hasHighFived,
  hasKudosed,
  floatingEmojis,
  handleMemberClick,
  setSelectedActivityId,
  handleSocialAction
}) => {
  let cardClass = "border border-neutral-850 bg-neutral-900/40 p-4 rounded-xl flex flex-col gap-3 relative shadow-md hover:border-neutral-700 hover:bg-neutral-900/60 transition-all duration-200 cursor-pointer";
  let themeBadge = null;
  
  if (activity.cardTheme === 'pr_smash') {
    cardClass = "border-2 border-slate-300/40 bg-gradient-to-b from-[#111] to-[#0a0a0a] p-4 rounded-xl flex flex-col gap-3 relative shadow-[0_0_12px_rgba(203,213,225,0.15)] hover:border-slate-300 hover:scale-[1.01] transition-all duration-200 cursor-pointer";
    themeBadge = (
      <span className="text-[8px] bg-slate-200/20 text-slate-200 border border-slate-200/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(203,213,225,0.4)]">
        🏆 PR SMASH
      </span>
    );
  } else if (activity.cardTheme === 'titan_slayer') {
    cardClass = "border-2 border-red-650 bg-gradient-to-b from-[#1a0b0b] to-[#080202] p-4 rounded-xl flex flex-col gap-3 relative shadow-[0_0_12px_rgba(239,68,68,0.2)] hover:border-red-500 hover:scale-[1.01] transition-all duration-200 cursor-pointer";
    themeBadge = (
      <span className="text-[8px] bg-red-600/20 text-red-400 border border-red-600/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse">
        👹 TITAN SLAYER
      </span>
    );
  }

  return (
    <div 
      className={cardClass}
      onClick={() => setSelectedActivityId(activity.id)}
    >
      <div className="flex items-center justify-between">
        <div 
          className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            if (memberInfo) handleMemberClick(memberInfo);
          }}
          title="Click to view profile & stats"
        >
          <div 
            className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center overflow-hidden shrink-0 transition-all duration-300"
            style={avatarStyle}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="font-display font-extrabold text-[9px] text-white">
                {activity.name?.slice(0, 2).toUpperCase() || 'ZK'}
              </span>
            )}
          </div>
          <div className="flex flex-col text-left">
            <span className="text-white font-bold text-xs">{activity.name}</span>
            <span className="text-[8px] text-neutral-500 font-mono">
              {activity.createdAt ? new Date(activity.createdAt.toDate ? activity.createdAt.toDate() : activity.createdAt).toLocaleDateString() : 'Just now'}
            </span>
          </div>
        </div>
        {themeBadge}
      </div>

      <div className="flex flex-col gap-1.5 text-left border-t border-b border-neutral-800/40 py-2.5 my-0.5">
        <div className="flex items-center justify-between">
          <span className="text-white font-black text-xs uppercase tracking-wide">
            {activity.workoutName}
          </span>
          {activity.isQuickLog && (
            <span className="text-[7px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1 py-0.5 rounded uppercase font-bold">
              ⚡ Retroactive Log
            </span>
          )}
        </div>
        
        <div className="flex flex-wrap gap-3 text-[10px] text-neutral-400 font-mono mt-1">
          <span>Sets: <strong className="text-slate-200">{activity.totalSets}</strong></span>
          <span className="text-neutral-700 select-none">•</span>
          <span>Exercises: <strong className="text-slate-200">{activity.exercisesCount}</strong></span>
          <span className="text-neutral-700 select-none">•</span>
          <span>Volume: <strong className="text-slate-200">{Math.round(activity.totalVolume).toLocaleString()}kg</strong></span>
        </div>

        {activity.prNames && activity.prNames.length > 0 && (
          <div className="mt-2 flex flex-col gap-1 text-[10px] font-mono">
            <span className="text-amber-400 font-bold uppercase tracking-wider flex items-center gap-1">
              🔥 PRs Smashed:
            </span>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {activity.prNames.map((pr, prIdx) => (
                <span key={prIdx} className="bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-1 rounded-md uppercase font-extrabold text-[9px] tracking-wide shadow-sm">
                  {pr}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 relative mt-1">
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSocialAction(activity.id, 'highFive');
          }}
          className={`flex items-center gap-1.5 font-display font-black text-[9px] px-3 py-1.5 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
            hasHighFived 
              ? 'bg-yellow-500 text-black border-yellow-500' 
              : 'bg-neutral-950 text-white hover:bg-neutral-900'
          }`}
        >
          <span>👏</span>
          <span>{activity.highFives?.length || 0} High-Fives</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            handleSocialAction(activity.id, 'kudos');
          }}
          className={`flex items-center gap-1.5 font-display font-black text-[9px] px-3 py-1.5 border border-neutral-800 rounded-lg uppercase cursor-pointer transition-all ${
            hasKudosed 
              ? 'bg-red-600 text-white border-red-600' 
              : 'bg-neutral-950 text-white hover:bg-neutral-900'
          }`}
        >
          <span>🔥</span>
          <span>{activity.kudos?.length || 0} Kudos</span>
        </button>

        <AnimatePresence>
          {(floatingEmojis[activity.id] || []).map((e) => (
            <motion.span
              key={e.id}
              initial={{ opacity: 1, scale: 0.5, y: 0, x: 0 }}
              animate={{ opacity: 0, scale: 1.5, y: -70, x: e.x }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute text-base pointer-events-none"
              style={{ left: '50%', transform: 'translateX(-50%)', bottom: '24px', zIndex: 50 }}
            >
              {e.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};
