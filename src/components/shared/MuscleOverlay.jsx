import React from 'react';
import mannequinFront from '../../assets/mannequin_front.webp';
import mannequinBack from '../../assets/mannequin_back.webp';

const VIEW_BOX = "0 0 240 420";

/**
 * MusclePath — organic HUD scan aesthetic.
 */
export const MusclePath = React.memo(({ id, d, color, isActive, onClick, onMouseEnter, onMouseLeave }) => (
  <g>
    {isActive && (
      <path d={d} fill={color} fillOpacity={0.15}
        stroke={color} strokeWidth="12" strokeLinecap="round" strokeLinejoin="round"
        className="pointer-events-none" style={{ filter: 'blur(8px)' }} />
    )}
    {isActive && (
      <path d={d} fill="none" stroke="#00f0ff" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3,2"
        className="pointer-events-none"
        style={{ filter: 'drop-shadow(0 0 3px #00f0ff)' }} />
    )}
    <path
      id={`muscle-${id}`}
      data-testid={`muscle-${id}`}
      d={d}
      fill={color}
      fillOpacity={isActive ? 0.52 : 0.26}
      stroke={isActive ? '#00f0ff' : color}
      strokeWidth={isActive ? 1.5 : 0.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="transition-all duration-300 cursor-pointer"
      style={{ filter: isActive ? `drop-shadow(0 0 5px ${color})` : `drop-shadow(0 0 2px ${color}66)` }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    />
  </g>
));
MusclePath.displayName = 'MusclePath';

/* ═══════════════════════════════════════════════════════════════════════════════
   FRONT BODY OVERLAY
   SVG viewBox "0 0 240 420". Image at x=-90 width=420 (overflow visible).

   ZONE MAP (no overlaps):
     CHEST     x=84–156  y=88–130
     DELT      flat cap on shoulder, y=84–108
     BIC       upper arm delt→elbow, y=106–152
     FORE      lower arm elbow→wrist, y=152–188
     ABS       center column y=128–178
     OBL       flanks y=120–178
     QUADS     y=200–272
     SHIN/CALF y=275–376
════════════════════════════════════════════════════════════════════════════════ */
export const FrontBodyOverlay = ({
  fatigueData, strengthData, mode, activeMuscle,
  onMuscleClick, onMuscleHover, viewType = 'grouped'
}) => {
  const getColor = (key) => {
    if (mode === 'fatigue') {
      const v = (viewType === 'grouped' ? fatigueData.general?.[key] : fatigueData.individual?.[key]) || 0;
      if (v > 100) return '#EF4444';
      if (v >= 30) return '#F59E0B';
      return '#22C55E';
    }
    const s = (viewType === 'grouped' ? strengthData.general?.[key] : strengthData.individual?.[key]) || 0;
    if (s >= 90) return '#FFD700';
    if (s >= 75) return '#B44FE8';
    if (s >= 60) return '#4F8EF7';
    if (s >= 40) return '#22C55E';
    return '#888888';
  };

  const paths = {
    // ── Pectorals ─────────────────────────────────────────────────────────────
    chest_left:
      'M120,90 C112,89 100,88 90,92 C86,97 84,108 84,120 C86,126 100,130 120,128 Z',
    chest_right:
      'M120,90 C128,89 140,88 150,92 C154,97 156,108 156,120 C154,126 140,130 120,128 Z',

    // ── Front Delts — flat cap sitting ON shoulder ─────────────────────────────
    front_delts_left:
      'M80,92 C78,86 68,84 58,86 C48,90 46,96 50,102 C54,108 64,108 72,106 C78,100 82,96 80,92 Z',
    front_delts_right:
      'M160,92 C162,86 172,84 182,86 C192,90 194,96 190,102 C186,108 176,108 168,106 C162,100 158,96 160,92 Z',

    // ── Biceps — upper arm only (delt bottom → elbow, shortened) ──────────────
    biceps_left:
      'M56,106 C48,114 38,126 28,136 C22,142 20,146 20,148 ' +
      'C24,152 28,150 32,146 ' +
      'C40,138 50,124 56,116 C60,110 64,108 64,108 ' +
      'C62,104 58,104 56,106 Z',
    biceps_right:
      'M184,106 C192,114 202,126 212,136 C218,142 220,146 220,148 ' +
      'C216,152 212,150 208,146 ' +
      'C200,138 190,124 184,116 C180,110 176,108 176,108 ' +
      'C178,104 182,104 184,106 Z',

    // ── Forearms — from elbow following arm diagonal ──────────────────────────
    forearm_left:
      'M24,154 C18,162 8,174 -2,184 C-6,188 -8,188 -10,186 ' +
      'C-10,182 -4,174 4,164 C12,156 20,152 22,152 ' +
      'C24,154 26,154 24,154 Z',
    forearm_right:
      'M216,154 C222,162 232,174 242,184 C246,188 248,188 250,186 ' +
      'C250,182 244,174 236,164 C228,156 220,152 218,152 ' +
      'C216,154 214,154 216,154 Z',

    // ── Abdominals ────────────────────────────────────────────────────────────
    abs:
      'M110,128 C114,130 126,130 130,128 C131,143 131,160 130,178 ' +
      'C126,180 114,180 110,178 C109,160 109,143 110,128 Z',

    // ── Obliques ──────────────────────────────────────────────────────────────
    obliques_left:
      'M86,120 C88,130 94,140 100,152 C104,162 106,172 106,178 ' +
      'C98,180 90,178 85,172 C82,162 82,144 84,132 Z',
    obliques_right:
      'M154,120 C152,130 146,140 140,152 C136,162 134,172 134,178 ' +
      'C142,180 150,178 155,172 C158,162 158,144 156,132 Z',

    // ── Quadriceps ────────────────────────────────────────────────────────────
    quads_left:
      'M88,200 C94,203 106,205 116,206 C117,226 116,248 112,272 ' +
      'C108,274 102,274 98,272 C94,248 88,226 88,200 Z',
    quads_right:
      'M152,200 C146,203 134,205 124,206 C123,226 124,248 128,272 ' +
      'C132,274 138,274 142,272 C146,248 152,226 152,200 Z',

    // ── Tibialis Anterior (shin) ──────────────────────────────────────────────
    tibialis_left:
      'M99,275 C103,277 107,278 109,278 C110,305 110,338 108,368 ' +
      'C106,370 102,370 100,368 C99,338 98,305 99,275 Z',
    tibialis_right:
      'M141,275 C137,277 133,278 131,278 C130,305 130,338 132,368 ' +
      'C134,370 138,370 140,368 C141,338 142,305 141,275 Z',

    // ── Gastrocnemius front-visible ────────────────────────────────────────────
    calves_left_front:
      'M99,275 C95,282 90,296 88,312 C86,330 88,356 92,376 ' +
      'C95,378 99,378 100,376 C99,356 98,330 99,312 C100,296 100,282 99,275 Z',
    calves_right_front:
      'M141,275 C145,282 150,296 152,312 C154,330 152,356 148,376 ' +
      'C145,378 141,378 140,376 C141,356 141,330 141,312 C140,296 140,282 141,275 Z',
  };

  const keyMapping = {
    chest_left: 'chest', chest_right: 'chest',
    front_delts_left: 'shoulders', front_delts_right: 'shoulders',
    biceps_left: 'arms', biceps_right: 'arms',
    forearm_left: 'arms', forearm_right: 'arms',
    abs: 'core', obliques_left: 'core', obliques_right: 'core',
    quads_left: 'legs', quads_right: 'legs',
    tibialis_left: 'legs', tibialis_right: 'legs',
    calves_left_front: 'legs', calves_right_front: 'legs',
  };
  const individualMapping = {
    chest_left: 'chest', chest_right: 'chest',
    front_delts_left: 'shoulders', front_delts_right: 'shoulders',
    biceps_left: 'biceps', biceps_right: 'biceps',
    forearm_left: 'forearms', forearm_right: 'forearms',
    abs: 'abs', obliques_left: 'obliques', obliques_right: 'obliques',
    quads_left: 'quads', quads_right: 'quads',
    tibialis_left: 'calves', tibialis_right: 'calves',
    calves_left_front: 'calves', calves_right_front: 'calves',
  };

  return (
    <svg viewBox={VIEW_BOX} className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <pattern id="hd-dots-f" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.38" fill="rgba(0,240,255,0.12)" />
        </pattern>
        <pattern id="scanline-f" width="240" height="3" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="240" y2="0" stroke="rgba(0,240,255,0.035)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hd-dots-f)" />
      <rect width="100%" height="100%" fill="url(#scanline-f)" />
      <image href={mannequinFront} x="-90" y="0" width="420" height="420"
        style={{ opacity: 0.72, mixBlendMode: 'screen' }} />
      <g>
        {Object.entries(paths).map(([mid, d]) => {
          const key = viewType === 'grouped' ? keyMapping[mid] : individualMapping[mid];
          return (
            <MusclePath key={mid} id={mid} d={d} color={getColor(key)}
              isActive={activeMuscle === key}
              onClick={() => onMuscleClick(key)}
              onMouseEnter={() => onMuscleHover({ key, active: true })}
              onMouseLeave={() => onMuscleHover({ key: null, active: false })} />
          );
        })}
      </g>
    </svg>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════════
   BACK BODY OVERLAY
════════════════════════════════════════════════════════════════════════════════ */
export const BackBodyOverlay = ({
  fatigueData, strengthData, mode, activeMuscle,
  onMuscleClick, onMuscleHover, viewType = 'grouped'
}) => {
  const getColor = (key) => {
    if (mode === 'fatigue') {
      const v = (viewType === 'grouped' ? fatigueData.general?.[key] : fatigueData.individual?.[key]) || 0;
      if (v > 100) return '#EF4444';
      if (v >= 30) return '#F59E0B';
      return '#22C55E';
    }
    const s = (viewType === 'grouped' ? strengthData.general?.[key] : strengthData.individual?.[key]) || 0;
    if (s >= 90) return '#FFD700';
    if (s >= 75) return '#B44FE8';
    if (s >= 60) return '#4F8EF7';
    if (s >= 40) return '#22C55E';
    return '#888888';
  };

  const paths = {
    // ── Trapezius ─────────────────────────────────────────────────────────────
    traps:
      'M120,70 C113,74 102,80 93,88 C97,94 106,106 116,118 C118,124 120,132 120,132 ' +
      'C120,132 122,124 124,118 C134,106 143,94 147,88 C138,80 127,74 120,70 Z',

    // ── Lats — stop at WAIST y=174 ────────────────────────────────────────────
    lats_left:
      'M90,96 C87,108 85,122 84,138 C83,152 85,165 90,174 ' +
      'C96,176 106,176 116,174 C116,158 115,142 113,126 C110,114 102,104 90,96 Z',
    lats_right:
      'M150,96 C153,108 155,122 156,138 C157,152 155,165 150,174 ' +
      'C144,176 134,176 124,174 C124,158 125,142 127,126 C130,114 138,104 150,96 Z',

    // ── Rear Delts — flat cap (same as front delts) ───────────────────────────
    rear_delts_left:
      'M80,92 C78,86 68,84 58,86 C48,90 46,96 50,102 C54,108 64,108 72,106 C78,100 82,96 80,92 Z',
    rear_delts_right:
      'M160,92 C162,86 172,84 182,86 C192,90 194,96 190,102 C186,108 176,108 168,106 C162,100 158,96 160,92 Z',

    // ── Triceps — upper arm, shortened + slight down-right tilt ───────────────
    triceps_left:
      'M56,108 C48,116 38,128 28,138 C22,144 20,148 20,150 ' +
      'C24,154 28,152 32,148 ' +
      'C40,140 50,126 56,118 C60,112 64,110 64,110 ' +
      'C62,106 58,106 56,108 Z',
    triceps_right:
      'M184,108 C192,116 202,128 212,138 C218,144 220,148 220,150 ' +
      'C216,154 212,152 208,148 ' +
      'C200,140 190,126 184,118 C180,112 176,110 176,110 ' +
      'C178,106 182,106 184,108 Z',

    // ── Lower Back ────────────────────────────────────────────────────────────
    lower_back:
      'M104,174 C110,176 114,176 120,176 C126,176 130,176 136,174 ' +
      'C136,184 135,192 134,200 C129,202 125,202 120,202 ' +
      'C115,202 111,202 106,200 C105,192 104,184 104,174 Z',

    // ── Glutes ────────────────────────────────────────────────────────────────
    glutes_left:
      'M96,198 C103,197 111,196 120,196 C120,212 118,228 114,240 ' +
      'C108,243 100,242 94,238 C90,228 90,214 96,198 Z',
    glutes_right:
      'M144,198 C137,197 129,196 120,196 C120,212 122,228 126,240 ' +
      'C132,243 140,242 146,238 C150,228 150,214 144,198 Z',

    // ── Hamstrings ────────────────────────────────────────────────────────────
    hamstrings_left:
      'M94,240 C100,239 108,238 118,237 C117,258 115,280 112,302 ' +
      'C107,304 101,304 97,302 C93,280 92,258 94,240 Z',
    hamstrings_right:
      'M146,240 C140,239 132,238 122,237 C123,258 125,280 128,302 ' +
      'C133,304 139,304 143,302 C147,280 148,258 146,240 Z',

    // ── Calves back ───────────────────────────────────────────────────────────
    calves_left_back:
      'M97,304 C101,304 107,304 112,302 C115,324 115,350 112,376 ' +
      'C108,378 104,378 100,376 C96,350 95,324 97,304 Z',
    calves_right_back:
      'M143,304 C139,304 133,304 128,302 C125,324 125,350 128,376 ' +
      'C132,378 136,378 140,376 C144,350 145,324 143,304 Z',
  };

  const keyMapping = {
    traps: 'back', lats_left: 'back', lats_right: 'back',
    rear_delts_left: 'shoulders', rear_delts_right: 'shoulders',
    triceps_left: 'arms', triceps_right: 'arms',
    lower_back: 'back',
    glutes_left: 'legs', glutes_right: 'legs',
    hamstrings_left: 'legs', hamstrings_right: 'legs',
    calves_left_back: 'legs', calves_right_back: 'legs',
  };
  const individualMapping = {
    traps: 'traps', lats_left: 'lats', lats_right: 'lats',
    rear_delts_left: 'shoulders', rear_delts_right: 'shoulders',
    triceps_left: 'triceps', triceps_right: 'triceps',
    lower_back: 'lower_back',
    glutes_left: 'glutes', glutes_right: 'glutes',
    hamstrings_left: 'hamstrings', hamstrings_right: 'hamstrings',
    calves_left_back: 'calves', calves_right_back: 'calves',
  };

  return (
    <svg viewBox={VIEW_BOX} className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <pattern id="hd-dots-b" width="8" height="8" patternUnits="userSpaceOnUse">
          <circle cx="1.5" cy="1.5" r="0.38" fill="rgba(0,240,255,0.12)" />
        </pattern>
        <pattern id="scanline-b" width="240" height="3" patternUnits="userSpaceOnUse">
          <line x1="0" y1="0" x2="240" y2="0" stroke="rgba(0,240,255,0.035)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#hd-dots-b)" />
      <rect width="100%" height="100%" fill="url(#scanline-b)" />
      <image href={mannequinBack} x="-90" y="0" width="420" height="420"
        style={{ opacity: 0.72, mixBlendMode: 'screen' }} />
      <g>
        {Object.entries(paths).map(([mid, d]) => {
          const key = viewType === 'grouped' ? keyMapping[mid] : individualMapping[mid];
          return (
            <MusclePath key={mid} id={mid} d={d} color={getColor(key)}
              isActive={activeMuscle === key}
              onClick={() => onMuscleClick(key)}
              onMouseEnter={() => onMuscleHover({ key, active: true })}
              onMouseLeave={() => onMuscleHover({ key: null, active: false })} />
          );
        })}
      </g>
    </svg>
  );
};
