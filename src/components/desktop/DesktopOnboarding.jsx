import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuthStore } from '../../stores/authStore';

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = ['Identity', 'Body', 'Goal', 'Gym', 'Lifestyle', 'Health'];

const USER_TYPES = [
  { key: 'Comeback',   desc: 'Returning after a break or injury', icon: '🔄' },
  { key: 'Beginner',   desc: 'Just starting my fitness journey',  icon: '🌱' },
  { key: 'Consistent', desc: 'Training regularly, want to level up', icon: '⚡' },
  { key: 'Challenger', desc: 'Pushing for peak performance',      icon: '🏆' },
];

const GOALS = [
  { key: 'Fat Loss',       icon: '🔥', desc: 'Burn fat, preserve muscle' },
  { key: 'Muscle Gain',    icon: '💪', desc: 'Build size with progressive overload' },
  { key: 'Strength',       icon: '🏋️', desc: 'Lift heavier, low-rep power' },
  { key: 'Endurance',      icon: '🏃', desc: 'Cardio base, functional fitness' },
  { key: 'General Fitness',icon: '⚖️', desc: 'Balanced health & wellness' },
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
  { key: 'Non-veg',     icon: '🥩', desc: 'Eat meat, eggs & dairy' },
  { key: 'Eggetarian',  icon: '🥚', desc: 'Eggs & dairy, no meat' },
  { key: 'Vegetarian',  icon: '🥛', desc: 'Dairy ok, no eggs or meat' },
  { key: 'Vegan',       icon: '🌱', desc: 'No animal products' },
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

// ─── Shared sub-components ────────────────────────────────────────────────────
const StepHeader = ({ title, highlight, sub }) => (
  <div className="mb-6">
    <h3 className="text-2xl font-bold mb-1">
      {title} {highlight && <span className="text-primary">{highlight}</span>}
    </h3>
    {sub && <p className="text-text-secondary text-sm">{sub}</p>}
  </div>
);

const NavButtons = ({ onBack, onNext, nextLabel = 'Next Step →', disabled = false, step }) => (
  <div className="pt-5 flex justify-between border-t border-border mt-6">
    {step > 0
      ? <button onClick={onBack} className="text-text-secondary py-2 hover:text-text-primary transition">← Back</button>
      : <div />
    }
    <button
      onClick={onNext}
      disabled={disabled}
      className="bg-primary px-8 py-2.5 rounded-lg text-white font-semibold hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {nextLabel}
    </button>
  </div>
);

// ─── DesktopOnboarding ────────────────────────────────────────────────────────
export const DesktopOnboarding = () => {
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

  return (
    <div className="min-h-screen bg-bg-base text-text-primary flex flex-col justify-center items-center p-8">
      <div className="w-full max-w-4xl space-y-6">

        {/* Header + progress */}
        <div className="text-center">
          <h2 className="font-display text-4xl font-extrabold uppercase tracking-widest mb-4">
            FIT<span className="text-primary">DESI</span> Setup
          </h2>
          <div className="flex items-center justify-center gap-2">
            {STEPS.map((s, i) => (
              <React.Fragment key={s}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${
                    i === step ? 'border-primary bg-primary text-white shadow-[0_0_12px_rgba(255,92,0,0.5)]'
                    : i < step  ? 'border-primary/50 bg-primary/20 text-primary'
                                : 'border-border bg-bg-surface text-text-muted'
                  }`}>
                    {i < step ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] font-mono uppercase tracking-wider ${i === step ? 'text-primary' : 'text-text-muted'}`}>{s}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`h-px w-10 mb-4 transition-all ${i < step ? 'bg-primary/40' : 'bg-border'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {error && <p className="text-center text-destructive text-sm">{error}</p>}

        <div className="bg-bg-surface p-8 rounded-2xl border border-border shadow-2xl">

          {/* ── Step 0: Identity ──────────────────────────────── */}
          {step === 0 && (
            <div>
              <StepHeader title="Who are you?" highlight="Pick your level." sub="This shapes your workout intensity and comeback strategy." />
              <div className="grid grid-cols-2 gap-4">
                {USER_TYPES.map(({ key, desc, icon }) => (
                  <button key={key} onClick={() => set('userType', key)}
                    className={`p-6 border rounded-xl text-left relative transition-all ${
                      data.userType === key
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(255,92,0,0.15)]'
                        : 'bg-bg-elevated border-border hover:border-primary/50'}`}>
                    {data.userType === key && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[10px] font-bold">✓</div>
                    )}
                    <div className="text-3xl mb-2">{icon}</div>
                    <div className={`text-lg font-bold mb-1 ${data.userType === key ? 'text-primary' : ''}`}>{key}</div>
                    <div className="text-sm text-text-secondary">{desc}</div>
                  </button>
                ))}
              </div>
              <NavButtons step={step} onNext={() => setStep(1)} disabled={!data.userType} />
            </div>
          )}

          {/* ── Step 1: Body ──────────────────────────────────── */}
          {step === 1 && (
            <div>
              <StepHeader title="Your body," highlight="your baseline." sub="Used to personalise plan intensity and nutrition targets." />
              <div className="grid grid-cols-2 gap-6">
                {/* Gender */}
                <div className="col-span-2">
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Gender</label>
                  <div className="flex gap-3">
                    {['Male', 'Female', 'Other'].map(g => (
                      <button key={g} onClick={() => set('gender', g)}
                        className={`flex-1 py-3 border rounded-xl font-semibold transition-all ${
                          data.gender === g ? 'bg-primary/10 border-primary text-primary' : 'bg-bg-elevated border-border hover:border-primary/40'}`}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Age */}
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Age</label>
                  <input type="number" min="13" max="70" placeholder="e.g. 22"
                    value={data.age} onChange={e => set('age', e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none transition" />
                </div>
                {/* Height */}
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Height (cm)</label>
                  <input type="number" min="140" max="220" placeholder="e.g. 175"
                    value={data.heightCm} onChange={e => set('heightCm', e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none transition" />
                </div>
                {/* Weight */}
                <div className="col-span-2">
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Current Weight (kg)</label>
                  <input type="number" min="30" max="200" placeholder="e.g. 72"
                    value={data.weightKg} onChange={e => set('weightKg', e.target.value)}
                    className="w-full bg-bg-elevated border border-border rounded-xl px-4 py-3 text-text-primary focus:border-primary focus:outline-none transition" />
                </div>
              </div>
              <NavButtons step={step} onBack={() => setStep(0)} onNext={() => setStep(2)}
                disabled={!data.gender || !data.age || !data.heightCm || !data.weightKg} />
            </div>
          )}

          {/* ── Step 2: Goal ──────────────────────────────────── */}
          {step === 2 && (
            <div>
              <StepHeader title="What are we" highlight="training for?" sub="Your primary goal shapes every workout, rep range and rest period." />
              <div className="grid grid-cols-3 gap-4 mb-2">
                {GOALS.map(({ key, icon, desc }) => (
                  <button key={key} onClick={() => set('goal', key)}
                    className={`p-5 border rounded-xl text-left relative transition-all ${
                      data.goal === key
                        ? 'bg-primary/10 border-primary shadow-[0_0_20px_rgba(255,92,0,0.15)]'
                        : 'bg-bg-elevated border-border hover:border-primary/50'}`}>
                    {data.goal === key && (
                      <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-[10px]">✓</div>
                    )}
                    <div className="text-3xl mb-2">{icon}</div>
                    <div className={`text-base font-bold mb-1 ${data.goal === key ? 'text-primary' : ''}`}>{key}</div>
                    <div className="text-xs text-text-secondary">{desc}</div>
                  </button>
                ))}
              </div>
              <NavButtons step={step} onBack={() => setStep(1)} onNext={() => setStep(3)} disabled={!data.goal} />
            </div>
          )}

          {/* ── Step 3: Gym ───────────────────────────────────── */}
          {step === 3 && (
            <div>
              <StepHeader title="What's in" highlight="your gym?" sub="We only program exercises you can actually do." />

              {/* Frequency + Duration */}
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Days per week</label>
                  <div className="flex gap-2">
                    {[2, 3, 4, 5, 6].map(n => (
                      <button key={n} onClick={() => set('workoutFrequency', n)}
                        className={`flex-1 py-2.5 border rounded-lg font-bold text-sm transition-all ${
                          data.workoutFrequency === n ? 'bg-primary border-primary text-white' : 'bg-bg-elevated border-border hover:border-primary/40'}`}>
                        {n}x
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-2 block">Session duration</label>
                  <div className="flex gap-2">
                    {['45 min', '60 min', '90 min'].map(d => (
                      <button key={d} onClick={() => set('sessionDuration', d)}
                        className={`flex-1 py-2.5 border rounded-lg font-semibold text-xs transition-all ${
                          data.sessionDuration === d ? 'bg-primary border-primary text-white' : 'bg-bg-elevated border-border hover:border-primary/40'}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equipment */}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-text-secondary">Select all available equipment</p>
                <span className="font-mono text-sm text-primary font-bold">{data.equipmentList.length} selected</span>
              </div>
              <div className="max-h-[38vh] overflow-y-auto space-y-4 pr-1">
                {EQUIPMENT_CATEGORIES.map(({ label, icon, items }) => (
                  <div key={label}>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5">
                      <span>{icon}</span>{label}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {items.map(eq => {
                        const sel = data.equipmentList.includes(eq);
                        return (
                          <button key={eq} onClick={() => toggleArr('equipmentList', eq)}
                            className={`px-3 py-2.5 rounded-lg text-xs font-medium border transition-all flex items-center justify-between gap-1 ${
                              sel ? 'bg-primary text-white border-primary' : 'bg-bg-base border-border text-text-secondary hover:border-primary/40'}`}>
                            <span className="truncate">{eq}</span>
                            {sel && <span className="shrink-0">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <NavButtons step={step} onBack={() => setStep(2)} onNext={() => setStep(4)}
                disabled={!data.workoutFrequency || !data.sessionDuration} />
            </div>
          )}

          {/* ── Step 4: Lifestyle ─────────────────────────────── */}
          {step === 4 && (
            <div>
              <StepHeader title="Your lifestyle," highlight="your fuel." sub="Helps us align supplement suggestions and recovery recommendations." />

              {/* Diet type */}
              <div className="mb-6">
                <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-3 block">Diet Type</label>
                <div className="grid grid-cols-4 gap-3">
                  {DIET_TYPES.map(({ key, icon, desc }) => (
                    <button key={key} onClick={() => set('dietType', key)}
                      className={`p-4 border rounded-xl text-center transition-all relative ${
                        data.dietType === key ? 'bg-primary/10 border-primary' : 'bg-bg-elevated border-border hover:border-primary/40'}`}>
                      {data.dietType === key && (
                        <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center text-white text-[9px]">✓</div>
                      )}
                      <div className="text-2xl mb-1">{icon}</div>
                      <div className={`text-sm font-bold ${data.dietType === key ? 'text-primary' : ''}`}>{key}</div>
                      <div className="text-[10px] text-text-muted mt-0.5 leading-tight">{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Current supplements */}
              <div>
                <label className="text-xs font-mono uppercase tracking-widest text-text-muted mb-1 block">
                  Supplements you currently take <span className="normal-case text-text-muted">(skip if none)</span>
                </label>
                <p className="text-xs text-text-muted mb-3">We'll factor these into your personalised stack later.</p>
                <div className="grid grid-cols-4 gap-2">
                  {SUPPLEMENT_OPTIONS.map(s => {
                    const sel = data.currentSupplements.includes(s);
                    return (
                      <button key={s} onClick={() => toggleArr('currentSupplements', s)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          sel ? 'bg-primary text-white border-primary' : 'bg-bg-base border-border text-text-secondary hover:border-primary/40'}`}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              <NavButtons step={step} onBack={() => setStep(3)} onNext={() => setStep(5)} disabled={!data.dietType} />
            </div>
          )}

          {/* ── Step 5: Health ────────────────────────────────── */}
          {step === 5 && (
            <div>
              <StepHeader title="Any areas to" highlight="be careful about?" sub="Optional — we quietly adjust your plan around these. No exercises that stress flagged areas." />
              <div className="space-y-5 max-h-[50vh] overflow-y-auto pr-2">
                {MEDICAL_CATEGORIES.map(({ label, icon, items }) => (
                  <div key={label}>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 flex items-center gap-1.5">
                      <span>{icon}</span>{label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map(({ key, desc }) => {
                        const active = data.medicalFlags.includes(key);
                        return (
                          <button key={key} onClick={() => toggleArr('medicalFlags', key)}
                            className={`p-3 rounded-lg border text-left transition-all flex items-center justify-between gap-3 ${
                              active ? 'bg-amber-500/10 border-amber-500/60 text-amber-400' : 'bg-bg-base border-border text-text-secondary hover:border-border-hover'}`}>
                            <div>
                              <p className="text-sm font-semibold">{key}</p>
                              <p className="text-xs opacity-60 mt-0.5">{desc}</p>
                            </div>
                            <div className={`shrink-0 w-10 h-5 rounded-full relative transition-all ${active ? 'bg-amber-500' : 'bg-border'}`}>
                              <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${active ? 'left-5' : 'left-0.5'}`} />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-5 flex items-center justify-between border-t border-border mt-6">
                <button onClick={() => setStep(4)} className="text-text-secondary py-2 hover:text-text-primary transition">← Back</button>
                <div className="flex items-center gap-4">
                  {data.medicalFlags.length > 0 && (
                    <span className="text-xs text-amber-400 font-mono">{data.medicalFlags.length} flagged</span>
                  )}
                  <button onClick={handleComplete} disabled={saving}
                    className="bg-primary px-8 py-2.5 rounded-lg text-white font-bold hover:brightness-110 transition disabled:opacity-60">
                    {saving ? 'Saving...' : 'Complete Setup ✓'}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
