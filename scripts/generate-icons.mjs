/**
 * Rasterises the sorgumcore chef mark into every launcher, splash and in-app
 * brand asset.
 *
 *   npm run assets:icons
 *
 * The character itself comes from src/brand/chefMark.ts, so the app icon and the
 * in-app logo can never drift apart.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  CHEF_CHARACTER,
  CHEF_CHARACTER_BOUNDS,
  CHEF_MARK,
  CHEF_VIEWBOX,
} from '../src/brand/chefMark.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Warm cream field, matching the splash and adaptive-icon background. */
const FIELD = '#FFF3E6';

/**
 * How much of the canvas the character fills.
 *
 * The launcher value keeps the toque, spoon and shoulders inside the circular
 * mask some launchers apply; the others keep the character inside the 66dp safe
 * zone that adaptive icons and the Android 12 splash mask crop to.
 */
const SCALE = { launcher: 0.8, safe: 0.5 };

/**
 * Compose one variant. Whatever the scale, the character's own bounds are centred
 * in the canvas so every asset lines up with the others.
 */
function compose({ size, content, background, scale }) {
  const cx = (CHEF_CHARACTER_BOUNDS.left + CHEF_CHARACTER_BOUNDS.right) / 2;
  const cy = (CHEF_CHARACTER_BOUNDS.top + CHEF_CHARACTER_BOUNDS.bottom) / 2;
  const tx = (50 - cx * scale).toFixed(4);
  const ty = (50 - cy * scale).toFixed(4);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${CHEF_VIEWBOX}">`,
    background ? `<rect width="100" height="100" fill="${background}"/>` : '',
    `<g transform="translate(${tx} ${ty}) scale(${scale})">${content}</g>`,
    '</svg>',
  ].join('');
}

/** Full-bleed icon: cream field, halo, complete character. */
const launcherSvg = (size) =>
  compose({ size, content: CHEF_MARK, background: FIELD, scale: SCALE.launcher });

/** Adaptive foreground: transparent, character only. */
const foregroundSvg = (size) =>
  compose({ size, content: CHEF_CHARACTER, background: null, scale: SCALE.safe });

/** Splash icon: transparent, halo behind the character. */
const splashSvg = (size) =>
  compose({ size, content: CHEF_MARK, background: null, scale: SCALE.safe });

const DENSITIES = [
  { dir: 'mdpi', launcher: 48, foreground: 108, splash: 288 },
  { dir: 'hdpi', launcher: 72, foreground: 162, splash: 432 },
  { dir: 'xhdpi', launcher: 96, foreground: 216, splash: 576 },
  { dir: 'xxhdpi', launcher: 144, foreground: 324, splash: 864 },
  { dir: 'xxxhdpi', launcher: 192, foreground: 432, splash: 1152 },
];

async function write(svg, relativePath, format) {
  const out = path.join(root, relativePath);
  await mkdir(path.dirname(out), { recursive: true });
  const image = sharp(Buffer.from(svg));
  const buffer =
    format === 'webp'
      ? await image.webp({ quality: 92, effort: 6 }).toBuffer()
      : await image.png().toBuffer();
  const { width, height } = await sharp(buffer).metadata();
  await writeFile(out, buffer);
  console.log(`  ${relativePath}  ${width}x${height}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

console.log('Generating sorgumcore chef brand assets…');

// Expo source assets (used by app.json / prebuild).
await write(launcherSvg(1024), 'assets/icon.png', 'png');
await write(foregroundSvg(1024), 'assets/android-icon-foreground.png', 'png');
await write(splashSvg(1024), 'assets/splash-icon.png', 'png');

// Android resources that actually ship inside the APK.
for (const { dir, launcher, foreground, splash } of DENSITIES) {
  await write(
    launcherSvg(launcher),
    `android/app/src/main/res/mipmap-${dir}/ic_launcher.webp`,
    'webp',
  );
  await write(
    launcherSvg(launcher),
    `android/app/src/main/res/mipmap-${dir}/ic_launcher_round.webp`,
    'webp',
  );
  await write(
    foregroundSvg(foreground),
    `android/app/src/main/res/mipmap-${dir}/ic_launcher_foreground.webp`,
    'webp',
  );
  await write(
    splashSvg(splash),
    `android/app/src/main/res/drawable-${dir}/splashscreen_logo.png`,
    'png',
  );
}

console.log('Done.');
