import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockGetDocs } from '../__mocks__/firebase';
import { useSquadStore } from '../stores/useSquadStore';

describe('useSquadStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSquadStore.setState({
      squadId: null,
      squadName: '',
      members: [],
      weeklyXPMultiplier: 1.0,
      dailyCheckIns: {},
      loading: false,
      error: null,
      leaderboard: [],
      leaderboardLoading: false,
      leaderboardError: null,
      leaderboardCache: {},
    });
  });

  it('sets squad data correctly', () => {
    const mockSquad = {
      id: 'squad-123',
      squadName: 'Zenkai Warriors',
      members: [{ uid: 'u1', displayName: 'Priyanshu', streak: 12, xpThisWeek: 450 }],
      weeklyXPMultiplier: 1.2,
      dailyCheckIns: { u1: true }
    };

    useSquadStore.getState().setSquadData(mockSquad);

    const state = useSquadStore.getState();
    expect(state.squadId).toBe('squad-123');
    expect(state.squadName).toBe('Zenkai Warriors');
    expect(state.members).toEqual(mockSquad.members);
    expect(state.weeklyXPMultiplier).toBe(1.2);
    expect(state.dailyCheckIns).toEqual({ u1: true });
    expect(state.error).toBeNull();
    // Branch coverage: empty/null squadDoc
    useSquadStore.getState().setSquadData(null);
    const clearedState = useSquadStore.getState();
    expect(clearedState.squadId).toBeNull();
    expect(clearedState.squadName).toBe('');
    expect(clearedState.members).toEqual([]);
    expect(clearedState.weeklyXPMultiplier).toBe(1.0);
    expect(clearedState.dailyCheckIns).toEqual({});
  });

  it('sets loading and error states', () => {
    useSquadStore.getState().setLoading(true);
    expect(useSquadStore.getState().loading).toBe(true);

    useSquadStore.getState().setError('Failed to fetch squad');
    expect(useSquadStore.getState().error).toBe('Failed to fetch squad');
  });

  it('clears squad data back to default values', () => {
    useSquadStore.setState({
      squadId: 'squad-abc',
      squadName: 'Elite Club',
      members: [{ uid: 'user' }],
      weeklyXPMultiplier: 1.5,
      dailyCheckIns: { user: true },
      loading: true,
      error: 'some-error',
    });

    useSquadStore.getState().clearSquad();

    const state = useSquadStore.getState();
    expect(state.squadId).toBeNull();
    expect(state.squadName).toBe('');
    expect(state.members).toEqual([]);
    expect(state.weeklyXPMultiplier).toBe(1.0);
    expect(state.dailyCheckIns).toEqual({});
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('fetches leaderboard and caches results with bypass option', async () => {
    const mockUsers = [
      { uid: 'u1', name: 'User One', xp: 500 },
      { uid: 'u2', name: 'User Two', xp: 300 }
    ];
    mockGetDocs.mockResolvedValue({
      forEach: (cb) => {
        mockUsers.forEach(u => cb({ data: () => u }));
      }
    });

    const store = useSquadStore.getState();

    // 1. Initial fetch
    await store.fetchLeaderboard('gym-abc');
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
    expect(useSquadStore.getState().leaderboard).toEqual(mockUsers);
    
    // Reset mock call count
    mockGetDocs.mockClear();

    // 2. Second fetch within TTL (should hit cache)
    await store.fetchLeaderboard('gym-abc');
    expect(mockGetDocs).not.toHaveBeenCalled();

    // 3. Force fetch (should bypass cache)
    await store.fetchLeaderboard('gym-abc', true);
    expect(mockGetDocs).toHaveBeenCalledTimes(1);
  });
});
