import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Dumbbell, Zap, Flame, Film, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, deleteDoc } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';

export const NeubrutalistCalendar = ({ sessions = [], onSelectSession = null, isMobile = false }) => {
  const { uid } = useAuthStore();
  const [currentMonthDate, setCurrentMonthDate] = useState(new Date());
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletedSessionIds, setDeletedSessionIds] = useState(new Set());

  // Filter out deleted session IDs locally to guarantee instant UI removal
  const activeSessions = useMemo(() => {
    return sessions.filter((s) => s?.id && !deletedSessionIds.has(s.id));
  }, [sessions, deletedSessionIds]);

  const proceedDeleteSession = async (sessId, source) => {
    if (!uid) return;
    try {
      const docPath = source === 'mobile' 
        ? ['users', uid, 'sessions', sessId] 
        : ['users', uid, 'executed_sessions', sessId];
      
      const docRef = doc(db, ...docPath);
      await deleteDoc(docRef);
      setConfirmDeleteId(null);
      setDeletedSessionIds((prev) => {
        const next = new Set(prev);
        next.add(sessId);
        return next;
      });
    } catch (err) {
      console.error('[Calendar] Failed to delete session:', err);
      alert('Failed to delete workout session.');
    }
  };

  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth(); // 0-indexed

  // Format Date to local YYYY-MM-DD
  const getYYYYMMDD = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Group sessions by local YYYY-MM-DD string
  const sessionsByDate = useMemo(() => {
    const map = {};
    activeSessions.forEach((sess) => {
      if (!sess.date) return;
      const dateObj = sess.date instanceof Date ? sess.date : new Date(sess.date);
      if (isNaN(dateObj.getTime())) return;
      const key = getYYYYMMDD(dateObj);
      if (!map[key]) map[key] = [];
      map[key].push(sess);
    });
    return map;
  }, [activeSessions]);

  // Calendar calculations
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday, 1 = Monday...
  // Convert firstDayIndex so Monday is index 0
  const adjustedFirstDayIndex = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const handlePrevMonth = () => {
    setCurrentMonthDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonthDate(new Date(year, month + 1, 1));
  };

  const daysGrid = useMemo(() => {
    const grid = [];
    // Previous month filler days
    for (let i = 0; i < adjustedFirstDayIndex; i++) {
      grid.push({ isFiller: true });
    }
    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const cellDate = new Date(year, month, d);
      const dateKey = getYYYYMMDD(cellDate);
      grid.push({
        dayNumber: d,
        dateKey,
        isFiller: false,
        sessionsList: sessionsByDate[dateKey] || []
      });
    }
    return grid;
  }, [year, month, daysInMonth, adjustedFirstDayIndex, sessionsByDate]);

  // Selected date key tracking (to dynamically compute details panel based on activeSessions)
  const [selectedDateKey, setSelectedDateKey] = useState(null);

  const selectedCell = useMemo(() => {
    if (!selectedDateKey) return null;
    return daysGrid.find(cell => cell.dateKey === selectedDateKey && !cell.isFiller) || null;
  }, [daysGrid, selectedDateKey]);

  const handleCellClick = (cell) => {
    if (cell.isFiller || !cell.sessionsList.length) {
      setSelectedDateKey(null);
      return;
    }
    setSelectedDateKey(cell.dateKey);
  };

  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayKey = getYYYYMMDD(new Date());
  const navigate = useNavigate();

  return (
    <div className="border-4 border-black bg-[var(--surface)] p-5 rounded-2xl shadow-[6px_6px_0px_rgba(0,0,0,1)] text-left font-mono text-xs flex flex-col gap-5">
      
      {/* Calendar Navigation */}
      <div className="flex justify-between items-center border-b-2 border-black pb-3">
        <span className="font-display font-black text-sm text-white uppercase tracking-wider">
          {monthNames[month]} {year}
        </span>
        <div className="flex gap-2">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 border-2 border-black bg-black text-[var(--primary)] rounded-lg hover:bg-[var(--primary)] hover:text-black cursor-pointer active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={handleNextMonth}
            className="p-1.5 border-2 border-black bg-black text-[var(--primary)] rounded-lg hover:bg-[var(--primary)] hover:text-black cursor-pointer active:translate-x-[1px] active:translate-y-[1px] transition-all"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Weekday Labels */}
      <div className="grid grid-cols-7 gap-2 text-center font-bold text-[9px] text-[var(--text-secondary)] uppercase tracking-wider">
        {weekdays.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-2">
        {daysGrid.map((cell, idx) => {
          if (cell.isFiller) {
            return <div key={`filler-${idx}`} className="aspect-square opacity-20" />;
          }

          const hasWorkout = cell.sessionsList.length > 0;
          const isSelected = selectedCell?.dateKey === cell.dateKey;
          const isToday = cell.dateKey === todayKey;

          return (
            <button
              key={cell.dateKey}
              onClick={() => handleCellClick(cell)}
              className={`aspect-square rounded-xl border-2 flex flex-col items-center justify-between p-1.5 transition-all select-none relative hover:scale-[1.05] active:scale-95 ${
                isSelected
                  ? 'border-[var(--primary)] bg-[var(--primary-glow)] text-[var(--primary)] shadow-[3px_3px_0px_black] font-bold z-10'
                  : isToday
                    ? 'border-[var(--secondary)] bg-[var(--secondary)]/10 text-[var(--secondary)] font-bold shadow-[2px_2px_0px_black]'
                    : hasWorkout
                      ? 'border-emerald-500 bg-emerald-950/20 text-emerald-400 hover:border-emerald-400 cursor-pointer shadow-[2px_2px_0px_black]'
                      : 'border-[#222] bg-black/40 text-neutral-500 hover:border-[#444] hover:text-neutral-300'
              }`}
            >
              <span className="text-[10px] self-start font-bold">{cell.dayNumber}</span>
              {hasWorkout && (
                <Dumbbell
                  size={12}
                  className={`mt-0.5 ${isSelected ? 'text-[var(--primary)]' : isToday ? 'text-[var(--secondary)]' : 'text-emerald-400 animate-pulse'}`}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Session Details Panel */}
      {selectedCell && selectedCell.sessionsList.length > 0 && (
        <div className="border-4 border-black bg-[#151515] p-4 rounded-2xl flex flex-col gap-4 shadow-[4px_4px_0px_rgba(0,0,0,1)] animate-fadeIn">
          <div className="flex justify-between items-center border-b-2 border-black pb-2">
            <span className="text-[10px] uppercase font-bold text-white tracking-wider">
              Logged Workouts: {selectedCell.dayNumber} {monthNames[month].substring(0, 3)}
            </span>
            <button
              onClick={() => setSelectedDateKey(null)}
              className="text-[9px] uppercase font-bold text-[var(--primary)] hover:text-white border-2 border-black bg-black px-2 py-0.5 rounded shadow-[1.5px_1.5px_0px_black]"
            >
              Close
            </button>
          </div>

          <div className="flex flex-col gap-3.5 max-h-[220px] overflow-y-auto pr-1">
            {selectedCell.sessionsList.map((sess, idx) => {
              const isConfirming = confirmDeleteId === sess.id;

              return (
                <div key={idx} className="border-2 border-black bg-black/50 p-3.5 rounded-xl flex flex-col gap-3 text-[11px] shadow-[2px_2px_0px_black] relative">
                  
                  {isConfirming ? (
                    <div className="flex flex-col gap-2.5 py-1 text-left animate-fadeIn">
                      <div className="flex items-center gap-1.5 text-red-500 font-bold uppercase text-[11px]">
                        <Trash2 size={14} />
                        <span>Delete Workout?</span>
                      </div>
                      <span className="text-[10px] text-neutral-300 leading-relaxed font-sans">
                        Are you sure you want to permanently delete Workout #{idx + 1}? This action is irreversible.
                      </span>
                      <div className="flex gap-2 mt-1">
                        <button
                          onClick={() => proceedDeleteSession(sess.id, sess.source)}
                          className="flex-1 py-1.5 bg-red-600 text-white font-mono font-bold text-[10px] uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_black] active:scale-95 transition-all cursor-pointer"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="flex-1 py-1.5 bg-neutral-800 text-white font-mono font-bold text-[10px] uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_black] active:scale-95 transition-all cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-start gap-2 flex-wrap">
                        <div className="flex flex-col text-left">
                          <span className="text-white font-black uppercase text-xs">
                            Workout #{idx + 1}
                          </span>
                          <span className="text-[8px] text-[var(--text-secondary)] uppercase mt-0.5">
                            {sess.source === 'desktop' ? '🖥️ Desktop App Log' : '📱 Mobile App Log'}
                          </span>
                        </div>
                        
                        <div className="flex gap-1.5 flex-wrap items-center">
                          <span className="text-[9px] font-mono font-bold bg-[#111] text-emerald-400 px-2 py-0.5 rounded-md border border-[#222]">
                            Vol: {sess.totalVolume || 0}kg
                          </span>
                          {sess.rpeScore && (
                            <span className="text-[9px] font-mono font-bold bg-[#111] text-[var(--primary)] px-2 py-0.5 rounded-md border border-[#222]">
                              RPE: {sess.rpeScore}/10
                            </span>
                          )}
                          {sess.mmcScore && (
                            <span className="text-[9px] font-mono font-bold bg-[#111] text-[var(--secondary)] px-2 py-0.5 rounded-md border border-[#222]">
                              MMC: {sess.mmcScore}/10
                            </span>
                          )}
                          <button
                            onClick={() => setConfirmDeleteId(sess.id)}
                            className="p-1 text-neutral-400 hover:text-red-500 hover:bg-red-950/20 rounded-md border border-transparent hover:border-red-900/40 transition-all active:scale-95 ml-1"
                            title="Delete workout"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Exercises short summary */}
                      <div className="text-[10px] text-neutral-300 font-sans leading-relaxed pl-2 border-l-2 border-[var(--primary)]">
                        {sess.exercises && sess.exercises.length > 0 ? (
                          sess.exercises.map((ex, exIdx) => (
                            <div key={exIdx} className="truncate">
                              • <span className="font-bold text-white">{ex.name}</span> ({ex.sets?.length || 0} sets)
                            </div>
                          ))
                        ) : (
                          <span className="text-neutral-500 italic">No movements recorded.</span>
                        )}
                      </div>

                      {/* Action Row */}
                      <div className="flex gap-2">
                        {/* Repeat Button (Mobile logger context only) */}
                        {onSelectSession && (
                          <button
                            onClick={() => onSelectSession(sess)}
                            className="flex-1 py-1.5 bg-[var(--primary)] text-black font-body font-bold text-[10px] uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_black] active:scale-95 cursor-pointer transition-all flex items-center justify-center gap-1"
                          >
                            <Flame size={10} className="fill-black" />
                            <span>⚡ Repeat Workout</span>
                          </button>
                        )}

                        {/* Recap Button (Desktop recap cinema context) */}
                        {!isMobile && (
                          <button
                            onClick={() => {
                              setSelectedDateKey(null);
                              navigate(`/recap?sessionId=${sess.id}&source=${sess.source}`);
                            }}
                            className="flex-1 py-1.5 bg-[var(--secondary)] text-black font-body font-bold text-[10px] uppercase rounded-lg border-2 border-black shadow-[2px_2px_0px_black] active:scale-95 cursor-pointer transition-all flex items-center justify-center gap-1.5"
                          >
                            <Film size={10} />
                            <span>🎬 Recap Workout</span>
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      
    </div>
  );
};
