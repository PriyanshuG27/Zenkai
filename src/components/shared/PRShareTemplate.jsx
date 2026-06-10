import React from 'react';
import exerciseBank from '../../data/exercises.json';
import strengthStandards from '../../data/strength_standards.json';

// Helper to determine the primary target muscle for an exercise name
export const getMuscleGroupForExercise = (exerciseName) => {
  if (!exerciseName) return 'CHEST';
  const nameLower = exerciseName.toLowerCase().replace(/_/g, ' ');
  const match = exerciseBank.find(ex => 
    ex.name.toLowerCase() === nameLower || 
    ex.key.toLowerCase() === nameLower ||
    ex.aliases?.some(alias => alias.toLowerCase() === nameLower)
  );
  return match ? match.muscleGroup.toUpperCase() : 'CHEST';
};

// Asynchronous strength standards resolver using pre-generated local JSON database
export const fetchStrengthStandards = async (exerciseName, oneRepMax, bodyweight, gender) => {
  const bw = bodyweight || 80;
  const genderKey = (gender || 'male').toLowerCase();
  const exerciseKey = exerciseName.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const ratio = oneRepMax / bw;
  const bwMultiplier = `${ratio.toFixed(2)}x`;

  let multipliers = null;

  // 1. Try instant local lookup from pre-generated JSON database
  const entry = strengthStandards[exerciseKey];
  if (entry) {
    multipliers = entry[genderKey] || entry['male'];
  }

  // 2. Fall back to rule-based local classifier if exercise is not in the JSON database
  if (!multipliers) {
    let standards = {
      bench: [0.50, 0.75, 1.00, 1.30, 1.60],
      squat: [0.60, 0.90, 1.25, 1.65, 2.10],
      deadlift: [0.70, 1.05, 1.45, 1.95, 2.40],
      ohp: [0.35, 0.50, 0.65, 0.85, 1.10],
      generic: [0.25, 0.40, 0.60, 0.85, 1.10]
    };

    if (genderKey === 'female') {
      const upperFactor = 0.65;
      const lowerFactor = 0.80;
      standards.bench = standards.bench.map(s => s * upperFactor);
      standards.ohp = standards.ohp.map(s => s * upperFactor);
      standards.squat = standards.squat.map(s => s * lowerFactor);
      standards.deadlift = standards.deadlift.map(s => s * lowerFactor);
      standards.generic = standards.generic.map(s => s * upperFactor);
    }

    const nameLower = exerciseName.toLowerCase();
    let key = 'generic';
    if (nameLower.includes('bench press') || nameLower.includes('chest press')) {
      key = 'bench';
    } else if (nameLower.includes('squat')) {
      key = 'squat';
    } else if (nameLower.includes('deadlift')) {
      key = 'deadlift';
    } else if (nameLower.includes('overhead press') || nameLower.includes('shoulder press') || nameLower.includes('ohp')) {
      key = 'ohp';
    }

    let selected = [...(standards[key] || standards.generic)];
    if (nameLower.includes('dumbbell') || nameLower.includes('db') || nameLower.includes('cable') || nameLower.includes('curl') || nameLower.includes('extension') || nameLower.includes('lateral') || nameLower.includes('fly')) {
      selected = selected.map(s => s * 0.5);
    }

    multipliers = {
      beginner: selected[0],
      novice: selected[1],
      intermediate: selected[2],
      advanced: selected[3],
      elite: selected[4]
    };
  }

  let tier = 'UNTRAINED';
  let percentile = 'TOP 90%';

  if (ratio >= multipliers.elite) {
    tier = 'ELITE';
    percentile = 'TOP 2%';
  } else if (ratio >= multipliers.advanced) {
    tier = 'ADVANCED';
    percentile = 'TOP 8%';
  } else if (ratio >= multipliers.intermediate) {
    tier = 'INTERMEDIATE';
    percentile = 'TOP 20%';
  } else if (ratio >= multipliers.novice) {
    tier = 'NOVICE';
    percentile = 'TOP 45%';
  } else if (ratio >= multipliers.beginner) {
    tier = 'BEGINNER';
    percentile = 'TOP 75%';
  }

  return {
    percentile,
    tier,
    bwMultiplier
  };
};

