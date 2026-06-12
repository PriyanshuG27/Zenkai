import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuthStore } from '../stores/authStore';

const VALID_USER_TYPES = ['Comeback', 'Beginner', 'Consistent', 'Challenger'];
const VALID_GOALS = ['Fat Loss', 'Muscle Gain', 'Strength', 'Endurance', 'General Fitness'];
const VALID_DIET_TYPES = ['Non-veg', 'Eggetarian', 'Vegetarian', 'Vegan'];

const VALID_EQUIPMENT = [
  'Flat Bench', 'Incline Bench', 'Decline Bench', 'Chest Press Machine', 'Pec Deck', 'Dip Bars',
  'Pull-up Bar', 'Lat Pulldown', 'Seated Row', 'Assisted Pull-up Machine', 'Cable Machine',
  'Squat Rack', 'Leg Press', 'Hack Squat', 'Leg Extension', 'Leg Curl', 'Smith Machine',
  'Shoulder Press Machine', 'Preacher Curl Bench', 'EZ Bar',
  'Barbell', 'Dumbbells', 'Kettlebell', 'Trap Bar', 'Medicine Ball', 'Weight Plates',
  'Ab Wheel', 'Resistance Bands', 'TRX / Suspension', 'Battle Ropes', 'Parallettes', 'Gymnastic Rings', 'Power Rack',
  'Treadmill', 'Stationary Bike', 'Rowing Machine', 'Elliptical', 'Stair Climber', 'Jump Rope',
  'Foam Roller', 'Bodyweight / No Equipment'
];

