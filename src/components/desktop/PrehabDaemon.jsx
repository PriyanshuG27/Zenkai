import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Pause, RotateCcw, Check, Sparkles, AlertCircle, Dumbbell } from 'lucide-react';
import { useAuthStore } from '../../stores/useAuthStore';
import { db } from '../../lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useXPEngine } from '../../hooks/useXPEngine';
import { motion, AnimatePresence } from 'framer-motion';

export const PrehabDaemon = ({ sessions = [] }) => {
  const { uid, profile, setProfile } = useAuthStore();
  const { awardXP } = useXPEngine();

  // Timer states
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes (120 seconds)
  const [isActive, setIsActive] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successXP, setSuccessXP] = useState(false);
  
  const timerRef = useRef(null);

  // Derive today's local date string (YYYY-MM-DD)
  const todayStr = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const isAlreadyClaimedToday = useMemo(() => {
    return profile?.lastPrehabDate === todayStr;
  }, [profile, todayStr]);

  // Map latest workout to specific stretches
  const prehabDrill = useMemo(() => {
    if (!sessions || sessions.length === 0) {
      return {
        name: "World's Greatest Stretch",
        muscleGroup: "Full Body Mobility",
        focus: "Ankles, hips, and thoracic spine rotation.",
        steps: [
          "Start in a high plank position. Step your right foot forward outside your right hand.",
          "Lower your left knee to the ground (optional) and stretch your hips forward.",
          "Lift your right hand and rotate your torso, pointing your hand toward the ceiling.",
          "Place your hand back down, step back to plank, and repeat on the left side."
        ]
      };
    }

    const latest = sessions[0];
    const exercises = latest.exercises || [];

    // Analyze names/keys
    let hasSquatDeadlift = false;
    let hasBenchPress = false;
    let hasShoulderPress = false;
    let hasBackPull = false;

    exercises.forEach(ex => {
      const name = (ex.name || '').toLowerCase();
      const key = (ex.exerciseKey || '').toLowerCase();

      if (name.includes('squat') || name.includes('deadlift') || key.includes('squat') || key.includes('deadlift') || name.includes('leg')) {
        hasSquatDeadlift = true;
      }
      if (name.includes('bench') || name.includes('press') || key.includes('bench') || key.includes('press') || name.includes('chest')) {
        // Distinguish from overhead shoulder press
        if (name.includes('overhead') || name.includes('shoulder') || key.includes('shoulder')) {
          hasShoulderPress = true;
        } else {
          hasBenchPress = true;
        }
      }
      if (name.includes('overhead') || name.includes('shoulder') || name.includes('delt') || key.includes('shoulder') || key.includes('press')) {
        hasShoulderPress = true;
      }
      if (name.includes('row') || name.includes('pulldown') || name.includes('chin') || name.includes('pullup') || name.includes('lat') || key.includes('row') || key.includes('lat')) {
        hasBackPull = true;
      }
    });

    if (hasSquatDeadlift) {
      return {
        name: "Couch Stretch & Hip Mobility",
        muscleGroup: "Hips & Glutes",
        focus: "Relieve spinal compression and open tight hip flexors.",
        steps: [
          "Place your back knee against the bottom of a wall (or couch cushion).",
          "Step your opposite leg forward into a lunge position.",
          "Slowly lift your torso upright while squeezing your glutes.",
          "Hold for 1 minute on each side, breathing deeply into the hip crease."
        ]
      };
    }

    if (hasBenchPress) {
      return {
        name: "Doorway Chest Stretch",
        muscleGroup: "Pectorals & Anterior Delts",
        focus: "Open tight pectorals and reset shoulders back.",
        steps: [
          "Stand in a doorway with your elbows bent at 90 degrees.",
          "Place your forearms against the door frame on each side.",
          "Slowly step one foot forward until you feel a comfortable stretch in your chest.",
          "Keep your head up and chest open. Hold for 2 minutes."
        ]
      };
    }

    if (hasShoulderPress) {
      return {
        name: "Shoulder Band Dislocates",
        muscleGroup: "Shoulder Capsule & Rotator Cuff",
        focus: "Increase range of motion and open shoulder girdle.",
        steps: [
          "Hold a resistance band or PVC pipe wide in front of your thighs.",
          "Keep your arms completely straight, lift them overhead, and circle them behind your back.",
          "Bring them back forward to the starting position.",
          "Perform slow, controlled passes for 2 minutes. Focus on smooth movement."
        ]
      };
    }

    if (hasBackPull) {
      return {
        name: "Thread the Needle",
        muscleGroup: "Lats & Thoracic Spine",
        focus: "Improve upper back rotation and stretch lat muscles.",
        steps: [
          "Start on your hands and knees in a tabletop position.",
          "Slide your right hand under your left arm, resting your right shoulder on the ground.",
          "Extend your left hand forward, keeping your hips high over your knees.",
          "Breathe into your mid-back for 1 minute, then switch sides."
        ]
      };
    }

    return {
      name: "World's Greatest Stretch",
      muscleGroup: "Full Body Mobility",
      focus: "Ankles, hips, and thoracic spine rotation.",
      steps: [
        "Start in a high plank position. Step your right foot forward outside your right hand.",
        "Lower your left knee to the ground (optional) and stretch your hips forward.",
        "Lift your right hand and rotate your torso, pointing your hand toward the ceiling.",
        "Place your hand back down, step back to plank, and repeat on the left side."
      ]
    };
  }, [sessions]);

  // Audio completion sound
  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      const now = audioCtx.currentTime;
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.exponentialRampToValueAtTime(1046.50, now + 0.15); // C6
      
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      
      osc.start(now);
      osc.stop(now + 0.6);
    } catch (e) {
      console.warn('[PrehabDaemon] Web Audio blocked or unsupported:', e);
    }
  };

  // Timer loop
  useEffect(() => {
    if (isActive && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            setIsActive(false);
            setIsCompleted(true);
            playChime();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isActive, timeLeft]);

  // Start/Pause toggle
  const toggleTimer = () => {
    if (isAlreadyClaimedToday) {
      setErrorMsg('Prehab daemon reward already claimed for today.');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }
    setIsActive(!isActive);
  };

  // Reset timer
  const resetTimer = () => {
    setIsActive(false);
    setTimeLeft(120);
    setIsCompleted(false);
  };

  // Claim check-off reward
  const handleCheckOff = async () => {
    if (isAlreadyClaimedToday) {
      setErrorMsg('You have already claimed this reward today!');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }
    if (!uid) return;

    try {
      // 1. Award XP (+10 XP)
      const res = await awardXP(uid, 'challenge_mission', 10, { challengeId: 'prehab_daemon' });
      
      if (res) {
        // 2. Update user profile lastPrehabDate to lock it out
        const userRef = doc(db, 'users', uid);
        await setDoc(userRef, { lastPrehabDate: todayStr }, { merge: true });

        // Update local auth store profile state
        if (profile) {
          setProfile({
            ...profile,
            xp: res.newXP,
            level: res.newLevel,
            levelName: res.newLevelName,
            lastPrehabDate: todayStr
          });
        }

        // 3. Sync to squad code if active
        const squadCode = profile?.squadCode;
        if (squadCode) {
          const codeRef = doc(db, 'squad_codes', squadCode);
          await setDoc(codeRef, {
            xp: res.newXP,
            level: res.newLevel,
            updatedAt: new Date()
          }, { merge: true });
        }

        setSuccessXP(true);
        setIsCompleted(false);
        setTimeLeft(120);
      }
    } catch (err) {
      console.error('[PrehabDaemon] Checkoff failed:', err);
      setErrorMsg('Network error occurred during XP claim.');
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  // Format MM:SS
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const pctProgress = ((120 - timeLeft) / 120) * 100;

  return (
    <div className="border-4 border-black bg-[var(--surface)] p-6 rounded-2xl shadow-[4px_4px_0px_rgba(0,0,0,1)] text-left flex flex-col gap-4 relative overflow-hidden">
      
      {/* Decorative Diagonal Stripes on Claimed State */}
      {isAlreadyClaimedToday && (
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-[var(--accent-xp)]/10 to-transparent pointer-events-none transform rotate-12" />
      )}

      {/* Header */}
      <div className="flex justify-between items-start border-b-2 border-black pb-3">
        <div className="flex items-center gap-2">
          <Dumbbell className="text-[var(--primary)]" size={18} />
          <h3 className="font-display font-black text-lg text-white uppercase tracking-wider">
            DESK PREHAB DAEMON
          </h3>
        </div>
        <span className="px-2 py-0.5 border border-[#333] text-[9px] font-mono text-[var(--accent-xp)] uppercase tracking-wider font-extrabold rounded">
          +10 XP DAILY
        </span>
      </div>

      {/* Renders instructions */}
      <div className="flex flex-col gap-3">
        <div className="bg-black/35 border border-neutral-900 p-3.5 rounded-xl">
          <div className="flex justify-between items-center mb-1">
            <span className="text-[10px] font-mono text-[var(--secondary)] uppercase font-extrabold">
              Target Stretch Drill
            </span>
            <span className="text-[9px] font-mono text-neutral-500 uppercase">
              {prehabDrill.muscleGroup}
            </span>
          </div>
          <h4 className="font-display font-black text-lg text-white uppercase tracking-wide">
            {prehabDrill.name}
          </h4>
          <p className="text-xs text-[var(--text-secondary)] font-sans mt-1 leading-relaxed">
            {prehabDrill.focus}
          </p>
        </div>

        {/* Steps accordion */}
        <div className="flex flex-col gap-1.5 pl-2 border-l-2 border-[#222]">
          {prehabDrill.steps.map((step, idx) => (
            <div key={idx} className="flex gap-2 text-xs font-sans text-neutral-400">
              <span className="font-mono text-[var(--primary)] font-bold">{idx + 1}.</span>
              <span className="leading-snug">{step}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Timer & Controls */}
      <div className="border-t-2 border-black pt-4 mt-1 flex flex-col md:flex-row justify-between items-center gap-4">
        
        {/* SVG Radial Progress & Timer Display */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 flex items-center justify-center">
            <svg className="absolute w-full h-full transform -rotate-90">
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="#161616"
                strokeWidth="5"
                fill="transparent"
              />
              <circle
                cx="32"
                cy="32"
                r="26"
                stroke="var(--secondary)"
                strokeWidth="5"
                fill="transparent"
                strokeDasharray="163"
                strokeDashoffset={163 - (163 * pctProgress) / 100}
                className="transition-all duration-300"
              />
            </svg>
            <span className="font-mono text-xs font-bold text-white relative">
              {formatTime(timeLeft)}
            </span>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={toggleTimer}
              disabled={isAlreadyClaimedToday}
              className={`p-2.5 border-2 border-black rounded-lg shadow-[2px_2px_0px_black] active:scale-95 transition-all ${
                isAlreadyClaimedToday 
                  ? 'bg-neutral-800 text-neutral-600 cursor-not-allowed shadow-none'
                  : isActive
                    ? 'bg-orange-600 text-white cursor-pointer'
                    : 'bg-[var(--primary)] text-black cursor-pointer hover:brightness-110'
              }`}
            >
              {isActive ? <Pause size={14} /> : <Play size={14} />}
            </button>

            <button
              onClick={resetTimer}
              disabled={isAlreadyClaimedToday}
              className={`p-2.5 border-2 border-black rounded-lg shadow-[2px_2px_0px_black] active:scale-95 transition-all bg-[var(--bg-elevated)] text-white ${
                isAlreadyClaimedToday ? 'cursor-not-allowed shadow-none' : 'cursor-pointer hover:bg-neutral-800'
              }`}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>

        {/* Check-off & Feedback Section */}
        <div className="w-full md:w-auto flex flex-col items-center md:items-end justify-center">
          <AnimatePresence mode="wait">
            {isAlreadyClaimedToday ? (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs font-mono text-[var(--accent-xp)] font-bold"
              >
                <Check size={14} />
                <span>COMPLETED TODAY</span>
              </motion.div>
            ) : isCompleted ? (
              <motion.button
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={handleCheckOff}
                className="w-full md:w-auto flex items-center justify-center gap-2 bg-[var(--accent-xp)] hover:brightness-110 text-black font-display font-black text-sm uppercase px-5 py-3 border-2 border-black shadow-[3px_3px_0px_black] active:scale-95 rounded-xl cursor-pointer transition-all animate-bounce"
              >
                <Check size={16} />
                <span>Check Off Drill</span>
              </motion.button>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center md:text-right"
              >
                <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider block">
                  Status
                </span>
                <span className="text-xs font-mono text-[var(--text-secondary)] uppercase font-semibold">
                  {isActive ? '⏱️ STRETCH NOW' : '⏸️ PAUSED'}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Success Flash Toast Animation */}
          {successXP && (
            <div className="absolute inset-0 bg-[#b5ff2d12] flex items-center justify-center pointer-events-none animate-fadeOut duration-1000">
              <span className="text-sm font-display font-black text-[var(--accent-xp)] uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={16} />
                <span>+10 XP CLAIMED!</span>
              </span>
            </div>
          )}
        </div>

      </div>

      {/* Error state */}
      {errorMsg && (
        <div className="flex items-center gap-1.5 text-xs font-mono text-red-500 justify-center border border-red-500/20 bg-red-950/10 p-2 rounded-xl mt-2">
          <AlertCircle size={14} />
          <span>{errorMsg}</span>
        </div>
      )}

    </div>
  );
};
