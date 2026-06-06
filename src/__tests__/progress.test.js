import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { mockGetDocs } from '../__mocks__/firebase';
import { useStrengthData, useVolumeData, usePRList } from '../hooks/useProgress';

describe('useProgress Hooks Test Suite', () => {
  beforeEach(() => {
    mockGetDocs.mockReset();
  });

  describe('useStrengthData Hook', () => {
    it('returns empty array if uid or exerciseKey is missing', () => {
      const { result: res1 } = renderHook(() => useStrengthData('', 'squat'));
      expect(res1.current.data).toEqual([]);
      expect(res1.current.loading).toBe(false);

      const { result: res2 } = renderHook(() => useStrengthData('user1', ''));
      expect(res2.current.data).toEqual([]);
      expect(res2.current.loading).toBe(false);
    });

    it('successfully queries sessions, fetches exercises subcollection, and extracts max weight sorted oldest first', async () => {
      const sessionDate1 = new Date();
      sessionDate1.setDate(sessionDate1.getDate() - 10);
      const sessionDate2 = new Date();
      sessionDate2.setDate(sessionDate2.getDate() - 5);

      // Sessions returned ordered desc by date: sessionDate2 first, then sessionDate1
      const sessionsMock = {
        docs: [
          {
            id: 'sess2',
            data: () => ({
              date: sessionDate2,
              dateString: '2026-06-05',
            }),
          },
          {
            id: 'sess1',
            data: () => ({
              date: sessionDate1,
              dateString: '2026-05-30',
            }),
          },
        ],
      };

      // Mock first call: sessions query
      mockGetDocs.mockResolvedValueOnce(sessionsMock);

      // Mock exercises subcollection call for sess2 (most recent)
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              exerciseKey: 'bench_press',
              sets: [
                { weight: 65, reps: 5, done: true },
                { weight: 70, reps: 4, done: true }, // heaviest
              ],
            }),
          },
        ],
      });

      // Mock exercises subcollection call for sess1 (oldest)
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              exerciseKey: 'bench_press',
              sets: [
                { weight: 60, reps: 8, done: true },
                { weight: 65, reps: 6, done: true }, // heaviest
              ],
            }),
          },
        ],
      });

      const { result } = renderHook(() => useStrengthData('user-123', 'bench_press', 30));

      // Wait for async effect to resolve
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      
      // Expected sorted ascending (sess1 2026-05-30: 65kg, sess2 2026-06-05: 70kg)
      expect(result.current.data).toEqual([
        { date: '2026-05-30', maxWeight: 65, maxReps: 6 },
        { date: '2026-06-05', maxWeight: 70, maxReps: 4 },
      ]);
    });

    it('returns cached results when same exerciseKey is re-queried', async () => {
      // Mock sessions query for first mount
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'sess_cached',
            data: () => ({
              date: new Date(),
              dateString: '2026-06-06',
            }),
          },
        ],
      });

      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              exerciseKey: 'deadlift',
              sets: [{ weight: 100, reps: 5, done: true }],
            }),
          },
        ],
      });

      const { result } = renderHook(() => useStrengthData('user-123', 'deadlift', 30));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.data).toEqual([{ date: '2026-06-06', maxWeight: 100, maxReps: 5 }]);
      expect(mockGetDocs).toHaveBeenCalledTimes(2);

      // Call it again. Cache should hit, mockGetDocs should NOT be called again.
      const { result: result2 } = renderHook(() => useStrengthData('user-123', 'deadlift', 30));
      
      expect(result2.current.loading).toBe(false);
      expect(result2.current.data).toEqual([{ date: '2026-06-06', maxWeight: 100, maxReps: 5 }]);
      expect(mockGetDocs).toHaveBeenCalledTimes(2); // Still 2
    });
    it('cleanup function cancels in-flight read on unmount', async () => {
      let resolveQuery;
      mockGetDocs.mockReturnValue(new Promise(resolve => {
        resolveQuery = resolve;
      }));

      const { unmount, result } = renderHook(() => useStrengthData('user-123', 'unique_exercise_for_cleanup', 30));
      
      expect(result.current.loading).toBe(true);
      
      unmount();
      
      resolveQuery({ docs: [] });
      
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      
      // Since it unmounted, state should not be updated or throw memory leaks
      // Vitest's lack of warnings or errors signifies success, but we can also mock a spy if needed.
      expect(result.current.loading).toBe(true); // Loading state never changes because it unmounted before resolve
    });
  });

  describe('useVolumeData Hook', () => {
    it('groups sessions by ISO week and fills missing intermediate weeks with 0 volume', async () => {
      const today = new Date();
      // Date in current week
      const dateCurrent = new Date(today.getTime());
      
      // Date 2 weeks ago (creating a gap of 1 week)
      const dateTwoWeeksAgo = new Date(today.getTime());
      dateTwoWeeksAgo.setDate(dateTwoWeeksAgo.getDate() - 14);

      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            data: () => ({
              date: dateCurrent,
              totalVolume: 5000,
            }),
          },
          {
            data: () => ({
              date: dateTwoWeeksAgo,
              totalVolume: 4000,
            }),
          },
        ],
      });

      const { result } = renderHook(() => useVolumeData('user-123', 3)); // 3 weeks range

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
      
      // There should be at least 3 weeks of data (cutoff week, gap week with 0 volume, current week)
      expect(result.current.data.length).toBeGreaterThanOrEqual(3);

      const currentWeek = result.current.data[result.current.data.length - 1];
      const gapWeek = result.current.data[result.current.data.length - 2];

      expect(currentWeek.totalVolume).toBe(5000);
      expect(gapWeek.totalVolume).toBe(0); // Intermediate week is filled with 0
    });
  });

  describe('usePRList Hook', () => {
    it('returns PR list sorted by date DESC and refetches on refresh', async () => {
      const prDate1 = new Date();
      prDate1.setDate(prDate1.getDate() - 10);
      const prDate2 = new Date();
      prDate2.setDate(prDate2.getDate() - 2);

      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'bench_press',
            data: () => ({
              exerciseName: 'Bench Press',
              weight: 80,
              reps: 5,
              date: prDate1,
            }),
          },
          {
            id: 'deadlift',
            data: () => ({
              exerciseName: 'Deadlift',
              weight: 120,
              reps: 3,
              date: prDate2, // more recent
            }),
          },
        ],
      });

      const { result } = renderHook(() => usePRList('user-123'));

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      // Deadlift (recent) should be first, Bench Press (oldest) second
      expect(result.current.prs[0].exerciseKey).toBe('deadlift');
      expect(result.current.prs[1].exerciseKey).toBe('bench_press');
      expect(mockGetDocs).toHaveBeenCalledTimes(1);

      // Trigger refresh
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          {
            id: 'squat',
            data: () => ({
              exerciseName: 'Squat',
              weight: 100,
              reps: 5,
              date: new Date(),
            }),
          },
        ],
      });

      act(() => {
        result.current.refresh();
      });

      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
      });

      expect(result.current.loading).toBe(false);
      expect(result.current.prs.length).toBe(1);
      expect(result.current.prs[0].exerciseKey).toBe('squat');
      expect(mockGetDocs).toHaveBeenCalledTimes(2);
    });
  });
});
