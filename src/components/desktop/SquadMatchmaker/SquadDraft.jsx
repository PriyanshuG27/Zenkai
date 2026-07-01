import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sliders, Search, ShieldAlert, AlertTriangle, TrendingUp, CheckCircle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SquadDraft = (props) => {
  const navigate = useNavigate();
  const {
    profile,
    realFreeAgents,
    sortedFreeAgents,
    sortField,
    setSortField,
    sortAsc,
    setSortAsc,
    handleInviteAgent,
    isAgentInvitePending,
    setSelectedAgent,
    handleDraftAgent,
    handleToggleLookingForSquad,
    handleMemberClick,
    isAgentInSquad
  } = props;

  const activeTab = 'draft';

  return (
    <>
              <div className="flex flex-col gap-6 animate-fadeIn">
                  
                  {/* Scouting matrix deck */}
                  <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                    <div className="border-b border-[#222] pb-3 flex justify-between items-center">
                      <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <Sliders className="text-[var(--primary)]" size={18} />
                        <span>University Gym Scouting Matrix</span>
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase">
                        Real-Time Free Agent Registry
                      </span>
                    </div>

                    {/* Free Agent Opt-In Registry / Home Gym Warning */}
                    {!profile?.gymId ? (
                      <div className="border border-red-500/30 bg-red-950/20 p-3 rounded-lg flex items-start justify-between gap-3 text-xs font-mono text-red-500">
                        <div className="flex items-start gap-2.5">
                          <AlertTriangle className="shrink-0 text-red-500 mt-0.5" size={16} />
                          <div className="flex flex-col text-left">
                            <span className="font-bold uppercase">Gym Configuration Required</span>
                            <span className="text-[10px] text-neutral-400 font-sans mt-0.5 leading-relaxed">
                              Set your Home Gym in your Profile to register as a Free Agent and appear in the Scouting Matrix.
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => navigate('/profile')}
                          className="shrink-0 flex items-center gap-1.5 bg-red-500 hover:bg-red-400 text-black font-display font-black text-[10px] px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase cursor-pointer transition-all"
                        >
                          <ExternalLink size={10} />
                          Go to Profile
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-black/30 p-3.5 rounded-lg border border-neutral-900 text-xs font-mono text-white">
                        <div className="flex flex-col text-left">
                          <span className="font-bold">Register as Free Agent (Open to Squad Invites)</span>
                          <span className="text-[9px] text-neutral-500 mt-0.5">
                            Currently matching with other lifters at <strong className="text-white">{profile.gymName || 'your gym'}</strong>.
                          </span>
                        </div>
                        <button
                          onClick={handleToggleLookingForSquad}
                          className={`px-3.5 py-1.5 border border-black rounded shadow-[2px_2px_0px_black] uppercase font-bold transition-all cursor-pointer ${
                            profile.lookingForSquad
                              ? 'bg-[var(--secondary)] text-black font-black hover:brightness-110'
                              : 'bg-neutral-800 text-white hover:bg-neutral-700'
                          }`}
                        >
                          {profile.lookingForSquad ? 'ON (Looking for Squad)' : 'OFF (Not looking)'}
                        </button>
                      </div>
                    )}

                    {/* Sorting Controls */}
                    <div className="flex flex-wrap gap-2.5 items-center bg-black/30 p-3 rounded-lg border border-neutral-900 text-xs font-mono">
                      <span className="text-neutral-500 uppercase text-[9px] font-extrabold">Sort Matrix:</span>
                      {['consistency', 'squatPR', 'benchPR', 'streak'].map(field => (
                        <button
                          key={field}
                          onClick={() => {
                            if (sortField === field) {
                              setSortAsc(!sortAsc);
                            } else {
                              setSortField(field);
                              setSortAsc(false);
                            }
                          }}
                          className={`px-3 py-1.5 border border-black rounded shadow-[1.5px_1.5px_0px_black] uppercase font-bold transition-all cursor-pointer ${
                            sortField === field ? 'bg-[var(--primary)] text-black' : 'bg-black text-white hover:bg-neutral-900'
                          }`}
                        >
                          {field === 'consistency' ? 'Consistency %' :
                           field === 'squatPR' ? 'Squat PR' :
                           field === 'benchPR' ? 'Bench PR' : 'Streak'} 
                          {sortField === field && (sortAsc ? ' ⬆️' : ' ⬇️')}
                        </button>
                      ))}
                    </div>

                    {/* Scouting Table */}
                    <div className="overflow-x-auto w-full">
                      <table className="w-full text-left font-mono text-xs border-collapse">
                        <thead>
                          <tr className="border-b-2 border-black text-neutral-500 uppercase text-[9px]">
                            <th className="py-2.5 px-3">Name / Handle</th>
                            <th className="py-2.5 px-3">Consistency</th>
                            <th className="py-2.5 px-3">Squat PR</th>
                            <th className="py-2.5 px-3">Bench PR</th>
                            <th className="py-2.5 px-3">Goal Focus</th>
                            <th className="py-2.5 px-3">Streak</th>
                            <th className="py-2.5 px-3 text-right">Draft Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sortedFreeAgents.length === 0 ? (
                            <tr>
                              <td colSpan="7" className="py-8 text-center text-neutral-500 font-sans text-xs italic">
                                {!profile?.gymId 
                                  ? "Please set your Home Gym in your profile to scout lifters." 
                                  : "No other free agents found at your gym right now."}
                              </td>
                            </tr>
                          ) : (
                            sortedFreeAgents.map((agent) => (
                              <tr key={agent.uid} className="border-b border-[#222] hover:bg-black/30 transition-all">
                                <td className="py-3.5 px-3 text-white font-bold cursor-pointer hover:underline" onClick={() => handleMemberClick(agent)}>{agent.name}</td>
                                <td className="py-3.5 px-3 text-[var(--accent-xp)] font-bold">{agent.consistency}%</td>
                                <td className="py-3.5 px-3">{agent.squatPR} kg</td>
                                <td className="py-3.5 px-3">{agent.benchPR} kg</td>
                                <td className="py-3.5 px-3 uppercase text-[10px]">{agent.goal}</td>
                                <td className="py-3.5 px-3 font-bold">{agent.streak} Days</td>
                                <td className="py-3.5 px-3 text-right flex justify-end gap-2.5">
                                  <button
                                    onClick={() => handleMemberClick(agent)}
                                    className="px-3 py-1 bg-black hover:bg-neutral-900 border-2 border-black text-[10px] text-white font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] transition-all cursor-pointer"
                                  >
                                    Scout
                                  </button>
                                  {isAgentInSquad(agent.uid) ? (
                                    <button
                                      disabled
                                      className="px-3 py-1 bg-neutral-800 border-2 border-black text-[10px] text-neutral-500 font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] cursor-not-allowed"
                                    >
                                      Member
                                    </button>
                                  ) : isAgentInvitePending(agent.uid) ? (
                                    <button
                                      disabled
                                      className="px-3 py-1 bg-neutral-900 border-2 border-black text-[10px] text-neutral-500 font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] cursor-not-allowed"
                                    >
                                      Pending Invite
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleDraftAgent(agent)}
                                      className="px-3 py-1 bg-[var(--primary)] hover:brightness-110 border-2 border-black text-[10px] text-black font-bold uppercase rounded shadow-[1.5px_1.5px_0px_black] transition-all cursor-pointer"
                                    >
                                      Draft
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
    </>
  );
};
