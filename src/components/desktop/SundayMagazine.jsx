import React, { useState, useEffect } from 'react';
import { Newspaper, Flame, RefreshCw, Award, Target, HelpCircle, Activity, Sparkles, BookOpen, Quote, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { callZenkaiAPI } from '../../lib/apiClient';
import { motion } from 'framer-motion';

const activeMagazineFetches = new Set();

const ZODIAC_SIGNS = [
  { key: 'aries', name: 'ARIES', symbol: '♈', range: 'MAR 21 - APR 19', prediction: "Beware of the 'Leg Day Traffic Jam' this week. Expect crowded gyms, but don't let that deter you from squatting your way to gains.", lucky: "Zercher Squat" },
  { key: 'taurus', name: 'TAURUS', symbol: '♉', range: 'APR 20 - MAY 20', prediction: "Your steady strength is your superpower. Slow, controlled eccentric reps on the bench will yield massive hypertrophy returns. Skip the rush.", lucky: "Incline DB Bench" },
  { key: 'gemini', name: 'GEMINI', symbol: '♊', range: 'MAY 21 - JUN 20', prediction: "Your energy is split between cardio speed and lifting power. Align your dual nature by running a fast warm-up before hitting heavy deadlifts.", lucky: "Trap Bar Deadlift" },
  { key: 'cancer', name: 'CANCER', symbol: '♋', range: 'JUN 21 - JUL 22', prediction: "Create a protective shield around your workout space. Put on your headphones, block out the gym noise, and execute your sets with absolute focus.", lucky: "Barbell Row" },
  { key: 'leo', name: 'LEO', symbol: '♌', range: 'JUL 23 - AUG 22', prediction: "This week, your charisma will be matched only by the intensity of your workouts. Roar loud and squat heavy. Avoid machine training.", lucky: "Deadlifts" },
  { key: 'virgo', name: 'VIRGO', symbol: '♍', range: 'AUG 23 - SEP 22', prediction: "Precision is key. Double-check your setup form and track your sets meticulously. A slight adjustment to your grip width will unlock a PR.", lucky: "Overhead Press" },
  { key: 'libra', name: 'LIBRA', symbol: '♎', range: 'SEP 23 - OCT 22', prediction: "Balance your pushing and pulling movements this week to prevent shoulder fatigue. Focus on muscle symmetry and slow tempo.", lucky: "Pull-Ups" },
  { key: 'scorpio', name: 'SCORPIO', symbol: '♏', range: 'OCT 23 - NOV 21', prediction: "Intensity runs deep in your veins. Push past your usual comfort zone on your final AMRAP set. The weights will submit to your willpower.", lucky: "Hack Squat" },
  { key: 'sagittarius', name: 'SAGITTARIUS', symbol: '♐', range: 'NOV 22 - DEC 21', prediction: "Target your goals with laser precision. Shoot for higher reps and keep rest periods short. A sudden boost of gym aura is coming.", lucky: "Lateral Raise" },
  { key: 'capricorn', name: 'CAPRICORN', symbol: '♑', range: 'DEC 22 - JAN 19', prediction: "Capricorns are known for their discipline. Channel that into consistent, balanced training, and the gains will follow. Push through.", lucky: "Bench Press" },
  { key: 'aquarius', name: 'AQUARIUS', symbol: '♒', range: 'JAN 20 - FEB 18', prediction: "Break the mold and try a new accessory movement this week. Your muscles need a novel stimulus to break through your current strength plateau.", lucky: "Face Pulls" },
  { key: 'pisces', name: 'PISCES', symbol: '♓', range: 'FEB 19 - MAR 20', prediction: "Trust your muscle-mind connection. Close your eyes during the isometric holds to feel the deep muscle fibers contracting. Rest well.", lucky: "Bicep Curls" }
];

export const SundayMagazine = () => {
  const { uid } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [magazineData, setMagazineData] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reprintCount, setReprintCount] = useState(0);
  const [selectedZodiac, setSelectedZodiac] = useState('aries');

  // Load Google Fonts for handwriting and newspaper styling dynamically on mount
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@700&family=Playfair+Display:ital,wght@0,700;0,900;1,400&family=Special+Elite&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  const fetchMagazine = async (forceRefresh = false) => {
    if (!uid) return;
    
    // Prevent duplicate simultaneous requests for the same UID
    if (activeMagazineFetches.has(uid) && !forceRefresh) {
      console.log('[SundayMagazine] Fetch already in progress for user, blocking duplicate.');
      return;
    }

    activeMagazineFetches.add(uid);
    if (forceRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const res = await callZenkaiAPI('generateWeeklyMagazine', { reprint: forceRefresh });
      if (res && res.data && res.data.success) {
        setMagazineData(res.data.magazine);
        setTelemetry(res.data.telemetry);
        setReprintCount(res.data.reprintCount || 0);
      } else {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error('[SundayMagazine] Fetch error:', err);
      setError(err.message || 'Failed to generate weekly magazine.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      activeMagazineFetches.delete(uid);
    }
  };

  useEffect(() => {
    fetchMagazine();
  }, [uid]);

  if (loading) {
    return (
      <div className="w-full max-w-[1440px] mx-auto px-4 py-16 flex flex-col items-center justify-center min-h-[90vh] bg-[var(--bg-oled)] text-white font-sans">
        <div className="border-4 border-black bg-[var(--surface)] p-8 rounded-2xl shadow-[6px_6px_0px_black] max-w-md w-full flex flex-col items-center gap-6">
          <Newspaper size={48} className="text-[var(--primary)] animate-pulse" />
          <div className="flex flex-col gap-2 text-center">
            <h3 className="font-display font-black text-xl uppercase tracking-wider">Printing Sunday Issue...</h3>
            <p className="text-xs font-mono text-neutral-400">Interviewing Coach Llama & compiling weekly training telemetry logs.</p>
          </div>
          <div className="w-full bg-neutral-900 border-2 border-black rounded-full h-4 overflow-hidden p-[1px]">
            <div className="bg-gradient-to-r from-[var(--primary)] to-[var(--accent-xp)] h-full rounded animate-[pulse_1.5s_infinite] w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  const todayString = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  const getZodiacData = (key) => {
    const staticData = ZODIAC_SIGNS.find(z => z.key === key);
    const aiData = magazineData?.horoscope?.[key];
    return {
      ...staticData,
      prediction: aiData?.prediction || staticData.prediction,
      lucky: aiData?.luckyLift || staticData.lucky
    };
  };

  const selectedIdx = ZODIAC_SIGNS.findIndex(z => z.key === selectedZodiac);
  const displaySigns = [
    getZodiacData(ZODIAC_SIGNS[selectedIdx].key),
    getZodiacData(ZODIAC_SIGNS[(selectedIdx + 1) % 12].key),
    getZodiacData(ZODIAC_SIGNS[(selectedIdx + 2) % 12].key),
  ];

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 py-6 flex flex-col gap-8 bg-[#e8dfc7] text-[#1e1e1c] min-h-[90vh] font-sans">
      
      {/* Header and Controls */}
      <div className="border-b-4 border-black pb-5 mt-2 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none text-[#1a1a18] flex items-center gap-3">
            <Newspaper className="text-neutral-800" size={32} />
            <span>📰 SUNDAY SPORTS MAGAZINE</span>
          </h1>
          <p className="text-xs font-mono text-[#2d2d2a] uppercase tracking-wider mt-2.5 flex items-center gap-2">
            <span>Issue 24</span>
            <span className="text-neutral-500">|</span>
            <span className="text-neutral-800 font-bold">{todayString}</span>
          </p>
        </div>

        <button
          onClick={() => fetchMagazine(true)}
          disabled={refreshing || reprintCount >= 1}
          className="flex items-center gap-2 border-2 border-black bg-white hover:bg-neutral-100 text-black font-mono text-xs uppercase px-4 py-2.5 rounded-lg shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          <span>
            {refreshing 
              ? 'Refreshing Print...' 
              : reprintCount >= 1 
                ? 'Reprint Limit Reached' 
                : 'Reprint Weekly Issue'}
          </span>
        </button>
      </div>

      {error ? (
        <div className="border-4 border-black bg-white p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left max-w-lg mx-auto flex flex-col gap-4">
          <div className="flex items-center gap-2 text-red-650 font-bold uppercase font-mono text-sm">
            <AlertTriangle size={18} />
            <span>Magazine Print Jammed</span>
          </div>
          <p className="text-xs text-neutral-800 font-sans leading-relaxed">{error}</p>
          <button
            onClick={() => fetchMagazine()}
            className="w-full text-center border-2 border-black bg-[var(--primary)] text-black font-display font-black text-xs uppercase py-2.5 rounded-lg shadow-[3px_3px_0px_black]"
          >
            Retry Printing
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT COLUMN: Main Editorial Newspaper Page (col-span-8) */}
          <div className="lg:col-span-8 border-4 border-black bg-[#fdfbf7] text-[#1a1a18] p-6 md:p-8 rounded-2xl shadow-[5px_5px_0px_black] flex flex-col gap-6 text-left relative overflow-hidden font-serif">
            
            {/* Newspaper Heading Mask */}
            <div className="border-b-4 border-double border-black pb-4 text-center">
              <h2 className="font-serif font-black text-3xl md:text-5xl uppercase tracking-tighter text-black leading-none select-none">
                ZENKAI CHRONICLES
              </h2>
              <div className="flex justify-between items-center text-[9px] font-mono font-bold uppercase border-t border-black mt-2 pt-2 px-1 text-neutral-600">
                <span>Vol. I // Issue XXIV</span>
                <span>Sunday Edition</span>
                <span>Price: 100 XP</span>
              </div>
            </div>

            {/* Editorial Headline */}
            <div className="flex flex-col gap-2 border-b border-neutral-300 pb-5">
              <h3 className="font-serif font-black text-2xl md:text-4xl text-black leading-tight italic">
                {magazineData.headline ? magazineData.headline.replace(/^["']|["']$/g, '') : ''}
              </h3>
              <p className="text-xs font-mono font-bold text-neutral-500 uppercase tracking-wide mt-1">
                {magazineData.subheadline}
              </p>
            </div>

            {/* Editorial Body (Multi-column) */}
            <div className="columns-1 md:columns-2 gap-8 text-neutral-850 leading-relaxed text-sm font-sans pt-1 border-b border-neutral-250 pb-6 text-justify">
              {/* Drop cap for editorial */}
              <span className="float-left text-5xl font-serif font-black text-black mr-2 mt-1 leading-none">
                {magazineData.editorial.charAt(0)}
              </span>
              <p className="inline">
                {magazineData.editorial.slice(1)}
              </p>
            </div>

            {/* Cues Vault overlay schematic */}
            {telemetry.desk_vault_cues && telemetry.desk_vault_cues.length > 0 ? (
              <div className="border-2 border-black bg-[#f5efe4] p-6 rounded-xl flex flex-col gap-4 relative overflow-hidden">
                <div className="border-b border-black pb-1.5 flex justify-between items-center text-xs font-mono font-bold">
                  <span className="text-black uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={14} className="text-neutral-700" />
                    <span>BIOMECHANICAL CUES VAULT SCHEMATIC</span>
                  </span>
                  <span className="text-neutral-500 uppercase">Interactive Map</span>
                </div>

                {/* Barbell schematic SVG */}
                <div className="relative h-48 w-full bg-[#fdfbf7] border border-neutral-300 rounded-lg flex items-center justify-center overflow-hidden">
                  <svg className="absolute w-full h-full max-w-md pointer-events-none" viewBox="0 0 400 200">
                    {/* Grid Lines */}
                    <line x1="0" y1="50" x2="400" y2="50" stroke="#f0f0f0" strokeDasharray="3 3" />
                    <line x1="0" y1="100" x2="400" y2="100" stroke="#f0f0f0" strokeDasharray="3 3" />
                    <line x1="0" y1="150" x2="400" y2="150" stroke="#f0f0f0" strokeDasharray="3 3" />
                    <line x1="100" y1="0" x2="100" y2="200" stroke="#f0f0f0" strokeDasharray="3 3" />
                    <line x1="200" y1="0" x2="200" y2="200" stroke="#f0f0f0" strokeDasharray="3 3" />
                    <line x1="300" y1="0" x2="300" y2="200" stroke="#f0f0f0" strokeDasharray="3 3" />

                    {/* Barbell shaft */}
                    <line x1="50" y1="100" x2="350" y2="100" stroke="#444" strokeWidth="6" strokeLinecap="round" />
                    
                    {/* Left plates */}
                    <rect x="70" y="50" width="12" height="100" rx="3" fill="#e53e3e" stroke="black" strokeWidth="2" />
                    <rect x="85" y="60" width="10" height="80" rx="2" fill="#3182ce" stroke="black" strokeWidth="2" />
                    <rect x="98" y="70" width="8" height="60" rx="1.5" fill="#38a169" stroke="black" strokeWidth="2" />
                    <rect x="109" y="80" width="5" height="40" rx="1" fill="#dd6b20" stroke="black" strokeWidth="2" />
                    
                    {/* Right plates */}
                    <rect x="318" y="50" width="12" height="100" rx="3" fill="#e53e3e" stroke="black" strokeWidth="2" />
                    <rect x="305" y="60" width="10" height="80" rx="2" fill="#3182ce" stroke="black" strokeWidth="2" />
                    <rect x="294" y="70" width="8" height="60" rx="1.5" fill="#38a169" stroke="black" strokeWidth="2" />
                    <rect x="286" y="80" width="5" height="40" rx="1" fill="#dd6b20" stroke="black" strokeWidth="2" />

                    {/* Collar sleeve */}
                    <rect x="114" y="94" width="20" height="12" fill="#888" stroke="black" strokeWidth="1.5" />
                    <rect x="266" y="94" width="20" height="12" fill="#888" stroke="black" strokeWidth="1.5" />

                    {/* Center ring */}
                    <circle cx="200" cy="100" r="6" fill="#1a202c" />
                  </svg>

                  {/* Overlaid Cues in Hand-written Font */}
                  <div className="absolute inset-0 w-full h-full font-serif pointer-events-none">
                    {telemetry.desk_vault_cues.slice(0, 3).map((cue, idx) => {
                      // Alternate positions around the barbell
                      const coords = [
                        { top: '15%', left: '15%', lineX: 110, lineY: 100 },
                        { top: '70%', left: '45%', lineX: 200, lineY: 106 },
                        { top: '20%', left: '62%', lineX: 290, lineY: 100 }
                      ][idx];

                      return (
                        <div 
                          key={idx} 
                          className="absolute pointer-events-auto bg-yellow-100/90 border border-yellow-300 p-2 shadow-sm rounded transform rotate-1 select-none"
                          style={{ top: coords.top, left: coords.left }}
                        >
                          <span 
                            className="font-bold text-xs text-blue-900 block tracking-tight leading-none"
                            style={{ fontFamily: "'Caveat', cursive", fontSize: '15px' }}
                          >
                            ✏️ "{cue}"
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="border-2 border-black bg-amber-50/90 p-6 rounded-xl flex flex-col gap-3 text-left relative overflow-hidden">
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-amber-100/80 rounded-lg border border-amber-300 text-amber-800 flex items-center justify-center shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono font-black uppercase text-amber-900 tracking-wider">CUES VAULT INACTIVE</span>
                    <h4 className="font-serif font-black text-base text-black mt-0.5 leading-tight">
                      You haven't logged any mental cues in the Recap Cinema yet!
                    </h4>
                    <p className="text-xs text-neutral-700 font-sans leading-relaxed mt-2.5">
                      To map verbal cues on this diagram, open the <a href="/recap" className="text-blue-600 font-bold hover:underline">Recap Cinema</a>, select a workout session, and write a checklist of verbal cues (e.g. *"keep elbows tucked"*) under the Desk Vault cue notes.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2-Column Newspaper Layout for telemetry viz and weather charts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              
              {/* Muscle Volume Distribution Bar Chart */}
              <div className="border-2 border-black p-4 bg-[#f5efe4] rounded-xl flex flex-col gap-4 font-mono text-[10px] text-neutral-800 text-left">
                <div className="border-b border-black pb-1.5 flex justify-between items-center font-bold">
                  <span className="text-black uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={14} className="text-neutral-700" />
                    <span>VOLUME DISTRIBUTION BY GROUP</span>
                  </span>
                  <span className="text-neutral-500 uppercase">VOL (KG)</span>
                </div>
                <div className="flex flex-col gap-3">
                  {(() => {
                    const dist = telemetry?.volume_distribution_kg || {};
                    const totalDistVolume = Object.values(dist).reduce((a, b) => Number(a) + Number(b), 0) || 1;
                    return Object.entries(dist).map(([group, vol]) => {
                      const percent = Math.round((Number(vol) / totalDistVolume) * 100);
                      const barColor = {
                        chest: '#ff6b6b', // Crimson
                        back: '#4dadf7',  // Sky Blue
                        legs: '#51cf66',  // Emerald
                        shoulders: '#fcc419', // Mustard
                        arms: '#cc5de8',  // Purple
                        core: '#20c997'   // Teal
                      }[group] || '#868e96';

                      return (
                        <div key={group} className="flex flex-col gap-1">
                          <div className="flex justify-between items-end font-bold uppercase text-black text-[10px]">
                            <span>{group}</span>
                            <span className="text-neutral-600 font-normal">{Number(vol).toLocaleString()} kg ({percent}%)</span>
                          </div>
                          <div className="w-full bg-white border-2 border-black h-3.5 rounded overflow-hidden relative shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                            <div
                              className="h-full border-r border-black"
                              style={{
                                width: `${Math.max(percent, vol > 0 ? 4 : 0)}%`,
                                backgroundColor: barColor
                              }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              {/* Gym Atmosphere & Map Stack */}
              <div className="flex flex-col gap-6">
                {/* Gym Atmosphere Report Widget */}
                <div className="border-2 border-black p-4 bg-[#f5efe4] rounded-xl flex flex-col gap-2 font-mono text-[10px] text-[#1a1a18] text-left">
                  <div className="border-b border-black pb-1.5 flex justify-between items-center font-bold">
                    <span className="text-black uppercase tracking-wider flex items-center gap-1">
                      <span>🌡️ GYM ATMOSPHERE WEATHER INDEX</span>
                    </span>
                    <span className="text-neutral-500 uppercase">WEEKLY AVG</span>
                  </div>
                  <div className="grid grid-cols-1 gap-y-2 mt-1">
                    <div className="flex justify-between border-b border-neutral-250 pb-1">
                      <span className="text-neutral-500">AVG TEMPERATURE:</span>
                      <span className="font-bold text-black">28°C (Sweaty/Heavy)</span>
                    </div>
                    <div className="flex justify-between border-b border-neutral-250 pb-1">
                      <span className="text-neutral-500">MUSIC BPM LEVEL:</span>
                      <span className="font-bold text-black">130 BPM (Synthwave/Phonk)</span>
                    </div>
                    <div className="flex justify-between border-b border-neutral-255 pb-1">
                      <span className="text-neutral-555">CROWD LEVEL:</span>
                      <span className="font-bold text-red-655">Peak Hour (90% Occupancy)</span>
                    </div>
                    <div className="flex justify-between border-b border-neutral-255 pb-1">
                      <span className="text-neutral-555">CHALK ATMOSPHERE:</span>
                      <span className="font-bold text-black">PR Dry / Chalky</span>
                    </div>
                  </div>
                </div>

                {/* Gym Land Meteorological Map */}
                <div className="border-2 border-black p-5 bg-[#fcf9f2] rounded-xl flex flex-col gap-4 font-mono text-[10px] text-[#1a1a18] text-left shadow-[3px_3px_0px_rgba(0,0,0,1)]">
                  <div className="border-b-2 border-black pb-2 flex justify-between items-center font-bold text-xs">
                    <span className="text-black uppercase tracking-wider flex items-center gap-1.5">
                      <span>🗺️ LOCAL GYM WEATHER ALMANAC</span>
                    </span>
                    <span className="bg-black text-[#fdfbf7] px-2 py-0.5 rounded text-[8px] uppercase tracking-widest animate-pulse">LIVE STATUS</span>
                  </div>

                  <p className="text-[9px] font-sans text-neutral-600 leading-normal border-b border-dashed border-neutral-300 pb-2.5">
                    <strong>HOW TO READ:</strong> Real-time lifter density and barbell loads shape the gym's micro-climates. High exertion yields seismic heat waves, high cardio yields sweat monsoons, and chalk creates heavy dumbbell fog.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Zone A: Dumbbell Bay */}
                    <div className="border-2 border-black p-3 bg-blue-50/60 rounded-lg flex flex-col gap-2 shadow-[2px_2px_0px_black] hover:-translate-y-0.5 transition-transform">
                      <div className="flex justify-between items-center border-b border-blue-200 pb-1.5">
                        <span className="font-bold text-[9.5px] text-blue-900 uppercase flex items-center gap-1">
                          <span>💨💪 ZONE A: DUMBBELL BAY</span>
                        </span>
                        <span className="text-[8px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded border border-blue-200 font-bold uppercase select-none">BREEZY</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono text-neutral-800 border-b border-dashed border-blue-150 pb-2">
                        <div>🌡️ Temp: 24°C</div>
                        <div>💨 Fan Speed: HIGH</div>
                        <div>🌫️ Chalk: HEAVY</div>
                        <div>🔊 Music: Phonk (130 BPM)</div>
                      </div>
                      <p className="text-[8.5px] font-sans text-neutral-700 leading-relaxed italic">
                        Cool air from max fans keeps you fresh during lateral raises. Grip environment is highly chalky.
                      </p>
                    </div>

                    {/* Zone B: Squat Peak */}
                    <div className="border-2 border-black p-3 bg-orange-50/60 rounded-lg flex flex-col gap-2 shadow-[2px_2px_0px_black] hover:-translate-y-0.5 transition-transform">
                      <div className="flex justify-between items-center border-b border-orange-200 pb-1.5">
                        <span className="font-bold text-[9.5px] text-orange-900 uppercase flex items-center gap-1">
                          <span>🌋🏋️ ZONE B: SQUAT PEAK</span>
                        </span>
                        <span className="text-[8px] bg-orange-100 text-orange-850 px-1.5 py-0.5 rounded border border-orange-200 font-bold uppercase select-none">SEISMIC</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono text-neutral-800 border-b border-dashed border-orange-150 pb-2">
                        <div>🌡️ Temp: 32°C (PR Heat)</div>
                        <div>⚠️ State: Peak Load</div>
                        <div>📊 Occupancy: 95%</div>
                        <div>🔊 Music: Metal/Rock</div>
                      </div>
                      <p className="text-[8.5px] font-sans text-neutral-700 leading-relaxed italic">
                        The floor is shaking from heavy barbell squats. Expect maximum heat—keep your core braced.
                      </p>
                    </div>

                    {/* Zone C: Cardio Deck */}
                    <div className="border-2 border-black p-3 bg-green-50/60 rounded-lg flex flex-col gap-2 shadow-[2px_2px_0px_black] hover:-translate-y-0.5 transition-transform">
                      <div className="flex justify-between items-center border-b border-green-200 pb-1.5">
                        <span className="font-bold text-[9.5px] text-green-900 uppercase flex items-center gap-1">
                          <span>☔🏃 ZONE C: CARDIO DECK</span>
                        </span>
                        <span className="text-[8px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded border border-green-200 font-bold uppercase select-none">MONSOON</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono text-neutral-800 border-b border-dashed border-green-150 pb-2">
                        <div>🌡️ Temp: 28°C</div>
                        <div>💧 Humidity: 95%</div>
                        <div>💨 Breeze: Sweaty</div>
                        <div>📉 Oxygen: Low</div>
                      </div>
                      <p className="text-[8.5px] font-sans text-neutral-700 leading-relaxed italic">
                        Extreme humidity caused by heavy cardio sweat. Drink water; you are in a high-endurance monsoon.
                      </p>
                    </div>

                    {/* Zone D: Smoothie Oasis */}
                    <div className="border-2 border-black p-3 bg-purple-50/60 rounded-lg flex flex-col gap-2 shadow-[2px_2px_0px_black] hover:-translate-y-0.5 transition-transform">
                      <div className="flex justify-between items-center border-b border-purple-200 pb-1.5">
                        <span className="font-bold text-[9.5px] text-purple-900 uppercase flex items-center gap-1">
                          <span>🌴🥤 ZONE D: SMOOTHIE OASIS</span>
                        </span>
                        <span className="text-[8px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded border border-purple-200 font-bold uppercase select-none">COOL</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-1 text-[8.5px] font-mono text-neutral-800 border-b border-dashed border-purple-150 pb-2">
                        <div>🌡️ Temp: 18°C (AC)</div>
                        <div>🥛 Rain: +30g Whey</div>
                        <div>❄️ Climate: Calm Chill</div>
                        <div>👤 Crowds: Low</div>
                      </div>
                      <p className="text-[8.5px] font-sans text-neutral-700 leading-relaxed italic">
                        Air-conditioned haven for muscle recovery. Stop by to refuel with premium whey protein.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Core Articles (The Sections) */}
            <div className="flex flex-col gap-6">
              {magazineData.sections.map((sec, idx) => (
                <div key={idx} className="border-t-2 border-black pt-4 flex flex-col gap-2">
                  <h4 className="font-serif font-black text-lg text-black uppercase tracking-tight">
                    {sec.title}
                  </h4>
                  <p className="text-xs font-sans text-neutral-850 leading-relaxed text-justify">
                    {sec.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Zenkai Horoscope Section */}
            <div className="border-t-4 border-double border-black pt-5 mt-6 flex flex-col gap-4 text-left font-serif">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-black pb-2 select-none">
                <h4 className="font-serif font-black text-xl text-black uppercase tracking-tight">
                  🌟 TRAINING ASTROLOGICAL ALIGNMENTS
                </h4>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-black">
                  <span className="font-bold">YOUR SIGN:</span>
                  <select 
                    value={selectedZodiac} 
                    onChange={(e) => setSelectedZodiac(e.target.value)}
                    className="border-2 border-black bg-[#faf6ee] px-2 py-0.5 rounded text-black font-bold uppercase cursor-pointer outline-none focus:ring-1 focus:ring-black"
                  >
                    {ZODIAC_SIGNS.map(z => (
                      <option key={z.key} value={z.key}>{z.symbol} {z.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans text-xs text-neutral-855">
                {displaySigns.map((z, idx) => (
                  <div 
                    key={z.key} 
                    className={`flex flex-col gap-1.5 ${idx < 2 ? 'border-b md:border-b-0 md:border-r border-neutral-350 pb-4 md:pb-0 md:pr-4' : 'pb-2'}`}
                  >
                    <span className="font-serif font-black text-xs text-black uppercase flex items-center gap-1.5">
                      <span>{z.symbol} {z.name}</span>
                      <span className="text-[9px] font-mono text-neutral-500 font-normal">{z.range}</span>
                    </span>
                    <p className="leading-relaxed text-neutral-750 text-justify">
                      {z.prediction} <strong>Lucky Lift:</strong> {z.lucky}.
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Retro Classified Ad Coupon */}
            <div className="border-2 border-dashed border-black p-4 mt-4 bg-white text-center relative font-mono text-xs select-none shadow-[2px_2px_0px_rgba(0,0,0,1)]">
              <span className="absolute -top-2 left-4 bg-[#fdfbf7] px-2 text-[9px] font-bold text-neutral-800 uppercase tracking-widest border border-black">
                ✂️ Cut Out Coupon
              </span>
              <h5 className="font-serif font-black text-sm uppercase text-black mb-1">
                SQUAD DRAFT ACTIVE — REDEEM SYNERGY CODE
              </h5>
              <p className="text-[10px] text-neutral-700 leading-tight">
                Are you training alone? Join an active squad to fight PvE Titan Raid Bosses and earn +6% weekly XP multipliers. Double your gains with teammate consistency synergy.
              </p>
              <div className="mt-2.5 font-serif font-black text-[10px] uppercase text-blue-900 tracking-wider">
                PROMO CODE: ZK-SYNERGY-2026 // REDEEM IN SQUAD MATCHMAKER
              </div>
            </div>

          </div>

          {/* RIGHT COLUMN: Telemetry Dashboard & Pull-quotes (col-span-4) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            
            {/* Telemetry Dashboard */}
            <div className="border-4 border-black bg-[#faf6ee] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4 text-black">
              <div className="border-b border-black pb-2 flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider">
                <span className="text-black flex items-center gap-2">
                  <Target size={14} className="text-blue-800" />
                  <span>WEEKLY TELEMETRY LEDGER</span>
                </span>
              </div>

              <div className="flex flex-col gap-3 font-mono text-[11px]">
                {/* Total Volume */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-2">
                  <span className="text-neutral-600">WEEKLY VOLUME:</span>
                  <span className="text-black font-bold">{telemetry.weekly_total_volume_kg.toLocaleString()} kg</span>
                </div>
                {/* Total Sets */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-2">
                  <span className="text-neutral-600">SETS COMPLETED:</span>
                  <span className="text-black font-bold">{telemetry.weekly_total_sets} working sets</span>
                </div>
                {/* Workouts Logged */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-2">
                  <span className="text-neutral-600">SESSIONS LOGGED:</span>
                  <span className="text-black font-bold">{telemetry.workouts_logged_this_week} workouts</span>
                </div>
                {/* Average MMC */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-2">
                  <span className="text-neutral-600">MIND-MUSCLE SYNC:</span>
                  <span className="text-blue-850 font-bold">{telemetry.average_mmc}/10</span>
                </div>
                {/* Average RPE */}
                <div className="flex justify-between items-center border-b border-neutral-300 pb-2">
                  <span className="text-neutral-600">EXERTION RATE (RPE):</span>
                  <span className="text-red-750 font-bold">{telemetry.average_rpe}/10</span>
                </div>
                {/* Active Streak */}
                <div className="flex justify-between items-center pb-1">
                  <span className="text-neutral-600">CONSISTENCY STREAK:</span>
                  <span className="text-green-750 font-bold">{telemetry.streak} Days</span>
                </div>
              </div>
            </div>

            {/* Coach's Pull Quote */}
            <div className="border-4 border-black bg-[#fef9c3] text-black p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4 relative overflow-hidden">
              <Quote className="absolute right-4 bottom-2 text-yellow-250/30 w-24 h-24 pointer-events-none" />
              <span className="text-[9px] font-mono text-neutral-600 uppercase font-black tracking-wider block">
                COACH LLAMA'S VERDICT
              </span>
              <p className="font-serif italic text-base leading-relaxed text-neutral-900 font-bold relative z-10">
                "{magazineData.coachVerdict}"
              </p>
              <div className="flex items-center gap-2 border-t border-yellow-350 pt-3 mt-1 relative z-10">
                <span className="w-5 h-0.5 bg-black" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black">
                  Llama 3.3 Core Engine
                </span>
              </div>
            </div>

            {/* PRs Broken Ledger Card */}
            <div className="border-4 border-black bg-[#faf6ee] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4 text-black">
              <div className="border-b border-black pb-2 flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider">
                <span className="text-black flex items-center gap-2">
                  <Flame size={14} className="text-red-650" />
                  <span>RECORD BREAKERS LEDGER</span>
                </span>
              </div>

              {telemetry.recent_personal_records && telemetry.recent_personal_records.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {telemetry.recent_personal_records.map((pr, idx) => (
                    <div key={idx} className="border border-neutral-300 p-3 bg-white/80 rounded-xl text-xs font-mono flex items-center gap-2.5 text-black">
                      <span className="text-yellow-650 font-bold text-sm">🏆</span>
                      <span className="text-black leading-tight">{pr}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs font-mono text-neutral-600 uppercase">
                  No PRs registered in telemetry this week.
                </div>
              )}
            </div>

            {/* Future Focus */}
            <div className="border-4 border-black bg-blue-50 text-blue-900 p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-3">
              <span className="text-[9px] font-mono text-blue-700 uppercase font-black tracking-wider block">
                UPCOMING WEEKLY OBJECTIVE
              </span>
              <h5 className="font-display font-black text-lg uppercase tracking-tight text-blue-950 leading-none">
                FUTURE FOCUS TARGET
              </h5>
              <p className="text-xs font-sans leading-relaxed text-blue-950/80">
                {magazineData.futureFocus}
              </p>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
