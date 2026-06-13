/**
 * convert-to-webp.js
 * Converts all PNG files in public/ and src/assets/ to WebP.
 * Keeps originals for browser compatibility (favicon, apple-touch-icon).
 * Run: node scripts/convert-to-webp.js
 */

const sharp = require('sharp');
const path  = require('path');
const fs    = require('fs');

const TARGETS = [
  { dir: 'public/logos', recurse: false },
  { dir: 'public',       recurse: false },
  { dir: 'src/assets',   recurse: false },
];

const ROOT = path.resolve(__dirname, '..');

async function convertDir({ dir, recurse }) {
  const absDir = path.join(ROOT, dir);
  if (!fs.existsSync(absDir)) return;

  const entries = fs.readdirSync(absDir, { withFileTypes: true });

  for (const entry of entries) {
    if (entry.isDirectory() && recurse) {
      await convertDir({ dir: path.join(dir, entry.name), recurse });
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.png')) continue;

    const srcPath  = path.join(absDir, entry.name);
    const destName = entry.name.replace(/\.png$/, '.webp');
    const destPath = path.join(absDir, destName);

    // Skip if WebP already exists and is newer than the source PNG
    if (fs.existsSync(destPath)) {
      const srcMtime  = fs.statSync(srcPath).mtimeMs;
      const destMtime = fs.statSync(destPath).mtimeMs;
      if (destMtime >= srcMtime) {
        console.log(`  ⏭  Already up-to-date: ${path.join(dir, destName)}`);
        continue;
      }
    }

    try {
      const srcStats = fs.statSync(srcPath);
      await sharp(srcPath)
        .webp({ lossless: true, quality: 90, effort: 4 })
        .toFile(destPath);
      const destStats = fs.statSync(destPath);
      const saved = Math.round((1 - destStats.size / srcStats.size) * 100);
      console.log(`  ✅ ${path.join(dir, entry.name)} → ${destName}  (${Math.round(srcStats.size/1024)}KB → ${Math.round(destStats.size/1024)}KB, -${saved}%)`);
    } catch (err) {
      console.error(`  ❌ Failed: ${srcPath}`, err.message);
    }
  }
}

(async () => {
  console.log('\n🔄 Converting PNG → WebP...\n');
  for (const target of TARGETS) {
    await convertDir(target);
  }
  console.log('\n✨ Done! Update your <img> src attributes and manifest.json to use .webp paths.\n');
})();
