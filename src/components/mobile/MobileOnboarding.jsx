import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';

// ─── Constants (same as desktop) ─────────────────────────────────────────────
const STEPS = ['Identity', 'Body', 'Goal', 'Gym', 'Lifestyle', 'Health'];

const USER_TYPES = [
  { key: 'Comeback',   desc: 'Returning after a break or injury', icon: '🔄' },
  { key: 'Beginner',   desc: 'Just starting my fitness journey',  icon: '🌱' },
  { key: 'Consistent', desc: 'Training regularly, levelling up',  icon: '⚡' },
  { key: 'Challenger', desc: 'Pushing for peak performance',      icon: '🏆' },
];

const GOALS = [
  { key: 'Fat Loss',        icon: '🔥', desc: 'Burn fat, preserve muscle' },
  { key: 'Muscle Gain',     icon: '💪', desc: 'Build size & strength' },
  { key: 'Strength',        icon: '🏋️', desc: 'Lift heavier, low-rep' },
  { key: 'Endurance',       icon: '🏃', desc: 'Cardio & functional fitness' },
  { key: 'General Fitness', icon: '⚖️', desc: 'Balanced health & wellness' },
];

const EQUIPMENT_CATEGORIES = [
  { label: 'Chest & Push',      icon: '💪', items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Chest Press Machine', 'Pec Deck', 'Dip Bars'] },
  { label: 'Back & Pull',       icon: '🔙', items: ['Pull-up Bar', 'Lat Pulldown', 'Seated Row', 'Assisted Pull-up Machine', 'Cable Machine'] },
  { label: 'Legs',              icon: '🦵', items: ['Squat Rack', 'Leg Press', 'Hack Squat', 'Leg Extension', 'Leg Curl', 'Smith Machine'] },
  { label: 'Shoulders & Arms',  icon: '🏋️', items: ['Shoulder Press Machine', 'Preacher Curl Bench', 'EZ Bar'] },
  { label: 'Free Weights',      icon: '⚖️', items: ['Barbell', 'Dumbbells', 'Kettlebell', 'Trap Bar', 'Medicine Ball', 'Weight Plates'] },
  { label: 'Core & Functional', icon: '🔥', items: ['Ab Wheel', 'Resistance Bands', 'TRX / Suspension', 'Battle Ropes', 'Parallettes', 'Gymnastic Rings', 'Power Rack'] },
  { label: 'Cardio',            icon: '🏃', items: ['Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Stair Climber', 'Jump Rope'] },
  { label: 'Recovery',          icon: '🧘', items: ['Foam Roller'] },
];

const DIET_TYPES = [
  { key: 'Non-veg',    icon: '🥩', desc: 'Meat, eggs & dairy' },
  { key: 'Eggetarian', icon: '🥚', desc: 'Eggs & dairy, no meat' },
  { key: 'Vegetarian', icon: '🥛', desc: 'Dairy ok, no eggs/meat' },
  { key: 'Vegan',      icon: '🌱', desc: 'No animal products' },
];

const SUPPLEMENT_OPTIONS = [
  'Whey Protein', 'Plant Protein', 'Creatine', 'Pre-Workout',
  'BCAA / EAA', 'Casein', 'Multivitamin', 'Omega-3',
  'Vitamin D', 'Ashwagandha', 'Mass Gainer', 'Fat Burner',
];

const MEDICAL_CATEGORIES = [
  {
    label: 'Upper Body', icon: '🫱',
    items: [
      { key: 'Shoulder Impingement', desc: 'Limits overhead pressing' },
      { key: 'Rotator Cuff Issue',   desc: 'Avoid heavy shoulder loads' },
      { key: 'Wrist Pain',           desc: 'Limits barbell grips' },
      { key: 'Elbow Tendinitis',     desc: 'Affects curls & pressing' },
    ],
  },
  {
    label: 'Core & Back', icon: '🔙',
    items: [
      { key: 'Lower Back Issues', desc: 'Limits deadlifts & rows' },
      { key: 'Herniated Disc',    desc: 'Avoid spinal loading' },
      { key: 'Hernia',            desc: 'Avoid heavy compound lifts' },
    ],
  },
  {
    label: 'Lower Body', icon: '🦵',
    items: [
      { key: 'Bad Knees',         desc: 'Limits squats & leg press' },
      { key: 'Hip Issues',        desc: 'Affects hip hinge movements' },
      { key: 'Ankle Instability', desc: 'Affects balance exercises' },
    ],
  },
  {
    label: 'General Health', icon: '❤️',
    items: [
      { key: 'Post-Surgery',        desc: 'Custom low-intensity plan' },
      { key: 'Varicocele',          desc: 'Avoid prolonged pressure' },
      { key: 'High Blood Pressure', desc: 'Limits intense cardio' },
      { key: 'Asthma',              desc: 'Affects cardio intensity' },
    ],
  },
];

// ─── MobileOnboarding ─────────────────────────────────────────────────────────
export const MobileOnboarding = () => {
  const { uid }  = useAuthStore();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    userType:           null,
    age:                '',
    gender:             null,
    heightCm:           '',
    weightKg:           '',
    goal:               null,
    equipmentList:      [],
    workoutFrequency:   null,
    sessionDuration:    null,
    dietType:           null,
    currentSupplements: [],
    medicalFlags:       [],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));
  const toggleArr = (key, val) =>
    setData(d => ({
      ...d,
      [key]: d[key].includes(val) ? d[key].filter(x => x !== val) : [...d[key], val],
    }));

  const handleComplete = async () => {
    if (!uid) return;
    setSaving(true);
    setError('');
    try {
      await updateDoc(doc(db, 'users', uid), {
        userType:           data.userType,
        age:                Number(data.age),
        gender:             data.gender,
        heightCm:           Number(data.heightCm),
        weightKg:           Number(data.weightKg),
        goal:               data.goal,
        equipmentList:      data.equipmentList,
        workoutFrequency:   data.workoutFrequency,
        sessionDuration:    data.sessionDuration,
        dietType:           data.dietType,
        currentSupplements: data.currentSupplements,
        medicalFlags:       data.medicalFlags,
        onboardingComplete: true,
      });
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('[Onboarding] Save failed:', err);
      setError('Failed to save. Please try again.');
      setSaving(false);
    }
  };

  // Shared bottom nav buttons
  const BottomNav = ({ onNext, nextLabel = 'Next →', disabled = false, isLast = false }) => (
    <div className="flex gap-3 pt-4 border-t border-border mt-4">
      {step > 0 && (
        <button onClick={() => setStep(s => s - 1)}
          className="px-4 py-3 border border-border rounded-xl text-text-secondary text-sm shrink-0">
          ← Back
        </button>
      )}
      <button onClick={onNext} disabled={disabled}
        className={`flex-1 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 ${
          isLast ? 'bg-primary text-white font-bold' : 'bg-primary text-white'}`}>
        {nextLabel}
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: '100dvh' }} className="bg-bg-base text-text-primary flex flex-col p-4 pb-6">

      {/* Header */}
      <div className="pt-5 pb-4 text-center shrink-0">
        <h2 className="font-display text-2xl font-extrabold uppercase tracking-widest">
          FIT<span className="text-primary">DESI</span>
        </h2>
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {STEPS.map((_, i) => (
            <div key={i} className={`rounded-full transition-all ${
              i === step ? 'w-6 h-2 bg-primary' : i < step ? 'w-2 h-2 bg-primary/50' : 'w-2 h-2 bg-border'
            }`} />
          ))}
        </div>
        <p className="text-[10px] text-text-muted font-mono uppercase tracking-widest mt-1.5">
          {step + 1} / {STEPS.length} — {STEPS[step]}
        </p>
      </div>

      {error && <p className="text-center text-destructive text-xs mb-3">{error}</p>}

      {/* ── Step 0: Identity ─────────────────────────────────── */}
      {step === 0 && (
        <div className="flex-1 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold">Who are you?</h3>
            <p className="text-xs text-text-secondary">Pick your training level.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            {USER_TYPES.map(({ key, desc, icon }) => {
              const sel = data.userType === key;
              return (
                <button key={key} onClick={() => set('userType', key)}
                  className={`p-4 border rounded-xl text-left relative transition-all ${
                    sel ? 'bg-primary/10 border-primary' : 'bg-bg-surface border-border'}`}>
                  {sel && <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[9px] font-bold">✓</div>}
                  <div className="text-2xl mb-1.5">{icon}</div>
                  <div className={`text-sm font-bold ${sel ? 'text-primary' : ''}`}>{key}</div>
                  <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{desc}</div>
                </button>
              );
            })}
          </div>
          <BottomNav onNext={() => setStep(1)} disabled={!data.userType} />
        </div>
      )}

      {/* ── Step 1: Body ─────────────────────────────────────── */}
      {step === 1 && (
        <div className="flex-1 flex flex-col gap-4">
          <div>
            <h3 className="text-lg font-bold">Your body, <span className="text-primary">your baseline.</span></h3>
            <p className="text-xs text-text-secondary">Personalises plan intensity and nutrition targets.</p>
          </div>
          {/* Gender */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Gender</label>
            <div className="flex gap-2">
              {['Male', 'Female', 'Other'].map(g => (
                <button key={g} onClick={() => set('gender', g)}
                  className={`flex-1 py-3 border rounded-xl font-semibold text-sm transition-all ${
                    data.gender === g ? 'bg-primary/10 border-primary text-primary' : 'bg-bg-surface border-border'}`}>
                  {g}
                </button>
              ))}
            </div>
          </div>
          {/* Age */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Age</label>
            <input type="number" min="13" max="70" placeholder="e.g. 22"
              value={data.age} onChange={e => set('age', e.target.value)}
              className="w-full bg-bg-surface border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none" />
          </div>
          {/* Height + Weight */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Height (cm)</label>
              <input type="number" placeholder="e.g. 175"
                value={data.heightCm} onChange={e => set('heightCm', e.target.value)}
                className="w-full bg-bg-surface border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none" />
            </div>
            <div>
              <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Weight (kg)</label>
              <input type="number" placeholder="e.g. 72"
                value={data.weightKg} onChange={e => set('weightKg', e.target.value)}
                className="w-full bg-bg-surface border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none" />
            </div>
          </div>
          <BottomNav onNext={() => setStep(2)} disabled={!data.gender || !data.age || !data.heightCm || !data.weightKg} />
        </div>
      )}

      {/* ── Step 2: Goal ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="flex-1 flex flex-col">
          <div className="mb-4">
            <h3 className="text-lg font-bold">Training <span className="text-primary">goal?</span></h3>
            <p className="text-xs text-text-secondary">Shapes rep ranges, rest periods, plan structure.</p>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            {GOALS.map(({ key, icon, desc }) => {
              const sel = data.goal === key;
              return (
                <button key={key} onClick={() => set('goal', key)}
                  className={`p-4 border rounded-xl text-left flex items-center gap-4 transition-all ${
                    sel ? 'bg-primary/10 border-primary' : 'bg-bg-surface border-border'}`}>
                  <span className="text-2xl">{icon}</span>
                  <div className="flex-1">
                    <p className={`font-bold text-sm ${sel ? 'text-primary' : ''}`}>{key}</p>
                    <p className="text-[10px] text-text-muted">{desc}</p>
                  </div>
                  {sel && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[9px] shrink-0">✓</div>}
                </button>
              );
            })}
          </div>
          <BottomNav onNext={() => setStep(3)} disabled={!data.goal} />
        </div>
      )}

      {/* ── Step 3: Gym ──────────────────────────────────────── */}
      {step === 3 && (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div>
            <h3 className="text-lg font-bold">Your <span className="text-primary">gym setup.</span></h3>
            <p className="text-xs text-text-secondary">We only program what you can actually do.</p>
          </div>
          {/* Frequency */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Days per week</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => set('workoutFrequency', n)}
                  className={`flex-1 py-2 border rounded-lg font-bold text-sm transition-all ${
                    data.workoutFrequency === n ? 'bg-primary border-primary text-white' : 'bg-bg-surface border-border'}`}>
                  {n}x
                </button>
              ))}
            </div>
          </div>
          {/* Duration */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Session duration</label>
            <div className="flex gap-2">
              {['45 min', '60 min', '90 min'].map(d => (
                <button key={d} onClick={() => set('sessionDuration', d)}
                  className={`flex-1 py-2 border rounded-lg font-semibold text-xs transition-all ${
                    data.sessionDuration === d ? 'bg-primary border-primary text-white' : 'bg-bg-surface border-border'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>
          {/* Equipment */}
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted">Equipment</p>
            <span className="text-xs text-primary font-mono font-bold">{data.equipmentList.length} selected</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 -mx-1 px-1">
            {EQUIPMENT_CATEGORIES.map(({ label, icon, items }) => (
              <div key={label}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1.5 flex items-center gap-1">
                  <span>{icon}</span>{label}
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {items.map(eq => {
                    const sel = data.equipmentList.includes(eq);
                    return (
                      <button key={eq} onClick={() => toggleArr('equipmentList', eq)}
                        className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-all flex items-center justify-between gap-1 ${
                          sel ? 'bg-primary text-white border-primary' : 'bg-bg-surface border-border text-text-secondary'}`}>
                        <span className="truncate">{eq}</span>
                        {sel && <span className="shrink-0">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <BottomNav onNext={() => setStep(4)} disabled={!data.workoutFrequency || !data.sessionDuration} />
        </div>
      )}

      {/* ── Step 4: Lifestyle ────────────────────────────────── */}
      {step === 4 && (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div>
            <h3 className="text-lg font-bold">Your <span className="text-primary">lifestyle.</span></h3>
            <p className="text-xs text-text-secondary">Aligns supplement & recovery recommendations.</p>
          </div>
          {/* Diet */}
          <div>
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">Diet Type</label>
            <div className="grid grid-cols-2 gap-2">
              {DIET_TYPES.map(({ key, icon, desc }) => {
                const sel = data.dietType === key;
                return (
                  <button key={key} onClick={() => set('dietType', key)}
                    className={`p-3 border rounded-xl text-left relative transition-all ${
                      sel ? 'bg-primary/10 border-primary' : 'bg-bg-surface border-border'}`}>
                    {sel && <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-white text-[8px]">✓</div>}
                    <div className="text-xl mb-1">{icon}</div>
                    <div className={`text-xs font-bold ${sel ? 'text-primary' : ''}`}>{key}</div>
                    <div className="text-[9px] text-text-muted">{desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
          {/* Current supplements */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1 block">
              Currently taking <span className="normal-case text-text-muted">(skip if none)</span>
            </label>
            <p className="text-[10px] text-text-muted mb-2">We'll build your personalised stack in the app.</p>
            <div className="grid grid-cols-2 gap-2 overflow-y-auto">
              {SUPPLEMENT_OPTIONS.map(s => {
                const sel = data.currentSupplements.includes(s);
                return (
                  <button key={s} onClick={() => toggleArr('currentSupplements', s)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      sel ? 'bg-primary text-white border-primary' : 'bg-bg-surface border-border text-text-secondary'}`}>
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
          <BottomNav onNext={() => setStep(5)} disabled={!data.dietType} />
        </div>
      )}

      {/* ── Step 5: Health ───────────────────────────────────── */}
      {step === 5 && (
        <div className="flex-1 flex flex-col gap-3 overflow-hidden">
          <div>
            <h3 className="text-lg font-bold">Careful <span className="text-primary">areas?</span></h3>
            <p className="text-xs text-text-secondary">Optional — we adjust your plan quietly.</p>
          </div>
          <div className="flex-1 overflow-y-auto space-y-4 -mx-1 px-1">
            {MEDICAL_CATEGORIES.map(({ label, icon, items }) => (
              <div key={label}>
                <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1">
                  <span>{icon}</span>{label}
                </p>
                <div className="space-y-2">
                  {items.map(({ key, desc }) => {
                    const active = data.medicalFlags.includes(key);
                    return (
                      <button key={key} onClick={() => toggleArr('medicalFlags', key)}
                        className={`w-full p-3 rounded-lg border text-left flex items-center justify-between gap-3 transition-all ${
                          active ? 'bg-amber-500/10 border-amber-500/50 text-amber-400' : 'bg-bg-surface border-border text-text-secondary'}`}>
                        <div>
                          <p className="text-xs font-semibold">{key}</p>
                          <p className="text-[9px] opacity-60">{desc}</p>
                        </div>
                        <div className={`shrink-0 w-9 h-5 rounded-full relative transition-all ${active ? 'bg-amber-500' : 'bg-border'}`}>
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${active ? 'left-4' : 'left-0.5'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-3 pt-3 border-t border-border">
            <button onClick={() => setStep(4)} className="px-4 py-3 border border-border rounded-xl text-text-secondary text-sm shrink-0">← Back</button>
            <button onClick={handleComplete} disabled={saving}
              className="flex-1 bg-primary py-3 rounded-xl text-white font-bold disabled:opacity-60">
              {saving ? 'Saving...' : 'Finish Setup ✓'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
