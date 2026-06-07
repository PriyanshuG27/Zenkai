/**
 * ExerciseSearch.jsx
 *
 * Shared component — used in MobileLogger (full-screen) and DesktopLoggerPanel (slide-in).
 *
 * Props:
 *   onSelect  (exercise: Exercise) => void
 *             Called when the user selects an exercise from the results list.
 *             The parent (logger) is responsible for calling the Zustand
 *             addExercise action or equivalent with this exercise object.
 *
 * Data sources:
 *   - useAuthStore().profile  — provides equipmentList and medicalFlags (set during onboarding)
 *   - useExerciseSearch()     — pure filter hook, no Firestore reads
 *
 * Keyboard navigation:
 *   ArrowDown / ArrowUp  → move highlighted index through results list
 *   Enter                → select highlighted result (or first result if none highlighted)
 *   Escape               → close dropdown, clear query
 *
 * Accessibility:
 *   role="combobox" on input with aria-expanded, aria-activedescendant
 *   role="listbox" on the results list
 *   role="option" on each result row
 *   data-testid="exercise-search" on input
 *   data-testid="exercise-result-{key}" on each result row
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, X, Dumbbell } from 'lucide-react';
import { useExerciseSearch } from '../../hooks/useExerciseSearch';
import { useAuthStore } from '../../stores/useAuthStore';

// Muscle group label colours — maps to CSS variables
const MUSCLE_GROUP_COLORS = {
  chest:     'var(--primary)',
  back:      'var(--secondary)',
  shoulders: '#a78bfa',        // violet — distinct from orange/cyan
  arms:      'var(--accent-xp)',
  legs:      '#f97316',        // amber-orange for legs
  core:      '#ec4899',        // pink for core
};

const MUSCLE_GROUP_LABELS = {
  chest:     'Chest',
  back:      'Back',
  shoulders: 'Shoulders',
  arms:      'Arms',
  legs:      'Legs',
  core:      'Core',
};

/**
 * ExerciseSearch
 *
 * @param {{ onSelect: (exercise: object) => void }} props
 */
