import React, { useState, useEffect, useRef } from 'react';
import { Terminal, X, CornerDownLeft } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, addDoc, updateDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { useAuthStore } from '../../stores/useAuthStore';
import exerciseData from '../../data/exercises.json';

export const CommandPalette = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [command, setCommand] = useState('');
  const [status, setStatus] = useState({ type: 'info', text: 'Enter shorthand command (e.g. log bench 80 3x5)' });
  const { uid } = useAuthStore();
  const inputRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setCommand('');
      setStatus({ type: 'info', text: 'Enter shorthand command (e.g. log bench 80 3x5)' });
    }
  }, [isOpen]);

  const handleExecute = async (e) => {
    e.preventDefault();
    if (!command.trim() || !uid) return;

    const logRegex = /^>?\s*log\s+([a-zA-Z\s]+)\s+(\d+(?:\.\d+)?)\s*k?g?\s+(\d+)\s*[x*]\s*(\d+)/i;
    const planRegex = /^>?\s*plan\s+([a-zA-Z\s]+)\s+tomorrow/i;
    const painRegex = /^>?\s*pain\s+([a-zA-Z\s]+)\s+(\d+)/i;

    setStatus({ type: 'info', text: 'Executing telemetry instruction...' });

    try {
      if (logRegex.test(command)) {
        const [, exercise, weight, sets, reps] = command.match(logRegex);
        
        const enteredName = exercise.trim().toLowerCase();
        const foundExercise = exerciseData.find(ex => 
          ex.name.toLowerCase() === enteredName || 
          (ex.aliases && ex.aliases.some(alias => alias.toLowerCase() === enteredName))
        );

        const resolvedName = foundExercise ? foundExercise.name : exercise.trim();
        const resolvedMuscle = foundExercise ? foundExercise.muscleGroup : 'other';

        const totalSets = parseInt(sets);
        const totalReps = parseInt(reps);
        const parseFloatWeight = parseFloat(weight);
        const volume = totalSets * totalReps * parseFloatWeight;

        // Push offline append logs into executed_sessions
        const sessionRef = collection(db, 'users', uid, 'executed_sessions');
        await addDoc(sessionRef, {
          date: new Date(),
          durationSeconds: 2400,
          moodTag: 'average',
          rpeScore: 7,
          mmcScore: 7,
          totalVolume: volume,
          exercises: [{
            name: resolvedName,
            muscleGroup: resolvedMuscle,
            sets: Array.from({ length: totalSets }, () => ({
              reps: totalReps,
              weight: parseFloatWeight,
              rpe: 7,
              mmc: 7,
              done: true
            }))
          }]
        });

        setStatus({ type: 'success', text: `Successfully appended log: ${resolvedName} ${weight}kg ${sets}x${reps}` });
        setTimeout(() => setIsOpen(false), 1200);
      } else if (planRegex.test(command)) {
        const [, focus] = command.match(planRegex);

        const planRef = collection(db, 'users', uid, 'planned_targets');
        await addDoc(planRef, {
          day: 1,
          focus: focus.trim().toUpperCase(),
          epoch: Date.now(),
          version: 1,
          exercises: []
        });

        setStatus({ type: 'success', text: `Created scheduled target for tomorrow: ${focus.toUpperCase()}` });
        setTimeout(() => setIsOpen(false), 1200);
      } else if (painRegex.test(command)) {
        const [, muscle, painLevel] = command.match(painRegex);
        const painVal = parseInt(painLevel);

        if (painVal < 1 || painVal > 10) {
          setStatus({ type: 'error', text: 'Pain level must be between 1 and 10' });
          return;
        }

        const stalledRef = doc(db, 'users', uid, 'stalledLifts', muscle.trim().toLowerCase());
        await updateDoc(stalledRef, {
          painValue: painVal,
          lastUpdated: new Date()
        }).catch(async () => {
          // Document might not exist, create it
          await addDoc(collection(db, 'users', uid, 'stalledLifts'), {
            muscle: muscle.trim().toLowerCase(),
            painValue: painVal,
            lastUpdated: new Date(),
            stalledWeeksCount: 0
          });
        });

        setStatus({ type: 'success', text: `Logged pain warning for ${muscle.trim()}: Level ${painVal}` });
        setTimeout(() => setIsOpen(false), 1200);
      } else {
        setStatus({ type: 'error', text: 'Unknown token shorthand pattern.' });
      }
    } catch (err) {
      console.error(err);
      setStatus({ type: 'error', text: 'Execution halted: Database error' });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xl border-4 border-black bg-[#111111] rounded-2xl shadow-[8px_8px_0px_rgba(0,0,0,1)] overflow-hidden">
        
        {/* Terminal Header */}
        <div className="border-b-4 border-black bg-[#1a1a1a] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs text-[var(--secondary)] uppercase font-black">
            <Terminal size={16} />
            <span>FitDesi Core Command Palette</span>
          </div>
          <button 
            onClick={() => setIsOpen(false)} 
            className="text-[var(--text-secondary)] hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Command Form */}
        <form onSubmit={handleExecute} className="p-6 flex flex-col gap-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="e.g. log Bench Press 80 3x5"
              className="w-full border-2 border-black bg-black px-4 py-3.5 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-[var(--primary)] placeholder-[#444]"
            />
            <div className="absolute right-3 top-3.5 flex items-center gap-1 font-mono text-[9px] text-[#444] border border-[#222] bg-[#111] px-1.5 py-0.5 rounded">
              <CornerDownLeft size={10} />
              <span>ENTER</span>
            </div>
          </div>

          {/* Status Message */}
          <div className={`border-2 border-black p-3.5 rounded-lg font-mono text-xs ${
            status.type === 'error' ? 'text-[#FF3366]' :
            status.type === 'success' ? 'text-[#33FF66]' : 'text-[var(--text-secondary)]'
          } bg-black`}>
            {status.text}
          </div>

          {/* Instructions List */}
          <div className="flex flex-col gap-1.5 border border-[#222] bg-[#151515] p-4 rounded-lg">
            <span className="text-[10px] font-mono font-bold text-[var(--primary)] uppercase tracking-wider">
              Supported Commands
            </span>
            <ul className="flex flex-col gap-2 font-mono text-[11px] text-[var(--text-secondary)] mt-1.5">
              <li className="flex justify-between">
                <span><code>log [exercise] [weight] [sets]x[reps]</code></span>
                <span className="text-white">Appends executed logs</span>
              </li>
              <li className="flex justify-between">
                <span><code>plan [focus] tomorrow</code></span>
                <span className="text-white">Schedules tomorrow's target</span>
              </li>
              <li className="flex justify-between">
                <span><code>pain [muscle] [1-10]</code></span>
                <span className="text-white">Logs joint pain warning</span>
              </li>
            </ul>
          </div>
        </form>

      </div>
    </div>
  );
};
