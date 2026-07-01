import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockGetDocs,
  mockSetDoc,
  mockRunTransaction,
  mockGetDoc,
  mockDeleteDoc,
  mockCollection,
  mockAuth,
} from '../__mocks__/firebase';

import { renderHook, act } from '@testing-library/react';
import { useChallenges } from '../hooks/useChallenges';
import { useAuthStore } from '../stores/useAuthStore';

// Mock callZenkaiAPI — all backend mutations now route through this
const mockCallZenkaiAPI = vi.fn();
vi.mock('../lib/apiClient', () => ({
  callZenkaiAPI: (...args) => mockCallZenkaiAPI(...args),
}));

// Mock useUIStore
const mockAddToast = vi.fn();
vi.mock('../stores/useUIStore', () => ({
  useUIStore: () => ({
    addToast: mockAddToast,
  }),
}));

describe('useChallenges Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = {
      uid: 'user-123',
      getIdToken: vi.fn().mockResolvedValue('mock-token'),
    };
    useAuthStore.setState({
      user: { uid: 'user-123' },
      uid: 'user-123',
      loading: false,
    });
    // Default mock for loading challenges on mount
    mockGetDocs.mockResolvedValue({
      empty: true,
      docs: [],
    });
  });

  describe('startChallenge', () => {
    it('throws an error if an active challenge of the same type already exists', async () => {
      mockCallZenkaiAPI.mockImplementationOnce(async (endpoint) => {
        if (endpoint === 'startChallenge') {
          throw new Error('You already have an active challenge of this type');
        }
        return {};
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.startChallenge('user-123', 'comeback');
        })
      ).rejects.toThrow('You already have an active challenge of this type');
    });

    it('successfully starts a challenge if no active challenge of that type exists', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        challengeId: 'mock-auto-id',
      });

      const { result } = renderHook(() => useChallenges());

      let challengeId;
      await act(async () => {
        challengeId = await result.current.startChallenge('user-123', 'comeback');
      });

      expect(challengeId).toBe('mock-auto-id');
      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('startChallenge', { type: 'comeback' });
    });
  });

  describe('updateProgress', () => {
    it('rejects updateProgress if challengeId has invalid format (path traversal defense)', async () => {
      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.updateProgress('user-123', '../../secrets', new Date());
        })
      ).rejects.toThrow('Invalid challenge ID format');

      expect(mockCallZenkaiAPI).not.toHaveBeenCalledWith('updateChallengeProgress', expect.anything());
    });

    it('calls backend with correct payload and handles progress update', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({ success: true, shouldAwardXP: false });

      const { result } = renderHook(() => useChallenges());
      const sessionDate = new Date('2026-07-01T10:00:00Z');

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', sessionDate);
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('updateChallengeProgress', {
        challengeId: 'valid_challenge_123',
        sessionDate: sessionDate.toISOString(),
      });
    });

    it('shows XP toast when backend signals challenge completion', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        shouldAwardXP: true,
        xpAmount: 500,
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
      });

      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('+500 XP'),
        'success'
      );
    });

    it('does not show XP toast when challenge is not yet complete', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        shouldAwardXP: false,
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
      });

      expect(mockAddToast).not.toHaveBeenCalledWith(
        expect.stringContaining('XP'),
        'success'
      );
    });

    it('throws if backend rejects (challenge not active)', async () => {
      mockCallZenkaiAPI.mockImplementation(async (endpoint) => {
        if (endpoint === 'updateChallengeProgress') throw new Error('Challenge is not active');
        return {};
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
        })
      ).rejects.toThrow('Challenge is not active');

      mockCallZenkaiAPI.mockReset();
    });
  });

  describe('useChallengeSkip', () => {
    it('calls backend with challengeId and shows success toast', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        challengeCompleted: false,
        xpAmount: 0,
        remainingSkips: 2,
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.useChallengeSkip('valid_challenge_123');
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('useChallengeSkip', {
        challengeId: 'valid_challenge_123',
      });
    });

    it('shows XP toast and updates XP store when challenge is completed via skip', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        challengeCompleted: true,
        xpAmount: 500,
        newXP: 1500,
        newCumulativeXP: 2000,
        remainingSkips: 1,
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.useChallengeSkip('valid_challenge_123');
      });

      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('+500 XP'),
        'success'
      );
    });

    it('shows error toast when user has no challenge skips', async () => {
      mockCallZenkaiAPI.mockImplementation(async (endpoint) => {
        if (endpoint === 'useChallengeSkip') throw new Error('No Challenge Skips remaining');
        return {};
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.useChallengeSkip('valid_challenge_123');
        })
      ).rejects.toThrow('No Challenge Skips remaining');

      expect(mockAddToast).toHaveBeenCalledWith(
        'No Challenge Skips remaining',
        'error'
      );

      mockCallZenkaiAPI.mockReset();
    });
  });


  describe('leaveChallenge', () => {
    it('successfully abandons a challenge, writes cooldowns, and updates local state', async () => {
      // Setup mock data for getDoc
      mockGetDoc
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ type: 'comeback' }),
        }) // 1st getDoc: get challenge document to find type
        .mockResolvedValueOnce({
          exists: () => true,
          data: () => ({ cooldowns: {} }),
        }); // 2nd getDoc: get user document to read current cooldowns

      mockSetDoc.mockResolvedValue(undefined);

      // Setup user profile in authStore
      useAuthStore.setState({
        user: { uid: 'user-123' },
        uid: 'user-123',
        profile: { cooldowns: {} },
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.leaveChallenge('challenge-to-leave');
      });

      // Assertions
      expect(mockGetDoc).toHaveBeenCalledTimes(2);
      expect(mockSetDoc).toHaveBeenCalledTimes(2);

      // Check status set to abandoned
      expect(mockSetDoc.mock.calls[0][1]).toEqual({ status: 'abandoned' });

      // Check cooldown written to user profile
      const userCooldownPayload = mockSetDoc.mock.calls[1][1];
      expect(userCooldownPayload.cooldowns.comeback).toBeDefined();

      // Check local auth store profile updated
      const updatedProfile = useAuthStore.getState().profile;
      expect(updatedProfile.cooldowns.comeback).toBeDefined();

      expect(mockAddToast).toHaveBeenCalledWith('Challenge removed! 🗑️', 'info');
    });

    it('rolls back and toasts error when leaving a challenge fails', async () => {
      mockGetDoc.mockRejectedValueOnce(new Error('Firestore error'));

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.leaveChallenge('challenge-to-leave');
      });

      expect(mockAddToast).toHaveBeenCalledWith('Failed to remove challenge: Failed to read challenge document: Firestore error', 'error');
    });
  });

  describe('createWager', () => {
    it('successfully places a wager when user has sufficient XP', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        challengeId: 'wager-abc',
        wagerAmount: 500,
        rewardXP: 1000,
      });

      const { result } = renderHook(() => useChallenges());

      let wagerId;
      await act(async () => {
        wagerId = await result.current.createWager('user-123', 500);
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('createWager', {
        amount: 500,
      });
      expect(wagerId).toBe('wager-abc');
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('Wager placed successfully!'),
        'success'
      );
    });

    it('shows error toast when server rejects wager (insufficient XP)', async () => {
      // First call on mount may be generateChallenge — use mockImplementation so
      // only the createWager call gets the rejection
      mockCallZenkaiAPI.mockImplementation(async (endpoint) => {
        if (endpoint === 'createWager') throw new Error('Insufficient XP for wager');
        return {};
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.createWager('user-123', 500);
        })
      ).rejects.toThrow('Insufficient XP for wager');

      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('Insufficient XP'),
        'error'
      );

      mockCallZenkaiAPI.mockReset();
    });
  });

  describe('joinChallenge', () => {
    it('joins standard comeback challenge when no campaign is running', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('comeback');
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('joinChallenge', { challengeId: 'comeback' });
      expect(mockAddToast).toHaveBeenCalledWith('Challenge joined successfully! 🔥', 'success');
    });

    it('joins personalized weak point challenge', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({ success: true });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('personal-template-id');
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith('joinChallenge', { challengeId: 'personal-template-id' });
      expect(mockAddToast).toHaveBeenCalledWith('Challenge joined successfully! 🔥', 'success');
    });

    it('toasts error if server rejects join (campaign already running)', async () => {
      mockCallZenkaiAPI.mockRejectedValueOnce(
        new Error('You already have an active campaign running.')
      );

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('personal-template-id');
      });

      expect(mockAddToast).toHaveBeenCalledWith(
        'You already have an active campaign running.',
        'error'
      );
    });
  });

  describe('updateProgress for weak_point', () => {
    it('increments weak_point challenge progress via backend API', async () => {
      mockCallZenkaiAPI.mockResolvedValueOnce({
        success: true,
        progress: { 'user-123': { completedSets: 4, badgeEarned: false } },
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'wp_challenge_123', new Date());
      });

      expect(mockCallZenkaiAPI).toHaveBeenCalledWith(
        'updateChallengeProgress',
        expect.objectContaining({ challengeId: 'wp_challenge_123' })
      );
    });
  });

  describe('getProgressPercent', () => {
    it('calculates progress percentage correctly for different challenge types', () => {
      const { result } = renderHook(() => useChallenges());

      // 1. comeback type
      const cbProgress = result.current.getProgressPercent({
        type: 'comeback',
        goal: { durationWeeks: 12 },
        progress: { 'user-123': { completedSessions: 18 } }
      }, 'user-123');
      expect(cbProgress).toBe(50); // 18 / 36

      // 2. streak type
      const streakProgress = result.current.getProgressPercent({
        type: 'streak',
        goal: { workoutsPerWeek: 3, durationWeeks: 8 },
        progress: { 'user-123': { weeklyCount: [3, 3, 3, 3, 0, 0, 0, 0] } }
      }, 'user-123');
      expect(streakProgress).toBe(50); // 12 / 24

      // 3. weak_point type
      const wpProgress = result.current.getProgressPercent({
        type: 'weak_point',
        goal: { targetSets: 20 },
        progress: { 'user-123': { completedSets: 5 } }
      }, 'user-123');
      expect(wpProgress).toBe(25); // 5 / 20
    });
  });
});