// Canvas drawing helper for rounded rectangles
function roundRect(ctx, x, y, width, height, radius) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  if (radius === undefined) {
    radius = 5;
  }
  if (typeof radius === 'number') {
    radius = { tl: radius, tr: radius, br: radius, bl: radius };
  } else {
    const defaultRadius = { tl: 0, tr: 0, br: 0, bl: 0 };
    for (const side in defaultRadius) {
      radius[side] = radius[side] || defaultRadius[side];
    }
  }
  ctx.beginPath();
  ctx.moveTo(x + radius.tl, y);
  ctx.lineTo(x + width - radius.tr, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
  ctx.lineTo(x + width, y + height - radius.br);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
  ctx.lineTo(x + radius.bl, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
  ctx.lineTo(x, y + radius.tl);
  ctx.quadraticCurveTo(x, y, x + radius.tl, y);
  ctx.closePath();
}

// Canvas text drawing helper with adjustable letter-spacing
function fillTextWithSpacing(ctx, text, x, y, spacing, align = 'left') {
  const characters = String(text).split('');
  
  // Calculate total width with custom spacing
  let totalWidth = 0;
  for (let i = 0; i < characters.length; i++) {
    totalWidth += ctx.measureText(characters[i]).width;
    if (i < characters.length - 1) {
      totalWidth += spacing;
    }
  }
  
  // Adjust starting X coordinate based on alignment
  let startX = x;
  if (align === 'center') {
    startX = x - totalWidth / 2;
  } else if (align === 'right') {
    startX = x - totalWidth;
  }
  
  ctx.save();
  ctx.textAlign = 'left';
  let currentX = startX;
  for (let i = 0; i < characters.length; i++) {
    ctx.fillText(characters[i], currentX, y);
    currentX += ctx.measureText(characters[i]).width + spacing;
  }
  ctx.restore();
}

// Canvas drawing helper for the Lucide Trophy SVG equivalent
function drawVectorTrophyBadge(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = '#B5FF2D';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  // Left handle
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 12);
  ctx.bezierCurveTo(cx - 28, cy - 12, cx - 28, cy - 2, cx - 16, cy - 2);
  ctx.stroke();

  // Right handle
  ctx.beginPath();
  ctx.moveTo(cx + 16, cy - 12);
  ctx.bezierCurveTo(cx + 28, cy - 12, cx + 28, cy - 2, cx + 16, cy - 2);
  ctx.stroke();
  
  // Cup Bowl
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - 22);
  ctx.lineTo(cx + 16, cy - 22);
  ctx.lineTo(cx + 16, cy - 5);
  ctx.quadraticCurveTo(cx + 16, cy + 12, cx, cy + 12);
  ctx.quadraticCurveTo(cx - 16, cy + 12, cx - 16, cy - 5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  
  // Stand/Connector
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy + 12);
  ctx.lineTo(cx - 6, cy + 18);
  ctx.bezierCurveTo(cx - 6, cy + 22, cx - 16, cy + 22, cx - 16, cy + 26);
  ctx.moveTo(cx + 6, cy + 12);
  ctx.lineTo(cx + 6, cy + 18);
  ctx.bezierCurveTo(cx + 6, cy + 22, cx + 16, cy + 22, cx + 16, cy + 26);
  ctx.stroke();
  
  // Base line
  ctx.beginPath();
  ctx.moveTo(cx - 24, cy + 26);
  ctx.lineTo(cx + 24, cy + 26);
  ctx.stroke();

  ctx.restore();
}

