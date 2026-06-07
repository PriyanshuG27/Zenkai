import React from 'react';
import { OnboardingLayout } from './OnboardingLayout';
import { useOnboarding } from '../../hooks/useOnboarding';

// Lucide Icons
import {
  RefreshCw,
  Zap,
  TrendingUp,
  Trophy,
  Flame,
  Dumbbell,
  Award,
  Activity,
  HeartPulse,
  Egg,
  Leaf,
  Milk,
  ShieldAlert,
  Check,
  Scale,
  Heart
} from 'lucide-react';

const USER_TYPES = [
  { key: 'Comeback', desc: 'Returning after a break or injury', Icon: RefreshCw },
  { key: 'Beginner', desc: 'Just starting my fitness journey', Icon: Zap },
  { key: 'Consistent', desc: 'Training regularly, levelling up', Icon: TrendingUp },
  { key: 'Challenger', desc: 'Pushing for peak performance', Icon: Trophy },
];

const GOALS = [
  { key: 'Fat Loss', desc: 'Burn fat, preserve muscle', Icon: Flame },
  { key: 'Muscle Gain', desc: 'Build size & strength', Icon: Dumbbell },
  { key: 'Strength', desc: 'Lift heavier, low-rep', Icon: Award },
  { key: 'Endurance', desc: 'Cardio & functional fitness', Icon: Activity },
  { key: 'General Fitness', desc: 'Balanced health & wellness', Icon: HeartPulse },
];

