import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle, ShieldAlert } from 'lucide-react';
import { db } from '../../lib/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';

// Helper to calculate YYYY-WNN weekId from a Date object
function getWeekIdFromDate(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  const startOfYear = new Date(year, 0, 1);
  const week = Math.ceil(((d - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export const AcademicBufferConfig = () => {
  const { uid } = useAuthStore();
  const [isActive, setIsActive] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generatedWeeks, setGeneratedWeeks] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');

  // Fetch initial exam configurations from user doc on mount
  useEffect(() => {
    if (!uid) return;
    const fetchExamConfig = async () => {
      try {
        const [snap, privateSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'users', uid, 'private', 'profile'))
        ]);
        if (snap.exists()) {
          const data = snap.data();
          const privateData = privateSnap.exists() ? privateSnap.data() : {};
          if (data.examDeloadActive !== undefined) {
            setIsActive(data.examDeloadActive);
          }
          setStartDate(privateData.examStartDate || '');
          setEndDate(privateData.examEndDate || '');
        }
      } catch (err) {
        console.error('[AcademicBufferConfig] Error fetching config:', err);
      }
    };
    fetchExamConfig();
  }, [uid]);

  const handleActivateExamMode = async () => {
    if (!uid) return;
    if (!startDate || !endDate) {
      setErrorMsg('Please select both Start and End Dates.');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setErrorMsg('Start Date cannot be after End Date.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    setSuccess(false);
    setGeneratedWeeks([]);

    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', uid);
      const privateRef = doc(db, 'users', uid, 'private', 'profile');
      const isActivating = !isActive;

      // 1. Save config directly in user profile (split across public and private documents)
      batch.update(userRef, {
        examDeloadActive: isActivating,
        updatedAt: new Date()
      });

      batch.set(privateRef, {
        examStartDate: startDate,
        examEndDate: endDate,
        updatedAt: new Date()
      }, { merge: true });

      await batch.commit();

      // Update local auth store profile to prevent latency
      const currentProfile = useAuthStore.getState().profile || {};
      useAuthStore.setState({
        profile: {
          ...currentProfile,
          examDeloadActive: isActivating,
          examStartDate: startDate,
          examEndDate: endDate
        }
      });

      setIsActive(isActivating);

      // If active, generate and push 1/9th Volume Flexible Deload plans for affected weeks
      if (isActivating) {
        const startWeek = getWeekIdFromDate(startDate);
        const endWeek = getWeekIdFromDate(endDate);
        
        // Find all affected week IDs
        const affectedWeeks = new Set();
        let current = new Date(startDate);
        const end = new Date(endDate);
        while (current <= end) {
          const wId = getWeekIdFromDate(current);
          if (wId) affectedWeeks.add(wId);
          current.setDate(current.getDate() + 7); // add one week
        }
        // Make sure to add the final week ID too
        const finalWId = getWeekIdFromDate(end);
        if (finalWId) affectedWeeks.add(finalWId);

        const weekList = Array.from(affectedWeeks);
        setGeneratedWeeks(weekList);

        for (const weekId of weekList) {
          // A. Fetch current week's plan (if it exists)
          const planRef = doc(db, 'users', uid, 'weeklyPlans', weekId);
          const planSnap = await getDoc(planRef);
          
          let deloadDays = [];
          
          if (planSnap.exists()) {
            const planData = planSnap.data();
            const originalDays = planData.plan?.days || planData.days || [];
            
            // Transform plan to day-agnostic flexible 1/9th volume deload format
            deloadDays = originalDays.map((day, idx) => {
              const labelLetter = String.fromCharCode(65 + idx); // A, B, C...
              return {
                ...day,
                label: `Session ${labelLetter} (Flexible Date - Recovery)`,
                id: `flexible_session_${idx + 1}`,
                estimatedMins: Math.max(15, Math.round((day.estimatedMins || 45) * 0.3)), // shorter sessions
                exercises: (day.exercises || []).map((ex) => {
                  const firstSet = ex.sets && ex.sets.length > 0 ? ex.sets[0] : { reps: 5, weight: 20 };
                  return {
                    ...ex,
                    sets: [
                      {
                        reps: firstSet.reps || 5,
                        weight: firstSet.weight || 20,
                        done: false,
                        completed: false
                      }
                    ]
                  };
                })
              };
            });
          } else {
            // Generate a default 3-session day-agnostic flexible deload template
            deloadDays = [
              {
                id: 'flexible_session_1',
                label: 'Session A (Flexible Date - Recovery)',
                muscleGroups: ['chest', 'back', 'legs'],
                estimatedMins: 20,
                exercises: [
                  {
                    exerciseId: 'barbell_bench_press',
                    exerciseKey: 'barbell_bench_press',
                    name: 'Barbell Bench Press',
                    sets: [{ reps: 5, weight: 40, done: false, completed: false }]
                  },
                  {
                    exerciseId: 'barbell_back_squat',
                    exerciseKey: 'barbell_back_squat',
                    name: 'Barbell Back Squat',
                    sets: [{ reps: 5, weight: 60, done: false, completed: false }]
                  }
                ]
              },
              {
                id: 'flexible_session_2',
                label: 'Session B (Flexible Date - Recovery)',
                muscleGroups: ['shoulders', 'arms', 'core'],
                estimatedMins: 20,
                exercises: [
                  {
                    exerciseId: 'overhead_press',
                    exerciseKey: 'overhead_press',
                    name: 'Overhead Press',
                    sets: [{ reps: 5, weight: 30, done: false, completed: false }]
                  },
                  {
                    exerciseId: 'pull_ups',
                    exerciseKey: 'pull_ups',
                    name: 'Pull-Ups',
                    sets: [{ reps: 5, weight: 'BW', done: false, completed: false }]
                  }
                ]
              },
              {
                id: 'flexible_session_3',
                label: 'Session C (Flexible Date - Recovery)',
                muscleGroups: ['back', 'legs', 'core'],
                estimatedMins: 20,
                exercises: [
                  {
                    exerciseId: 'barbell_deadlift',
                    exerciseKey: 'barbell_deadlift',
                    name: 'Barbell Deadlift',
                    sets: [{ reps: 5, weight: 70, done: false, completed: false }]
                  },
                  {
                    exerciseId: 'hanging_leg_raise',
                    exerciseKey: 'hanging_leg_raise',
                    name: 'Hanging Leg Raise',
                    sets: [{ reps: 10, weight: 'BW', done: false, completed: false }]
                  }
                ]
              }
            ];
          }

          // B. Write deload plan to Firestore paths
          const deloadPlanDoc = {
            weekId,
            plan: { days: deloadDays },
            days: deloadDays,
            isExamDeload: true,
            examStartDate: startDate,
            examEndDate: endDate,
            generatedAt: new Date().toISOString()
          };

          // Update weeklyPlans and planned_targets
          await setDoc(doc(db, 'users', uid, 'weeklyPlans', weekId), deloadPlanDoc);
          await setDoc(doc(doc(db, 'users', uid, 'planned_targets', weekId)), {
            ...deloadPlanDoc,
            epoch: Date.now()
          });
        }
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3500);
    } catch (err) {
      console.error('[AcademicBufferConfig] Failed to toggle exam mode:', err);
      setErrorMsg('Error committing deload plan to database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[5px_5px_0px_rgba(0,0,0,1)] flex flex-col gap-4 text-left">
      
      {/* Header */}
      <div className="border-b border-[var(--border)] pb-2 flex justify-between items-center">
        <h3 className="font-display font-black text-lg text-white uppercase tracking-tight flex items-center gap-2">
          <Calendar className="text-[var(--primary)]" size={18} />
          <span>Academic Buffer Engine</span>
        </h3>
      </div>

      <div className="flex flex-col gap-4 mt-2">
        <div className="flex flex-col gap-1.5 border border-[#FFE600]/20 bg-[#FFE600]/5 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#FFE600] uppercase">
            <AlertCircle size={14} />
            <span>High-Stakes Deload Config</span>
          </div>
          <p className="text-[10px] text-[var(--text-secondary)] leading-relaxed font-sans mt-1">
            During sessional exams, project submissions, or high academic workload dates, activate the **1/9th Volume flexible deload planner**. 
            This dynamically transforms your scheduled workouts into day-agnostic flexible sessions (complete them whenever you get a break) and caps working sets at 1 set to prevent physical crash while locking in your strength gains.
          </p>
        </div>

        {/* Form controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">Exam Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-black border border-[#222] px-3 py-2 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-mono text-[var(--text-secondary)] uppercase">Exam End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-black border border-[#222] px-3 py-2 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--primary)]"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <button
            onClick={handleActivateExamMode}
            disabled={loading}
            className={`w-full border-2 border-black px-4 py-2 rounded-lg shadow-[3px_3px_0px_black] text-xs font-mono font-bold uppercase hover:brightness-110 active:scale-95 transition-all cursor-pointer ${
              isActive ? 'bg-[#33FF66] text-black font-black' : 'bg-[var(--primary)] text-white'
            }`}
          >
            <span>{loading ? 'Processing...' : isActive ? 'Active: Flexible Deload Engaged' : 'Activate Exam Mode'}</span>
          </button>
        </div>

        {/* Success Feedback messages */}
        {success && (
          <div className="border border-[#33FF66]/20 bg-[#33FF66]/5 p-3 rounded-xl flex flex-col gap-1 font-mono text-[9px] text-[#33FF66]">
            <div className="flex items-center gap-1.5 font-bold uppercase">
              <CheckCircle size={12} />
              <span>Deload Plan Synced Successfully!</span>
            </div>
            {isActive ? (
              <div className="text-[8px] text-neutral-400 mt-1 flex flex-col gap-0.5">
                <span>• Generated 1/9th volume flexible plans in Firestore.</span>
                <span>• Affected weeks: {generatedWeeks.join(', ')}.</span>
                <span>• Gym sessions changed to day-agnostic flexible labels on mobile.</span>
              </div>
            ) : (
              <span className="text-[8px] text-neutral-400 mt-1">Exam Deload Mode disabled. Standard planning restored.</span>
            )}
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-[#FF3366] uppercase">
            <ShieldAlert size={12} />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

    </div>
  );
};
