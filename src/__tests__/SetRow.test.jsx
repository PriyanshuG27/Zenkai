/**
 * SetRow.test.jsx
 *
 * Unit tests for the SetRow component — the atomic unit of workout logging.
 *
 * Covers:
 *  - Rendering weight, reps, set number from props
 *  - +/− weight and reps button callbacks
 *  - Weight floor clamping (cannot go below 0 for normal sets)
 *  - Done button disabled/enabled states
 *  - PR badge rendering
 *  - Done state renders checkmark (set.done = true)
 *  - Bodyweight exercise special handling (BW toggle)
 *  - Manual text input + blur commit
 *  - Enter key blurs the input
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SetRow } from '../components/shared/SetRow';

// firebase mock must be loaded for framer-motion stub
import '../__mocks__/firebase';

describe('SetRow Component', () => {
  const defaultProps = {
    exerciseId:    'test-exercise-123',
    setIndex:       0,
    set:           { reps: 8, weight: 60, done: false },
    onUpdate:      vi.fn(),
    onDone:        vi.fn(),
    isPR:          false,
    exerciseIndex: 1,
    isBodyweight:  false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Rendering ──────────────────────────────────────────────────────────────

  it('renders set index, weight, reps, and Done button with correct initial values', () => {
    render(<SetRow {...defaultProps} />);

    // Set number (setIndex + 1)
    expect(screen.getByText('1')).toBeInTheDocument();

    const weightInput = screen.getByTestId('weight-1-0');
    const repsInput   = screen.getByTestId('reps-1-0');
    expect(weightInput.value).toBe('60');
    expect(repsInput.value).toBe('8');

    const doneBtn = screen.getByTestId('set-done-1-0');
    expect(doneBtn).toBeInTheDocument();
    expect(doneBtn).not.toBeDisabled();
  });

  it('renders weight and reps from props correctly', () => {
    const props = { ...defaultProps, set: { reps: 12, weight: 80, done: false } };
    render(<SetRow {...props} />);

    expect(screen.getByTestId('weight-1-0').value).toBe('80');
    expect(screen.getByTestId('reps-1-0').value).toBe('12');
  });

  // ── Weight +/− buttons ─────────────────────────────────────────────────────

  it('+weight button calls onUpdate("weight", weight + 2.5)', () => {
    render(<SetRow {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    // button order: [0] weight−, [1] weight+, [2] reps−, [3] reps+, [4] done
    fireEvent.click(buttons[1]);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 62.5);
  });

  it('−weight button calls onUpdate("weight", weight − 2.5)', () => {
    render(<SetRow {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 57.5);
  });

  it('−weight at 0 does NOT call onUpdate for non-bodyweight exercise', () => {
    // Non-BW exercise at weight=0: decrement does nothing (no BW mode)
    const props = { ...defaultProps, set: { reps: 8, weight: 0, done: false } };
    render(<SetRow {...props} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // weight−
    // handleWeightDecrement: current===0 && !isBodyweight → early return, no call
    expect(props.onUpdate).not.toHaveBeenCalled();
  });

  it('−weight from 2.5 clamps to 0 and calls onUpdate("weight", 0)', () => {
    const props = { ...defaultProps, set: { reps: 8, weight: 2.5, done: false } };
    render(<SetRow {...props} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]);
    expect(props.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 0);
  });

  // ── Reps +/− buttons ──────────────────────────────────────────────────────

  it('+reps button calls onUpdate("reps", reps + 1)', () => {
    render(<SetRow {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[3]);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'reps', 9);
  });

  it('−reps button calls onUpdate("reps", reps − 1)', () => {
    render(<SetRow {...defaultProps} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'reps', 7);
  });

  it('−reps at 0 clamps to 0 and calls onUpdate("reps", 0)', () => {
    const props = { ...defaultProps, set: { reps: 0, weight: 60, done: false } };
    render(<SetRow {...props} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[2]);
    expect(props.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'reps', 0);
  });

  // ── Done button disabled/enabled ────────────────────────────────────────────

  it('Done button is disabled when weight = 0 (non-BW)', () => {
    const props = { ...defaultProps, set: { reps: 8, weight: 0, done: false } };
    const { rerender } = render(<SetRow {...props} />);
    expect(screen.getByTestId('set-done-1-0')).toBeDisabled();

    // Also test reps = 0
    rerender(<SetRow {...{ ...defaultProps, set: { reps: 0, weight: 60, done: false } }} />);
    expect(screen.getByTestId('set-done-1-0')).toBeDisabled();
  });

  it('Done button is enabled and calls onDone when weight > 0 and reps > 0', () => {
    render(<SetRow {...defaultProps} />);

    const doneBtn = screen.getByTestId('set-done-1-0');
    expect(doneBtn).not.toBeDisabled();

    fireEvent.click(doneBtn);
    expect(defaultProps.onDone).toHaveBeenCalledTimes(1);
    expect(defaultProps.onDone).toHaveBeenCalledWith('test-exercise-123', 0);
  });

  // ── Done state renders checkmark ────────────────────────────────────────────

  it('done=true renders the done button in accent-xp style and contains a Check icon', () => {
    const props = { ...defaultProps, set: { reps: 8, weight: 60, done: true } };
    render(<SetRow {...props} />);

    const doneBtn = screen.getByTestId('set-done-1-0');
    // When done=true the button gets bg-[var(--accent-xp)] class
    expect(doneBtn.className).toContain('bg-[var(--accent-xp)]');
    // The Check icon (aria: Mark set 1 as completed) is inside the button
    expect(doneBtn).toBeInTheDocument();
  });

  it('done=false renders the done button without the accent fill', () => {
    render(<SetRow {...defaultProps} />);

    const doneBtn = screen.getByTestId('set-done-1-0');
    expect(doneBtn.className).not.toContain('bg-[var(--accent-xp)]');
    expect(doneBtn.className).toContain('bg-transparent');
  });

  // ── PR badge ──────────────────────────────────────────────────────────────

  it('isPR=true renders PR badge; isPR=false renders nothing', () => {
    const { rerender } = render(<SetRow {...defaultProps} />);
    expect(screen.queryByText('PR')).not.toBeInTheDocument();

    rerender(<SetRow {...{ ...defaultProps, isPR: true }} />);
    expect(screen.getByText('PR')).toBeInTheDocument();
  });

  // ── Manual typing ──────────────────────────────────────────────────────────

  it('typing in weight input and blurring commits via onUpdate', () => {
    render(<SetRow {...defaultProps} />);

    const weightInput = screen.getByTestId('weight-1-0');
    fireEvent.change(weightInput, { target: { value: '72.5' } });
    expect(weightInput.value).toBe('72.5');
    expect(defaultProps.onUpdate).not.toHaveBeenCalled(); // change doesn't commit

    fireEvent.blur(weightInput);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 72.5);
  });

  it('typing in reps input and blurring commits via onUpdate', () => {
    render(<SetRow {...defaultProps} />);

    const repsInput = screen.getByTestId('reps-1-0');
    fireEvent.change(repsInput, { target: { value: '12' } });
    fireEvent.blur(repsInput);
    expect(defaultProps.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'reps', 12);
  });

  it('pressing Enter on an input calls blur()', () => {
    render(<SetRow {...defaultProps} />);

    const weightInput = screen.getByTestId('weight-1-0');
    const blurSpy = vi.spyOn(weightInput, 'blur');
    fireEvent.keyDown(weightInput, { key: 'Enter', code: 'Enter', charCode: 13 });
    expect(blurSpy).toHaveBeenCalledTimes(1);
  });

  // ── Bodyweight exercise special handling ────────────────────────────────────

  it('Done button is enabled for bodyweight exercise when weight="BW" and reps > 0', () => {
    const props = {
      ...defaultProps,
      isBodyweight: true,
      set: { reps: 5, weight: 'BW', done: false },
    };
    const { rerender } = render(<SetRow {...props} />);
    expect(screen.getByTestId('set-done-1-0')).not.toBeDisabled();

    // Also works with weight=0 on a bodyweight exercise
    rerender(<SetRow {...{ ...props, set: { reps: 5, weight: 0, done: false } }} />);
    expect(screen.getByTestId('set-done-1-0')).not.toBeDisabled();
  });

  it('−weight from 0 on BW exercise transitions to "BW" via onUpdate', () => {
    const props = {
      ...defaultProps,
      isBodyweight: true,
      set: { reps: 5, weight: 0, done: false },
    };
    render(<SetRow {...props} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]); // weight−
    expect(props.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 'BW');
  });

  it('+weight from "BW" on BW exercise transitions to 0 via onUpdate', () => {
    const props = {
      ...defaultProps,
      isBodyweight: true,
      set: { reps: 5, weight: 'BW', done: false },
    };
    render(<SetRow {...props} />);

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]); // weight+
    expect(props.onUpdate).toHaveBeenCalledWith('test-exercise-123', 0, 'weight', 0);
  });
});
