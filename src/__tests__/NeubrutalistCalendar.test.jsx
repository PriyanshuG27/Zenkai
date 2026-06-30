import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { mockDeleteDoc, mockGetDocs } from '../__mocks__/firebase';
import { NeubrutalistCalendar } from '../components/shared/NeubrutalistCalendar';
import { useAuthStore } from '../stores/useAuthStore';

// Helper to wrap component in router
function RouterWrapper({ children }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('NeubrutalistCalendar Component', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    mockGetDocs.mockResolvedValue({
      empty: true,
      docs: [],
    });
    useAuthStore.setState({
      user: { uid: 'user123' },
      uid: 'user123',
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders correctly with default props', () => {
    render(
      <RouterWrapper>
        <NeubrutalistCalendar />
      </RouterWrapper>
    );

    // Should render weekdays
    expect(screen.getByText('Mon')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('filters out invalid and deleted sessions', () => {
    const sessions = [
      { id: 'sess1', date: new Date('2026-06-01'), name: 'Leg Day', source: 'mobile' },
      { id: null, date: new Date('2026-06-02'), name: 'No ID' }, // invalid
      { id: 'sess2', date: 'invalid-date', name: 'Bad Date' }, // invalid date
    ];

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} />
      </RouterWrapper>
    );

    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  it('navigates to next and previous months', () => {
    render(
      <RouterWrapper>
        <NeubrutalistCalendar />
      </RouterWrapper>
    );

    const prevButton = screen.getAllByRole('button')[0]; // ChevronLeft
    const nextButton = screen.getAllByRole('button')[1]; // ChevronRight

    fireEvent.click(nextButton);
    fireEvent.click(prevButton);

    expect(screen.getByText('Mon')).toBeInTheDocument();
  });

  it('handles cell clicks and displays details panel', async () => {
    const sessions = [
      {
        id: 'sess1',
        date: new Date('2026-06-15'),
        name: 'Bench Press Workout',
        source: 'desktop',
        totalVolume: 5000,
        rpeScore: 8,
        mmcScore: 9,
        exercises: [{ name: 'Bench Press', sets: [1, 2, 3] }],
      },
    ];

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} isMobile={false} />
      </RouterWrapper>
    );

    const day15Button = screen.getByRole('button', { name: /^15/ });
    expect(day15Button).toBeInTheDocument();

    fireEvent.click(day15Button);

    // Details panel should be open
    expect(screen.getByText(/Logged Workouts: 15/i)).toBeInTheDocument();
    expect(screen.getByText('Workout #1')).toBeInTheDocument();
    expect(screen.getByText('Vol: 5000kg')).toBeInTheDocument();
    expect(screen.getByText('RPE: 8/10')).toBeInTheDocument();
    expect(screen.getByText('MMC: 9/10')).toBeInTheDocument();
    expect(screen.getByText(/Bench Press/i)).toBeInTheDocument();

    // Close panel
    const closeButton = screen.getByRole('button', { name: /Close/i });
    fireEvent.click(closeButton);
    expect(screen.queryByText(/Logged Workouts: 15/i)).not.toBeInTheDocument();
  });

  it('supports repeating a workout when onSelectSession is provided', () => {
    const mockOnSelect = vi.fn();
    const sessions = [
      {
        id: 'sess1',
        date: new Date('2026-06-15'),
        name: 'Legs',
        source: 'mobile',
        exercises: [],
      },
    ];

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} onSelectSession={mockOnSelect} isMobile={true} />
      </RouterWrapper>
    );

    const day15Button = screen.getByRole('button', { name: /^15/ });
    fireEvent.click(day15Button);

    const repeatButton = screen.getByRole('button', { name: /Repeat Workout/i });
    fireEvent.click(repeatButton);

    expect(mockOnSelect).toHaveBeenCalledWith(sessions[0]);
  });

  it('navigates to recap screen when Recap Workout is clicked on desktop', () => {
    const sessions = [
      {
        id: 'sess1',
        date: new Date('2026-06-15'),
        name: 'Chest',
        source: 'desktop',
        exercises: [],
      },
    ];

    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={<NeubrutalistCalendar sessions={sessions} isMobile={false} />}
          />
          <Route
            path="/recap"
            element={<div data-testid="recap-page">Recap Page</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    const day15Button = screen.getByRole('button', { name: /^15/ });
    fireEvent.click(day15Button);

    const recapButton = screen.getByRole('button', { name: /Recap Workout/i });
    fireEvent.click(recapButton);

    expect(screen.getByTestId('recap-page')).toBeInTheDocument();
  });

  it('handles delete flow cancellation and confirmation', async () => {
    const sessions = [
      {
        id: 'sess_del',
        date: new Date('2026-06-15'),
        name: 'Delete Me',
        source: 'mobile',
        exercises: [],
      },
    ];

    mockDeleteDoc.mockResolvedValueOnce(undefined);

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} isMobile={true} />
      </RouterWrapper>
    );

    const day15Button = screen.getByRole('button', { name: /^15/ });
    fireEvent.click(day15Button);

    const deleteIconBtn = screen.getByTitle('Delete workout');
    fireEvent.click(deleteIconBtn);

    // Confirm dialog should open
    expect(screen.getByText('Delete Workout?')).toBeInTheDocument();

    // Cancel deletion
    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText('Delete Workout?')).not.toBeInTheDocument();

    // Re-trigger delete and confirm
    fireEvent.click(screen.getByTitle('Delete workout'));
    const confirmBtn = screen.getByRole('button', { name: /Yes, Delete/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1);
    });
  });

  it('handles delete failure gracefully', async () => {
    const sessions = [
      {
        id: 'sess_fail',
        date: new Date('2026-06-15'),
        name: 'Fail Del',
        source: 'desktop',
        exercises: [],
      },
    ];

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockDeleteDoc.mockRejectedValueOnce(new Error('Delete Denied'));

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} isMobile={false} />
      </RouterWrapper>
    );

    const day15Button = screen.getByRole('button', { name: /^15/ });
    fireEvent.click(day15Button);

    fireEvent.click(screen.getByTitle('Delete workout'));
    fireEvent.click(screen.getByRole('button', { name: /Yes, Delete/i }));

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledWith('Failed to delete workout session.');
    });

    consoleSpy.mockRestore();
    alertSpy.mockRestore();
  });

  it('closes details panel or does nothing when clicking empty or filler cells', () => {
    const sessions = [
      {
        id: 'sess1',
        date: new Date('2026-06-15'),
        name: 'Bench Press Workout',
        source: 'desktop',
        exercises: [],
      },
    ];

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} />
      </RouterWrapper>
    );

    // Click day 15 to open
    fireEvent.click(screen.getByRole('button', { name: /^15/ }));
    expect(screen.getByText(/Logged Workouts: 15/i)).toBeInTheDocument();

    // Click day 16 (empty cell) to close
    fireEvent.click(screen.getByRole('button', { name: /^16/ }));
    expect(screen.queryByText(/Logged Workouts: 15/i)).not.toBeInTheDocument();
  });

  it('handles months starting on Sunday', () => {
    const mockDate = new Date(2026, 2, 1); // March 2026 starts on Sunday
    const originalDate = global.Date;
    global.Date = class extends originalDate {
      constructor(...args) {
        if (args.length === 0) return mockDate;
        return new originalDate(...args);
      }
      static now() {
        return mockDate.getTime();
      }
    };

    render(
      <RouterWrapper>
        <NeubrutalistCalendar />
      </RouterWrapper>
    );

    expect(screen.getByText(/March 2026/i)).toBeInTheDocument();
    global.Date = originalDate;
  });

  it('renders today cell with workout styling when not selected', () => {
    const today = new Date();
    const sessions = [
      { id: 'sess_today', date: today, name: 'Today Workout', exercises: [] }
    ];
    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} />
      </RouterWrapper>
    );

    const todayButton = screen.getByRole('button', { name: new RegExp('^' + today.getDate() + '$') });
    expect(todayButton).toBeInTheDocument();
  });

  it('renders exercise summary when sets is undefined/null', () => {
    const sessions = [
      {
        id: 'sess1',
        date: new Date('2026-06-15'),
        name: 'Bench Press Workout',
        exercises: [{ name: 'Bench Press', sets: null }],
      },
    ];

    render(
      <RouterWrapper>
        <NeubrutalistCalendar sessions={sessions} />
      </RouterWrapper>
    );

    fireEvent.click(screen.getByRole('button', { name: /^15/ }));
    expect(screen.getByText(/0 sets/i)).toBeInTheDocument();
  });
});
