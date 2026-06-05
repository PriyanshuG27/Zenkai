/**
 * useDeviceLayout.js
 * Detects viewport width and returns 'mobile' | 'desktop'.
 *
 * Rules:
 * - Below 768px  → 'mobile'
 * - 768px+       → 'desktop'
 * - Debounced 100ms so resize events (100+/sec) don't thrash React state
 * - Cleans up both listener and pending timeout on unmount
 */

import { useState, useEffect } from 'react';

const BREAKPOINT = 768; // px — same as Tailwind's `md`

function getLayout() {
  return window.innerWidth >= BREAKPOINT ? 'desktop' : 'mobile';
}

export function useDeviceLayout() {
  const [layout, setLayout] = useState(
    typeof window !== 'undefined' ? getLayout() : 'mobile'
  );

  useEffect(() => {
    let timeoutId;

    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setLayout(getLayout());
      }, 100); // 100ms debounce — prevents excessive re-renders
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId); // cancel any pending debounce on unmount
    };
  }, []); // empty deps — register once, never re-register

  return layout; // 'mobile' | 'desktop'
}
