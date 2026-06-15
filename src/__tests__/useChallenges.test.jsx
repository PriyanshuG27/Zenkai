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

    it('does not increment comeback progress if another session was logged on the same calendar day', async () => {
      const sameDay = new Date();
      // The new useChallenges on mount fires:
      //   1. onSnapshot for challenges (handled by mockGetDocs default empty)
      //   2. getDocs for avgHour sessions cache (mount-time effect)
      //   3. getDocs for personalTemplates (mount-time effect)
      // Then updateProgress fires:
      //   4. getDocs for latest 2 sessions (to check isSameDaySession)
      //   5. getDocs for exercises of latest session
      // We need to mock 2-5 in order.
      mockGetDocs
        .mockResolvedValueOnce({ empty: true, docs: [] })    // 1: challenges onSnapshot (mount)
        .mockResolvedValueOnce({ empty: true, docs: [] })    // 2: avgHour sessions (mount effect)
        .mockResolvedValueOnce({ empty: true, docs: [] })    // 3: personalTemplates (mount effect)
        .mockResolvedValueOnce({                             // 4: latest 2 sessions for isSameDaySession
          empty: false,
          docs: [
            {
              id: 'session-2',
              data: () => ({ date: { toDate: () => sameDay } }),
            },
            {
              id: 'session-1',
              data: () => ({ date: { toDate: () => sameDay } }),
            }
          ]
        })
        .mockResolvedValueOnce({ docs: [] });                // 5: exercises for latest session

      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({
            type: 'comeback',
            status: 'active',
            startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
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
        await result.current.updateProgress('user-123', 'valid_challenge_123', sameDay);
      });

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(1);

      const updatePayload = mockTx.update.mock.calls[0][1];
      expect(updatePayload['progress.user-123']).toEqual({
        currentWeek: 1,
        completedSessions: 2, // NOT incremented — same day blocked
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

  describe('useChallengeSkip', () => {
    it('consumes a challenge skip and increments comeback progress', async () => {
      // Mock getDocs to return active challenges
      mockGetDocs.mockResolvedValueOnce({
        empty: false,
        docs: [
          {
            id: 'valid_challenge_123',
            data: () => ({
              type: 'comeback',
              status: 'active',
              startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
              goal: { durationWeeks: 12 },
              progress: {
                'user-123': { currentWeek: 1, completedSessions: 2, badgeEarned: false }
              }
            })
          }
        ]
      });

      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref._path.includes('users/user-123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                powerUps: { challengeSkip: 2 }
              })
            });
          }
          if (ref._path.includes('challenges/valid_challenge_123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'comeback',
                status: 'active',
                startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
                goal: { durationWeeks: 12 },
                progress: {
                  'user-123': { currentWeek: 1, completedSessions: 2, badgeEarned: false }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => false });
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.useChallengeSkip('valid_challenge_123');
      });

      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(2);

      // Verify user document update (deducted skip)
      const userUpdate = mockTx.update.mock.calls[0][1];
      expect(userUpdate.powerUps.challengeSkip).toBe(1);

      // Verify challenge document update (incremented session)
      const challengeUpdate = mockTx.update.mock.calls[1][1];
      expect(challengeUpdate['progress.user-123'].completedSessions).toBe(3);
    });

    it('consumes a challenge skip, completes the challenge, awards XP, and updates local profile', async () => {
      // Set local profile mock in authStore
      useAuthStore.setState({
        user: { uid: 'user-123' },
        uid: 'user-123',
        profile: { powerUps: { challengeSkip: 2 } },
      });

      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref._path.includes('users/user-123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                powerUps: { challengeSkip: 2 }
              })
            });
          }
          if (ref._path.includes('challenges/complete_challenge_123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'comeback',
                status: 'active',
                startDate: { toDate: () => new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) },
                goal: { durationWeeks: 12 },
                rewardXP: 1000,
                progress: {
                  'user-123': { currentWeek: 1, completedSessions: 35, badgeEarned: false }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => false });
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.useChallengeSkip('complete_challenge_123');
      });

      // Verify transaction updates
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledTimes(2);

      // Verify challenge document update (incremented session, badge earned, status completed)
      const challengeUpdate = mockTx.update.mock.calls[1][1];
      expect(challengeUpdate['progress.user-123'].completedSessions).toBe(36);
      expect(challengeUpdate['progress.user-123'].badgeEarned).toBe(true);
      expect(challengeUpdate.status).toBe('completed');

      // Verify awardXP called
      expect(mockAwardXP).toHaveBeenCalledWith('user-123', 'challenge_complete', 1000, {
        challengeId: 'complete_challenge_123',
      });

      // Verify local profile state updated in useAuthStore
      const updatedProfile = useAuthStore.getState().profile;
      expect(updatedProfile.powerUps.challengeSkip).toBe(1);
    });

    it('throws an error and triggers error toast when user has no challenge skips', async () => {
      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref._path.includes('users/user-123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({ powerUps: { challengeSkip: 0 } })
            });
          }
          return Promise.resolve({ exists: () => false });
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.useChallengeSkip('valid_challenge_123');
        })
      ).rejects.toThrow('No Challenge Skips remaining');

      expect(mockAddToast).toHaveBeenCalledWith('No Challenge Skips remaining', 'error');
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
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ xp: 1200, powerUps: {} })
        }),
        update: vi.fn(),
        set: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      let wagerId;
      await act(async () => {
        wagerId = await result.current.createWager('user-123', 500);
      });

      expect(wagerId).toBeDefined();
      expect(mockRunTransaction).toHaveBeenCalledTimes(1);
      expect(mockTx.update).toHaveBeenCalledWith(expect.any(Object), { xp: 700 });
      expect(mockTx.set).toHaveBeenCalledTimes(1);
      
      const wagerDoc = mockTx.set.mock.calls[0][1];
      expect(wagerDoc.subtype).toBe('wager');
      expect(wagerDoc.wagerAmount).toBe(500);
      expect(wagerDoc.rewardXP).toBe(1000);
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Wager placed successfully!'), 'success');
    });

    it('throws an error and rejects transaction when user has insufficient XP', async () => {
      const mockTx = {
        get: vi.fn().mockResolvedValue({
          exists: () => true,
          data: () => ({ xp: 200, powerUps: {} })
        }),
        update: vi.fn(),
        set: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await expect(
        act(async () => {
          await result.current.createWager('user-123', 500);
        })
      ).rejects.toThrow('Insufficient XP for wager');

      expect(mockTx.update).not.toHaveBeenCalled();
      expect(mockTx.set).not.toHaveBeenCalled();
    });
  });

  describe('joinChallenge', () => {
    it('joins standard comeback challenge when no campaign is running', async () => {
      mockGetDoc.mockResolvedValueOnce({ exists: () => false });
      // Mock getActiveChallenges to return empty
      mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      mockSetDoc.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('comeback');
      });

      expect(mockAddToast).toHaveBeenCalledWith('Challenge joined successfully! 🔥', 'success');
    });

    it('joins personalized weak point challenge, deleting template', async () => {
      // Mock personal templates getDoc
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          type: 'weak_point',
          subtype: 'campaign',
          name: 'Core Crusher',
          description: '15 sets of core',
          goal: { targetSets: 15, muscleGroup: 'Core' },
          rewardXP: 300,
        })
      });

      // Mock getActiveChallenges to return empty
      mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
      mockSetDoc.mockResolvedValueOnce(undefined);
      mockDeleteDoc.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('personal-template-id');
      });

      expect(mockSetDoc).toHaveBeenCalledTimes(1);
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
      expect(mockAddToast).toHaveBeenCalledWith(expect.stringContaining('Challenge accepted!'), 'success');
    });

    it('toasts error if personalized challenge subtype already active', async () => {
      mockGetDoc.mockResolvedValueOnce({
        exists: () => true,
        data: () => ({
          type: 'weak_point',
          subtype: 'campaign',
        })
      });

      // Mock getActiveChallenges to return an active campaign
      mockGetDocs.mockResolvedValue({
        empty: false,
        docs: [
          {
            id: 'active-camp',
            data: () => ({ subtype: 'campaign', status: 'active' }),
          }
        ]
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.joinChallenge('personal-template-id');
      });

      expect(mockAddToast).toHaveBeenCalledWith('You already have an active campaign running.', 'error');
    });
  });

  describe('updateProgress for weak_point', () => {
    it('increments weak_point challenge progress inside transaction', async () => {
      mockCollection.mockImplementation((_db, ...pathSegments) => {
        return {
          _path: pathSegments.join('/'),
        };
      });

      mockGetDocs.mockImplementation((q) => {
        const path = q?._path || '';
        if (path.includes('personalTemplates')) {
          return Promise.resolve({ empty: true, docs: [] });
        }
        if (path.includes('sessions') && path.includes('exercises')) {
          // exercises query
          return Promise.resolve({
            empty: false,
            docs: [
              {
                id: 'ex-wp-1',
                data: () => ({
                  muscleGroup: 'Abs',
                  sets: [{ completed: true }, { completed: true }, { completed: false }]
                })
              }
            ]
          });
        }
        if (path.includes('sessions')) {
          // sessions query
          return Promise.resolve({
            empty: false,
            docs: [
              { id: 'session-wp-1', data: () => ({ date: new Date() }) }
            ]
          });
        }
        return Promise.resolve({ empty: true, docs: [] });
      });

      const mockTx = {
        get: vi.fn().mockImplementation((ref) => {
          if (ref._path.includes('challenges/wp_challenge_123')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'weak_point',
                status: 'active',
                goal: { targetSets: 15, muscleGroup: 'Core' },
                progress: {
                  'user-123': { completedSets: 2, badgeEarned: false }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => false });
        }),
        update: vi.fn(),
      };

      mockRunTransaction.mockImplementationOnce(async (db, cb) => {
        return await cb(mockTx);
      });

      const { result } = renderHook(() => useChallenges());

      await act(async () => {
        await result.current.updateProgress('user-123', 'wp_challenge_123', new Date());
      });

      expect(mockTx.update).toHaveBeenCalledTimes(1);
      const wpUpdate = mockTx.update.mock.calls[0][1];
      expect(wpUpdate['progress.user-123'].completedSets).toBe(4); // 2 existing + 2 completed sets
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
