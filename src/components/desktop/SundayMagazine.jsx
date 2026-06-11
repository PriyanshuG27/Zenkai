import React, { useState, useEffect } from 'react';
import { Newspaper, Flame, RefreshCw, Award, Target, HelpCircle, Activity, Sparkles, BookOpen, Quote, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { callZenkaiAPI } from '../../lib/apiClient';
import { motion } from 'framer-motion';

const activeMagazineFetches = new Set();

export const SundayMagazine = () => {
  const { uid } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [magazineData, setMagazineData] = useState(null);
  const [telemetry, setTelemetry] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [reprintCount, setReprintCount] = useState(0);

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

  return (
    <div className="w-full max-w-[1440px] mx-auto px-4 py-6 flex flex-col gap-8 bg-[var(--bg-oled)] text-[var(--text-primary)] min-h-[90vh] font-sans">
      
      {/* Header and Controls */}
      <div className="border-b-4 border-black pb-5 mt-2 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-display text-4xl font-black tracking-tight uppercase leading-none text-white flex items-center gap-3">
            <Newspaper className="text-blue-400" size={32} />
            <span>📰 SUNDAY SPORTS MAGAZINE</span>
          </h1>
          <p className="text-xs font-mono text-[var(--text-secondary)] uppercase tracking-wider mt-2.5 flex items-center gap-2">
            <span>Issue 24</span>
            <span className="text-neutral-700">|</span>
            <span className="text-blue-400 font-bold">{todayString}</span>
          </p>
        </div>

        <button
          onClick={() => fetchMagazine(true)}
          disabled={refreshing || reprintCount >= 1}
          className="flex items-center gap-2 border-2 border-black bg-[var(--surface)] hover:bg-neutral-900 text-white font-mono text-xs uppercase px-4 py-2.5 rounded-lg shadow-[3px_3px_0px_black] active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left max-w-lg mx-auto flex flex-col gap-4">
          <div className="flex items-center gap-2 text-red-500 font-bold uppercase font-mono text-sm">
            <AlertTriangle size={18} />
            <span>Magazine Print Jammed</span>
          </div>
          <p className="text-xs text-neutral-300 font-sans leading-relaxed">{error}</p>
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
          <div className="lg:col-span-8 border-4 border-black bg-white text-black p-6 md:p-8 rounded-2xl shadow-[5px_5px_0px_black] flex flex-col gap-6 text-left relative overflow-hidden font-serif">
            
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
            <div className="columns-1 md:columns-2 gap-8 text-neutral-800 leading-relaxed text-sm font-sans pt-1 border-b border-neutral-250 pb-6 text-justify">
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
              <div className="border-2 border-black bg-neutral-50 p-6 rounded-xl flex flex-col gap-4 relative overflow-hidden">
                <div className="border-b border-black pb-1.5 flex justify-between items-center text-xs font-mono font-bold">
                  <span className="text-black uppercase tracking-wider flex items-center gap-1.5">
                    <Activity size={14} className="text-neutral-700" />
                    <span>BIOMECHANICAL CUES VAULT SCHEMATIC</span>
                  </span>
                  <span className="text-neutral-500 uppercase">Interactive Map</span>
                </div>

                {/* Barbell schematic SVG */}
                <div className="relative h-48 w-full bg-white border border-neutral-300 rounded-lg flex items-center justify-center overflow-hidden">
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
              <div className="border-2 border-black bg-amber-50/70 p-6 rounded-xl flex flex-col gap-3 text-left relative overflow-hidden">
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
              <div className="border-2 border-black p-4 bg-neutral-50 rounded-xl flex flex-col gap-4 font-mono text-[10px] text-neutral-800 text-left">
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
                <div className="border-2 border-black p-4 bg-neutral-50 rounded-xl flex flex-col gap-2 font-mono text-[10px] text-neutral-800 text-left">
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
                    <div className="flex justify-between border-b border-neutral-250 pb-1">
                      <span className="text-neutral-550">CROWD LEVEL:</span>
                      <span className="font-bold text-red-650">Peak Hour (90% Occupancy)</span>
                    </div>
                    <div className="flex justify-between border-b border-neutral-250 pb-1">
                      <span className="text-neutral-550">CHALK ATMOSPHERE:</span>
                      <span className="font-bold text-black">PR Dry / Chalky</span>
                    </div>
                  </div>
                </div>

                {/* Gym Land Meteorological Map */}
                <div className="border-2 border-black p-4 bg-neutral-50 rounded-xl flex flex-col gap-3 font-mono text-[10px] text-neutral-800 text-left">
                  <div className="border-b border-black pb-1.5 flex justify-between items-center font-bold">
                    <span className="text-black uppercase tracking-wider flex items-center gap-1">
                      <span>🗺️ ZENKAI GYM LAND METEOROLOGICAL BLUEPRINT</span>
                    </span>
                    <span className="text-neutral-500 uppercase">LIVE</span>
                  </div>
                  
                  <div className="w-full bg-white border border-neutral-300 rounded p-1.5 relative overflow-hidden flex items-center justify-center">
                    <svg className="w-full h-auto max-w-xs" viewBox="0 0 240 160" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Grid background */}
                      <defs>
                        <pattern id="gymGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#f4f4f5" strokeWidth="0.5" />
                        </pattern>
                      </defs>
                      <rect width="240" height="160" fill="url(#gymGrid)" />
                      <rect x="5" y="5" width="230" height="150" rx="2" stroke="#000" strokeWidth="1" strokeDasharray="3 3" />

                      {/* Zone A: Dumbbell Bay (Top Left) */}
                      <rect x="15" y="15" width="95" height="55" rx="1.5" fill="#eff6ff" stroke="#000" strokeWidth="1" />
                      <line x1="15" y1="30" x2="110" y2="30" stroke="#000" strokeWidth="0.5" strokeDasharray="1 1" />
                      <text x="20" y="25" fill="#000" fontSize="5" fontWeight="bold" fontFamily="monospace">ZONE A: DUMBBELL BAY</text>
                      <text x="20" y="42" fill="#2563eb" fontSize="4.5" fontWeight="bold" fontFamily="monospace">💨 FANS HIGH // CHALKY</text>
                      {/* Dumbbell visual */}
                      <rect x="20" y="47" width="10" height="2" rx="0.5" fill="#000" />
                      <rect x="22" y="45" width="1" height="6" fill="#000" />
                      <rect x="27" y="45" width="1" height="6" fill="#000" />

                      {/* Zone B: Squat Rack Peak (Top Right) */}
                      <rect x="130" y="15" width="95" height="55" rx="1.5" fill="#fff7ed" stroke="#000" strokeWidth="1" />
                      <line x1="130" y1="30" x2="225" y2="30" stroke="#000" strokeWidth="0.5" strokeDasharray="1 1" />
                      <text x="135" y="25" fill="#000" fontSize="5" fontWeight="bold" fontFamily="monospace">ZONE B: SQUAT PEAK</text>
                      <text x="135" y="42" fill="#ea580c" fontSize="4.5" fontWeight="bold" fontFamily="monospace">⚠️ SEISMIC // HEAVY</text>
                      {/* Barbell visual */}
                      <line x1="145" y1="50" x2="175" y2="50" stroke="#000" strokeWidth="1" />
                      <rect x="148" y="47" width="2" height="7" fill="#000" />
                      <rect x="170" y="47" width="2" height="7" fill="#000" />

                      {/* Zone C: Cardio Monsoon Deck (Bottom Right) */}
                      <rect x="130" y="85" width="95" height="60" rx="1.5" fill="#f0fdf4" stroke="#000" strokeWidth="1" />
                      <line x1="130" y1="100" x2="225" y2="100" stroke="#000" strokeWidth="0.5" strokeDasharray="1 1" />
                      <text x="135" y="95" fill="#000" fontSize="5" fontWeight="bold" fontFamily="monospace">ZONE C: CARDIO DECK</text>
                      <text x="135" y="112" fill="#16a34a" fontSize="4.5" fontWeight="bold" fontFamily="monospace">🌧️ 95% HUMIDITY // MONSOON</text>
                      {/* Treadmill visual */}
                      <path d="M 145 130 L 160 130 L 163 120" stroke="#000" strokeWidth="1" strokeLinecap="round" />

                      {/* Zone D: Smoothie Bar Oasis (Bottom Left) */}
                      <rect x="15" y="85" width="95" height="60" rx="1.5" fill="#faf5ff" stroke="#000" strokeWidth="1" />
                      <line x1="15" y1="100" x2="110" y2="100" stroke="#000" strokeWidth="0.5" strokeDasharray="1 1" />
                      <text x="20" y="95" fill="#000" fontSize="5" fontWeight="bold" fontFamily="monospace">ZONE D: SMOOTHIE OASIS</text>
                      <text x="20" y="112" fill="#9333ea" fontSize="4.5" fontWeight="bold" fontFamily="monospace">❄️ COOL BREEZE // +30G WHEY</text>
                      {/* Cup visual */}
                      <path d="M 20 122 L 25 122 L 24 132 L 21 132 Z" fill="#000" />

                      {/* Compass */}
                      <circle cx="120" cy="77" r="6" fill="#fff" stroke="#000" strokeWidth="0.75" />
                      <text x="118.5" y="79" fill="#000" fontSize="6.5" fontWeight="black" fontFamily="sans-serif">N</text>
                    </svg>
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
                  <p className="text-xs font-sans text-neutral-700 leading-relaxed text-justify">
                    {sec.content}
                  </p>
                </div>
              ))}
            </div>

            {/* Zenkai Horoscope Section */}
            <div className="border-t-4 border-double border-black pt-5 mt-6 flex flex-col gap-4 text-left font-serif">
              <h4 className="font-serif font-black text-xl text-black uppercase tracking-tight text-center border-b border-black pb-2 select-none">
                🌟 TRAINING ASTROLOGICAL ALIGNMENTS
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-sans text-xs text-neutral-800">
                <div className="flex flex-col gap-1.5 border-b md:border-b-0 md:border-r border-neutral-250 pb-4 md:pb-0 md:pr-4">
                  <span className="font-serif font-black text-xs text-black uppercase flex items-center gap-1.5">
                    <span>♈ ARIES</span>
                    <span className="text-[9px] font-mono text-neutral-500 font-normal">(MAR 21 - APR 19)</span>
                  </span>
                  <p className="leading-relaxed text-neutral-700 text-justify">
                    {magazineData.horoscope?.aries?.prediction || "Your squat rack will be occupied by a guy doing barbell curls today. Exercise patience, or suggest working in. Your energy demands heavy lifting."}{" "}
                    <strong>Lucky Lift:</strong> {magazineData.horoscope?.aries?.luckyLift || "Zercher Squat"}.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 border-b md:border-b-0 md:border-r border-neutral-250 pb-4 md:pb-0 md:pr-4">
                  <span className="font-serif font-black text-xs text-black uppercase flex items-center gap-1.5">
                    <span>♌ LEO</span>
                    <span className="text-[9px] font-mono text-neutral-500 font-normal">(JUL 23 - AUG 22)</span>
                  </span>
                  <p className="leading-relaxed text-neutral-700 text-justify">
                    {magazineData.horoscope?.leo?.prediction || "The chalk bag is calling your name. A massive PR is written in your stars if you play heavy Phonk music. Avoid machine training this week."}{" "}
                    <strong>Lucky Lift:</strong> {magazineData.horoscope?.leo?.luckyLift || "5x5 Bench Press"}.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 pb-2">
                  <span className="font-serif font-black text-xs text-black uppercase flex items-center gap-1.5">
                    <span>♑ CAPRICORN</span>
                    <span className="text-[9px] font-mono text-neutral-500 font-normal">(DEC 22 - JAN 19)</span>
                  </span>
                  <p className="leading-relaxed text-neutral-700 text-justify">
                    {magazineData.horoscope?.capricorn?.prediction || "An extra rest day is recommended by stars, but your muscles demand heavy overhead presses. Push through. Consistency streak will multiply."}{" "}
                    <strong>Lucky Lift:</strong> {magazineData.horoscope?.capricorn?.luckyLift || "Overhead Press"}.
                  </p>
                </div>
              </div>
            </div>

            {/* Retro Classified Ad Coupon */}
            <div className="border-2 border-dashed border-neutral-400 p-4 mt-4 bg-yellow-50/20 text-center relative font-mono text-xs select-none">
              <span className="absolute -top-2 left-4 bg-white px-2 text-[9px] font-bold text-neutral-500 uppercase tracking-widest border border-neutral-300">
                ✂️ Cut Out Coupon
              </span>
              <h5 className="font-serif font-black text-sm uppercase text-black mb-1">
                SQUAD DRAFT ACTIVE — REDEEM SYNERGY CODE
              </h5>
              <p className="text-[10px] text-neutral-600 leading-tight">
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
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2 flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider">
                <span className="text-white flex items-center gap-2">
                  <Target size={14} className="text-[var(--accent-xp)]" />
                  <span>WEEKLY TELEMETRY LEDGER</span>
                </span>
              </div>

              <div className="flex flex-col gap-3 font-mono text-[11px]">
                {/* Total Volume */}
                <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span className="text-neutral-500">WEEKLY VOLUME:</span>
                  <span className="text-white font-bold">{telemetry.weekly_total_volume_kg.toLocaleString()} kg</span>
                </div>
                {/* Total Sets */}
                <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span className="text-neutral-500">SETS COMPLETED:</span>
                  <span className="text-white font-bold">{telemetry.weekly_total_sets} working sets</span>
                </div>
                {/* Workouts Logged */}
                <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span className="text-neutral-500">SESSIONS LOGGED:</span>
                  <span className="text-white font-bold">{telemetry.workouts_logged_this_week} workouts</span>
                </div>
                {/* Average MMC */}
                <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span className="text-neutral-500">MIND-MUSCLE SYNC:</span>
                  <span className="text-[var(--secondary)] font-bold">{telemetry.average_mmc}/10</span>
                </div>
                {/* Average RPE */}
                <div className="flex justify-between items-center border-b border-neutral-900 pb-2">
                  <span className="text-neutral-500">EXERTION RATE (RPE):</span>
                  <span className="text-[var(--primary)] font-bold">{telemetry.average_rpe}/10</span>
                </div>
                {/* Active Streak */}
                <div className="flex justify-between items-center pb-1">
                  <span className="text-neutral-500">CONSISTENCY STREAK:</span>
                  <span className="text-[var(--accent-xp)] font-bold">{telemetry.streak} Days</span>
                </div>
              </div>
            </div>

            {/* Coach's Pull Quote */}
            <div className="border-4 border-black bg-yellow-100 text-black p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4 relative overflow-hidden">
              <Quote className="absolute right-4 bottom-2 text-yellow-200/50 w-24 h-24 pointer-events-none" />
              <span className="text-[9px] font-mono text-neutral-600 uppercase font-black tracking-wider block">
                COACH LLAMA'S VERDICT
              </span>
              <p className="font-serif italic text-base leading-relaxed text-neutral-900 font-bold relative z-10">
                "{magazineData.coachVerdict}"
              </p>
              <div className="flex items-center gap-2 border-t border-yellow-300 pt-3 mt-1 relative z-10">
                <span className="w-5 h-0.5 bg-black" />
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-black">
                  Llama 3.3 Core Engine
                </span>
              </div>
            </div>

            {/* PRs Broken Ledger Card */}
            <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_black] text-left flex flex-col gap-4">
              <div className="border-b border-neutral-900 pb-2 flex justify-between items-center text-xs font-mono font-bold uppercase tracking-wider">
                <span className="text-white flex items-center gap-2">
                  <Flame size={14} className="text-[var(--primary)]" />
                  <span>RECORD BREAKERS LEDGER</span>
                </span>
              </div>

              {telemetry.recent_personal_records && telemetry.recent_personal_records.length > 0 ? (
                <div className="flex flex-col gap-2.5">
                  {telemetry.recent_personal_records.map((pr, idx) => (
                    <div key={idx} className="border border-neutral-900 p-3 bg-black/40 rounded-xl text-xs font-mono flex items-center gap-2.5">
                      <span className="text-[var(--accent-xp)] font-bold text-sm">🏆</span>
                      <span className="text-white leading-tight">{pr}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-xs font-mono text-neutral-500 uppercase">
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
