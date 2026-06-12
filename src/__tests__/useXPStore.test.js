import { describe, it, expect, beforeEach } from 'vitest';
import { useXPStore } from '../stores/useXPStore';

describe('useXPStore', () => {
  beforeEach(() => {
    useXPStore.setState({
      xp:            0,
      totalXP:       0,
      level:         1,
      levelName:     'Rookie',
      xpToNextLevel: 200,
      streak:        0,
      pendingXP:     0,
      leveledUp:     false,
    });
  });

  it('sets initial XP and streak correctly (legacy 2 args)', () => {
    useXPStore.getState().setXP(1200, 5);

    const state = useXPStore.getState();
    expect(state.xp).toBe(1200);
    expect(state.totalXP).toBe(1200);
    expect(state.streak).toBe(5);
    expect(state.level).toBe(6);
    expect(state.levelName).toBe('Challenger');
    expect(state.xpToNextLevel).toBe(400);
  });

  it('sets initial XP with 1 argument (args.length === 1)', () => {
    useXPStore.getState().setXP(500);

    const state = useXPStore.getState();
    expect(state.xp).toBe(500);
    expect(state.totalXP).toBe(500);
    expect(state.streak).toBe(0);
    expect(state.level).toBe(3);
  });

  it('sets initial XP with 3 arguments where cumulative is not null', () => {
    useXPStore.getState().setXP(100, 500, 3);

    const state = useXPStore.getState();
    expect(state.xp).toBe(100);
    expect(state.totalXP).toBe(500);
    expect(state.streak).toBe(3);
    expect(state.level).toBe(3);
  });

  it('sets initial XP with 3 arguments where cumulative is null', () => {
    useXPStore.getState().setXP(200, null, 4);

    const state = useXPStore.getState();
    expect(state.xp).toBe(200);
    expect(state.totalXP).toBe(200);
    expect(state.streak).toBe(4);
    expect(state.level).toBe(2);
  });

  it('sets initial XP with no arguments (args.length === 0)', () => {
    useXPStore.getState().setXP();

    const state = useXPStore.getState();
    expect(state.xp).toBe(0);
    expect(state.totalXP).toBe(0);
    expect(state.streak).toBe(0);
    expect(state.level).toBe(1);
  });

  it('awards XP, updates pending values, and flags levelUp', () => {
    useXPStore.getState().setXP(900, 0); // level 5 (Rookie)
    
    useXPStore.getState().awardXP(150);

    const state = useXPStore.getState();
    expect(state.xp).toBe(1050);
    expect(state.totalXP).toBe(1050);
    expect(state.pendingXP).toBe(150);
    expect(state.leveledUp).toBe(true);
    expect(state.level).toBe(6);
  });

  it('rolls back speculative XP correctly', () => {
    useXPStore.getState().setXP(900, 0);
    useXPStore.getState().awardXP(150);
    
    expect(useXPStore.getState().totalXP).toBe(1050);

    useXPStore.getState().rollbackXP(150);

    const state = useXPStore.getState();
    expect(state.xp).toBe(900);
    expect(state.totalXP).toBe(900);
    expect(state.pendingXP).toBe(0);
    expect(state.leveledUp).toBe(false);
    expect(state.level).toBe(5);
  });

  it('clears pending animation states correctly', () => {
    useXPStore.getState().awardXP(50);
    expect(useXPStore.getState().pendingXP).toBe(50);

    useXPStore.getState().clearPending();

    const state = useXPStore.getState();
    expect(state.pendingXP).toBe(0);
    expect(state.leveledUp).toBe(false);
  });
});
