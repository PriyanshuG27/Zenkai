import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  mockGetDocs,
  mockSetDoc,
  mockRunTransaction,
} from '../__mocks__/firebase';

import { renderHook, act } from '@testing-library/react';
import { useChallenges } from '../hooks/useChallenges';
import { useAuthStore } from '../stores/useAuthStore';

// Mock useXPEngine
const mockAwardXP = vi.fn().mockResolvedValue({ newXP: 500, levelUp: false, newLevel: 1 });
vi.mock('../hooks/useXPEngine', () => ({
  useXPEngine: () => ({
    awardXP: mockAwardXP,
  }),
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
      // Mock getDocs to return an active challenge of the same type
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'active-challenge-123',
            data: () => ({
              type: 'comeback',
              status: 'active',
              participants: ['user-123'],
            }),
          },
        ],
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.startChallenge('user-123', 'comeback');
        })
      ).rejects.toThrow('You already have an active challenge of this type');
    });

    it('successfully starts a challenge if no active challenge of that type exists', async () => {
      // Mock getDocs to return empty (no duplicate active challenge)
      mockGetDocs.mockResolvedValueOnce({
        empty: true,
        docs: [],
      });
      mockSetDoc.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useChallenges());

      let challengeId;
      await act(async () => {
        challengeId = await result.current.startChallenge('user-123', 'comeback');
      });

      expect(challengeId).toBe('mock-auto-id');
      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      
      const payload = mockSetDoc.mock.calls[0][1];
      expect(payload.type).toBe('comeback');
      expect(payload.status).toBe('active');
      expect(payload.participants).toEqual(['user-123']);
      expect(payload.progress['user-123'].badgeEarned).toBe(false);
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

      expect(mockRunTransaction).not.toHaveBeenCalled();
    });

    it('successfully increments comeback challenge progress inside transaction', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'comeback',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }, // 5 days ago (Week 1)
            goal: { durationWeeks: 12 },
            progress: {
              'user-123': { currentWeek: 1, completedSessions: 2, badgeEarned: false }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
      });

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(1);

      // Check fields updated
      const updatePayload = mockTx.update.mock.calls[0][1];
      expect(updatePayload['progress.user-123']).toEqual({
        currentWeek: 1,
        completedSessions: 3,
        badgeEarned: false,
      });
    });

    it('successfully increments streak challenge progress inside transaction', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'streak',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) }, // 10 days ago (Week 2)
            goal: { durationWeeks: 8, workoutsPerWeek: 3 },
            progress: {
              'user-123': { currentWeek: 2, weeklyCount: [3, 1, 0, 0, 0, 0, 0, 0], badgeEarned: false }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_456', new Date());
      });

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(1);

      const updatePayload = mockTx.update.mock.calls[0][1];
      expect(updatePayload['progress.user-123']).toEqual({
        currentWeek: 2,
        weeklyCount: [3, 2, 0, 0, 0, 0, 0, 0],
        badgeEarned: false,
      });
    });

    it('awards 500 XP exactly once upon comeback challenge completion (idempotent)', async () => {
      // Case 1: First completion (badgeEarned: false transitioning to true)
      const mockTx1 = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'comeback',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
            goal: { durationWeeks: 12 },
            progress: {
              'user-123': { currentWeek: 1, completedSessions: 35, badgeEarned: false }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx1);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
      });

      expect(mockTx1.update).toHaveBeenCalledTimes(2);
      
      // User update is first (power-ups)
      const userUpdatePayload = mockTx1.update.mock.calls[0][1];
      expect(userUpdatePayload.powerUps).toBeDefined();
      expect(userUpdatePayload.powerUps.streakShield).toBe(1);
      expect(userUpdatePayload.powerUps.xpBooster).toBe(1);

      // Challenge update is second
      const updatePayload1 = mockTx1.update.mock.calls[1][1];
      expect(updatePayload1['progress.user-123'].completedSessions).toBe(36);
      expect(updatePayload1['progress.user-123'].badgeEarned).toBe(true);
      expect(updatePayload1.status).toBe('completed');

      // Assert XP is awarded
      expect(mockAwardXP).toHaveBeenCalledTimes(1);
      expect(mockAwardXP).toHaveBeenCalledWith('user-123', 'challenge_complete', 500, {
        challengeId: 'valid_challenge_123',
      });

      // Clear awardXP call mock history
      mockAwardXP.mockClear();

      // Case 2: Already completed/badge earned (idempotency check)
      const mockTx2 = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'comeback',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
            goal: { durationWeeks: 12 },
            progress: {
              'user-123': { currentWeek: 1, completedSessions: 36, badgeEarned: true }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx2);
      });

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
      });

      // XP should NOT be awarded again
      expect(mockAwardXP).not.toHaveBeenCalled();
    });

    it('awards 500 XP exactly once upon streak challenge completion (idempotent)', async () => {
      const mockTx1 = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'streak',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) }, // ~Week 8
            goal: { durationWeeks: 8, workoutsPerWeek: 3 },
            progress: {
              'user-123': { currentWeek: 8, weeklyCount: [3, 3, 3, 3, 3, 3, 3, 2], badgeEarned: false }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx1);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'valid_challenge_456', new Date());
      });

      expect(mockTx1.update).toHaveBeenCalledTimes(2);

      // User update is first (power-ups)
      const userUpdatePayload = mockTx1.update.mock.calls[0][1];
      expect(userUpdatePayload.powerUps).toBeDefined();
      expect(userUpdatePayload.powerUps.xpBooster).toBe(1);

      // Challenge update is second
      const updatePayload1 = mockTx1.update.mock.calls[1][1];
      expect(updatePayload1['progress.user-123'].weeklyCount).toEqual([3, 3, 3, 3, 3, 3, 3, 3]);
      expect(updatePayload1['progress.user-123'].badgeEarned).toBe(true);
      expect(updatePayload1.status).toBe('completed');

      expect(mockAwardXP).toHaveBeenCalledTimes(1);
      expect(mockAwardXP).toHaveBeenCalledWith('user-123', 'challenge_complete', 500, {
        challengeId: 'valid_challenge_456',
      });
    });

    it('throws an error if the challenge is not active', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'comeback',
            status: 'completed',
            progress: {
              'user-123': { currentWeek: 12, completedSessions: 36, badgeEarned: true }
            }
          }),
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.updateProgress('user-123', 'valid_challenge_123', new Date());
        })
      ).rejects.toThrow('Challenge is not active');
    });
  });
});
