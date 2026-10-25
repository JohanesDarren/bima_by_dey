/**
 * Build APK release Android lokal: `npm run compile`.
 *
 * Semua hasil masuk ke compile/out/ (di-gitignore):
 *   compile/out/apk/<nama>-<versi>.apk   APK siap pasang
 *   compile/out/logs/build-apk.log       log Gradle lengkap
 *
 * Langkah:
 *   1. `expo prebuild` bila folder android/ belum ada (folder itu hasil generate).
 *   2. Tulis android/local.properties bila belum ada (SDK + CMake ≥ 3.31: CMake 3.22
 *      gagal di Windows dengan "build.ninja still dirty").
 *   3. Hapus cache bundle JS: Gradle tidak memantau .env, jadi tanpa ini nilai
 *      EXPO_PUBLIC_* lama ikut ter-bundle.
 *   4. `gradlew assembleRelease` untuk armeabi-v7a + arm64-v8a.
 *
 * Opsi:
 *   `npm run compile -- --clean`  hapus android/ dan buat ulang dari awal (±3 menit).
 *   `npm run compile -- --fast`   untuk tes harian: hanya HP 64-bit (arm64-v8a) dan
 *                                 maksimal 4 proses paralel → clang kerja setengahnya,
 *                                 PC tidak penuh. APK berakhiran `-arm64.apk`.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ANDROID = path.join(REPO, 'android');
const OUT = path.join(REPO, 'compile', 'out');
const LOG = path.join(OUT, 'logs', 'build-apk.log');
const ARCHS = 'armeabi-v7a,arm64-v8a';
const WIN = process.platform === 'win32';

function step(msg) {
  console.log(`\n▶ ${msg}`);
}

function fail(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

/**
 * Jalankan perintah. Di Windows `npx`/`gradlew.bat` butuh shell, dan Node meminta
 * perintah + argumen digabung jadi satu string (argumen di sini konstanta, aman).
 */
function run(command, args, options) {
  return WIN
    ? spawnSync([command, ...args].join(' '), { ...options, shell: true })
    : spawnSync(command, args, options);
}

/** Folder terbaru di `dir` yang namanya diawali `prefix` (mis. versi CMake/JDK). */
function newestDir(dir, prefix = '') {
  if (!fs.existsSync(dir)) return null;
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.startsWith(prefix))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const last = names.at(-1);
  return last ? path.join(dir, last) : null;
}

function androidSdk() {
  const fromEnv = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const guess = WIN
    ? path.join(process.env.LOCALAPPDATA ?? '', 'Android', 'Sdk')
    : path.join(
        os.homedir(),
        process.platform === 'darwin' ? 'Library/Android/sdk' : 'Android/Sdk',
      );
  return fs.existsSync(guess) ? guess : null;
}

function javaHome() {
  if (process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  return WIN ? newestDir('C:/Program Files/Eclipse Adoptium', 'jdk-21') : null;
}

const appConfig = JSON.parse(fs.readFileSync(path.join(REPO, 'app.json'), 'utf8')).expo;
const apkName = `${appConfig.android?.package?.split('.').pop() ?? appConfig.slug}-${appConfig.version}.apk`;

if (process.argv.includes('--clean')) {
  step('Hapus android/ (--clean)');
  // Daemon Gradle masih mengunci berkas di android/ (EPERM di Windows) → hentikan dulu.
  if (fs.existsSync(ANDROID)) {
    run(WIN ? `"${path.join(ANDROID, 'gradlew.bat')}"` : './gradlew', ['--stop'], {
      cwd: ANDROID,
      stdio: 'ignore',
    });
  }
  try {
    fs.rmSync(ANDROID, { recursive: true, force: true, maxRetries: 10, retryDelay: 1000 });
  } catch (error) {
    fail(
      `android/ tidak bisa dihapus (${error.code}). Tutup Android Studio / terminal yang ` +
        'membuka folder itu, lalu jalankan ulang.',
    );
  }
}

if (!fs.existsSync(ANDROID)) {
  step('expo prebuild --platform android');
  const npx = run('npx', ['expo', 'prebuild', '--platform', 'android', '--no-install'], {
    cwd: REPO,
    stdio: 'inherit',
  });
  if (npx.status !== 0) fail('expo prebuild gagal.');
}

const localProps = path.join(ANDROID, 'local.properties');
if (!fs.existsSync(localProps)) {
  const sdk = androidSdk();
  if (!sdk) fail('Android SDK tidak ditemukan. Set ANDROID_HOME.');
  const cmake = newestDir(path.join(sdk, 'cmake'));
  // Gradle membaca local.properties sebagai properti Java: pakai '/' agar '\' tak di-escape.
  const lines = [`sdk.dir=${sdk.replaceAll(path.sep, '/')}`];
  if (cmake) lines.push(`cmake.dir=${cmake.replaceAll(path.sep, '/')}`);
  fs.writeFileSync(localProps, lines.join('\n') + '\n');
  step(`local.properties ditulis (${lines.join(', ')})`);
}

step('Hapus cache bundle JS (agar .env terbaru ikut)');
for (const dir of [
  path.join(os.tmpdir(), 'metro-cache'),
  path.join(ANDROID, 'app', 'build', 'generated', 'assets'),
  path.join(ANDROID, 'app', 'build', 'intermediates', 'assets'),
]) {
  fs.rmSync(dir, { recursive: true, force: true });
}

const java = javaHome();
if (!java) fail('JDK 21 tidak ditemukan. Set JAVA_HOME.');

step(`gradlew assembleRelease (${ARCHS}) — log: ${path.relative(REPO, LOG)}`);
fs.mkdirSync(path.dirname(LOG), { recursive: true });
const log = fs.openSync(LOG, 'w');
const gradle = run(
  // Path absolut: cmd.exe tidak selalu mencari .bat di folder kerja.
  WIN ? `"${path.join(ANDROID, 'gradlew.bat')}"` : './gradlew',
  [
    'assembleRelease',
    `-PreactNativeArchitectures=${ARCHS}`,
    // Kotlin dikompilasi di dalam Gradle: tanpa daemon Kotlin terpisah yang terus
    // mengunci android/ (membuat --clean gagal EPERM di Windows).
    '-Pkotlin.compiler.execution.strategy=in-process',
  ],
  { cwd: ANDROID, stdio: ['ignore', log, log], env: { ...process.env, JAVA_HOME: java } },
);
fs.closeSync(log);
if (gradle.status !== 0) {
  const tail = fs.readFileSync(LOG, 'utf8').split(/\r?\n/).slice(-30).join('\n');
  fail(`Build gagal. 30 baris terakhir log:\n${tail}`);
}

const built = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const target = path.join(OUT, 'apk', apkName);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(built, target);

const mb = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
console.log(`\n✔ APK siap: ${path.relative(REPO, target)} (${mb} MB)`);
