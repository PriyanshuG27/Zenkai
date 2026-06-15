import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// Import mocks from the Firebase mocking infrastructure
import {
  mockUpdateDoc,
  mockSetDoc,
  mockAddDoc,
  mockDoc,
  mockAuth,
  mockGetDoc
} from '../__mocks__/firebase';

// Mock useNavigate from react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Import modules under test
import { useOnboarding } from '../hooks/useOnboarding';
import { useAuthStore } from '../stores/authStore';
import { writeSession, updateUserProfile } from '../lib/firestoreUtils';
import { writeBatch } from 'firebase/firestore';

// Mock writeBatch and its returned object
const pendingBatchOps = [];
const mockSet = vi.fn((docRef, data, options) => {
  pendingBatchOps.push(Promise.resolve(mockSetDoc(docRef, data, options)));
});
const mockUpdate = vi.fn((docRef, data) => {
  pendingBatchOps.push(Promise.resolve(mockUpdateDoc(docRef, data)));
});
const mockCommit = vi.fn(async () => {
  const ops = [...pendingBatchOps];
  pendingBatchOps.length = 0;
  await Promise.all(ops);
});
vi.mocked(writeBatch).mockReturnValue({
  set: mockSet,
  update: mockUpdate,
  commit: mockCommit,
});

// Helper wrapper to provide Router context to hooks
const wrapper = ({ children }) => <MemoryRouter>{children}</MemoryRouter>;