const EQUIPMENT_CATEGORIES = [
  { label: 'Chest & Push', Icon: Dumbbell, items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Chest Press Machine', 'Pec Deck', 'Dip Bars'] },
  { label: 'Back & Pull', Icon: Activity, items: ['Pull-up Bar', 'Lat Pulldown', 'Seated Row', 'Assisted Pull-up Machine', 'Cable Machine'] },
  { label: 'Legs', Icon: Activity, items: ['Squat Rack', 'Leg Press', 'Hack Squat', 'Leg Extension', 'Leg Curl', 'Smith Machine'] },
  { label: 'Shoulders & Arms', Icon: Dumbbell, items: ['Shoulder Press Machine', 'Preacher Curl Bench', 'EZ Bar'] },
  { label: 'Free Weights', Icon: Dumbbell, items: ['Barbell', 'Dumbbells', 'Kettlebell', 'Trap Bar', 'Medicine Ball', 'Weight Plates'] },
  { label: 'Core & Functional', Icon: Activity, items: ['Ab Wheel', 'Resistance Bands', 'TRX / Suspension', 'Battle Ropes', 'Parallettes', 'Gymnastic Rings', 'Power Rack'] },
  { label: 'Cardio', Icon: Zap, items: ['Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Stair Climber', 'Jump Rope'] },
  { label: 'Recovery', Icon: Heart, items: ['Foam Roller'] },
];

const DIET_TYPES = [
  { key: 'Non-veg', desc: 'Meat, eggs & dairy', Icon: Flame },
  { key: 'Eggetarian', desc: 'Eggs & dairy, no meat', Icon: Egg },
  { key: 'Vegetarian', desc: 'Dairy ok, no eggs/meat', Icon: Milk },
  { key: 'Vegan', desc: 'No animal products', Icon: Leaf },
];

const SUPPLEMENT_OPTIONS = [
  'Whey Protein', 'Plant Protein', 'Creatine', 'Pre-Workout',
  'BCAA / EAA', 'Casein', 'Multivitamin', 'Omega-3',
  'Vitamin D', 'Ashwagandha', 'Mass Gainer', 'Fat Burner',
];

const MEDICAL_CATEGORIES = [
  {
    label: 'Upper Body', Icon: ShieldAlert,
    items: [
      { key: 'Shoulder Impingement', desc: 'Limits overhead pressing' },
      { key: 'Rotator Cuff Issue', desc: 'Avoid heavy shoulder loads' },
      { key: 'Wrist Pain', desc: 'Limits barbell grips' },
      { key: 'Elbow Tendinitis', desc: 'Affects curls & pressing' },
    ],
  },
  {
    label: 'Core & Back', Icon: ShieldAlert,
    items: [
      { key: 'Lower Back Issues', desc: 'Limits deadlifts & rows' },
      { key: 'Herniated Disc', desc: 'Avoid spinal loading' },
      { key: 'Hernia', desc: 'Avoid heavy compound lifts' },
    ],
  },
  {
    label: 'Lower Body', Icon: ShieldAlert,
    items: [
      { key: 'Bad Knees', desc: 'Limits squats & leg press' },
      { key: 'Hip Issues', desc: 'Affects hip hinge movements' },
      { key: 'Ankle Instability', desc: 'Affects balance exercises' },
    ],
  },
  {
    label: 'General Health', Icon: Heart,
    items: [
      { key: 'Post-Surgery', desc: 'Custom low-intensity plan' },
      { key: 'Varicocele', desc: 'Avoid prolonged pressure' },
      { key: 'High Blood Pressure', desc: 'Limits intense cardio' },
      { key: 'Asthma', desc: 'Affects cardio intensity' },
    ],
  },
];

export const OnboardingPage = () => {
  const {
    state,
    currentStep,
    setCurrentStep,
    saving,
    error,
    updateState,
    setUserType,
    toggleEquipment,
    selectAllEquipment,
    toggleMedicalFlag,
    toggleSupplement,
    advance,
    skip,
    complete
  } = useOnboarding();

  const handleSelectAllEquipment = (e) => {
    e.preventDefault();
    const allItems = EQUIPMENT_CATEGORIES.flatMap(cat => cat.items);
    const isAllSelected = allItems.every(item => state.equipmentList.includes(item));
    if (isAllSelected) {
      updateState('equipmentList', []);
    } else {
      updateState('equipmentList', allItems);
    }
  };

  // Helper validation checks for enabling Continue buttons
  const isStep1Valid = state.gender && state.age && state.heightCm && state.weightKg;
  const isStep3Valid = state.workoutFrequency && state.sessionDuration;

  return (
    <OnboardingLayout
      step={currentStep}
      totalSteps={6}
      onBack={() => setCurrentStep(s => s - 1)}
      onSkip={skip}
    >
      {error && <p className="text-center text-destructive text-sm mb-4 font-semibold">{error}</p>}

      {/* ── STEP 0: IDENTITY (User Type) ── */}
      {currentStep === 0 && (
        <div className="flex flex-col h-full justify-between">
          <div>
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2">
              WHAT BRINGS YOU HERE?
            </h1>
            <p className="text-sm text-text-secondary mb-6">
              Pick the profile that best describes your current training state.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {USER_TYPES.map(({ key, desc, Icon }) => {
                const isSelected = state.userType === key;
                return (
                  <button
                    key={key}
                    onClick={() => setUserType(key)}
                    disabled={saving}
                    style={{ minHeight: '84px' }}
                    className={`group p-4 border rounded-xl text-left flex items-start gap-4 transition-all duration-150 ease-out focus:outline-none disabled:opacity-60 ${
                      isSelected
                        ? 'bg-primary/5 border-primary border-l-[3px]'
                        : 'bg-bg-surface border-border hover:border-border-bright'
                    }`}
                  >
                    <div className={`p-2.5 rounded-lg shrink-0 transition-colors ${
                      isSelected ? 'bg-primary/20 text-primary' : 'bg-bg-base text-text-secondary group-hover:text-text-primary'
                    }`}>
                      <Icon size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold tracking-wide transition-colors ${isSelected ? 'text-primary' : 'text-text-primary'}`}>
                        {key.toUpperCase()}
                      </h4>
                      <p className="text-xs text-text-secondary mt-0.5 leading-tight truncate sm:normal-case sm:whitespace-normal">
                        {desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="h-20" /> {/* Spacer */}
        </div>
      )}

      {/* ── STEP 1: BODY DETAILS ── */}
      {currentStep === 1 && (
        <div className="flex flex-col h-full justify-between">
          <div>
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2">
              YOUR BODY, YOUR BASELINE.
            </h1>
            <p className="text-sm text-text-secondary mb-6">
              Used to personalize plan intensity, calorie targets, and volume metrics.
            </p>

            <div className="space-y-5">
              {/* Gender Selection */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                  Gender
                </label>
                <div className="flex gap-2">
                  {['Male', 'Female', 'Other'].map(g => {
                    const isSelected = state.gender === g;
                    return (
                      <button
                        key={g}
                        onClick={() => updateState('gender', g)}
                        style={{ minHeight: '44px' }}
                        className={`flex-1 py-2 rounded-xl font-bold text-sm transition-all focus:outline-none ${
                          isSelected
                            ? 'bg-primary text-white border border-primary shadow-[0_0_12px_var(--primary-glow)]'
                            : 'bg-bg-surface border border-border text-text-secondary hover:border-border-bright'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Age Input */}
              <div>
                <label htmlFor="onboarding-age" className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                  Age
                </label>
                <input
                  id="onboarding-age"
                  type="number"
                  min="13"
                  max="100"
                  placeholder="e.g. 25"
                  value={state.age}
                  style={{ minHeight: '44px' }}
                  onChange={e => updateState('age', e.target.value)}
                  className="w-full bg-bg-input border border-border rounded-xl px-4 py-2 text-text-primary focus:border-primary focus:outline-none transition duration-150 font-body placeholder:text-text-muted"
                />
              </div>

              {/* Height and Weight Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="onboarding-height" className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                    Height (cm)
                  </label>
                  <input
                    id="onboarding-height"
                    type="number"
                    min="100"
                    max="250"
                    placeholder="e.g. 175"
                    value={state.heightCm}
                    style={{ minHeight: '44px' }}
                    onChange={e => updateState('heightCm', e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-xl px-4 py-2 text-text-primary focus:border-primary focus:outline-none transition duration-150 font-body placeholder:text-text-muted"
                  />
                </div>
                <div>
                  <label htmlFor="onboarding-weight" className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                    Weight (kg)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="onboarding-weight"
                      type="number"
                      min="30"
                      max="300"
                      placeholder="e.g. 70"
                      value={state.weightKg}
                      style={{ minHeight: '44px' }}
                      onChange={e => updateState('weightKg', e.target.value)}
                      className="w-full bg-bg-input border border-border rounded-xl pl-4 pr-10 py-2 text-text-primary focus:border-primary focus:outline-none transition duration-150 font-body placeholder:text-text-muted"
                    />
                    <Scale size={16} className="absolute right-3.5 text-text-muted pointer-events-none" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={advance}
            disabled={!isStep1Valid || saving}
            style={{ minHeight: '44px' }}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_20px_var(--primary-glow)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none mt-8"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      )}

      {/* ── STEP 2: GOAL ── */}
      {currentStep === 2 && (
        <div className="flex flex-col h-full justify-between">
          <div>
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2">
              TRAINING GOAL?
            </h1>
            <p className="text-sm text-text-secondary mb-6">
              Shapes rep ranges, rest periods, plan density, and volume distributions.
            </p>

            <div className="space-y-3">
              {GOALS.map(({ key, desc, Icon }) => {
                const isSelected = state.goal === key;
                return (
                  <button
                    key={key}
                    onClick={() => updateState('goal', key)}
                    style={{ minHeight: '64px' }}
                    className={`group w-full p-3.5 border rounded-xl text-left flex items-center gap-4 transition-all duration-150 ease-out focus:outline-none ${
                      isSelected
                        ? 'bg-primary/5 border-primary border-l-[3px]'
                        : 'bg-bg-surface border-border hover:border-border-bright'
                    }`}
                  >
                    <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                      isSelected ? 'bg-primary/20 text-primary' : 'bg-bg-base text-text-secondary group-hover:text-text-primary'
                    }`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold tracking-wide transition-colors ${isSelected ? 'text-primary' : 'text-text-primary'}`}>
                        {key.toUpperCase()}
                      </h4>
                      <p className="text-xs text-text-secondary leading-tight truncate">
                        {desc}
                      </p>
                    </div>
                    {isSelected && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white shrink-0">
                        <Check size={12} strokeWidth={3} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={advance}
            disabled={!state.goal || saving}
            style={{ minHeight: '44px' }}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_20px_var(--primary-glow)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none mt-8"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      )}

      {/* ── STEP 3: GYM SETUP ── */}
      {currentStep === 3 && (
        <div className="flex flex-col h-full justify-between max-h-[75vh]">
          <div className="overflow-hidden flex flex-col flex-1">
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2 shrink-0">
              WHAT'S IN YOUR GYM?
            </h1>
            <p className="text-sm text-text-secondary mb-5 shrink-0">
              We only program workouts using gear you actually have access to.
            </p>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
              {/* Workout Frequency */}
              <div className="shrink-0">
                <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                  Weekly frequency
                </label>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6].map(n => {
                    const isSelected = state.workoutFrequency === n;
                    return (
                      <button
                        key={n}
                        onClick={() => updateState('workoutFrequency', n)}
                        style={{ minHeight: '44px' }}
                        className={`flex-1 rounded-xl font-bold text-sm transition-all focus:outline-none ${
                          isSelected
                            ? 'bg-primary text-white border border-primary shadow-[0_0_12px_var(--primary-glow)]'
                            : 'bg-bg-surface border border-border text-text-secondary hover:border-border-bright'
                        }`}
                      >
                        {n}x
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Session Duration */}
              <div className="shrink-0">
                <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2 block">
                  Session duration
                </label>
                <div className="flex gap-2">
                  {['45 min', '60 min', '90 min'].map(d => {
                    const isSelected = state.sessionDuration === d;
                    return (
                      <button
                        key={d}
                        onClick={() => updateState('sessionDuration', d)}
                        style={{ minHeight: '44px' }}
                        className={`flex-1 rounded-xl font-bold text-sm transition-all focus:outline-none ${
                          isSelected
                            ? 'bg-primary text-white border border-primary shadow-[0_0_12px_var(--primary-glow)]'
                            : 'bg-bg-surface border border-border text-text-secondary hover:border-border-bright'
                        }`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Equipment Grid Section */}
              <div className="pt-2">
                <div className="flex justify-between items-baseline mb-3 shrink-0">
                  <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted block">
                    Equipment List
                  </label>
                  <button
                    onClick={handleSelectAllEquipment}
                    className="text-xs text-primary font-bold hover:underline transition"
                  >
                    Select All
                  </button>
                </div>

                <div className="space-y-4">
                  {EQUIPMENT_CATEGORIES.map(({ label, Icon, items }) => (
                    <div key={label} className="space-y-2">
                      <h5 className="text-[10px] font-mono uppercase tracking-widest text-text-muted flex items-center gap-1.5 mb-1.5">
                        <Icon size={12} className="text-primary" />
                        {label}
                      </h5>
                      <div className="grid grid-cols-2 gap-2">
                        {items.map(eq => {
                          const isSelected = state.equipmentList.includes(eq);
                          return (
                            <button
                              key={eq}
                              onClick={() => toggleEquipment(eq)}
                              style={{ minHeight: '44px' }}
                              className={`px-3 py-2 rounded-xl text-left text-xs font-semibold border transition-all duration-150 flex items-center justify-between gap-2 focus:outline-none ${
                                isSelected
                                  ? 'bg-primary/10 border-primary text-primary'
                                  : 'bg-bg-surface border-border text-text-secondary hover:border-border-bright'
                              }`}
                            >
                              <span className="truncate">{eq}</span>
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                isSelected ? 'bg-primary text-white' : 'border border-border bg-bg-base'
                              }`}>
                                {isSelected && <Check size={10} strokeWidth={3} />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={advance}
            disabled={!isStep3Valid || saving}
            style={{ minHeight: '44px' }}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_20px_var(--primary-glow)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none mt-8 shrink-0"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      )}

      {/* ── STEP 4: LIFESTYLE (Diet & Supplements) ── */}
      {currentStep === 4 && (
        <div className="flex flex-col h-full justify-between max-h-[75vh]">
          <div className="overflow-hidden flex flex-col flex-1">
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2 shrink-0">
              YOUR LIFESTYLE.
            </h1>
            <p className="text-sm text-text-secondary mb-5 shrink-0">
              Helps customize dietary priorities, recovery goals, and supplement stacks.
            </p>

            <div className="space-y-5 overflow-y-auto flex-1 pr-1 -mr-1">
              {/* Diet Selection */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-2.5 block">
                  Diet Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {DIET_TYPES.map(({ key, desc, Icon }) => {
                    const isSelected = state.dietType === key;
                    return (
                      <button
                        key={key}
                        onClick={() => updateState('dietType', key)}
                        style={{ minHeight: '74px' }}
                        className={`group p-3 border rounded-xl text-left flex items-start gap-3 transition-all duration-150 focus:outline-none ${
                          isSelected
                            ? 'bg-primary/5 border-primary border-l-[3px]'
                            : 'bg-bg-surface border-border hover:border-border-bright'
                        }`}
                      >
                        <div className={`p-2 rounded-lg shrink-0 transition-colors ${
                          isSelected ? 'bg-primary/20 text-primary' : 'bg-bg-base text-text-secondary group-hover:text-text-primary'
                        }`}>
                          <Icon size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h5 className={`text-xs font-bold transition-colors ${isSelected ? 'text-primary' : 'text-text-primary'}`}>
                            {key}
                          </h5>
                          <p className="text-[10px] text-text-secondary mt-0.5 leading-tight truncate">
                            {desc}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Supplements Selection */}
              <div>
                <label className="text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1 block">
                  Supplements
                </label>
                <p className="text-xs text-text-muted mb-3 leading-tight">
                  Select items you currently take regularly. Skip if none.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {SUPPLEMENT_OPTIONS.map(s => {
                    const isSelected = state.currentSupplements.includes(s);
                    return (
                      <button
                        key={s}
                        onClick={() => toggleSupplement(s)}
                        style={{ minHeight: '44px' }}
                        className={`px-3.5 py-2 rounded-xl text-xs text-left font-semibold border transition-all duration-150 flex items-center justify-between gap-2 focus:outline-none ${
                          isSelected
                            ? 'bg-primary/10 border-primary text-primary font-bold'
                            : 'bg-bg-surface border-border text-text-secondary hover:border-border-bright'
                        }`}
                      >
                        <span>{s}</span>
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-primary text-white' : 'border border-border bg-bg-base'
                        }`}>
                          {isSelected && <Check size={10} strokeWidth={3} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <button
            onClick={advance}
            disabled={!state.dietType || saving}
            style={{ minHeight: '44px' }}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_20px_var(--primary-glow)] disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none mt-8 shrink-0"
          >
            {saving ? 'Saving...' : 'Continue'}
          </button>
        </div>
      )}

      {/* ── STEP 5: HEALTH (Medical restrictions) ── */}
      {currentStep === 5 && (
        <div className="flex flex-col h-full justify-between max-h-[75vh]">
          <div className="overflow-hidden flex flex-col flex-1">
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-text-primary mb-2 shrink-0">
              ANY RESTRICTIONS WE SHOULD KNOW?
            </h1>
            <p className="text-sm text-text-secondary mb-5 shrink-0 font-body">
              This keeps your AI plans safe. You can edit this anytime.
            </p>

            <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
              {MEDICAL_CATEGORIES.map(({ label, Icon, items }) => (
                <div key={label} className="space-y-2">
                  <h5 className="text-[10px] font-mono uppercase tracking-widest text-text-muted flex items-center gap-1.5 mb-1.5">
                    <Icon size={12} className="text-amber-500" />
                    {label}
                  </h5>
                  <div className="space-y-2">
                    {items.map(({ key, desc }) => {
                      const isActive = state.medicalFlags.includes(key);
                      return (
                        <button
                          key={key}
                          onClick={() => toggleMedicalFlag(key)}
                          style={{ minHeight: '52px' }}
                          className={`w-full px-4 py-2.5 rounded-xl border text-left flex items-center justify-between gap-4 transition-all duration-150 focus:outline-none ${
                            isActive
                              ? 'bg-amber-500/10 border-amber-500/50 text-amber-400'
                              : 'bg-bg-surface border-border text-text-secondary hover:border-border-bright'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold tracking-wide">{key}</p>
                            <p className="text-[10px] text-text-muted leading-tight mt-0.5 truncate">{desc}</p>
                          </div>
                          
                          {/* Custom CSS Toggle Switch */}
                          <div 
                            style={{ minWidth: '44px', minHeight: '44px' }} 
                            className="flex items-center justify-center shrink-0"
                          >
                            <div className={`w-9 h-5 rounded-full relative transition-colors duration-200 ${
                              isActive ? 'bg-amber-500' : 'bg-border'
                            }`}>
                              <div className={`absolute top-[2px] w-4 h-4 rounded-full bg-white shadow-md transition-all duration-200 ${
                                isActive ? 'left-[18px]' : 'left-[2px]'
                              }`} />
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-[10px] text-text-muted text-center mt-3 leading-tight shrink-0 font-body">
              🔒 Only affects exercise suggestions. Never shared.
            </p>
          </div>

          <button
            onClick={complete}
            disabled={saving}
            style={{ minHeight: '44px' }}
            className="w-full bg-primary text-white font-bold py-3 px-6 rounded-xl hover:brightness-110 active:brightness-95 transition-all shadow-[0_0_20px_var(--primary-glow)] disabled:opacity-40 disabled:cursor-not-allowed mt-6 shrink-0"
          >
            {saving ? 'Completing Setup...' : 'Finish Setup ✓'}
          </button>
        </div>
      )}
    </OnboardingLayout>
  );
};

export default OnboardingPage;
