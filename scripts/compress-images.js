import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const PUBLIC_DIR = 'd:/Fitdesi/public';

async function optimizeImage({ inputName, outputName, width, format, quality }) {
  const inputPath = path.join(PUBLIC_DIR, inputName);
  const outputPath = path.join(PUBLIC_DIR, outputName);

  if (!fs.existsSync(inputPath)) {
    console.error(`Input file does not exist: ${inputPath}`);
    return;
  }

  const initialSize = fs.statSync(inputPath).size;
  const image = sharp(inputPath);
  const metadata = await image.metadata();

  console.log(`\nOptimizing ${inputName}:`);
  console.log(`- Original Dimensions: ${metadata.width}x${metadata.height}`);
  console.log(`- Original Size: ${(initialSize / 1024).toFixed(2)} KB`);

  // Setup transformation
  let pipeline = image;
  if (width && metadata.width > width) {
    pipeline = pipeline.resize({ width });
    console.log(`- Resized width to: ${width}px (maintained aspect ratio)`);
  }

  if (format === 'webp') {
    pipeline = pipeline.webp({ quality });
  } else if (format === 'png') {
    pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  }

  await pipeline.toFile(outputPath);

  const finalSize = fs.statSync(outputPath).size;
  const ratio = ((1 - finalSize / initialSize) * 100).toFixed(2);
  const finalMetadata = await sharp(outputPath).metadata();

  console.log(`- Final Dimensions: ${finalMetadata.width}x${finalMetadata.height}`);
  console.log(`- Final Size: ${(finalSize / 1024).toFixed(2)} KB (Reduced by ${ratio}%)`);
}

async function main() {
  try {
    // 1. Chests -> convert to WebP & resize to 384px
    await optimizeImage({
      inputName: 'common_chest.png',
      outputName: 'common_chest.webp',
      width: 384,
      format: 'webp',
      quality: 85
    });

    await optimizeImage({
      inputName: 'rare_chest.png',
      outputName: 'rare_chest.webp',
      width: 384,
      format: 'webp',
      quality: 85
    });

    await optimizeImage({
      inputName: 'legendary_chest.png',
      outputName: 'legendary_chest.webp',
      width: 384,
      format: 'webp',
      quality: 85
    });

    // 2. Logos -> compress PNGs (favicons/apple-touch-icons should stay PNG for cross-platform compatibility)
    // zenkai_official_logo.png is used as favicon/logo - resize to max 256px
    await optimizeImage({
      inputName: 'logos/zenkai_official_logo.png',
      outputName: 'logos/zenkai_official_logo.png_temp',
      width: 256,
      format: 'png',
      quality: 85
    });
    // Replace original logo safely
    const logoTemp = path.join(PUBLIC_DIR, 'logos/zenkai_official_logo.png_temp');
    const logoDest = path.join(PUBLIC_DIR, 'logos/zenkai_official_logo.png');
    if (fs.existsSync(logoTemp)) {
      fs.unlinkSync(logoDest);
      fs.renameSync(logoTemp, logoDest);
      console.log(`- Successfully replaced original logos/zenkai_official_logo.png`);
    }

    // zenkai_app_icon.png - resize to 192px
    await optimizeImage({
      inputName: 'logos/zenkai_app_icon.png',
      outputName: 'logos/zenkai_app_icon.png_temp',
      width: 192,
      format: 'png',
      quality: 85
    });
    const iconTemp = path.join(PUBLIC_DIR, 'logos/zenkai_app_icon.png_temp');
    const iconDest = path.join(PUBLIC_DIR, 'logos/zenkai_app_icon.png');
    if (fs.existsSync(iconTemp)) {
      fs.unlinkSync(iconDest);
      fs.renameSync(iconTemp, iconDest);
      console.log(`- Successfully replaced original logos/zenkai_app_icon.png`);
    }

    console.log('\nAll image optimizations completed successfully.');
  } catch (err) {
    console.error('Error in main execution:', err);
  }
}

main();