describe('useOnboarding Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingBatchOps.length = 0;
    useAuthStore.setState({ uid: 'test-user-123', loading: false });
  });

  // 1. useOnboarding — setUserType()
  describe('setUserType()', () => {
    it('updates userType in local state, calls setDoc, and does not advance step on failure', async () => {
      // Simulate firestore write failure
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.state.userType).toBeNull();
      expect(result.current.currentStep).toBe(0);

      await act(async () => {
        await result.current.setUserType('Comeback');
      });

      // State is updated locally
      expect(result.current.state.userType).toBe('Comeback');
      // setDoc was called with the correct payload
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockSetDoc).toHaveBeenCalledWith(
        expect.objectContaining({ _path: 'users/test-user-123' }),
        { userType: 'Comeback' },
        { merge: true }
      );
      // Step did NOT advance due to write failure
      expect(result.current.currentStep).toBe(0);
      expect(result.current.error).toBe('Failed to save user type. Please try again.');

      // Clear error and mock success for next write
      act(() => {
        result.current.setError(null);
      });
      mockSetDoc.mockResolvedValueOnce(undefined);

      await act(async () => {
        await result.current.setUserType('Consistent');
      });

      // Step successfully advanced
      expect(result.current.state.userType).toBe('Consistent');
      expect(result.current.currentStep).toBe(1);
      expect(result.current.error).toBeNull();
    });
  });

  // 2. useOnboarding — toggleEquipment()
  describe('toggleEquipment()', () => {
    it('toggles items in equipmentList and ignores invalid ones', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.state.equipmentList).toEqual([]);

      // Toggle item on (add)
      act(() => {
        result.current.toggleEquipment('Barbell');
      });
      expect(result.current.state.equipmentList).toEqual(['Barbell']);

      // Toggle item off (remove)
      act(() => {
        result.current.toggleEquipment('Barbell');
      });
      expect(result.current.state.equipmentList).toEqual([]);

      // Ignore invalid equipment IDs (not in valid enum)
      act(() => {
        result.current.toggleEquipment('InvalidGear');
      });
      expect(result.current.state.equipmentList).toEqual([]);
    });
  });

  // 3. useOnboarding — skip()
  describe('skip()', () => {
    it('calls setDoc with onboardingComplete: true, navigates to /home, and saves partial state', async () => {
      mockSetDoc.mockResolvedValue(undefined);

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      // Partially fill state
      act(() => {
        result.current.updateState('userType', 'Beginner');
        result.current.updateState('goal', 'Muscle Gain');
      });

      await act(async () => {
        await result.current.skip();
      });

      expect(mockSetDoc).toHaveBeenCalledTimes(2);

      // Verify public document update
      const publicUpdateCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/test-user-123');
      expect(publicUpdateCall).toBeDefined();
      expect(publicUpdateCall[1]).toEqual(
        expect.objectContaining({
          userType: 'Beginner',
          onboardingComplete: true,
          onboardingSkipped: true
        })
      );

      // Verify private document update
      const privateUpdateCall = mockSetDoc.mock.calls.find(call => call[0]._path === 'users/test-user-123/private/profile');
      expect(privateUpdateCall).toBeDefined();
      expect(privateUpdateCall[1]).toEqual(
        expect.objectContaining({
          goal: 'Muscle Gain'
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
    });
  });

  describe('toggleMedicalFlag()', () => {
    it('toggles items in medicalFlags', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });
      expect(result.current.state.medicalFlags).toEqual([]);

      act(() => {
        result.current.toggleMedicalFlag('bad_knees');
      });
      expect(result.current.state.medicalFlags).toEqual(['bad_knees']);

      act(() => {
        result.current.toggleMedicalFlag('bad_knees');
      });
      expect(result.current.state.medicalFlags).toEqual([]);
    });
  });

  describe('toggleSupplement()', () => {
    it('toggles items in currentSupplements', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });
      expect(result.current.state.currentSupplements).toEqual([]);

      act(() => {
        result.current.toggleSupplement('Creatine');
      });
      expect(result.current.state.currentSupplements).toEqual(['Creatine']);

      act(() => {
        result.current.toggleSupplement('Creatine');
      });
      expect(result.current.state.currentSupplements).toEqual([]);
    });
  });

  describe('selectAllEquipment()', () => {
    it('adds all valid equipment to equipmentList', () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });
      expect(result.current.state.equipmentList).toEqual([]);

      act(() => {
        result.current.selectAllEquipment();
      });
      expect(result.current.state.equipmentList.length).toBeGreaterThan(10);
    });
  });

  describe('advance()', () => {
    it('fails to advance if step validation fails', async () => {
      const { result } = renderHook(() => useOnboarding(), { wrapper });
      expect(result.current.currentStep).toBe(0);

      await act(async () => {
        await result.current.advance();
      });

      expect(result.current.currentStep).toBe(0);
      expect(result.current.error).toBe('Please fill out all required fields for this step.');
    });

    it('fails to advance step 3 if equipmentList is empty', async () => {
      mockSetDoc.mockResolvedValue(undefined);
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      // Step 0: UserType
      act(() => { result.current.updateState('userType', 'Beginner'); });
      await act(async () => { await result.current.advance(); });

      // Step 1: Body info
      act(() => {
        result.current.updateState('gender', 'Male');
        result.current.updateState('age', '25');
        result.current.updateState('heightCm', '175');
        result.current.updateState('weightKg', '70');
      });
      await act(async () => { await result.current.advance(); });

      // Step 2: Goal
      act(() => { result.current.updateState('goal', 'Strength'); });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(3);

      // Step 3: Gym Frequency, Duration but EMPTY equipment
      act(() => {
        result.current.updateState('workoutFrequency', '3');
        result.current.updateState('sessionDuration', '60 min');
        result.current.updateState('equipmentList', []);
      });
      await act(async () => { await result.current.advance(); });

      // Fails to advance because equipmentList is empty
      expect(result.current.currentStep).toBe(3);
      expect(result.current.error).toBe('Please fill out all required fields for this step.');

      // Toggle equipment on
      act(() => { result.current.toggleEquipment('Barbell'); });
      await act(async () => { await result.current.advance(); });

      // Successfully advanced to Step 4
      expect(result.current.currentStep).toBe(4);
    });

    it('advances steps sequentially when data is valid', async () => {
      mockSetDoc.mockResolvedValue(undefined);
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.updateState('userType', 'Beginner');
      });
      await act(async () => {
        await result.current.advance();
      });
      expect(result.current.currentStep).toBe(1);

      act(() => {
        result.current.updateState('gender', 'Male');
        result.current.updateState('age', '25');
        result.current.updateState('heightCm', '175');
        result.current.updateState('weightKg', '70');
      });
      await act(async () => {
        await result.current.advance();
      });
      expect(result.current.currentStep).toBe(2);
    });
  });

  describe('complete()', () => {
    it('saves all selections on complete and navigates home', async () => {
      mockSetDoc.mockResolvedValueOnce(undefined);
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => {
        result.current.updateState('userType', 'Beginner');
        result.current.updateState('age', '25');
        result.current.updateState('gender', 'Male');
        result.current.updateState('heightCm', '175');
        result.current.updateState('weightKg', '70');
        result.current.updateState('goal', 'Muscle Gain');
        result.current.updateState('workoutFrequency', '3-4');
        result.current.updateState('sessionDuration', '45');
        result.current.updateState('dietType', 'Vegetarian');
      });

      await act(async () => {
        await result.current.complete();
      });

      expect(mockSetDoc).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
    });

    it('sets error when complete() fails', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await act(async () => {
        await result.current.complete();
      });

      expect(result.current.error).toBe('Failed to save onboarding selections. Please try again.');
    });
  });

  describe('skip() error path', () => {
    it('sets error when skip() fails', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      await act(async () => {
        await result.current.skip();
      });

      expect(result.current.error).toBe('Failed to skip onboarding. Please try again.');
    });
  });

  describe('advance() comprehensive sequential steps and error handling', () => {
    it('advances all steps from 0 to 5 and then navigates to home', async () => {
      mockSetDoc.mockResolvedValue(undefined);
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      // Step 0: UserType
      expect(result.current.currentStep).toBe(0);
      act(() => { result.current.updateState('userType', 'Comeback'); });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(1);

      // Step 1: Body info
      act(() => {
        result.current.updateState('gender', 'Female');
        result.current.updateState('age', '30');
        result.current.updateState('heightCm', '165');
        result.current.updateState('weightKg', '60');
      });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(2);

      // Step 2: Goal
      act(() => { result.current.updateState('goal', 'Fat Loss'); });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(3);

      // Step 3: Gym Frequency, Duration & Equipment
      act(() => {
        result.current.updateState('workoutFrequency', '2-3');
        result.current.updateState('sessionDuration', '60');
        result.current.toggleEquipment('Barbell');
      });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(4);

      // Step 4: Diet
      act(() => { result.current.updateState('dietType', 'Vegan'); });
      await act(async () => { await result.current.advance(); });
      expect(result.current.currentStep).toBe(5);

      // Step 5: Medical Flags (final step)
      act(() => { result.current.updateState('medicalFlags', ['bad_knees']); });
      await act(async () => { await result.current.advance(); });

      // Navigated to /home
      expect(mockNavigate).toHaveBeenCalledWith('/home', { replace: true });
    });

    it('sets error when setDoc fails during advance()', async () => {
      mockSetDoc.mockRejectedValueOnce(new Error('Firestore write failed'));
      const { result } = renderHook(() => useOnboarding(), { wrapper });

      act(() => { result.current.updateState('userType', 'Comeback'); });
      await act(async () => {
        await result.current.advance();
      });

      expect(result.current.currentStep).toBe(0);
    });
  });

  describe('profile sync and pre-population', () => {
    it('pre-populates hook state from authStore profile', () => {
      const mockProfile = {
        userType: 'Beginner',
        age: 30,
        gender: 'Male',
        heightCm: 180,
        weightKg: 85,
        goal: 'Muscle Gain',
        workoutFrequency: '3-4 days/week',
        sessionDuration: '45-60 mins',
        equipmentList: ['Dumbbells', 'Barbell'],
        dietType: 'Non-veg',
        currentSupplements: ['Creatine'],
        medicalFlags: ['none']
      };
      useAuthStore.setState({ profile: mockProfile });

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      expect(result.current.state.userType).toBe('Beginner');
      expect(result.current.state.age).toBe('30');
      expect(result.current.state.gender).toBe('Male');
      expect(result.current.state.heightCm).toBe('180');
      expect(result.current.state.weightKg).toBe('85');
      expect(result.current.state.goal).toBe('Muscle Gain');
      expect(result.current.state.workoutFrequency).toBe('3-4 days/week');
      expect(result.current.state.sessionDuration).toBe('45-60 mins');
      expect(result.current.state.equipmentList).toEqual(['Dumbbells', 'Barbell']);
      expect(result.current.state.dietType).toBe('Non-veg');
      expect(result.current.state.currentSupplements).toEqual(['Creatine']);
      expect(result.current.state.medicalFlags).toEqual(['none']);

      // reset authStore profile to avoid affecting other tests
      useAuthStore.setState({ profile: null });
    });

    it('syncProfile calls getDoc, merges and updates authStore profile', async () => {
      useAuthStore.setState({ uid: 'user-id-456' });

      // Mock user document exists and has basic data
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ name: 'John Doe', userType: 'Beginner' })
      });
      // Mock private profile document exists and has private data
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ weightKg: 80, goal: 'Strength' })
      });

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      // Trigger syncProfile by calling skip() (which calls syncProfile internally)
      mockSetDoc.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.skip();
      });

      expect(mockGetDoc).toHaveBeenCalledTimes(2);
      expect(useAuthStore.getState().profile).toEqual({
        name: 'John Doe',
        userType: 'Beginner',
        weightKg: 80,
        goal: 'Strength'
      });
    });

    it('syncProfile handles getDoc exceptions gracefully', async () => {
      useAuthStore.setState({ uid: 'user-id-456' });
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockGetDoc.mockRejectedValueOnce(new Error('Firestore error'));

      const { result } = renderHook(() => useOnboarding(), { wrapper });

      mockSetDoc.mockResolvedValue(undefined);
      await act(async () => {
        await result.current.skip();
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Onboarding] Error syncing profile:',
        expect.any(Error)
      );
      consoleErrorSpy.mockRestore();
    });
  });
});

