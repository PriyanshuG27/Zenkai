export const EQUIPMENT_CATEGORIES = [
  { label: 'Chest & Push', items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Chest Press Machine', 'Pec Deck', 'Dip Bars'] },
  { label: 'Back & Pull', items: ['Pull-up Bar', 'Lat Pulldown', 'Seated Row', 'Assisted Pull-up Machine', 'Cable Machine'] },
  { label: 'Legs', items: ['Squat Rack', 'Leg Press', 'Hack Squat', 'Leg Extension', 'Leg Curl', 'Smith Machine'] },
  { label: 'Shoulders & Arms', items: ['Shoulder Press Machine', 'Preacher Curl Bench', 'EZ Bar'] },
  { label: 'Free Weights', items: ['Barbell', 'Dumbbells', 'Kettlebell', 'Trap Bar', 'Medicine Ball', 'Weight Plates'] },
  { label: 'Core & Functional', items: ['Ab Wheel', 'Resistance Bands', 'TRX / Suspension', 'Battle Ropes', 'Parallettes', 'Gymnastic Rings', 'Power Rack'] },
  { label: 'Cardio', items: ['Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Stair Climber', 'Jump Rope'] },
  { label: 'Recovery', items: ['Foam Roller'] },
];

export const MEDICAL_CATEGORIES = [
  {
    label: 'Upper Body',
    items: [
      { key: 'Shoulder Impingement', desc: 'Limits overhead pressing' },
      { key: 'Rotator Cuff Issue', desc: 'Avoid heavy shoulder loads' },
      { key: 'Wrist Pain', desc: 'Limits barbell grips' },
      { key: 'Elbow Tendinitis', desc: 'Affects curls & pressing' },
    ],
  },
  {
    label: 'Core & Back',
    items: [
      { key: 'Lower Back Issues', desc: 'Limits deadlifts & rows' },
      { key: 'Herniated Disc', desc: 'Avoid spinal loading' },
      { key: 'Hernia', desc: 'Avoid heavy compound lifts' },
    ],
  },
  {
    label: 'Lower Body',
    items: [
      { key: 'Bad Knees', desc: 'Limits squats & leg press' },
      { key: 'Hip Issues', desc: 'Affects hip hinge movements' },
      { key: 'Ankle Instability', desc: 'Affects balance exercises' },
    ],
  },
  {
    label: 'General Health',
    items: [
      { key: 'Post-Surgery', desc: 'Custom low-intensity plan' },
      { key: 'Varicocele', desc: 'Avoid prolonged pressure' },
      { key: 'High Blood Pressure', desc: 'Limits intense cardio' },
      { key: 'Asthma', desc: 'Affects cardio intensity' },
    ],
  },
];
