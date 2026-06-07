import { mockGetDocs, mockRunTransaction } from '../__mocks__/firebase';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChallenges } from '../hooks/useChallenges';
import { useAuthStore } from '../stores/useAuthStore';

const { mockUseAuthStore } = vi.hoisted(() => {
  const store = Object.assign(vi.fn(), {
    getState: vi.fn(() => ({ profile: { cooldowns: {} }, setProfile: vi.fn() }))
  });
  return { mockUseAuthStore: store };
});

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: mockUseAuthStore,
}));

vi.mock('../stores/useUIStore', () => ({
  useUIStore: () => ({ addToast: vi.fn() }),
}));

const { mockAwardXP, mockUseXPEngine } = vi.hoisted(() => {
  const mockAwardXP = vi.fn();
  const mockUseXPEngine = vi.fn(() => ({ awardXP: mockAwardXP }));
  return { mockAwardXP, mockUseXPEngine };
});

vi.mock('../hooks/useXPEngine', () => ({
  useXPEngine: mockUseXPEngine,
}));

describe('Challenges System TDD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({ user: { uid: 'test-uid' }, profile: {} });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true, size: 0 });
  });

  it('1. startChallenge() with duplicate active challenge throws error', async () => {
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'existing-chall',
          data: () => ({ type: 'comeback', status: 'active', startDate: new Date() })
        }
      ]
    });

    const { result } = renderHook(() => useChallenges());
    
    await expect(result.current.startChallenge('test-uid', 'comeback')).rejects.toThrow('You already have an active challenge of this type');
  });

  it('2. updateProgress() increments comeback completedSessions correctly & 3. uses Firestore transaction', async () => {
    mockGetDocs.mockResolvedValueOnce({ empty: true });
    
    const mockUpdate = vi.fn();
    mockRunTransaction.mockImplementation(async (db, callback) => {
      const mockTransaction = {
        get: vi.fn((ref) => {
          if (ref._path.includes('challenges')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'comeback',
                status: 'active',
                startDate: new Date(Date.now() - 1000),
                goal: { durationWeeks: 12 },
                progress: {
                  'test-uid': { completedSessions: 2, currentWeek: 1 }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({}) });
        }),
        update: mockUpdate,
      };
      await callback(mockTransaction);
    });

    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await result.current.updateProgress('test-uid', 'mock_id', new Date());
    });

    expect(mockRunTransaction).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      'progress.test-uid': expect.objectContaining({ completedSessions: 3 })
    }));
  });

  it('4. Challenge completion detected at correct threshold (3 sessions x 12 weeks = 36)', async () => {
    mockGetDocs.mockResolvedValueOnce({ empty: true });
    
    const mockUpdate = vi.fn();
    mockRunTransaction.mockImplementation(async (db, callback) => {
      const mockTransaction = {
        get: vi.fn((ref) => {
          if (ref._path.includes('challenges')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'comeback',
                status: 'active',
                startDate: new Date(),
                goal: { durationWeeks: 12 },
                progress: {
                  'test-uid': { completedSessions: 35, currentWeek: 12 }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({}) });
        }),
        update: mockUpdate,
      };
      await callback(mockTransaction);
    });

    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await result.current.updateProgress('test-uid', 'mock_id', new Date());
    });

    expect(mockUpdate).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      status: 'completed',
      'progress.test-uid': expect.objectContaining({ completedSessions: 36, badgeEarned: true })
    }));
  });

  it('5. Badge XP awarded only when badgeEarned is false (idempotent check)', async () => {
    mockGetDocs.mockResolvedValueOnce({ empty: true });
    let awardXPMock = vi.fn();
    
    // We can't easily mock the internal awardXP destructured at the top level without re-mocking the file
    // But since we mocked useXPEngine globally, let's just spy on the mocked awardXP
    const { useXPEngine: useXPEngineMock } = await import('../hooks/useXPEngine');
    useXPEngineMock.mockReturnValue({ awardXP: awardXPMock });

    mockRunTransaction.mockImplementation(async (db, callback) => {
      const mockTransaction = {
        get: vi.fn((ref) => {
          if (ref._path.includes('challenges')) {
            return Promise.resolve({
              exists: () => true,
              data: () => ({
                type: 'comeback',
                status: 'active',
                startDate: new Date(),
                goal: { durationWeeks: 12 },
                progress: {
                  // Already completed and earned badge previously
                  'test-uid': { completedSessions: 36, currentWeek: 12, badgeEarned: true }
                }
              })
            });
          }
          return Promise.resolve({ exists: () => true, data: () => ({}) });
        }),
        update: vi.fn(),
      };
      await callback(mockTransaction);
    });

    const { result } = renderHook(() => useChallenges());
    await act(async () => {
      await result.current.updateProgress('test-uid', 'mock_id', new Date());
    });

    expect(awardXPMock).not.toHaveBeenCalled();
  });

  it('6. getProgressPercent() returns 0 at start, 100 at completion', () => {
    const { result } = renderHook(() => useChallenges());
    
    const startObj = {
      id: 'mock', type: 'comeback', goal: { durationWeeks: 12 },
      progress: { 'test-uid': { completedSessions: 0 } }
    };
    expect(result.current.getProgressPercent(startObj, 'test-uid')).toBe(0);

    const completeObj = {
      id: 'mock', type: 'comeback', goal: { durationWeeks: 12 },
      progress: { 'test-uid': { completedSessions: 36 } }
    };
    expect(result.current.getProgressPercent(completeObj, 'test-uid')).toBe(100);
  });

  it('7. leaveChallenge() calls deleteDoc, sets cooldown on user document, and updates local auth state', async () => {
    const { mockDeleteDoc, mockGetDoc, mockSetDoc } = await import('../__mocks__/firebase');
    
    mockGetDoc
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ type: 'streak' })
      })
      .mockResolvedValueOnce({
        exists: () => true,
        data: () => ({ cooldowns: {} })
      });

    const setProfileSpy = vi.fn();
    vi.mocked(useAuthStore).mockReturnValue({
      user: { uid: 'test-uid' },
      profile: { cooldowns: {} },
      setProfile: setProfileSpy
    });
    mockUseAuthStore.getState.mockReturnValue({
      profile: { cooldowns: {} },
      setProfile: setProfileSpy
    });

    const { result } = renderHook(() => useChallenges());
    
    await act(async () => {
      await result.current.leaveChallenge('mock-challenge-id');
    });

    expect(mockGetDoc).toHaveBeenCalledTimes(2);
    expect(mockDeleteDoc).toHaveBeenCalled();
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ _path: 'users/test-uid' }),
      expect.objectContaining({
        cooldowns: expect.objectContaining({
          streak: expect.any(Number)
        })
      }),
      { merge: true }
    );
  });
});