// Canvas drawing helper for the glowing Cyberpunk Hexagonal Emblem
function drawCyberHexagonBadge(ctx, cx, cy, size, tier, percentile) {
  ctx.save();
  
  // Helper to trace a hexagon path
  const traceHex = (r) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3 - Math.PI / 6;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // 1. Large outer ambient saffron glow
  traceHex(size + 6);
  ctx.strokeStyle = 'rgba(255, 92, 0, 0.15)';
  ctx.lineWidth = 14;
  ctx.stroke();

  // 2. Outer Hexagon
  traceHex(size);
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();
  ctx.strokeStyle = '#FF5C00'; // Brand Orange saffron
  ctx.lineWidth = 4;
  ctx.stroke();

  // 3. Inner Hexagon
  traceHex(size - 10);
  ctx.strokeStyle = '#B5FF2D'; // Acid Lime
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 4. Subtle center circular radial backdrop
  const radGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, size - 20);
  radGrad.addColorStop(0, 'rgba(255, 92, 0, 0.08)');
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, size - 20, 0, Math.PI * 2);
  ctx.fill();

  // 5. HUD Crosshair ticks outside the hexagon corners
  ctx.strokeStyle = 'rgba(255, 92, 0, 0.4)';
  ctx.lineWidth = 1.5;
  
  // Horizontal crosshairs
  ctx.beginPath();
  ctx.moveTo(cx - size - 22, cy);
  ctx.lineTo(cx - size - 6, cy);
  ctx.moveTo(cx + size + 6, cy);
  ctx.lineTo(cx + size + 22, cy);
  ctx.stroke();

  // Vertical crosshairs
  ctx.beginPath();
  ctx.moveTo(cx, cy - size - 22);
  ctx.lineTo(cx, cy - size - 6);
  ctx.moveTo(cx, cy + size + 6);
  ctx.lineTo(cx, cy + size + 22);
  ctx.stroke();

  // 6. Text Elements inside the Hexagon (using project Google Fonts)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Label: "STRENGTH TIER"
  ctx.font = '600 11px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  fillTextWithSpacing(ctx, 'STRENGTH TIER', cx, cy - 38, 2, 'center');

  // Value: Tier name (e.g. ELITE)
  ctx.font = '800 34px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(tier.toUpperCase(), cx, cy + 2);

  // Percentile Rank: e.g. TOP 2%
  ctx.font = '600 13px "DM Mono", monospace';
  ctx.fillStyle = '#B5FF2D'; // Acid Lime
  fillTextWithSpacing(ctx, percentile.toUpperCase(), cx, cy + 38, 1, 'center');

  // Certification badge footer
  ctx.font = '600 8px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#FF5C00';
  fillTextWithSpacing(ctx, 'ZENKAI SECURED', cx, cy + 54, 1.5, 'center');

  ctx.restore();
}

/**
 * generatePRCardImage
 * A pure HTML5 Canvas drawing function that generates a premium, high-density 1080x1350 PR share card.
 */
