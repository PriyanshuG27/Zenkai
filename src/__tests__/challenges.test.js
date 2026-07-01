import { mockGetDoc, mockSetDoc, mockGetDocs } from '../__mocks__/firebase';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChallenges } from '../hooks/useChallenges';
import { useAuthStore } from '../stores/useAuthStore';

// Mock callZenkaiAPI
const mockCallZenkaiAPI = vi.fn();
vi.mock('../lib/apiClient', () => ({
  callZenkaiAPI: (...args) => mockCallZenkaiAPI(...args),
}));

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

describe('Challenges System TDD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({ user: { uid: 'test-uid' }, profile: {} });
    mockGetDocs.mockResolvedValue({ docs: [], empty: true, size: 0 });
    mockCallZenkaiAPI.mockResolvedValue({ success: true });
  });

  it('1. startChallenge() successfully calls the backend API', async () => {
    const { result } = renderHook(() => useChallenges());
    
    await act(async () => {
      await result.current.startChallenge('test-uid', 'comeback');
    });

    expect(mockCallZenkaiAPI).toHaveBeenCalledWith('startChallenge', { type: 'comeback' });
  });

  it('2. updateProgress() calls the backend updateChallengeProgress API', async () => {
    const { result } = renderHook(() => useChallenges());
    const sessionDate = new Date();
    
    await act(async () => {
      await result.current.updateProgress('test-uid', 'challenge-123', sessionDate);
    });

    expect(mockCallZenkaiAPI).toHaveBeenCalledWith('updateChallengeProgress', {
      challengeId: 'challenge-123',
      sessionDate: sessionDate.toISOString(),
    });
  });

  it('3. getProgressPercent() returns 0 at start, 100 at completion', () => {
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

  it('4. leaveChallenge() marks challenge abandoned, sets cooldown on user document, and updates local auth state', async () => {
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
    expect(mockSetDoc).toHaveBeenCalledWith(
      expect.objectContaining({ _path: 'challenges/mock-challenge-id' }),
      { status: 'abandoned' },
      { merge: true }
    );
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
