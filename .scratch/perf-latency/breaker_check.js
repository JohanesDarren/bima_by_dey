/**
 * Uji perilaku state machine pemutus arus (bukan sekadar tipe).
 * Dijalankan dengan `node .scratch/perf-latency/breaker_check.js` dari akar repo.
 * Mengompilasi sendiri sumbernya bila belum ada, supaya tidak butuh artefak ter-commit.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(__dirname, 'breaker-check');
const COMPILED = path.join(OUT_DIR, 'breaker.js');

if (!fs.existsSync(COMPILED)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  execFileSync(
    'npx',
    [
      'tsc',
      path.join(REPO, 'src', 'services', 'breaker.ts'),
      '--ignoreConfig',
      '--outDir',
      OUT_DIR,
      '--module',
      'commonjs',
      '--target',
      'es2019',
      '--skipLibCheck',
    ],
    { cwd: REPO, stdio: 'inherit' },
  );
}

const { CircuitBreaker, CircuitOpenError } = require(COMPILED);

let failures = 0;
const check = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label}  (dapat=${JSON.stringify(actual)} harap=${JSON.stringify(expected)})`,
  );
};

// Jam palsu supaya bisa memajukan waktu tanpa menunggu.
let now = 1_000_000;
const clock = () => now;

// Skenario 1: normal → 3 gagal → OPEN → tunggu 60s → HALF-OPEN (1 percobaan) → sukses → CLOSED
const b = new CircuitBreaker({ failureThreshold: 3, openMs: 60_000, now: clock });
check('awal CLOSED, izinkan lewat', [b.getState(), b.canPass()], ['closed', true]);
b.onFailure();
b.onFailure();
check('2 gagal: masih CLOSED', [b.getState(), b.canPass()], ['closed', true]);
b.onFailure();
check('3 gagal: OPEN, tolak', [b.getState(), b.canPass()], ['open', false]);

now += 59_000;
check('59s: masih OPEN, tolak', [b.getState(), b.canPass()], ['open', false]);
now += 2_000;
{
  const passed = b.canPass();
  check('61s: jadi HALF-OPEN, izinkan 1', [b.getState(), passed], ['half-open', true]);
}
check('HALF-OPEN: percobaan kedua ditahan', b.canPass(), false);

// Skenario 2: percobaan half-open gagal → OPEN lagi
b.onFailure();
check('probe gagal: OPEN lagi', [b.getState(), b.canPass()], ['open', false]);

// Skenario 3: setelah openMs, probe sukses → CLOSED + hitungan nol
now += 61_000;
{
  const passed = b.canPass();
  check('lewat openMs: HALF-OPEN lagi', [b.getState(), passed], ['half-open', true]);
}
b.onSuccess();
check('probe sukses: CLOSED', [b.getState(), b.canPass()], ['closed', true]);
b.onFailure();
check(
  'setelah sukses, hitungan direset (1 gagal tetap CLOSED)',
  [b.getState(), b.canPass()],
  ['closed', true],
);

// Skenario 4: onAbort melepas slot half-open supaya tidak macet
const b2 = new CircuitBreaker({ failureThreshold: 2, openMs: 1_000, now: clock });
b2.onFailure();
b2.onFailure();
check('b2: 2 gagal → OPEN', b2.getState(), 'open');
now += 1_001;
{
  const first = b2.canPass();
  const second = b2.canPass();
  check(
    'b2: HALF-OPEN, probe dipegang',
    [b2.getState(), first, second],
    ['half-open', true, false],
  );
}
b2.onAbort();
check('b2: abort melepas slot → probe baru diizinkan', b2.canPass(), true);

// Skenario 5: ambang bisa diatur
const b3 = new CircuitBreaker({ failureThreshold: 5, now: clock });
for (let i = 0; i < 4; i += 1) b3.onFailure();
check('threshold=5: 4 gagal masih CLOSED', b3.getState(), 'closed');
b3.onFailure();
check('threshold=5: 5 gagal → OPEN', b3.getState(), 'open');

// Skenario 6: CircuitOpenError terbawa sebagai Error biasa
const e = new CircuitOpenError('layanan bermasalah');
check('CircuitOpenError instanceof Error', e instanceof Error, true);

console.log(failures === 0 ? '\nSEMUA LULUS' : `\n${failures} GAGAL`);
process.exit(failures === 0 ? 0 : 1);