export const generatePRCardImage = async ({
  userName = 'Trainer',
  level = 1,
  exerciseName = 'Bench Press',
  weight = 60,
  reps = 8,
  oneRepMax = 76,
  dateString = 'Today',
  percentile = 'TOP 15%',
  tier = 'ELITE',
  targetMuscle = 'CHEST',
  bwMultiplier = '1.00x',
}) => {
  // 1. Guard check to make sure custom web fonts are fully loaded before rendering
  try {
    if (document && document.fonts && document.fonts.ready) {
      await document.fonts.ready;
    }
  } catch (e) {
    console.warn("[generatePRCardImage] Web fonts ready check skipped/failed:", e);
  }

  const canvas = document.createElement('canvas');
  const width = 1080;
  const height = 1350;
  
  // Use a 2x backing scale factor to generate a crisp Retina HD image (2160x2700)
  const dpr = 2;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(dpr, dpr);

  // 2. Ambient dark radial gradient background
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 20, width / 2, height / 2, Math.max(width, height));
  bgGrad.addColorStop(0, '#0f0f0f');
  bgGrad.addColorStop(1, '#050505');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Faint high-tech neon background grid lines (subtle saffron/lime layout)
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(181, 255, 45, 0.04)'; // Extremely faint acid lime
  ctx.lineWidth = 1;
  const gridSize = 45;
  for (let x = 0; x <= width; x += gridSize) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += gridSize) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
  ctx.restore();

  // 4. Top saffron orange/acid lime accent bars
  ctx.fillStyle = '#FF5C00';
  ctx.fillRect(0, 0, width, 8);
  ctx.fillStyle = '#B5FF2D';
  ctx.fillRect(0, 8, width, 4);

  // 5. Trophy Badge Container
  const badgeW = 120;
  const badgeH = 120;
  const badgeX = 540 - badgeW / 2;
  const badgeY = 90;
  
  ctx.beginPath();
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20);
  ctx.fillStyle = '#111111';
  ctx.fill();
  
  ctx.beginPath();
  roundRect(ctx, badgeX, badgeY, badgeW, badgeH, 20);
  ctx.strokeStyle = '#B5FF2D';
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw trophy icon inside the container
  drawVectorTrophyBadge(ctx, 540, badgeY + badgeH / 2);

  // 6. Header Typography: "NEW PERSONAL RECORD"
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '800 58px "Barlow Condensed", sans-serif';
  
  const text1 = 'NEW ';
  const text2 = 'PERSONAL RECORD';
  const w1 = ctx.measureText(text1).width;
  const w2 = ctx.measureText(text2).width;
  const totalW = w1 + w2;
  const startX = 540 - totalW / 2;
  
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text1, startX, 290);
  ctx.fillStyle = '#B5FF2D';
  ctx.fillText(text2, startX + w1, 290);
  ctx.restore();

  // Subtitle
  ctx.save();
  ctx.font = '600 20px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  ctx.textAlign = 'center';
  fillTextWithSpacing(ctx, `MILESTONE CONQUERED  •  ${tier.toUpperCase()} TIER`, 540, 335, 2.5, 'center');
  ctx.restore();

  // 7. Core Card Container
  const cardX = 80;
  const cardY = 385;
  const cardW = 920;
  const cardH = 680;

  // Background card box
  ctx.beginPath();
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.fillStyle = '#111111';
  ctx.fill();
  
  ctx.beginPath();
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw HUD style high-contrast brackets around the card box corners
  ctx.save();
  const bracketSize = 24;
  ctx.strokeStyle = '#B5FF2D';
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'square';

  // Top-Left corner bracket
  ctx.beginPath();
  ctx.moveTo(cardX - 12, cardY - 12 + bracketSize);
  ctx.lineTo(cardX - 12, cardY - 12);
  ctx.lineTo(cardX - 12 + bracketSize, cardY - 12);
  ctx.stroke();
  
  // Top-Right corner bracket
  ctx.beginPath();
  ctx.moveTo(cardX + cardW + 12 - bracketSize, cardY - 12);
  ctx.lineTo(cardX + cardW + 12, cardY - 12);
  ctx.lineTo(cardX + cardW + 12, cardY - 12 + bracketSize);
  ctx.stroke();
  
  // Bottom-Left corner bracket
  ctx.beginPath();
  ctx.moveTo(cardX - 12, cardY + cardH + 12 - bracketSize);
  ctx.lineTo(cardX - 12, cardY + cardH + 12);
  ctx.lineTo(cardX - 12 + bracketSize, cardY + cardH + 12);
  ctx.stroke();
  
  // Bottom-Right corner bracket
  ctx.beginPath();
  ctx.moveTo(cardX + cardW + 12 - bracketSize, cardY + cardH + 12);
  ctx.lineTo(cardX + cardW + 12, cardY + cardH + 12);
  ctx.lineTo(cardX + cardW + 12, cardY + cardH + 12 - bracketSize);
  ctx.stroke();
  ctx.restore();

  // 8. Exercise Title Header Area
  const headerH = 140;
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.clip();
  ctx.fillStyle = '#161616';
  ctx.fillRect(cardX, cardY, cardW, headerH);
  
  // Label: TARGET ENGAGED
  ctx.font = '600 15px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  ctx.textAlign = 'center';
  fillTextWithSpacing(ctx, 'TARGET ENGAGED', cardX + cardW / 2, cardY + 44, 3, 'center');

  // Exercise Name
  ctx.font = '800 36px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  
  // Word wrap exercise name if it's too long
  const cleanExName = exerciseName.toUpperCase();
  const words = cleanExName.split(' ');
  let exerciseLines = [];
  let currentLine = '';
  words.forEach((word) => {
    const testLine = currentLine ? currentLine + ' ' + word : word;
    if (ctx.measureText(testLine).width > 800 && currentLine) {
      exerciseLines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  if (currentLine) exerciseLines.push(currentLine);

  if (exerciseLines.length === 1) {
    ctx.fillText(exerciseLines[0], cardX + cardW / 2, cardY + 98);
  } else {
    ctx.font = '800 28px "Barlow Condensed", sans-serif';
    ctx.fillText(exerciseLines[0], cardX + cardW / 2, cardY + 84);
    ctx.fillText(exerciseLines[1], cardX + cardW / 2, cardY + 118);
  }

  // Header Divider
  ctx.beginPath();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2.5;
  ctx.moveTo(cardX, cardY + headerH);
  ctx.lineTo(cardX + cardW, cardY + headerH);
  ctx.stroke();
  ctx.restore();

  // 9. Split Left/Right columns
  const contentY = cardY + headerH;
  const splitX = cardX + 550;
  const contentH = cardH - headerH;

  // Vertical Divider
  ctx.beginPath();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2.5;
  ctx.moveTo(splitX, contentY);
  ctx.lineTo(splitX, cardY + cardH);
  ctx.stroke();

  // LEFT COLUMN: STATS AND RANK
  ctx.save();
  ctx.beginPath();
  ctx.rect(cardX, contentY, 550, contentH);
  ctx.clip();

  // Label: MASS MOVED
  ctx.font = '600 15px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  ctx.textAlign = 'left';
  fillTextWithSpacing(ctx, 'MASS MOVED', cardX + 45, contentY + 54, 2.5, 'left');

  // Big Mass and Reps Values
  const isBW = weight === 'BW' || String(weight).toUpperCase() === 'BW';
  const valString = isBW ? 'BW' : String(weight);
  
  ctx.font = '800 84px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#B5FF2D'; // acid lime weight value
  const valW = ctx.measureText(valString).width;
  ctx.fillText(valString, cardX + 45, contentY + 145);

  let nextX = cardX + 45 + valW + 8;
  if (!isBW) {
    ctx.font = '600 32px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#A3A3A3';
    ctx.fillText('kg', nextX, contentY + 145 - 8);
    nextX += ctx.measureText('kg').width + 20;
  } else {
    nextX += 12;
  }

  // reps value
  ctx.font = '800 44px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  const repsText = `× ${reps}`;
  ctx.fillText(repsText, nextX, contentY + 145);
  nextX += ctx.measureText(repsText).width + 10;

  ctx.font = '600 20px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  ctx.fillText('REPS', nextX, contentY + 145 - 4);

  // Epley 1RM & Power-to-weight Ratio Row
  const row2Y = contentY + 200;

  // Epley 1RM Column
  ctx.font = '600 14px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  fillTextWithSpacing(ctx, 'EPLEY 1RM', cardX + 45, row2Y + 28, 2, 'left');

  ctx.font = '800 42px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  const rmText = isBW ? 'N/A' : `${oneRepMax} kg`;
  ctx.fillText(rmText, cardX + 45, row2Y + 84);

  // Power-to-weight Ratio Column
  ctx.font = '600 14px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  fillTextWithSpacing(ctx, 'PWR/WT RATIO', cardX + 310, row2Y + 28, 2, 'left');

  ctx.font = '800 42px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(bwMultiplier, cardX + 310, row2Y + 84);

  // Percentile Badge (Global Rank)
  const badgeBoxX = cardX + 45;
  const badgeBoxY = row2Y + 130;
  const badgeBoxW = 460;
  const badgeBoxH = 100;

  ctx.beginPath();
  roundRect(ctx, badgeBoxX, badgeBoxY, badgeBoxW, badgeBoxH, 14);
  ctx.fillStyle = 'rgba(0, 212, 255, 0.08)';
  ctx.fill();
  
  ctx.beginPath();
  roundRect(ctx, badgeBoxX, badgeBoxY, badgeBoxW, badgeBoxH, 14);
  ctx.strokeStyle = 'rgba(0, 212, 255, 0.4)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = '600 13px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#00D4FF';
  fillTextWithSpacing(ctx, 'GLOBAL RANK', badgeBoxX + 24, badgeBoxY + 38, 2.5, 'left');

  ctx.font = '800 34px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#00D4FF';
  ctx.fillText(percentile, badgeBoxX + 24, badgeBoxY + 80);

  ctx.restore();

  // RIGHT COLUMN: CYBERPUNK EMBLEM
  ctx.save();
  ctx.beginPath();
  ctx.rect(splitX, contentY, 370, contentH);
  ctx.clip();
  
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(splitX, contentY, 370, contentH);

  // Header Title for Right Emblem
  ctx.font = '600 14px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#FF5C00'; // saffron
  ctx.textAlign = 'center';
  fillTextWithSpacing(ctx, 'ACHIEVEMENT TIER', splitX + 370 / 2, contentY + 54, 2.5, 'center');

  // Draw Glowing Hexagon
  const emblemCx = splitX + 370 / 2;
  const emblemCy = contentY + 265;
  drawCyberHexagonBadge(ctx, emblemCx, emblemCy, 95, tier, percentile);

  ctx.restore();

  // 10. Footer Layout
  const footerY = 1175;

  // Level Badge Pill
  const lvlBadgeW = 110;
  const lvlBadgeH = 50;
  const lvlBadgeX = 80;
  
  ctx.beginPath();
  roundRect(ctx, lvlBadgeX, footerY - 5, lvlBadgeW, lvlBadgeH, 25);
  ctx.fillStyle = '#B5FF2D'; // Acid lime
  ctx.fill();

  ctx.font = '800 20px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LVL ${level}`, lvlBadgeX + lvlBadgeW / 2, footerY - 5 + lvlBadgeH / 2 + 1);

  // Athlete Label and Name
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 13px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#A3A3A3';
  ctx.textAlign = 'left';
  fillTextWithSpacing(ctx, 'ATHLETE', 215, footerY + 12, 2.5, 'left');

  ctx.font = '800 26px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(userName.toUpperCase(), 215, footerY + 44);
  ctx.restore();

  // ZENKAI Logo
  ctx.save();
  ctx.font = '800 42px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#FF5C00'; // saffron saffron logo
  ctx.textAlign = 'right';
  ctx.fillText('ZENKAI', 1000, footerY + 15);

  // Date String
  ctx.font = '600 16px "DM Mono", monospace';
  ctx.fillStyle = '#A3A3A3';
  ctx.fillText(dateString.toUpperCase(), 1000, footerY + 44);
  ctx.restore();

  return canvas.toDataURL('image/png');
};

// Upgraded React Component counterpart for direct React DOM rendering (matching the Canvas output perfectly)
export default function PRShareTemplate({
  exerciseName = "BARBELL BENCH PRESS",
  weight = 100,
  reps = 15,
  oneRepMax = 150,
  athleteName = "ATHLETE",
  level = 3,
  date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
  percentile = "TOP 1%",
  tier = "ELITE",
  bwMultiplier = "1.87x"
}) {
  return (
    <div 
      id="pr-capture-target"
      className="relative flex flex-col items-center justify-between overflow-hidden bg-[#050505] p-0"
      style={{ width: '1080px', height: '1350px', fontFamily: '"Outfit", system-ui, sans-serif' }}
    >
      {/* HUD GRID BACKGROUND */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(181, 255, 45, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(181, 255, 45, 0.04) 1px, transparent 1px)',
          backgroundSize: '45px 45px'
        }}
      />
      
      {/* TOP BRAND ACCENT BARS */}
      <div className="absolute top-0 w-full flex flex-col pointer-events-none">
        <div className="w-full h-2 bg-[#FF5C00]" />
        <div className="w-full h-1 bg-[#B5FF2D]" />
      </div>

      {/* HEADER SECTION */}
      <div className="z-10 flex flex-col items-center w-full px-16 pt-24">
        {/* Trophy icon container */}
        <div className="flex items-center justify-center w-32 h-32 mb-8 bg-[#111] border-[3px] border-[#B5FF2D] rounded-[20px] shadow-[0_0_15px_rgba(181,255,45,0.1)]">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#B5FF2D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path>
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path>
            <path d="M4 22h16"></path>
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path>
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path>
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path>
          </svg>
        </div>
        
        {/* Neubrutalist Title */}
        <h1 className="text-7xl font-extrabold text-white tracking-tighter uppercase m-0 leading-none" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
          NEW <span className="text-[#B5FF2D]">PERSONAL RECORD</span>
        </h1>
        <p className="mt-5 text-xl tracking-widest text-[#A3A3A3] uppercase font-semibold">
          MILESTONE CONQUERED • {tier} TIER
        </p>
      </div>

      {/* CORE DATA CARD */}
      <div className="z-10 flex w-full max-w-[920px] px-8 mt-4 relative">
        {/* HUD targeting corner brackets */}
        <div className="absolute top-1 left-5 w-6 h-6 border-t-[4px] border-l-[4px] border-[#B5FF2D] pointer-events-none" />
        <div className="absolute top-1 right-5 w-6 h-6 border-t-[4px] border-r-[4px] border-[#B5FF2D] pointer-events-none" />
        <div className="absolute bottom-1 left-5 w-6 h-6 border-b-[4px] border-l-[4px] border-[#B5FF2D] pointer-events-none" />
        <div className="absolute bottom-1 right-5 w-6 h-6 border-b-[4px] border-r-[4px] border-[#B5FF2D] pointer-events-none" />

        <div className="w-full bg-[#111] border-2 border-[#222] rounded-[24px] overflow-hidden flex flex-col shadow-[0_0_30px_rgba(255,92,0,0.05)]">
          
          {/* Card Header: Exercise name */}
          <div className="w-full py-6 text-center border-b-2 border-[#222] bg-[#161616]">
            <p className="mb-1 text-sm tracking-[0.2em] text-[#A3A3A3] uppercase font-semibold">Target Engaged</p>
            <h2 className="text-4xl font-extrabold text-white uppercase truncate px-6 style-title" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{exerciseName}</h2>
          </div>

          <div className="flex w-full">
            {/* LEFT COLUMN: STATS */}
            <div className="flex flex-col justify-center w-3/5 p-12 border-r-2 border-[#222]">
              <div className="mb-10">
                <p className="mb-1 text-sm tracking-[0.15em] text-[#A3A3A3] uppercase font-semibold">Mass Moved</p>
                <div className="flex items-baseline gap-3">
                  <span className="text-8xl font-black text-[#B5FF2D] leading-none" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{weight}</span>
                  <span className="text-3xl font-semibold text-[#A3A3A3]">kg</span>
                  <span className="text-4xl font-extrabold text-white ml-3" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>× {reps} <span className="text-xl font-semibold text-[#A3A3A3] ml-1">REPS</span></span>
                </div>
              </div>

              <div className="flex items-center gap-12">
                <div>
                  <p className="mb-1 text-xs tracking-wider text-[#A3A3A3] uppercase font-semibold">Epley 1RM</p>
                  <p className="text-4xl font-extrabold text-white" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{oneRepMax} <span className="text-xl font-semibold text-[#A3A3A3] ml-0.5">kg</span></p>
                </div>
                <div>
                  <p className="mb-1 text-xs tracking-wider text-[#A3A3A3] uppercase font-semibold">Pwr/Wt Ratio</p>
                  <p className="text-4xl font-extrabold text-white" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{bwMultiplier}</p>
                </div>
              </div>

              {/* PERCENTILE BADGE */}
              <div className="mt-8 px-6 py-3 border-2 border-[#00D4FF] rounded-xl bg-[#00D4FF]/8 w-max">
                <p className="text-xs font-bold tracking-[0.18em] text-[#00D4FF] uppercase mb-1">Global Rank</p>
                <p className="text-3xl font-extrabold text-[#00D4FF]" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{percentile}</p>
              </div>
            </div>

            {/* RIGHT COLUMN: CYBERPUNK EMBLEM */}
            <div className="relative flex flex-col items-center justify-center w-2/5 p-8 bg-[#0a0a0a]">
              <p className="absolute top-6 text-xs font-bold tracking-[0.18em] text-[#FF5C00] uppercase text-center w-full">
                ACHIEVEMENT TIER
              </p>
              
              <div className="relative flex items-center justify-center w-64 h-64 mt-6">
                {/* SVG glowing crosshair guidelines */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-[200px] h-[1.5px] bg-[#FF5C00]/30" />
                  <div className="h-[200px] w-[1.5px] bg-[#FF5C00]/30 absolute" />
                </div>

                {/* SVG Cyberpunk Hexagonal Emblem */}
                <svg width="220" height="220" viewBox="0 0 200 200" className="z-10 filter drop-shadow-[0_0_15px_rgba(255,92,0,0.15)]">
                  {/* Outer Hexagon */}
                  <polygon 
                    points="100,10 178,55 178,145 100,190 22,145 22,55" 
                    fill="#0a0a0a" 
                    stroke="#FF5C00" 
                    strokeWidth="4" 
                    strokeLinejoin="round"
                  />
                  {/* Inner Hexagon Accent */}
                  <polygon 
                    points="100,20 169,60 169,140 100,180 31,140 31,60" 
                    fill="none" 
                    stroke="#B5FF2D" 
                    strokeWidth="1.5" 
                    strokeLinejoin="round"
                  />
                  {/* Hexagon Interior Text */}
                  <text x="100" y="65" fill="#A3A3A3" fontSize="10" fontWeight="600" fontFamily="system-ui" letterSpacing="1.5" textAnchor="middle">STRENGTH TIER</text>
                  <text x="100" y="108" fill="#ffffff" fontSize="28" fontWeight="800" fontFamily="Barlow Condensed, sans-serif" textAnchor="middle">{tier}</text>
                  <text x="100" y="142" fill="#B5FF2D" fontSize="12" fontWeight="600" fontFamily="DM Mono, monospace" letterSpacing="1" textAnchor="middle">{percentile}</text>
                  <text x="100" y="158" fill="#FF5C00" fontSize="7" fontWeight="600" fontFamily="system-ui" letterSpacing="1" textAnchor="middle">ZENKAI SECURED</text>
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="z-10 flex items-center justify-between w-full px-16 pb-16 mt-4">
        <div className="flex items-center gap-5">
          <div className="px-6 py-2.5 font-bold tracking-wider text-black uppercase bg-[#B5FF2D] rounded-full text-lg" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
            LVL {level}
          </div>
          <div>
            <p className="text-xs tracking-widest text-[#A3A3A3] uppercase font-semibold">Athlete</p>
            <p className="text-2xl font-extrabold text-white uppercase" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>{athleteName}</p>
          </div>
        </div>

        <div className="flex flex-col items-end">
          <p className="text-4xl font-extrabold tracking-tight text-[#FF5C00]" style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>ZENKAI</p>
          <p className="text-base font-semibold tracking-wider text-[#A3A3A3] uppercase" style={{ fontFamily: '"DM Mono", monospace' }}>{date}</p>
        </div>
      </div>
    </div>
  );
}
