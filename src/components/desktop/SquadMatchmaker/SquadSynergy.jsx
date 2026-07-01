import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Swords, Activity, Zap, MessageSquare, ChevronDown, ChevronUp, Vote, UserPlus, FileSignature, Calendar, Award, Key, Flame, CheckCircle, Trash2, Copy, TrendingUp, Plus } from 'lucide-react';
import { PollCard } from './PollCard';
import { InviteCard } from './InviteCard';
import { ActivityCard } from './ActivityCard';
import { MemberCard } from './MemberCard';
import { getAvatarStyle } from '../../../lib/xpHelpers';

export const SquadSynergy = (props) => {
  const {
    activeSquad,
    activeSquadMembers,
    pollsList,
    activityList,
    incomingInvites,
    isRosterCollapsed,
    setIsRosterCollapsed,
    isCheckInsCollapsed,
    setIsCheckInsCollapsed,
    isActivityFeedCollapsed,
    setIsActivityFeedCollapsed,
    isPollsCollapsed,
    setIsPollsCollapsed,
    handleMemberClick,
    handleRescueStreak,
    handleKickMember,
    handleVote,
    handleSocialAction,
    handleAcceptInvite,
    handleRejectInvite,
    setSelectedActivityId,
    avatarStyle,
    isTitleActive,
    floatingEmojis,
    uid,
    profile,
    totalVolume,
    presenceList,
    handleVoteRegenerate,
    generatingChallenge,
    handleClaimReward,
    cooldownTimeLeft,
    formatCooldownTime,
    handleSummonNextTitan,
    summoningTitan,
    handleGenerateSquadChallenge,
    isCreator,
    handleCheckIn,
    checkInTime,
    setCheckInTime,
    showAppAlert,
    handleCreatePoll,
    pollQuestion,
    setPollQuestion,
    pollOptionsInput,
    setPollOptionsInput,
    creatingPoll
  } = props;

  const activeTab = 'synergy';

  return (
    <>
              <div className="flex flex-col gap-6 animate-fadeIn">
                  {/* 1. SYNERGY CHALLENGE PANEL */}
                  <div className={`p-5 rounded-2xl flex flex-col gap-4 transition-all duration-300 ${
                    activeSquad.activeChallenge?.isTitanRaid 
                      ? 'border-4 border-red-650 bg-[#0e0202] shadow-[0_0_20px_rgba(220,38,38,0.25)]' 
                      : 'border-2 border-black bg-neutral-950/60 shadow-[4px_4px_0px_black]'
                  }`}>
                    <div className={`flex justify-between items-center pb-2 border-b ${
                      activeSquad.activeChallenge?.isTitanRaid ? 'border-red-900/60' : 'border-neutral-900'
                    }`}>
                      <span className="text-xs font-mono text-white uppercase font-extrabold tracking-wider flex items-center gap-1.5">
                        <Award size={16} className={activeSquad.activeChallenge?.isTitanRaid ? 'text-red-500 animate-pulse' : 'text-[var(--accent-xp)]'} />
                        <span>{activeSquad.activeChallenge?.isTitanRaid ? '🚨 active titan boss raid 🚨' : 'Active Squad Synergy Challenge'}</span>
                      </span>
                      {activeSquad.activeChallenge && (
                        <span className={`px-2 py-0.5 text-[8px] font-mono font-bold uppercase rounded ${
                          activeSquad.activeChallenge.status === 'completed' 
                            ? activeSquad.activeChallenge.isTitanRaid
                              ? 'bg-green-500/20 text-green-400 border border-green-500/30 animate-pulse'
                              : 'bg-[#33FF66]/20 text-[#33FF66] border border-[#33FF66]/30 animate-pulse'
                            : activeSquad.activeChallenge.isTitanRaid
                              ? 'bg-red-655/20 text-red-400 border border-red-650/30 animate-pulse'
                              : 'bg-[var(--primary)]/20 text-[var(--primary)] border border-[var(--primary)]/30'
                        }`}>
                          {activeSquad.activeChallenge.status}
                        </span>
                      )}
                    </div>

                    {activeSquad.activeChallenge ? (
                      <div className="flex flex-col gap-4">
                        {activeSquad.activeChallenge.isTitanRaid ? (
                          <div className="flex flex-col gap-4 animate-fadeIn">
                            <div className="flex flex-col gap-1 text-left relative z-10">
                              <span className="text-[10px] font-mono text-red-500 font-extrabold tracking-widest uppercase flex items-center gap-1 animate-pulse">
                                💀 WEEKLY TITAN BOSS RAID 💀
                              </span>
                              <h5 className="font-display font-black text-xl text-red-500 uppercase mt-0.5 tracking-wider drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]">
                                {activeSquad.activeChallenge.title}
                              </h5>
                            </div>

                            {/* Grid combining Description, Weakness, and Loot */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono">
                              {/* Boss Details */}
                              <div className="flex flex-col justify-center border-2 border-neutral-850 bg-black/40 p-3 rounded-xl text-left">
                                <span className="text-[8.5px] text-neutral-500 uppercase font-bold tracking-wider">Boss Description</span>
                                <p className="text-[10px] text-neutral-300 italic mt-1 leading-snug">
                                  "{activeSquad.activeChallenge.description}"
                                </p>
                              </div>

                              {/* Weakness: Legendary Tier */}
                              <div className="flex flex-col justify-center border-2 border-amber-500/50 bg-[#160f05]/90 p-3 rounded-xl text-left relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-amber-500 text-[8px] font-black text-black px-1.5 py-0.5 rounded-bl uppercase tracking-wider scale-90 origin-top-right">
                                  Legendary
                                </div>
                                <span className="text-[8.5px] text-amber-500/60 uppercase font-bold tracking-wider">Weakness (1.5x DMG)</span>
                                <span className="text-amber-400 font-extrabold uppercase flex items-center gap-1.5 mt-1 text-xs">
                                  <Flame size={12} className="text-amber-400 animate-pulse fill-amber-400/20 shrink-0" />
                                  <span className="truncate">{activeSquad.activeChallenge.weakness}</span>
                                </span>
                              </div>

                              {/* Loot: Mythic Tier */}
                              <div className="flex flex-col justify-center border-2 border-red-500/50 bg-[#1c0505]/95 p-3 rounded-xl text-left relative overflow-hidden">
                                <div className="absolute top-0 right-0 bg-red-650 text-[8px] font-black text-white px-1.5 py-0.5 rounded-bl uppercase tracking-wider scale-90 origin-top-right">
                                  Mythic Loot
                                </div>
                                <span className="text-[8.5px] text-red-500/60 uppercase font-bold tracking-wider">Loot Reward</span>
                                <span className="text-red-400 font-extrabold uppercase mt-1 text-xs truncate flex items-center gap-1.5">
                                  ⚔️ <span className="truncate">{activeSquad.activeChallenge.rewardName}</span>
                                </span>
                              </div>
                            </div>

                            {/* Health Bar (Clamped) */}
                            {(() => {
                              const currentHP = Math.max(0, activeSquad.activeChallenge.currentHP || 0);
                              const totalHP = activeSquad.activeChallenge.totalHP || 100;
                              const hpPercentage = Math.max(0, Math.min(100, (currentHP / totalHP) * 100));
                              return (
                                <div className="flex flex-col gap-2 mt-1">
                                  <div className="flex justify-between text-[10px] font-mono">
                                    <span className="text-red-500 font-extrabold uppercase tracking-widest flex items-center gap-1">
                                      🚨 TITAN ARMOR INTEGRITY
                                    </span>
                                    <span className="text-red-400 font-bold">{currentHP.toLocaleString()} / {totalHP.toLocaleString()} HP ({hpPercentage.toFixed(1)}%)</span>
                                  </div>
                                  <div className="h-7 w-full bg-neutral-950 border-2 border-red-900/60 rounded-xl overflow-hidden relative p-[3px] shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]">
                                    {/* Pulsing Backlight */}
                                    <div className="absolute inset-0 bg-red-955/20 animate-pulse" />
                                    {/* Health Progress with Striped Warning Pattern */}
                                    <div 
                                      className="h-full bg-red-650 rounded-lg transition-all duration-1000 ease-out shadow-[0_0_10px_rgba(239,68,68,0.8)] relative overflow-hidden"
                                      style={{ 
                                        width: `${hpPercentage}%`,
                                        backgroundImage: 'linear-gradient(45deg, rgba(255, 255, 255, 0.15) 25%, transparent 25%, transparent 50%, rgba(255, 255, 255, 0.15) 50%, rgba(255, 255, 255, 0.15) 75%, transparent 75%, transparent)',
                                        backgroundSize: '16px 16px'
                                      }}
                                    >
                                      {/* Animated overlay highlight */}
                                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                                    </div>
                                    {currentHP <= 0 && (
                                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-black text-white uppercase tracking-widest bg-green-950/90 border border-green-500 rounded-lg animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.4)]">
                                        ⚡ TITAN SLAYED ⚡
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Individual Damage Contributions (Simplified flex badges) */}
                            <div className="flex flex-col gap-1.5 text-left mt-1">
                              <span className="text-[9px] font-mono text-red-500/70 uppercase font-black tracking-widest flex items-center gap-1">
                                ⚔️ Squad Damage Ledger
                              </span>
                              <div className="flex flex-wrap gap-2 bg-neutral-950/40 border border-neutral-900 rounded-xl p-2.5">
                                {activeSquadMembers.map((m, idx) => {
                                  const dmg = activeSquad.activeChallenge.progress?.[m.uid] || 0;
                                  const maxDmg = Math.max(...activeSquadMembers.map(member => activeSquad.activeChallenge.progress?.[member.uid] || 0));
                                  const isTopDamager = dmg > 0 && maxDmg === dmg;
                                  return (
                                    <div 
                                      key={idx} 
                                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono transition-all ${
                                        isTopDamager 
                                          ? 'bg-red-950/30 border-red-500/50 text-red-400 shadow-[0_0_8px_rgba(239,68,68,0.1)]' 
                                          : 'bg-black/40 border-neutral-805 text-neutral-400'
                                      }`}
                                    >
                                      <span>{isTopDamager ? '🔥' : '⚔️'}</span>
                                      <span className="font-bold">{m.name.replace(' (You)', '')}:</span>
                                      <span className={isTopDamager ? 'text-white font-extrabold' : 'text-neutral-300 font-semibold'}>
                                        {dmg.toLocaleString()} DMG
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Standard sets-based challenge layout */
                          <div className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1 text-left">
                              <h5 className="font-display font-black text-base text-[var(--accent-xp)] uppercase">
                                {activeSquad.activeChallenge.title}
                              </h5>
                              <p className="text-xs text-neutral-300">
                                {activeSquad.activeChallenge.description}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-black/30 border border-[#222] p-3 rounded-lg">
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Target Sets ({activeSquad.activeChallenge.muscleGroup})</span>
                                <span className="text-white font-bold">{activeSquad.activeChallenge.totalCompletedSets} / {activeSquad.activeChallenge.targetSets} sets</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] text-neutral-500 uppercase">Premium Reward</span>
                                <span className="text-[var(--primary)] font-bold flex items-center gap-1">
                                  {activeSquad.activeChallenge.rewardType === 'bossFightKey' ? <Key size={12} /> : <Award size={12} />}
                                  <span>{activeSquad.activeChallenge.rewardName}</span>
                                </span>
                              </div>
                            </div>

                            {(() => {
                              const pct = Math.min(100, Math.round((activeSquad.activeChallenge.totalCompletedSets / activeSquad.activeChallenge.targetSets) * 100));
                              return (
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex justify-between text-[10px] font-mono text-neutral-400">
                                    <span>Synergy Progress</span>
                                    <span>{pct}%</span>
                                  </div>
                                  <div className="h-4 w-full bg-neutral-900 border-[#222] rounded-md overflow-hidden p-[2px]">
                                    <div 
                                      className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)] rounded-sm transition-all duration-500"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="flex flex-col gap-1.5 text-left">
                              <span className="text-[9px] font-mono text-neutral-500 uppercase font-bold">Individual Contributions:</span>
                              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                                {activeSquadMembers.map((m, idx) => {
                                  const count = activeSquad.activeChallenge.progress?.[m.uid] || 0;
                                  return (
                                    <div key={idx} className="flex justify-between items-center bg-black/20 px-3 py-1.5 rounded border border-[#111]">
                                      <span className="text-neutral-400 truncate pr-1">{m.name}</span>
                                      <span className="font-bold text-white shrink-0">{count} sets</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Regeneration Voting Card */}
                        {activeSquad.activeChallenge.status === 'active' && (
                          <div className="border border-[#222] bg-black/40 p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                            <div className="flex flex-col text-left">
                              <span className="text-[10px] font-mono text-white uppercase font-bold">Request Challenge Regeneration</span>
                              <span className="text-[9px] text-neutral-500 font-sans">
                                {activeSquad.hasRegeneratedThisWeek 
                                  ? "This week's regeneration has already been used." 
                                  : `Requires >50% approval. Votes: ${(activeSquad.regenerationVotes || []).length} / ${activeSquad.members?.length || 1} (Need ${Math.floor((activeSquad.members?.length || 1) / 2) + 1})`
                                }
                              </span>
                            </div>
                            {!activeSquad.hasRegeneratedThisWeek && (
                              <button
                                onClick={handleVoteRegenerate}
                                disabled={generatingChallenge}
                                className={`font-mono text-[9px] font-bold px-3 py-1.5 border border-black rounded shadow-[2px_2px_0px_black] uppercase cursor-pointer transition-all ${
                                  (activeSquad.regenerationVotes || []).includes(uid)
                                    ? 'bg-red-500 text-black hover:brightness-110'
                                    : 'bg-[var(--secondary)] text-black hover:brightness-110'
                                }`}
                              >
                                {(activeSquad.regenerationVotes || []).includes(uid) ? 'Cancel Vote' : 'Vote to Regenerate'}
                              </button>
                            )}
                          </div>
                        )}

                        {activeSquad.activeChallenge.status === 'completed' && (
                          <div className="flex flex-col gap-3 w-full">
                            <div className="border border-dashed border-[#33FF66]/30 bg-[#33FF66]/5 p-3 rounded-lg flex flex-col items-center justify-center gap-3">
                              <span className="text-xs font-mono text-[#33FF66] font-bold text-center">
                                🎉 Challenge Completed! The squad has successfully synchronized!
                              </span>
                              {activeSquad.activeChallenge.claimedBy?.[uid] ? (
                                <span className="text-xs font-mono text-[var(--accent-xp)] font-black uppercase border border-[var(--accent-xp)] px-3 py-1 rounded bg-[var(--accent-xp)]/10 flex items-center gap-1">
                                  <CheckCircle size={12} />
                                  <span>Reward Claimed</span>
                                </span>
                              ) : (
                                <button
                                  onClick={handleClaimReward}
                                  className="bg-[#33FF66] hover:bg-[#2ae058] text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer"
                                >
                                  Claim {activeSquad.activeChallenge.rewardName}!
                                </button>
                              )}
                            </div>

                            {/* Summon Next Titan Card */}
                            <div className="w-full border-2 border-black bg-neutral-950 p-4 rounded-xl shadow-[3px_3px_0px_black] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left">
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-mono text-purple-400 font-extrabold uppercase tracking-wider block">
                                  🌌 Titan Summon Portal
                                </span>
                                <span className="text-xs text-white font-bold font-mono">
                                  {cooldownTimeLeft > 0 ? (
                                    <>
                                      Portal Cooldown: <span className="text-red-500 font-extrabold">{formatCooldownTime(cooldownTimeLeft)}</span>
                                    </>
                                  ) : (
                                    <span className="text-green-500 font-extrabold">Portal Ready to Summon!</span>
                                  )}
                                </span>
                                <span className="text-[9px] text-neutral-500 font-sans leading-normal mt-1">
                                  {cooldownTimeLeft > 0 
                                    ? "Bypassing the 24h cooldown costs 2 Boss Keys. Waiting out the cooldown costs 1 Boss Key."
                                    : "Summoning the next Titan Raid costs 1 Boss Key."}
                                </span>
                              </div>
                              <button
                                onClick={handleSummonNextTitan}
                                disabled={summoningTitan}
                                className={`px-4 py-2 border-2 border-black text-xs font-mono font-bold uppercase rounded shadow-[2px_2px_0px_black] active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer shrink-0 ${
                                  cooldownTimeLeft > 0
                                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                                    : 'bg-green-500 text-black hover:bg-green-600'
                                }`}
                              >
                                {summoningTitan ? "Summoning..." : (
                                  <div className="flex items-center gap-1.5">
                                    <Key size={12} />
                                    <span>Summon Titan ({cooldownTimeLeft > 0 ? 2 : 1} Keys)</span>
                                  </div>
                                )}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="border border-dashed border-[#222] bg-neutral-900/30 p-6 rounded-lg text-center flex flex-col items-center justify-center gap-4">
                        <span className="text-xs font-sans text-neutral-500 leading-relaxed max-w-sm">
                          No active Synergy Challenge. Generate an AI-crafted fitness synergy challenge tailored to your squad's goals!
                        </span>
                        <button
                          onClick={handleGenerateSquadChallenge}
                          disabled={generatingChallenge}
                          className="flex items-center gap-2 bg-[var(--primary)] hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-lg border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer"
                        >
                          <Zap size={14} className={generatingChallenge ? "animate-spin" : ""} />
                          <span>{generatingChallenge ? "Consulting AI Coach..." : "Generate AI Synergy Challenge"}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Grid Layout for details */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* LEFT COLUMN: ROSTER, CHECK-INS & INVITES (5/12 cols) */}
                    <div className="lg:col-span-5 flex flex-col gap-6">
                      
                      {/* Roster Display */}
                      <div className="border-2 border-black bg-neutral-950/60 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Users size={18} className="text-[var(--primary)]" />
                            <span>Squad Roster ({activeSquadMembers.length})</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono text-[var(--text-secondary)] uppercase bg-black/40 px-2 py-0.5 border border-neutral-805 rounded">
                              {Math.round(totalVolume).toLocaleString()}kg
                            </span>
                            <button
                              onClick={() => setIsRosterCollapsed(!isRosterCollapsed)}
                              className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                            >
                              {isRosterCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                            </button>
                          </div>
                        </div>

                        {!isRosterCollapsed && (
                          <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                            {activeSquadMembers.map((mbr, idx) => {
                              const isLifting = presenceList.some(p => p.id === mbr.uid && p.time !== 'Not Going');
                              const avatarStyle = getAvatarStyle(mbr.aura, mbr.level, mbr.powerUps);
                              const hoursSinceLastWorkout = mbr.updatedAt 
                                ? (Date.now() - new Date(mbr.updatedAt).getTime()) / (1000 * 60 * 60)
                                : 999;
                              const isStreakExpiring = hoursSinceLastWorkout > 24 && (mbr.streak || 0) > 0 && !(mbr.powerUps?.streakShield > 0);

                              return (
                                <div key={idx} className="border border-neutral-850 bg-neutral-900/10 p-3.5 rounded-xl flex items-center justify-between hover:border-neutral-700/60 hover:bg-neutral-900/20 transition-all duration-300 shadow-md text-xs font-mono">
                                  <div 
                                    className="flex items-center gap-3 cursor-pointer hover:bg-neutral-850 p-1.5 rounded-xl transition-all"
                                    onClick={() => handleMemberClick(mbr)}
                                    title="Click to view profile & stats"
                                  >
                                    {/* Avatar with Aura & Border */}
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
                                      {/* Small presence green dot */}
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
                            })}
                          </div>
                        )}
                      </div>

                      {/* Presence Check-In Panel */}
                      <div className="border-2 border-black bg-neutral-950/60 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Calendar size={18} className="text-[var(--accent-xp)]" />
                            <span>Today's Gym Check-Ins</span>
                          </span>
                          <button
                            onClick={() => setIsCheckInsCollapsed(!isCheckInsCollapsed)}
                            className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {isCheckInsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>

                        {!isCheckInsCollapsed && (
                          <div className="flex flex-col gap-3">
                            {presenceList.length > 0 ? (
                              <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                                {presenceList.map((presence) => {
                                  const mInfo = activeSquadMembers.find(m => m.uid === presence.id);
                                  return (
                                    <div 
                                      key={presence.id} 
                                      className="border border-neutral-850 bg-neutral-950/40 p-3.5 rounded-xl flex items-center gap-2.5 font-mono text-xs text-left shadow-md cursor-pointer hover:border-neutral-700/60 hover:bg-neutral-900/20 transition-all"
                                      onClick={() => mInfo && handleMemberClick(mInfo)}
                                      title="Click to view profile & stats"
                                    >
                                      <span className="text-sm">{presence.time === 'Not Going' ? '😴' : '🏋️‍♂️'}</span>
                                      <div className="flex flex-col">
                                        <span className="text-white font-bold">{presence.name}</span>
                                        <span className="text-[9px] text-[var(--accent-xp)] uppercase font-bold">
                                          {presence.time === 'Not Going' ? 'Not hitting the gym today ❌' : `Going to Gym today at ${presence.time}`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="py-6 px-4 border border-dashed border-neutral-800 rounded-xl text-center flex flex-col items-center justify-center gap-2 bg-neutral-950/20">
                                <Calendar className="text-neutral-600 animate-pulse" size={24} />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-mono text-white font-bold uppercase">No Check-Ins</span>
                                  <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                    Let your squad know when you're hitting the gym today.
                                  </span>
                                </div>
                              </div>
                            )}

                            <form onSubmit={handleCheckIn} className="border-t border-neutral-850/60 pt-3 flex flex-col gap-3">
                              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Check In Gym Time Today</span>
                              <div className="flex gap-2">
                                <select
                                  value={checkInTime}
                                  onChange={(e) => setCheckInTime(e.target.value)}
                                  className="bg-black border border-neutral-850 focus:border-[var(--accent-xp)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--accent-xp)] w-full cursor-pointer transition-all"
                                >
                                  {['05:00', '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', 'Not Going'].map(t => (
                                    <option key={t} value={t}>{t}</option>
                                  ))}
                                </select>
                                <button
                                  type="submit"
                                  className="bg-[var(--accent-xp)] text-black font-display font-black text-xs px-5 py-2.5 rounded-xl uppercase cursor-pointer shrink-0 hover:brightness-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(181,255,45,0.15)]"
                                >
                                  {checkInTime === 'Not Going' ? 'Confirm' : "I'm Going"}
                                </button>
                              </div>
                            </form>
                          </div>
                        )}
                      </div>

                      {/* Share Code Widget */}
                      <div className="flex items-center justify-between border-2 border-black bg-neutral-950/60 p-4 rounded-2xl shadow-[4px_4px_0px_black]">
                        <div className="flex flex-col gap-0.5 text-left">
                          <span className="text-[10px] font-mono text-white uppercase font-bold">Invite Gym Bros</span>
                          <span className="text-[9px] text-neutral-500">Share this code to let friends join:</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(activeSquad.squadCode);
                            showAppAlert('Squad Code copied to clipboard!', 'Success');
                          }}
                          className="bg-[var(--primary)] text-black font-display font-black text-[10px] px-3.5 py-2.5 rounded-xl uppercase cursor-pointer flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all shadow-[0_0_12px_rgba(255,92,0,0.15)]"
                        >
                          <Copy size={12} />
                          <span>Code: {activeSquad.squadCode}</span>
                        </button>
                      </div>

                    </div>

                    {/* RIGHT COLUMN: ACTIVITY FEED & POLLS (7/12 cols) */}
                    <div className="lg:col-span-7 flex flex-col gap-6">
                      
                      {/* Live Squad Activity Feed */}
                      <div className="border-2 border-black bg-neutral-950/60 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <TrendingUp size={18} className="text-[var(--primary)]" />
                            <span>Squad Activity Feed</span>
                          </span>
                          <button
                            onClick={() => setIsActivityFeedCollapsed(!isActivityFeedCollapsed)}
                            className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {isActivityFeedCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>

                        {!isActivityFeedCollapsed && (
                          <div className="flex flex-col gap-4 max-h-[420px] overflow-y-auto pr-1">
                            {activityList.length > 0 ? (
                              activityList.map((activity) => {
                                const memberInfo = activeSquadMembers.find(m => m.uid === activity.uid);
                                const avatarUrl = memberInfo?.avatarUrl;
                                const aura = memberInfo?.aura;
                                const levelVal = memberInfo?.level;
                                const avatarStyle = getAvatarStyle(aura, levelVal, memberInfo?.powerUps);

                                const hasHighFived = activity.highFives?.includes(uid);
                                const hasKudosed = activity.kudos?.includes(uid);

                                let cardClass = "border border-neutral-800 bg-neutral-900/10 p-4 rounded-xl flex flex-col gap-3 relative shadow-sm hover:border-neutral-700/80 hover:scale-[1.01] transition-all duration-200 cursor-pointer";
                                let themeTitleColor = "text-white";
                                let themeBadge = null;

                                if (activity.cardTheme === 'pr_smash') {
                                  cardClass = "border-2 border-slate-300 bg-gradient-to-b from-[#1b1f24] to-[#0f1115] p-4 rounded-xl flex flex-col gap-3 relative shadow-[0_0_12px_rgba(203,213,225,0.18)] hover:border-slate-200 hover:scale-[1.01] transition-all duration-200 cursor-pointer";
                                  themeTitleColor = "text-slate-200";
                                  themeBadge = (
                                    <span className="text-[8px] bg-slate-200/20 text-slate-200 border border-slate-200/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(203,213,225,0.4)]">
                                      🏆 PR SMASH
                                    </span>
                                  );
                                } else if (activity.cardTheme === 'titan_slayer') {
                                  cardClass = "border-2 border-red-650 bg-gradient-to-b from-[#1a0b0b] to-[#080202] p-4 rounded-xl flex flex-col gap-3 relative shadow-[0_0_12px_rgba(239,68,68,0.2)] hover:border-red-500 hover:scale-[1.01] transition-all duration-200 cursor-pointer";
                                  themeTitleColor = "text-red-400";
                                  themeBadge = (
                                    <span className="text-[8px] bg-red-600/20 text-red-400 border border-red-600/30 px-1.5 py-0.5 rounded uppercase font-bold flex items-center gap-0.5 shadow-[0_0_8px_rgba(239,68,68,0.4)] animate-pulse">
                                      👹 TITAN SLAYER
                                    </span>
                                  );
                                }

                                return (
                                  <div 
                                    key={activity.id} 
                                    className={cardClass}
                                    onClick={() => setSelectedActivityId(activity.id)}
                                  >
                                    {/* Top Row: User Avatar & Name */}
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

                                    {/* Middle Row: Workout Details */}
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
                                        <span>
                                          Sets: <strong className="text-slate-200">{activity.totalSets}</strong>
                                        </span>
                                        <span className="text-neutral-700 select-none">•</span>
                                        <span>
                                          Exercises: <strong className="text-slate-200">{activity.exercisesCount}</strong>
                                        </span>
                                        <span className="text-neutral-700 select-none">•</span>
                                        <span>
                                          Volume: <strong className="text-slate-200">{Math.round(activity.totalVolume).toLocaleString()}kg</strong>
                                        </span>
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

                                    {/* Bottom Row: Kudos & High Five Reactions */}
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

                                      {/* Floating Emojis Animation container */}
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
                              })
                            ) : (
                              <div className="py-8 px-4 border border-dashed border-neutral-800 rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-neutral-950/20">
                                <MessageSquare className="text-neutral-600 animate-pulse" size={32} />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-mono text-white font-bold uppercase">No Activity</span>
                                  <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                    No workouts logged by your squad members yet. Push harder and log your sets!
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Scheduler Polls Panel */}
                      <div className="border-2 border-black bg-neutral-950/60 p-5 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                        <div className="flex justify-between items-center border-b border-neutral-800/60 pb-3">
                          <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                            <Vote size={18} className="text-[var(--primary)]" />
                            <span>Squad Scheduler Polls</span>
                          </span>
                          <button
                            onClick={() => setIsPollsCollapsed(!isPollsCollapsed)}
                            className="text-neutral-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {isPollsCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                          </button>
                        </div>

                        {!isPollsCollapsed && (
                          <div className="flex flex-col gap-4">
                            {pollsList.length > 0 ? (
                              <div className="flex flex-col gap-3 max-h-[300px] overflow-y-auto pr-1">
                                {pollsList.map((poll) => {
                                  const totalVotes = Object.keys(poll.votes || {}).length;
                                  return (
                                    <div key={poll.id} className="border border-neutral-850 bg-neutral-950/40 p-4 rounded-xl shadow-md flex flex-col gap-3 font-mono text-xs text-left">
                                      <div className="flex justify-between items-start gap-2 border-b border-neutral-800/40 pb-2">
                                        <div className="flex flex-col">
                                          <span className="text-xs text-[var(--primary)] font-bold">{poll.question}</span>
                                          <span className="text-[8px] text-neutral-500 uppercase mt-0.5 font-bold">Started by {poll.creatorName} • {totalVotes} votes</span>
                                        </div>
                                      </div>

                                      <div className="flex flex-col gap-2">
                                        {poll.options.map((opt, optIdx) => {
                                          const votesForOption = Object.values(poll.votes || {}).filter(v => v === optIdx).length;
                                          const pct = totalVotes > 0 ? Math.round((votesForOption / totalVotes) * 100) : 0;
                                          const hasVoted = poll.votes?.[uid] === optIdx;

                                          return (
                                            <button
                                              key={optIdx}
                                              onClick={() => handleVote(poll.id, optIdx)}
                                              className={`relative w-full border border-neutral-800 hover:border-[var(--primary)] text-left px-4 py-3 rounded-xl font-mono text-xs text-white uppercase cursor-pointer transition-all overflow-hidden flex justify-between items-center ${
                                                hasVoted ? 'bg-black border-[var(--primary)] shadow-[0_0_10px_rgba(255,92,0,0.1)]' : 'bg-neutral-950/40 hover:bg-neutral-900/30'
                                              }`}
                                            >
                                              <div 
                                                className={`absolute top-0 left-0 bottom-0 ${hasVoted ? 'bg-[var(--primary)]/15' : 'bg-neutral-800/35'} transition-all`}
                                                style={{ width: `${pct}%`, zIndex: 0 }}
                                              />
                                              <span className="z-10 font-bold flex items-center gap-1.5">
                                                {hasVoted && <span className="text-[var(--primary)] text-sm">●</span>}
                                                <span>{opt}</span>
                                              </span>
                                              <span className="z-10 text-[10px] text-neutral-400 font-black shrink-0">{votesForOption} votes ({pct}%)</span>
                                            </button>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="py-8 px-4 border border-dashed border-neutral-800 rounded-xl text-center flex flex-col items-center justify-center gap-3 bg-neutral-950/20">
                                <Vote className="text-neutral-600 animate-pulse" size={32} />
                                <div className="flex flex-col gap-0.5">
                                  <span className="text-xs font-mono text-white font-bold uppercase">No Polls Active</span>
                                  <span className="text-[10px] text-neutral-500 max-w-xs font-sans">
                                    Coordinate your next workout day or gym timing. Start a scheduler poll below!
                                  </span>
                                </div>
                              </div>
                            )}

                            <form onSubmit={handleCreatePoll} className="border-t border-neutral-850/60 pt-4 flex flex-col gap-3">
                              <span className="text-[10px] font-mono text-[var(--text-secondary)] uppercase font-bold tracking-wider">Start Gym Schedule Poll</span>
                              
                              <div className="flex flex-col gap-1.5">
                                <label className="text-[8px] font-mono text-neutral-500 uppercase font-bold tracking-wider">Question / Goal</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. When are we hitting chest tomorrow?"
                                  value={pollQuestion}
                                  onChange={(e) => setPollQuestion(e.target.value)}
                                  className="bg-black border border-neutral-800 focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
                                />
                              </div>

                              <div className="flex flex-col gap-1.5">
                                <label className="text-[8px] font-mono text-neutral-500 uppercase font-bold tracking-wider">Options (comma-separated times/days)</label>
                                <input
                                  type="text"
                                  required
                                  placeholder="e.g. 06:00, 16:30, 18:00"
                                  value={pollOptionsInput}
                                  onChange={(e) => setPollOptionsInput(e.target.value)}
                                  className="bg-black border border-neutral-800 focus:border-[var(--primary)] px-4 py-2.5 rounded-xl text-xs font-mono text-white focus:outline-none focus:ring-1 focus:ring-[var(--primary)] w-full transition-all"
                                />
                              </div>

                              <button
                                type="submit"
                                disabled={creatingPoll}
                                className="bg-[var(--primary)] hover:brightness-110 disabled:bg-neutral-800 disabled:text-neutral-500 disabled:cursor-not-allowed text-black font-display font-black text-xs uppercase px-5 py-2.5 rounded-xl shadow-[0_0_12px_rgba(255,92,0,0.15)] active:scale-95 transition-all cursor-pointer self-end mt-2 flex items-center gap-1.5"
                              >
                                <Plus size={14} />
                                <span>Launch Poll</span>
                              </button>
                            </form>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>

                </div>
    </>
  );
};