describe('firestoreUtils Writes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 4. firestoreUtils — writeSession()
  describe('writeSession()', () => {
    it('rejects negative weight values', async () => {
      const sessionData = { sessionId: 's1', totalVolume: 100, xpEarned: 10 };
      const exercises = [{
        exerciseId: 'ex1',
        name: 'Bench Press',
        sets: [{ weight: -5, reps: 10 }]
      }];

      await expect(writeSession('uid-123', sessionData, exercises)).rejects.toThrow(
        'Validation Error: Weight must be greater than 0'
      );
    });

    it('strips HTML tags from exercise names, uses batch write, and commits exactly once', async () => {
      const sessionData = { sessionId: 'session-789', totalVolume: 1200, xpEarned: 50 };
      const exercises = [
        {
          exerciseId: 'ex-1',
          name: '<h3>Deadlift</h3> & Squat',
          sets: [{ weight: 120, reps: 5, done: true }]
        }
      ];

      await writeSession('uid-123', sessionData, exercises);

      // Uses batch write (mockSet called for session document + exercise document)
      expect(mockSet).toHaveBeenCalledTimes(2);
      
      const exercisePayload = mockSet.mock.calls[1][1];
      // HTML and script characters (<, >, &, ", ') stripped
      expect(exercisePayload.name).toBe('h3Deadlift/h3  Squat');

      // batch.commit() is called exactly once
      expect(mockCommit).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateUserProfile()', () => {
    it('strips unknown fields, throws on empty uid, and updates whitelisted fields', async () => {
      // 1. Throws if UID is empty
      await expect(updateUserProfile('', { name: 'Atharva' })).rejects.toThrow(
        'Validation Error: A valid, non-empty UID must be provided.'
      );

      mockUpdateDoc.mockResolvedValueOnce(undefined);

      // 2. Strips unknown fields, allows whitelisted
      const payload = {
        name: 'Atharva',
        xp: 150,
        level: 2,
        gender: 'Male',
        maliciousToken: 'hack_session_data', // non-whitelisted
      };

      await updateUserProfile('uid-123', payload);

      expect(mockUpdateDoc).toHaveBeenCalledTimes(1);
      const updatePayload = mockUpdateDoc.mock.calls[0][1];

      expect(updatePayload.name).toBe('Atharva');
      expect(updatePayload.xp).toBe(150);
      expect(updatePayload.level).toBe(2);
      expect(updatePayload.gender).toBe('Male');
      expect(updatePayload.maliciousToken).toBeUndefined();
    });

    it('throws if data payload is null or not an object', async () => {
      await expect(updateUserProfile('uid-123', null)).rejects.toThrow(
        'Validation Error: Data payload must be an object.'
      );
      await expect(updateUserProfile('uid-123', 'not-an-object')).rejects.toThrow(
        'Validation Error: Data payload must be an object.'
      );
    });

    it('throws clean error when updateDoc fails', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockUpdateDoc.mockRejectedValueOnce(new Error('Firestore down'));

      await expect(updateUserProfile('uid-123', { name: 'Atharva' })).rejects.toThrow(
        'Update Failed: Unable to update user profile. Check connection.'
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('sanitizes arrays and maps in payload correctly', async () => {
      mockUpdateDoc.mockResolvedValueOnce(undefined);

      const payload = {
        equipmentList: ['Barbell', 'Dumbbells', 'Barbell', '<h3>Invalid HTML Hack</h3>'],
        powerUps: {
          unlocked_aura_crimson_until: 10,
          unlocked_title_champion_until: '2026-12-31',
          nested: { some: 'value' }, // should be ignored
          activeFlag: true
        }
      };

      await updateUserProfile('uid-123', payload);

      const updatePayload = mockUpdateDoc.mock.calls[0][1];
      // Array has duplicates stripped
      expect(updatePayload.equipmentList).toEqual(['Barbell', 'Dumbbells', '<h3>Invalid HTML Hack</h3>']);
      
      // Map has numeric powerUps capped/floored, strings sanitized, booleans kept, nested objects ignored
      expect(updatePayload.powerUps.unlocked_aura_crimson_until).toBe(10);
      expect(updatePayload.powerUps.unlocked_title_champion_until).toBe('2026-12-31');
      expect(updatePayload.powerUps.nested).toBeUndefined();
      expect(updatePayload.powerUps.activeFlag).toBe(true);
    });
  });
});
