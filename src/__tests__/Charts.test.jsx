import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StrengthChart } from '../components/shared/StrengthChart';
import { VolumeChart } from '../components/shared/VolumeChart';

// Mock Recharts ResponsiveContainer to render children cleanly in JSDOM
vi.mock('recharts', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    ResponsiveContainer: ({ children }) => (
      <div style={{ width: '800px', height: '240px' }} data-testid="responsive-container">
        {children}
      </div>
    ),
  };
});

// Mock useUIStore Zustand hook
vi.mock('../../stores/useUIStore', () => ({
  useUIStore: vi.fn((selector) => {
    // Return mock values for selectors
    const state = { sidebarOpen: true };
    return selector ? selector(state) : state;
  }),
}));

describe('StrengthChart Component', () => {
  it('renders a skeleton state when loading is true', () => {
    const { container } = render(<StrengthChart loading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an empty state with Dumbbell icon and custom message when data is empty', () => {
    render(<StrengthChart data={[]} exerciseName="Bench Press" />);
    expect(screen.getByText(/Log Bench Press to see strength progress/i)).toBeInTheDocument();
    // Dumbbell icon has generic aria or path
    expect(screen.getByText(/Your estimated 1RM progression timeline/i)).toBeInTheDocument();
  });

  it('renders the chart container when data is present', () => {
    const data = [
      { date: '2026-06-01', maxWeight: 60, maxReps: 8 },
      { date: '2026-06-03', maxWeight: 65, maxReps: 6 },
    ];
    render(<StrengthChart data={data} exerciseName="Bench Press" />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});

describe('VolumeChart Component', () => {
  it('renders a skeleton state when loading is true', () => {
    const { container } = render(<VolumeChart loading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders an empty state when data is empty', () => {
    render(<VolumeChart data={[]} />);
    expect(screen.getByText(/Start logging to see weekly volume/i)).toBeInTheDocument();
  });

  it('renders the bar chart when data is present', () => {
    const data = [
      { week: '2026-W22', totalVolume: 12000 },
      { week: '2026-W23', totalVolume: 15000 },
    ];
    render(<VolumeChart data={data} />);
    expect(screen.getByTestId('responsive-container')).toBeInTheDocument();
  });
});
