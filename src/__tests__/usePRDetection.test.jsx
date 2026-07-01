import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { mockGetDoc, mockSetDoc } from '../__mocks__/firebase';
import { usePRDetection } from '../hooks/usePRDetection';

describe('usePRDetection Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('first set ever for an exercise returns isPR: true', async () => {
    // Mock getDoc resolving to document that does not exist
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });

    const { result } = renderHook(() => usePRDetection());
    
    // We use a unique exercise key to bypass any cache from previous test runs
    const exerciseKey = 'bench_press_new_pr_1';
    const res = await result.current.checkForPR('user-123', exerciseKey, 60, 8);

    expect(res.isPR).toBe(true);
    expect(res.prevPR).toBeNull();
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('62.5kg after a previous PR of 60kg returns isPR: true', async () => {
    // Mock getDoc returning existing PR of 60kg x 8 reps
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 60, reps: 8, exerciseKey: 'squat_pr_2' }),
    });

    const { result } = renderHook(() => usePRDetection());
    const exerciseKey = 'squat_pr_2';
    
    const res = await result.current.checkForPR('user-123', exerciseKey, 62.5, 5);

    expect(res.isPR).toBe(true);
    expect(res.prevPR).toEqual({ weight: 60, reps: 8, exerciseKey: 'squat_pr_2' });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
  });

  it('60kg after a previous PR of 62.5kg returns isPR: false', async () => {
    // Mock getDoc returning existing PR of 62.5kg x 5 reps
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 62.5, reps: 5, exerciseKey: 'deadlift_pr_3' }),
    });

    const { result } = renderHook(() => usePRDetection());
    const exerciseKey = 'deadlift_pr_3';

    const res = await result.current.checkForPR('user-123', exerciseKey, 60, 8);

    expect(res.isPR).toBe(false);
    expect(res.prevPR).toEqual({ weight: 62.5, reps: 5, exerciseKey: 'deadlift_pr_3' });
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('error in Firestore read returns isPR: false (safe fallback)', async () => {
    // Mock getDoc throwing an error
    mockGetDoc.mockRejectedValueOnce(new Error('Firestore read failed'));

    const { result } = renderHook(() => usePRDetection());
    const exerciseKey = 'overhead_press_pr_4';

    const res = await result.current.checkForPR('user-123', exerciseKey, 50, 5);

    expect(res.isPR).toBe(false);
    expect(res.prevPR).toBeNull();
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('is idempotent: calling it twice with same data returns isPR: false the second time due to cache hit', async () => {
    // First call reads from Firestore and establishes a PR of 50kg
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 45, reps: 8, exerciseKey: 'barbell_curl_pr_5' }),
    });

    const { result } = renderHook(() => usePRDetection());
    const exerciseKey = 'barbell_curl_pr_5';

    // First call: 50kg > 45kg -> isPR: true
    const res1 = await result.current.checkForPR('user-123', exerciseKey, 50, 8);
    expect(res1.isPR).toBe(true);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).toHaveBeenCalledTimes(1);

    // Reset mock setDoc to track call count
    mockSetDoc.mockClear();

    // Second call: 50kg is now cached as the current PR.
    // 50kg is not > 50kg, so it should be false (idempotent cache hit)
    const res2 = await result.current.checkForPR('user-123', exerciseKey, 50, 8);
    expect(res2.isPR).toBe(false);
    // Should NOT call getDoc again because of cache
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
    expect(mockSetDoc).not.toHaveBeenCalled();
  });

  it('returns early when uid or exerciseKey is missing', async () => {
    const { result } = renderHook(() => usePRDetection());
    
    const res1 = await result.current.checkForPR('', 'bench_press', 60, 5);
    expect(res1.isPR).toBe(false);
    expect(res1.prevPR).toBeNull();

    const res2 = await result.current.checkForPR('user-123', '', 60, 5);
    expect(res2.isPR).toBe(false);
    expect(res2.prevPR).toBeNull();
  });

  it('clears cache when clearPRCache is called', async () => {
    const { clearPRCache } = await import('../hooks/usePRDetection');
    
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 45, reps: 8, exerciseKey: 'bicep_curl_cache' }),
    });

    const { result } = renderHook(() => usePRDetection());
    const exerciseKey = 'bicep_curl_cache';

    // First call caches the PR
    const res1 = await result.current.checkForPR('user-123', exerciseKey, 50, 8);
    expect(res1.isPR).toBe(true);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);

    // Call clearPRCache
    clearPRCache();

    // Reset mock getDoc to track next call
    mockGetDoc.mockClear();
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 50, reps: 8, exerciseKey: 'bicep_curl_cache' }),
    });

    // Second call should NOT hit cache because we cleared it, so it calls getDoc again
    const res2 = await result.current.checkForPR('user-123', exerciseKey, 50, 8);
    expect(res2.isPR).toBe(false);
    expect(mockGetDoc).toHaveBeenCalledTimes(1);
  });

  it('handles bodyweight (BW) weight format correctly and detects new PRs', async () => {
    // 1. First set ever with 'BW'
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });
    const { result } = renderHook(() => usePRDetection());
    const exerciseKey1 = 'pullup_bw_1';
    const res1 = await result.current.checkForPR('user-123', exerciseKey1, 'BW', 10);
    expect(res1.isPR).toBe(true);

    // 2. Mock existing 'BW' doc returning weight: 'BW' or 0
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ weight: 'BW', reps: 10, exerciseKey: 'pullup_bw_2' }),
    });
    const exerciseKey2 = 'pullup_bw_2';
    // More reps than existing PR
    const res2 = await result.current.checkForPR('user-123', exerciseKey2, 'BW', 12);
    expect(res2.isPR).toBe(true);

    // 3. Fallback when weight is invalid (falls back to 0)
    mockGetDoc.mockResolvedValueOnce({
      exists: () => false,
    });
    const exerciseKey3 = 'pull_ups_invalid_weight';
    const res3 = await result.current.checkForPR('user-123', exerciseKey3, 'abc', 8);
    expect(res3.isPR).toBe(true); // first set is still treated as PR
  });
});
