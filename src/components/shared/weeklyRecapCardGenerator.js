// ─── Helper: draw a rounded rect path ───────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ─── Stat box renderer ───────────────────────────────────────────────────────
function drawStatBox(ctx, x, y, w, h, label, value, valueColor) {
  // Box bg
  roundRect(ctx, x, y, w, h, 16);
  ctx.fillStyle = '#111111';
  ctx.fill();
  roundRect(ctx, x, y, w, h, 16);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Value
  ctx.save();
  ctx.font = '800 52px "Barlow Condensed", sans-serif';
  ctx.fillStyle = valueColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(value, x + w / 2, y + h - 42);
  ctx.restore();

  // Label
  ctx.save();
  ctx.font = '500 18px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#777777';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w / 2, y + h - 18);
  ctx.restore();
}

// ─── Main Canvas card generator ──────────────────────────────────────────────
export async function generateWeeklyStatsCardImage({
  weekNumber = '',
  sessionsCount = 0,
  totalVolume = 0,
  prsBrokenCount = 0,
  xpEarned = 0,
  streak = 0,
  bestLift = null,
  motivationalLine = '',
  userName = '',
}) {
  try {
    if (document?.fonts?.ready) await document.fonts.ready;
  } catch (_) {}

  const W = 1080;
  const H = 1350;
  const DPR = 2;

  const canvas = document.createElement('canvas');
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(DPR, DPR);

  // ── 1. Background ──
  const bgGrad = ctx.createRadialGradient(W / 2, H * 0.4, 80, W / 2, H * 0.4, Math.max(W, H));
  bgGrad.addColorStop(0, '#111111');
  bgGrad.addColorStop(1, '#050505');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid
  ctx.save();
  ctx.strokeStyle = 'rgba(181,255,45,0.03)';
  ctx.lineWidth = 1;
  const G = 50;
  for (let x = 0; x <= W; x += G) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += G) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();

  // ── 2. Top accent bars ──
  ctx.fillStyle = '#FF5C00'; ctx.fillRect(0, 0, W, 10);
  ctx.fillStyle = '#B5FF2D'; ctx.fillRect(0, 10, W, 5);

  // ── 3. Header area ──
  const headerY = 50;

  // WEEK label
  ctx.save();
  ctx.font = '600 18px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('WEEKLY STATS CARD', 70, headerY + 48);
  ctx.restore();

  // WEEK N big number
  ctx.save();
  ctx.font = '900 110px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`WEEK ${weekNumber}`, 70, headerY + 150);
  ctx.restore();

  // ZENKAI branding top-right
  ctx.save();
  ctx.font = '900 52px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#FF5C00';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ZENKAI', W - 70, headerY + 100);
  ctx.font = '600 18px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#555555';
  ctx.fillText('TRAIN SMARTER', W - 70, headerY + 130);
  ctx.restore();

  // Divider
  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, headerY + 175);
  ctx.lineTo(W - 70, headerY + 175);
  ctx.stroke();
  ctx.restore();

  // ── 4. HERO stat: sessions count ──
  const heroY = 260;
  const heroH = 260;
  roundRect(ctx, 70, heroY, W - 140, heroH, 20);
  ctx.fillStyle = '#111111';
  ctx.fill();
  roundRect(ctx, 70, heroY, W - 140, heroH, 20);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Trophy icon hint (geometric)
  ctx.save();
  ctx.fillStyle = 'rgba(181,255,45,0.05)';
  ctx.beginPath();
  ctx.arc(W - 150, heroY + heroH / 2, 90, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.font = '900 160px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#B5FF2D';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(sessionsCount), W / 2, heroY + heroH / 2 - 15);
  ctx.restore();

  ctx.save();
  ctx.font = '600 22px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#777777';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('WORKOUTS LOGGED THIS WEEK', W / 2, heroY + heroH - 28);
  ctx.restore();

  // ── 5. 2×2 stats grid ──
  const gridY = 560;
  const boxW = (W - 140 - 20) / 2; // two columns with 20px gap
  const boxH = 180;
  const gap = 20;

  drawStatBox(ctx, 70,          gridY,        boxW, boxH, 'TOTAL VOLUME',  `${(totalVolume || 0).toLocaleString()} kg`, '#00D4FF');
  drawStatBox(ctx, 70 + boxW + gap, gridY,        boxW, boxH, 'PRs BROKEN',    String(prsBrokenCount),  '#FF5C00');
  drawStatBox(ctx, 70,          gridY + boxH + gap, boxW, boxH, 'XP EARNED',     `+${xpEarned}`,        '#B5FF2D');
  drawStatBox(ctx, 70 + boxW + gap, gridY + boxH + gap, boxW, boxH, 'ACTIVE STREAK',  `${streak}d`,          '#ffffff');

  // ── 6. Best Lift row ──
  const liftY = gridY + 2 * (boxH + gap) + 24;
  const liftH = 130;
  roundRect(ctx, 70, liftY, W - 140, liftH, 16);
  ctx.fillStyle = '#111111';
  ctx.fill();
  roundRect(ctx, 70, liftY, W - 140, liftH, 16);
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.save();
  ctx.font = '600 18px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('BEST LIFT THIS WEEK', 105, liftY + 38);
  ctx.restore();

  ctx.save();
  ctx.textBaseline = 'alphabetic';
  if (bestLift) {
    // Lift name
    ctx.font = '800 36px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    const liftName = String(bestLift.name || '').toUpperCase();
    // Truncate if too long
    ctx.fillText(liftName.length > 36 ? liftName.slice(0, 36) + '…' : liftName, 105, liftY + 108);
    // Weight
    const weightText = bestLift.weight === 'BW'
      ? `BW × ${bestLift.reps || 0} reps`
      : `${bestLift.weight} kg`;
    ctx.font = '700 36px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#00D4FF';
    ctx.textAlign = 'right';
    ctx.fillText(weightText, W - 105, liftY + 108);
  } else {
    ctx.font = '600 28px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#444444';
    ctx.textAlign = 'center';
    ctx.fillText('No lifts recorded this week', W / 2, liftY + 80);
  }
  ctx.restore();

  // ── 7. Motivational quote ──
  const quoteY = liftY + liftH + 28;
  ctx.save();
  ctx.font = 'italic 500 24px "Outfit", system-ui, sans-serif';
  ctx.fillStyle = '#555555';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // Simple word-wrap
  const qWords = `"${motivationalLine}"`.split(' ');
  let qLine = '';
  let qLines = [];
  for (const word of qWords) {
    const test = qLine ? qLine + ' ' + word : word;
    if (ctx.measureText(test).width > W - 200 && qLine) {
      qLines.push(qLine);
      qLine = word;
    } else {
      qLine = test;
    }
  }
  if (qLine) qLines.push(qLine);
  qLines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, quoteY + i * 36));
  ctx.restore();

  // ── 8. Footer ──
  const footerY = H - 110;
  // Divider
  ctx.save();
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(70, footerY);
  ctx.lineTo(W - 70, footerY);
  ctx.stroke();
  ctx.restore();

  // Athlete name (left)
  if (userName) {
    ctx.save();
    ctx.font = '600 18px "Outfit", system-ui, sans-serif';
    ctx.fillStyle = '#555555';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ATHLETE', 70, footerY + 34);
    ctx.font = '800 34px "Barlow Condensed", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(userName.toUpperCase(), 70, footerY + 72);
    ctx.restore();
  }

  // ZENKAI + zenkai.app (right)
  ctx.save();
  ctx.font = '900 46px "Barlow Condensed", sans-serif';
  ctx.fillStyle = '#FF5C00';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('ZENKAI', W - 70, footerY + 55);
  ctx.font = '500 20px "DM Mono", monospace';
  ctx.fillStyle = '#555555';
  ctx.fillText('zenkai.app', W - 70, footerY + 84);
  ctx.restore();

  return canvas.toDataURL('image/png');
}
