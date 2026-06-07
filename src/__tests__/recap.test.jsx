import { mockGetDocs } from '../__mocks__/firebase';
import { renderHook, act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useWeeklyRecap } from '../hooks/useWeeklyRecap';
import { WeeklyRecapScreen } from '../components/shared/WeeklyRecapScreen';
import { useAuthStore } from '../stores/useAuthStore';
import { useXPStore } from '../stores/useXPStore';
import html2canvas from 'html2canvas';

vi.mock('../stores/useAuthStore', () => ({
  useAuthStore: vi.fn(),
}));

vi.mock('../stores/useXPStore', () => ({
  useXPStore: vi.fn(),
}));

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toBlob: (cb) => cb(new Blob(['mock-blob'], { type: 'image/png' }))
  })
}));

describe('Weekly Recap System TDD', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue({ uid: 'test-uid' });
    vi.mocked(useXPStore).mockReturnValue({ streak: 5 });
    vi.useFakeTimers({ toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('1. useWeeklyRecap() aggregates session count correctly for last 7 days', async () => {
    vi.setSystemTime(new Date('2026-06-07T12:00:00Z')); // Sunday

    // 1 call for sessions, followed by N calls for exercises, 1 for PRs
    mockGetDocs.mockResolvedValueOnce({
      size: 3,
      docs: [
        { id: 'sess1', data: () => ({ totalVolume: 1000, xpEarned: 150 }) },
        { id: 'sess2', data: () => ({ totalVolume: 1200, xpEarned: 150 }) },
        { id: 'sess3', data: () => ({ totalVolume: 800, xpEarned: 150 }) }
      ]
    }).mockResolvedValueOnce({
      docs: [] // ex sess1
    }).mockResolvedValueOnce({
      docs: [] // ex sess2
    }).mockResolvedValueOnce({
      docs: [] // ex sess3
    }).mockResolvedValueOnce({
      size: 2 // pr count
    });

    const { result } = renderHook(() => useWeeklyRecap());
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.recap).toEqual(expect.objectContaining({
      sessionsCount: 3,
      totalVolume: 3000,
      xpEarned: 450,
      prsBrokenCount: 2
    }));
  });

  it('2. Recap only shows on Sunday (mock Date, verify logic)', () => {
    vi.setSystemTime(new Date('2026-06-07T12:00:00Z')); // Sunday
    const { result: r1 } = renderHook(() => useWeeklyRecap());
    expect(r1.current.isRecapDay).toBe(true);

    vi.setSystemTime(new Date('2026-06-08T12:00:00Z')); // Monday
    const { result: r2 } = renderHook(() => useWeeklyRecap());
    expect(r2.current.isRecapDay).toBe(false);
  });

  it('3. After viewing, localStorage key prevents re-showing same week', () => {
    vi.setSystemTime(new Date('2026-06-07T12:00:00Z'));
    const { result } = renderHook(() => useWeeklyRecap());
    
    expect(result.current.hasSeen).toBe(false);
    
    act(() => {
      result.current.markAsSeen();
    });
    
    expect(result.current.hasSeen).toBe(true);
    expect(localStorage.getItem(`recap_seen_${result.current.weekId}`)).toBe('true');
  });

  it('4. shareRecap() calls navigator.share on mobile', async () => {
    global.navigator.share = vi.fn().mockResolvedValue(true);
    global.navigator.canShare = vi.fn().mockReturnValue(true);

    const mockRecap = { sessionsCount: 3, totalVolume: 1000, xpEarned: 100, streak: 5, prsBrokenCount: 0, motivationalLine: '' };
    render(<WeeklyRecapScreen isOpen={true} recap={mockRecap} weekId="2026-W23" markAsSeen={vi.fn()} onClose={vi.fn()} />);
    
    const shareBtn = screen.getByText(/Share Recap/i);
    fireEvent.click(shareBtn);
    
    await waitFor(() => {
      expect(html2canvas).toHaveBeenCalled();
      expect(global.navigator.share).toHaveBeenCalled();
    });
  });

  it('5. shareRecap() falls back to download link when navigator.share unavailable', async () => {
    global.navigator.share = undefined;
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');

    const mockRecap = { sessionsCount: 3, totalVolume: 1000, xpEarned: 100, streak: 5, prsBrokenCount: 0, motivationalLine: '' };
    render(<WeeklyRecapScreen isOpen={true} recap={mockRecap} weekId="2026-W23" markAsSeen={vi.fn()} onClose={vi.fn()} />);
    
    const shareBtn = screen.getByText(/Share Recap/i);
    fireEvent.click(shareBtn);
    
    await waitFor(() => {
      expect(html2canvas).toHaveBeenCalled();
      expect(appendSpy).toHaveBeenCalled();
      expect(removeSpy).toHaveBeenCalled();
    });
  });
});
