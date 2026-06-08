import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles, Save, CheckCircle, Activity, Brain } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, query, orderBy, limit, getDocs, doc, writeBatch } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';

export const DesktopLogEditor = () => {
  const [searchParams] = useSearchParams();
  const targetSessionId = searchParams.get('sessionId');

  const { uid } = useAuthStore();
  const [session, setSession] = useState(null);
  const [exercises, setExercises] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  const [recentSessions, setRecentSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');

  useEffect(() => {
    if (!uid) return;
    const fetchRecentSessions = async () => {
      let mobileList = [];
      try {
        const sessionsRef = collection(db, 'users', uid, 'sessions');
        const qMobile = query(sessionsRef, orderBy('date', 'desc'), limit(15));
        const snapMobile = await getDocs(qMobile);
        for (const docSnap of snapMobile.docs) {
          const sessData = docSnap.data();
          const exSnap = await getDocs(collection(db, 'users', uid, 'sessions', docSnap.id, 'exercises'));
          const exercisesList = exSnap.docs.map(exDoc => ({ id: exDoc.id, ...exDoc.data() }));

          const rawDate = sessData.date;
          let resolvedDate = new Date();
          if (rawDate) {
            if (rawDate.toDate) resolvedDate = rawDate.toDate();
            else if (rawDate.seconds) resolvedDate = new Date(rawDate.seconds * 1000);
            else resolvedDate = new Date(rawDate);
          }

          mobileList.push({
            id: docSnap.id,
            source: 'mobile',
            ...sessData,
            date: resolvedDate,
            exercises: exercisesList
          });
        }
      } catch (err) {
        console.error('[LogEditor] Error fetching mobile session:', err);
      }

      let desktopList = [];
      try {
        const execRef = collection(db, 'users', uid, 'executed_sessions');
        const qDesktop = query(execRef, orderBy('date', 'desc'), limit(15));
        const snapDesktop = await getDocs(qDesktop);
        for (const docSnap of snapDesktop.docs) {
          const sessData = docSnap.data();

          const rawDate = sessData.date;
          let resolvedDate = new Date();
          if (rawDate) {
            if (rawDate.toDate) resolvedDate = rawDate.toDate();
            else if (rawDate.seconds) resolvedDate = new Date(rawDate.seconds * 1000);
            else resolvedDate = new Date(rawDate);
          }

          desktopList.push({
            id: docSnap.id,
            source: 'desktop',
            ...sessData,
            date: resolvedDate,
            exercises: sessData.exercises || []
          });
        }
      } catch (err) {
        console.error('[LogEditor] Error fetching desktop session:', err);
      }

      const merged = [...mobileList, ...desktopList].sort((a, b) => b.date - a.date);
      setRecentSessions(merged);

      let activeSess = null;
      if (targetSessionId) {
        activeSess = merged.find(s => s.id === targetSessionId);
      }
      if (!activeSess && merged.length > 0) {
        activeSess = merged[0];
      }

      if (activeSess) {
        setSelectedSessionId(activeSess.id);
        setSession(activeSess);
        const resolvedExercises = (activeSess.exercises || []).map(ex => ({
          ...ex,
          sets: (ex.sets || []).map(set => ({
            ...set,
            rpe: set.rpe !== undefined ? set.rpe : (activeSess.rpeScore || 7),
            mmc: set.mmc !== undefined ? set.mmc : (activeSess.mmcScore || 7),
          }))
        }));
        setExercises(resolvedExercises);
        setNotes(activeSess.notes || '');
      }
    };
    fetchRecentSessions();
  }, [uid, targetSessionId]);

  const handleSessionChange = (sessionId) => {
    const selected = recentSessions.find(s => s.id === sessionId);
    if (selected) {
      setSelectedSessionId(sessionId);
      setSession(selected);
      const resolvedExercises = (selected.exercises || []).map(ex => ({
        ...ex,
        sets: (ex.sets || []).map(set => ({
          ...set,
          rpe: set.rpe !== undefined ? set.rpe : (selected.rpeScore || 7),
          mmc: set.mmc !== undefined ? set.mmc : (selected.mmcScore || 7),
        }))
      }));
      setExercises(resolvedExercises);
      setNotes(selected.notes || '');
    }
  };

  const handleUpdateExerciseLog = (exIndex, setIndex, field, value) => {
    const updated = [...exercises];
    updated[exIndex].sets[setIndex][field] = parseFloat(value) || value;
    setExercises(updated);
  };

  const handleUpdateCues = (exIndex, value) => {
    const updated = [...exercises];
    updated[exIndex].verbalCues = value.split(',').map(c => c.trim()).filter(Boolean);
    setExercises(updated);
  };

  const getAverageScores = () => {
    let totalRpe = 0;
    let totalMmc = 0;
    let setCount = 0;

    exercises.forEach((ex) => {
      ex.sets?.forEach((set) => {
        totalRpe += set.rpe !== undefined ? parseInt(set.rpe) : 7;
        totalMmc += set.mmc !== undefined ? parseInt(set.mmc) : 7;
        setCount++;
      });
    });

    if (setCount === 0) return { avgRpe: 7, avgMmc: 7 };
    return {
      avgRpe: Math.round(totalRpe / setCount),
      avgMmc: Math.round(totalMmc / setCount)
    };
  };

  const handleSaveLogs = async () => {
    if (!uid || !session) return;
    setSaving(true);
    setSuccess(false);

    try {
      const batch = writeBatch(db);

      const { avgRpe, avgMmc } = getAverageScores();

      if (session.source === 'mobile') {
        const sessRef = doc(db, 'users', uid, 'sessions', session.id);
        batch.set(sessRef, {
          rpeScore: avgRpe,
          mmcScore: avgMmc,
          notes,
          editedAt: new Date()
        }, { merge: true });

        exercises.forEach((ex) => {
          const exId = ex.id || ex.exerciseId || ex.exerciseKey;
          if (exId) {
            const exRef = doc(db, 'users', uid, 'sessions', session.id, 'exercises', exId);
            batch.set(exRef, {
              sets: ex.sets || [],
              verbalCues: ex.verbalCues || []
            }, { merge: true });
          }
        });
      } else {
        const sessRef = doc(db, 'users', uid, 'executed_sessions', session.id);
        batch.set(sessRef, {
          exercises,
          rpeScore: avgRpe,
          mmcScore: avgMmc,
          notes,
          editedAt: new Date()
        }, { merge: true });
      }

      await batch.commit();
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error('[LogEditor] Failed to save session edits:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!session) {
    return (
      <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] text-center font-mono text-xs text-[var(--text-secondary)]">
        No recent executed workouts found to review.
      </div>
    );
  }

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-6 text-left">
      
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-3 flex justify-between items-center">
        <div>
          <h3 className="font-display font-black text-xl text-white uppercase tracking-tight flex items-center gap-2">
            <Activity className="text-[var(--primary)]" size={20} />
            <span>Post-Workout Recap Cinema</span>
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Review telemetry logs, edit values, and configure Desk Vault cues.
          </p>
        </div>
        <button
          onClick={handleSaveLogs}
          disabled={saving}
          className="flex items-center gap-2 border-2 border-black bg-[var(--primary)] px-4 py-2 rounded-lg shadow-[3px_3px_0px_black] text-xs font-mono font-bold text-white uppercase hover:brightness-110 active:scale-95 transition-all disabled:opacity-40"
        >
          {success ? <CheckCircle size={14} /> : <Save size={14} />}
          <span>{saving ? 'Saving...' : success ? 'Saved!' : 'Save Logs'}</span>
        </button>
      </div>

      {/* Session Selector */}
      {recentSessions.length > 0 && (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b-2 border-black pb-4">
          <div className="flex flex-col text-left font-mono">
            <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Select Session to Edit</span>
            <span className="text-[9px] text-[var(--text-muted)] mt-0.5 font-sans">Choose from your last 30 workouts</span>
          </div>
          <select
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
            className="w-full sm:w-72 bg-black border-2 border-black text-white px-3 py-2 rounded-lg focus:outline-none focus:border-[var(--primary)] font-mono text-xs shadow-[3px_3px_0px_black] cursor-pointer"
          >
            {recentSessions.map((sess) => (
              <option key={sess.id} value={sess.id}>
                {sess.date.toLocaleDateString('en-IN', {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })} - {sess.source === 'desktop' ? '🖥️ Desktop' : '📱 Mobile'}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Session Average Telemetry Summary */}
      {(() => {
        const { avgRpe, avgMmc } = getAverageScores();
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="border-2 border-black bg-[var(--bg-elevated)] p-4 rounded-xl flex justify-between items-center shadow-[3px_3px_0px_black]">
              <div className="flex flex-col text-left font-mono">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Average Exertion (RPE)</span>
                <span className="text-[9px] text-[var(--text-muted)] font-sans mt-0.5">Overall intensity across all logged sets</span>
              </div>
              <span className="text-xl font-display font-black text-[var(--primary)] bg-black px-3 py-1 border-2 border-black rounded shadow-[1.5px_1.5px_0px_black]">
                {avgRpe}/10
              </span>
            </div>
            <div className="border-2 border-black bg-[var(--bg-elevated)] p-4 rounded-xl flex justify-between items-center shadow-[3px_3px_0px_black]">
              <div className="flex flex-col text-left font-mono">
                <span className="text-[10px] text-[var(--text-secondary)] uppercase font-bold">Average Connection (MMC)</span>
                <span className="text-[9px] text-[var(--text-muted)] font-sans mt-0.5">Overall cognitive activation across sets</span>
              </div>
              <span className="text-xl font-display font-black text-[var(--secondary)] bg-black px-3 py-1 border-2 border-black rounded shadow-[1.5px_1.5px_0px_black]">
                {avgMmc}/10
              </span>
            </div>
          </div>
        );
      })()}

      {/* Log Details */}
      <div className="flex flex-col gap-4">
        <span className="text-xs font-mono font-bold text-white uppercase tracking-wider">
          Exercise Table
        </span>
        
        <div className="flex flex-col gap-3">
          {exercises.map((ex, exIndex) => (
            <div key={exIndex} className="border border-[var(--border)] bg-[var(--bg-elevated)] p-4 rounded-xl flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-mono font-black uppercase text-white">
                  {ex.name}
                </span>
                <div className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-secondary)]">
                  <Brain size={12} className="text-[var(--primary)]" />
                  <span>Desk Cues</span>
                </div>
              </div>

              {/* Set Grid */}
              <div className="flex flex-col gap-2">
                {ex.sets?.map((set, setIndex) => (
                  <div key={setIndex} className="border border-black bg-black/40 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                    <span className="text-white font-bold">Set {setIndex + 1}</span>
                    
                    <div className="flex flex-wrap items-center gap-4">
                      {/* Weight and Reps */}
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          value={set.weight}
                          onChange={(e) => handleUpdateExerciseLog(exIndex, setIndex, 'weight', e.target.value)}
                          className="w-14 bg-black border border-[#333] text-center text-white py-1 rounded focus:outline-none focus:border-[var(--primary)]"
                        />
                        <span className="text-[var(--text-secondary)]">kg</span>
                        <input
                          type="number"
                          value={set.reps}
                          onChange={(e) => handleUpdateExerciseLog(exIndex, setIndex, 'reps', e.target.value)}
                          className="w-12 bg-black border border-[#333] text-center text-white py-1 rounded focus:outline-none focus:border-[var(--primary)]"
                        />
                        <span className="text-[var(--text-secondary)]">reps</span>
                      </div>

                      {/* RPE Selector */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-secondary)] font-semibold">RPE:</span>
                        <select
                          value={set.rpe ?? 7}
                          onChange={(e) => handleUpdateExerciseLog(exIndex, setIndex, 'rpe', e.target.value)}
                          className="bg-black border border-[#333] text-white px-2 py-1 rounded focus:outline-none focus:border-[var(--primary)] font-bold text-xs"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                            <option key={val} value={val}>{val}/10</option>
                          ))}
                        </select>
                      </div>

                      {/* MMC Selector */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[var(--text-secondary)] font-semibold">MMC:</span>
                        <select
                          value={set.mmc ?? 7}
                          onChange={(e) => handleUpdateExerciseLog(exIndex, setIndex, 'mmc', e.target.value)}
                          className="bg-black border border-[#333] text-white px-2 py-1 rounded focus:outline-none focus:border-[var(--primary)] font-bold text-xs"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => (
                            <option key={val} value={val}>{val}/10</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mind-Muscle Cues Vault */}
              <div className="flex flex-col gap-1 mt-1">
                <label className="text-[10px] font-mono text-[var(--text-secondary)] uppercase">
                  Mobile Trigger Cues (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Break at hips, Chest tall"
                  value={ex.verbalCues?.join(', ') || ''}
                  onChange={(e) => handleUpdateCues(exIndex, e.target.value)}
                  className="w-full bg-black border border-[#222] px-3 py-1.5 rounded text-xs text-white focus:outline-none focus:border-[var(--primary)]"
                />
              </div>

            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
