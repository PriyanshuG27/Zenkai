import { Swords, Info, Zap, Flame, Target, Sliders, AlertTriangle, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis as ReXAxis, YAxis as ReYAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';

export const SquadWarroom = (props) => {
  const {
    activeSquad,
    activeSquadMembers,
    profile,
    inactiveMembers,
    squadWeeklyXPTrajectory,
    multiplier,
    totalVolume,
    setSuccessMsg
  } = props;

  const activeTab = 'warroom';

  return (
    <>
              <div className="flex flex-col gap-6 animate-fadeIn">
                  
                  {/* Alarm Warning on Decay */}
                  {inactiveMembers.length > 0 && (
                    <div className="border-4 border-black bg-red-950/20 p-5 rounded-2xl shadow-[4px_4px_0px_rgba(239,68,68,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-left border-red-500">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="text-red-500 shrink-0 mt-0.5 animate-bounce" size={24} />
                        <div className="flex flex-col gap-0.5">
                          <h4 className="font-display font-black text-lg text-red-500 uppercase tracking-wide">
                            🚨 COMMAND DECAY WARNING
                          </h4>
                          <p className="text-xs text-neutral-200 font-sans leading-relaxed">
                            {inactiveMembers.map(m => m.name.replace(' (You)', '')).join(', ')} {inactiveMembers.length === 1 ? 'has' : 'have'} missed check-ins. XP Multiplier will decay to 0.8x in 4 hours unless they log!
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          const names = inactiveMembers.map(m => m.name.replace(' (You)', '')).join(' and ');
                          const msg = `Yo ${names}! You've been MIA from our Zenkai gym squad. Our XP multiplier is about to decay! Go log your workout right now. - Zenkai Squad ⚡`;
                          navigator.clipboard.writeText(msg);
                          setSuccessMsg('Nudge copied! Send it via WhatsApp/Slack.');
                          setTimeout(() => setSuccessMsg(''), 4000);
                        }}
                        className="bg-red-500 hover:bg-red-600 text-black font-display font-black text-xs uppercase px-5 py-2.5 border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer shrink-0"
                      >
                        Nudge Bros
                      </button>
                    </div>
                  )}

                  {/* Cumulative XP Trajectory Chart */}
                  <div className="border-2 border-black bg-black/45 p-6 rounded-2xl shadow-[4px_4px_0px_black] flex flex-col gap-4 text-left">
                    <div className="border-b border-[#222] pb-3 flex justify-between items-center">
                      <span className="font-display font-black text-sm text-white uppercase tracking-wider flex items-center gap-2">
                        <TrendingUp className="text-[var(--secondary)]" size={18} />
                        <span>Squad Weekly Trajectory</span>
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500 uppercase">
                        Cumulative XP Generation vs Ghost Squad
                      </span>
                    </div>

                    <div className="h-[280px] w-full mt-4 font-mono text-[9px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={squadWeeklyXPTrajectory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid stroke="#222" strokeDasharray="3 3" />
                          <ReXAxis dataKey="day" stroke="#888" tickLine={false} />
                          <ReYAxis stroke="#888" tickLine={false} />
                          <ReTooltip contentStyle={{ backgroundColor: '#151515', border: '2px solid black', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="Squad" stroke="var(--secondary)" strokeWidth={3} activeDot={{ r: 6 }} />
                          <Line type="monotone" dataKey="Ghost" stroke="#FF5C00" strokeWidth={2} strokeDasharray="5 5" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* squad summary stats bento cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left font-mono">
                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Multiplier status</span>
                      <span className="text-xl font-display font-black text-[var(--accent-xp)] uppercase">
                        {multiplier.toFixed(2)}x Active
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        +{Math.round((multiplier - 1.0) * 100)}% bonus XP awarded to all logged sessions.
                      </span>
                    </div>
                    
                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Inactive Warning</span>
                      <span className={`text-xl font-display font-black uppercase ${inactiveMembers.length > 0 ? 'text-red-500 animate-pulse' : 'text-green-500'}`}>
                        {inactiveMembers.length > 0 ? `${inactiveMembers.length} Decay Risks` : '0 Members Inactive'}
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        {inactiveMembers.length > 0 ? 'Teammate streak decay danger. Send clip nudges.' : 'All members checked in and active within 24h.'}
                      </span>
                    </div>

                    <div className="border border-neutral-900 bg-black/40 p-4.5 rounded-xl flex flex-col gap-1">
                      <span className="text-[9px] text-neutral-500 uppercase">Squad volume target</span>
                      <span className="text-xl font-display font-black text-[var(--primary)] uppercase">
                        {Math.round(totalVolume)} / 8000 kg
                      </span>
                      <span className="text-[10px] text-neutral-400 font-sans leading-normal mt-0.5">
                        Cumulative weekly lift volume target. Reaching 8K unlocks rare Boss key.
                      </span>
                    </div>
                  </div>

                </div>
    </>
  );
};