export const useOnboarding = () => {
  const { uid, setProfile, profile } = useAuthStore();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(0);

  const syncProfile = async () => {
    if (!uid) return;
    try {
      const [snap, privateSnap] = await Promise.all([
        getDoc(doc(db, 'users', uid)),
        getDoc(doc(db, 'users', uid, 'private', 'profile'))
      ]);
      if (snap && typeof snap.exists === 'function' && snap.exists()) {
        const privateData = privateSnap.exists() ? privateSnap.data() : {};
        setProfile({ ...snap.data(), ...privateData });
      }
    } catch (err) {
      console.error('[Onboarding] Error syncing profile:', err);
    }
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [state, setState] = useState({
    userType: null,
    age: '',
    gender: null,
    heightCm: '',
    weightKg: '',
    goal: null,
    equipmentList: [],
    workoutFrequency: null,
    sessionDuration: null,
    dietType: null,
    currentSupplements: [],
    medicalFlags: [],
  });

  // Pre-populate state if user already has profile details (e.g. skipped onboarding previously)
  useEffect(() => {
    if (profile) {
      setState(s => ({
        userType: profile.userType ?? s.userType,
        age: profile.age !== null && profile.age !== undefined ? String(profile.age) : s.age,
        gender: profile.gender ?? s.gender,
        heightCm: profile.heightCm !== null && profile.heightCm !== undefined ? String(profile.heightCm) : s.heightCm,
        weightKg: profile.weightKg !== null && profile.weightKg !== undefined ? String(profile.weightKg) : s.weightKg,
        goal: profile.goal ?? s.goal,
        equipmentList: Array.isArray(profile.equipmentList) && profile.equipmentList.length > 0 ? profile.equipmentList : s.equipmentList,
        workoutFrequency: profile.workoutFrequency ?? s.workoutFrequency,
        sessionDuration: profile.sessionDuration ?? s.sessionDuration,
        dietType: profile.dietType ?? s.dietType,
        currentSupplements: Array.isArray(profile.currentSupplements) ? profile.currentSupplements : s.currentSupplements,
        medicalFlags: Array.isArray(profile.medicalFlags) ? profile.medicalFlags : s.medicalFlags,
      }));
    }
  }, [profile]);

  const updateState = (key, val) => {
    setState(s => ({ ...s, [key]: val }));
  };

  const setUserType = async (type) => {
    if (!VALID_USER_TYPES.includes(type)) return;
    updateState('userType', type);
    setError(null);
    if (!uid) return;

    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', uid), { userType: type });
      setCurrentStep(1);
    } catch (err) {
      console.error('[Onboarding] Error saving userType:', err);
      setError('Failed to save user type. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipment = (item) => {
    if (!VALID_EQUIPMENT.includes(item)) return;
    setState(s => {
      const list = s.equipmentList.includes(item)
        ? s.equipmentList.filter(x => x !== item)
        : [...s.equipmentList, item];
      return { ...s, equipmentList: list };
    });
  };

  const selectAllEquipment = () => {
    setState(s => ({ ...s, equipmentList: [...VALID_EQUIPMENT] }));
  };

  const toggleMedicalFlag = (flag) => {
    setState(s => {
      const list = s.medicalFlags.includes(flag)
        ? s.medicalFlags.filter(x => x !== flag)
        : [...s.medicalFlags, flag];
      return { ...s, medicalFlags: list };
    });
  };

  const toggleSupplement = (supplement) => {
    setState(s => {
      const list = s.currentSupplements.includes(supplement)
        ? s.currentSupplements.filter(x => x !== supplement)
        : [...s.currentSupplements, supplement];
      return { ...s, currentSupplements: list };
    });
  };

  // Helper validation for saving steps
  const validateStepData = (stepIndex) => {
    switch (stepIndex) {
      case 0:
        return state.userType && VALID_USER_TYPES.includes(state.userType);
      case 1:
        return state.gender && state.age && state.heightCm && state.weightKg;
      case 2:
        return state.goal && VALID_GOALS.includes(state.goal);
      case 3:
        return state.workoutFrequency && state.sessionDuration && state.equipmentList.length > 0;
      case 4:
        return state.dietType && VALID_DIET_TYPES.includes(state.dietType);
      default:
        return true;
    }
  };

  const advance = async () => {
    if (!uid) return;
    setError(null);

    if (!validateStepData(currentStep)) {
      setError('Please fill out all required fields for this step.');
      return;
    }

    setSaving(true);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const batch = writeBatch(db);
      const publicRef = doc(db, 'users', uid);
      const privateRef = doc(db, 'users', uid, 'private', 'profile');

      let hasPublic = false;
      let hasPrivate = false;
      let publicPayload = {};
      let privatePayload = {};

      if (currentStep === 0) {
        publicPayload = { userType: state.userType };
        hasPublic = true;
      } else if (currentStep === 1) {
        privatePayload = {
          gender: state.gender,
          age: Number(state.age),
          heightCm: Number(state.heightCm),
          weightKg: Number(state.weightKg),
        };
        hasPrivate = true;
      } else if (currentStep === 2) {
        privatePayload = { goal: state.goal };
        hasPrivate = true;
      } else if (currentStep === 3) {
        // Filter out any invalid equipment items before write
        const filteredEquipment = state.equipmentList.filter(item => VALID_EQUIPMENT.includes(item));
        privatePayload = {
          workoutFrequency: state.workoutFrequency,
          sessionDuration: state.sessionDuration,
          equipmentList: filteredEquipment,
        };
        hasPrivate = true;
      } else if (currentStep === 4) {
        privatePayload = {
          dietType: state.dietType,
          currentSupplements: state.currentSupplements,
        };
        hasPrivate = true;
      } else if (currentStep === 5) {
        privatePayload = {
          medicalFlags: state.medicalFlags,
        };
        publicPayload = {
          onboardingComplete: true,
          onboardingSkipped: false,
        };
        hasPublic = true;
        hasPrivate = true;
      }

      if (hasPublic) {
        batch.update(publicRef, publicPayload);
      }
      if (hasPrivate) {
        batch.update(privateRef, privatePayload);
      }
      await batch.commit();

      if (currentStep < 5) {
        setCurrentStep(s => s + 1);
      } else {
        navigate('/home', { replace: true });
      }
    } catch (err) {
      console.error(`[Onboarding] Error saving step ${currentStep}:`, err);
      setError('Failed to save data. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const skip = async () => {
    if (!uid) return;
    setError(null);
    setSaving(true);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const filteredEquipment = state.equipmentList.filter(item => VALID_EQUIPMENT.includes(item));
      const batch = writeBatch(db);

      batch.update(doc(db, 'users', uid), {
        userType: state.userType || 'Beginner',
        onboardingComplete: true,
        onboardingSkipped: true,
      });

      batch.update(doc(db, 'users', uid, 'private', 'profile'), {
        gender: state.gender || 'male',
        age: state.age ? Number(state.age) : 25,
        heightCm: state.heightCm ? Number(state.heightCm) : 175,
        weightKg: state.weightKg ? Number(state.weightKg) : 70,
        goal: state.goal || 'General Fitness',
        workoutFrequency: state.workoutFrequency || '3-4 days/week',
        sessionDuration: state.sessionDuration || '45-60 mins',
        equipmentList: filteredEquipment.length > 0 ? filteredEquipment : ['Dumbbells', 'Barbell', 'Pull-up Bar', 'Flat Bench'],
        dietType: state.dietType || 'Vegetarian',
        currentSupplements: state.currentSupplements,
        medicalFlags: state.medicalFlags,
      });

      await batch.commit();
      await syncProfile();
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('[Onboarding] Error in skip:', err);
      setError('Failed to skip onboarding. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const complete = async () => {
    if (!uid) return;
    setError(null);
    setSaving(true);
    try {
      const { writeBatch } = await import('firebase/firestore');
      const filteredEquipment = state.equipmentList.filter(item => VALID_EQUIPMENT.includes(item));
      const batch = writeBatch(db);

      batch.update(doc(db, 'users', uid), {
        userType: state.userType,
        onboardingComplete: true,
        onboardingSkipped: false,
      });

      batch.update(doc(db, 'users', uid, 'private', 'profile'), {
        gender: state.gender,
        age: Number(state.age),
        heightCm: Number(state.heightCm),
        weightKg: Number(state.weightKg),
        goal: state.goal,
        workoutFrequency: state.workoutFrequency,
        sessionDuration: state.sessionDuration,
        equipmentList: filteredEquipment,
        dietType: state.dietType,
        currentSupplements: state.currentSupplements,
        medicalFlags: state.medicalFlags,
      });

      await batch.commit();
      await syncProfile();
      navigate('/home', { replace: true });
    } catch (err) {
      console.error('[Onboarding] Error completing onboarding:', err);
      setError('Failed to save onboarding selections. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return {
    state,
    currentStep,
    setCurrentStep,
    saving,
    error,
    setError,
    updateState,
    setUserType,
    toggleEquipment,
    selectAllEquipment,
    toggleMedicalFlag,
    toggleSupplement,
    advance,
    skip,
    complete,
  };
};