export function ExerciseSearch({ onSelect, label = 'Add Exercise', dropUp = false }) {
  const { profile } = useAuthStore();

  const equipmentList = profile?.equipmentList ?? [];
  const medicalFlags  = profile?.medicalFlags  ?? [];

  const [query, setQuery]             = useState('');
  const [isOpen, setIsOpen]           = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(-1);

  const { results, isSearching } = useExerciseSearch({ equipmentList, medicalFlags, query });

  const inputRef      = useRef(null);
  const listRef       = useRef(null);
  const containerRef  = useRef(null);

  // Open dropdown whenever there is a query value
  useEffect(() => {
    setIsOpen(query.length > 0);
    setHighlightedIdx(-1);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setHighlightedIdx(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Scroll highlighted row into view
  useEffect(() => {
    if (highlightedIdx >= 0 && listRef.current) {
      const rows = listRef.current.querySelectorAll('[role="option"]');
      if (rows[highlightedIdx]) {
        rows[highlightedIdx].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIdx]);

  const handleSelect = useCallback(
    (exercise) => {
      onSelect(exercise);
      setQuery('');
      setIsOpen(false);
      setHighlightedIdx(-1);
      inputRef.current?.focus();
    },
    [onSelect]
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setIsOpen(false);
    setHighlightedIdx(-1);
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (!isOpen || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIdx((prev) => Math.min(prev + 1, results.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIdx((prev) => Math.max(prev - 1, -1));
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIdx >= 0 && results[highlightedIdx]) {
            handleSelect(results[highlightedIdx]);
          } else if (results.length > 0) {
            handleSelect(results[0]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          handleClear();
          break;
        default:
          break;
      }
    },
    [isOpen, results, highlightedIdx, handleSelect, handleClear]
  );

  const activeDescendant =
    highlightedIdx >= 0 && results[highlightedIdx]
      ? `exercise-option-${results[highlightedIdx].key}`
      : undefined;

  const showDropdown = isOpen && query.length > 0;

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%' }}
    >
      {label && (
        <h3
          style={{
            fontFamily:    'Barlow Condensed, sans-serif',
            fontSize:      '15px',
            fontWeight:    800,
            letterSpacing: '0.03em',
            textTransform: 'uppercase',
            color:         'var(--text-secondary)',
            marginBottom:  '10px',
            paddingLeft:   '2px',
          }}
        >
          {label}
        </h3>
      )}
      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          display:        'flex',
          alignItems:     'center',
          gap:            '10px',
          background:     'var(--bg-input)',
          borderTop:      `1px solid ${showDropdown ? 'var(--primary)' : 'var(--border)'}`,
          borderLeft:     `1px solid ${showDropdown ? 'var(--primary)' : 'var(--border)'}`,
          borderRight:    `1px solid ${showDropdown ? 'var(--primary)' : 'var(--border)'}`,
          borderBottom:   (showDropdown && !dropUp) ? 'none' : `1px solid ${showDropdown ? 'var(--primary)' : 'var(--border)'}`,
          borderRadius:   showDropdown ? (dropUp ? '8px' : '8px 8px 0 0') : '8px',
          padding:        '0 14px',
          height:         '48px',
          transition:     'border-color 150ms ease',
          boxShadow:      showDropdown ? '0 0 0 2px var(--primary-glow)' : 'none',
        }}
      >
        <Search
          size={16}
          style={{
            color:     isSearching ? 'var(--primary)' : 'var(--text-secondary)',
            flexShrink: 0,
            transition: 'color 150ms ease',
          }}
        />
        <input
          ref={inputRef}
          data-testid="exercise-search"
          id="exercise-search-input"
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          aria-controls={showDropdown ? 'exercise-results-list' : undefined}
          aria-activedescendant={activeDescendant}
          placeholder="Search exercise…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex:        1,
            background:  'transparent',
            border:      'none',
            outline:     'none',
            color:       'var(--text-primary)',
            fontFamily:  'Outfit, sans-serif',
            fontSize:    '15px',
            fontWeight:  500,
            minWidth:    0,
          }}
        />
        {query.length > 0 && (
          <button
            aria-label="Clear search"
            onClick={handleClear}
            style={{
              background:  'transparent',
              border:      'none',
              cursor:      'pointer',
              padding:     '4px',
              display:     'flex',
              alignItems:  'center',
              color:       'var(--text-secondary)',
              flexShrink:  0,
            }}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* ── Dropdown ──────────────────────────────────────────────────────── */}
      {showDropdown && (
        <ul
          id="exercise-results-list"
          ref={listRef}
          role="listbox"
          aria-label="Exercise results"
          style={{
            position:        'absolute',
            top:             dropUp ? 'auto' : '100%',
            bottom:          dropUp ? 'calc(100% + 8px)' : 'auto',
            left:            0,
            right:           0,
            zIndex:          50,
            background:      'var(--bg-elevated)',
            border:          '1px solid var(--primary)',
            borderRadius:    dropUp ? '8px' : '0 0 8px 8px',
            maxHeight:       '264px',      // ~5.5 rows visible
            overflowY:       'auto',
            margin:          0,
            padding:         0,
            listStyle:       'none',
            boxShadow:       dropUp ? '0 -8px 24px rgba(0,0,0,0.6)' : '0 8px 24px rgba(0,0,0,0.6)',
          }}
        >
          {results.length === 0 && !isSearching && (
            <li
              style={{
                padding:     '16px',
                color:       'var(--text-secondary)',
                fontFamily:  'Outfit, sans-serif',
                fontSize:    '14px',
                textAlign:   'center',
              }}
            >
              No exercises found
            </li>
          )}

          {results.map((exercise, idx) => {
            const isHighlighted = idx === highlightedIdx;
            const tagColor = MUSCLE_GROUP_COLORS[exercise.muscleGroup] ?? 'var(--text-secondary)';

            return (
              <ExerciseResultItem
                key={exercise.key}
                exercise={exercise}
                idx={idx}
                isHighlighted={isHighlighted}
                tagColor={tagColor}
                handleSelect={handleSelect}
                setHighlightedIdx={setHighlightedIdx}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ExerciseResultItem = React.memo(({ exercise, idx, isHighlighted, tagColor, handleSelect, setHighlightedIdx }) => {
  return (
    <li
      id={`exercise-option-${exercise.key}`}
      role="option"
      aria-selected={isHighlighted}
      data-testid={`exercise-result-${exercise.key}`}
      onMouseDown={(e) => {
        // mousedown fires before blur — prevent input losing focus before select
        e.preventDefault();
        handleSelect(exercise);
      }}
      onMouseEnter={() => setHighlightedIdx(idx)}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            '12px',
        padding:        '10px 14px',
        cursor:         'pointer',
        background:     isHighlighted ? 'var(--border-bright)' : 'transparent',
        borderBottom:   '1px solid var(--border)',
        transition:     'background 80ms ease',
        minHeight:      '48px',
      }}
    >
      {/* Icon */}
      <Dumbbell
        size={15}
        style={{ color: tagColor, flexShrink: 0 }}
      />

      {/* Name */}
      <span
        style={{
          flex:        1,
          fontFamily:  'Outfit, sans-serif',
          fontSize:    '14px',
          fontWeight:  isHighlighted ? 600 : 500,
          color:       'var(--text-primary)',
          whiteSpace:  'nowrap',
          overflow:    'hidden',
          textOverflow:'ellipsis',
        }}
      >
        {exercise.name}
      </span>

      {/* Muscle group tag */}
      <span
        style={{
          fontFamily:    'Outfit, sans-serif',
          fontSize:      '11px',
          fontWeight:    600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color:         tagColor,
          background:    `${tagColor}18`,   // ~10% opacity fill
          border:        `1px solid ${tagColor}40`,
          borderRadius:  '4px',
          padding:       '2px 7px',
          flexShrink:    0,
        }}
      >
        {MUSCLE_GROUP_LABELS[exercise.muscleGroup] ?? exercise.muscleGroup}
      </span>
    </li>
  );
});
ExerciseResultItem.displayName = 'ExerciseResultItem';
