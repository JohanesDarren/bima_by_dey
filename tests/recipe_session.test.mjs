/**
 * Uji perilaku module "sesi resep" (services/recipeSession) — satu-satunya pemilik
 * status membuka resep (memuat / siap / gagal), resep aktif, coba lagi, dan snapshot
 * riwayat.
 *
 * Pengambil resep DISUNTIKKAN (`fetchRecipe` palsu di bawah), jadi seluruh uji ini
 * berjalan tanpa jaringan DAN tanpa merender layar — itulah gunanya state resep
 * pindah ke module murni.
 *
 * Dijalankan dengan `npm test`. Module yang diuji hanya mengimpor tipe (terhapus saat
 * kompilasi), jadi skrip ini mengompilasinya sebagai CommonJS lewat
 * tests/compileForTest.mjs — tanpa test runner pihak ketiga.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest } from './compileForTest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.compiled-recipe');

const require = compileForTest({
  sources: [
    'src/services/recipeSession.ts',
    'src/services/errors.ts',
    'src/services/ai/failures.ts',
    'src/services/breaker.ts',
    'src/utils/menuKey.ts',
    'src/constants/index.ts',
  ],
  outDir: OUT,
});

const { createRecipeSession } = require(path.join(OUT, 'src', 'services', 'recipeSession.js'));
const { UserFacingError } = require(path.join(OUT, 'src', 'services', 'errors.js'));

const SEGMENT = { ageGroup: 'Dewasa', condition: 'Umum' };

function recipe(name) {
  return { name, servings: 2, ingredients: ['sorgum'], steps: [], totalMinutes: 5 };
}

/** Pengambil palsu: mengembalikan `result`, atau melempar `error`. */
function fakeFetcher({ result, error } = {}) {
  const calls = [];
  const fn = (menuName, segment) => {
    calls.push({ menuName, segment });
    return error ? Promise.reject(error) : Promise.resolve(result);
  };
  fn.calls = calls;
  return fn;
}

/** Pengambil yang penyelesaiannya bisa dikendalikan manual (uji balapan). */
function deferredFetcher() {
  const pending = [];
  const fn = (menuName) =>
    new Promise((resolve, reject) => {
      pending.push({ menuName, resolve, reject });
    });
  fn.pending = pending;
  return fn;
}

// ---------------------------------------------------------------------------
// Transisi status dasar
// ---------------------------------------------------------------------------

test('sesi: open → status loading lalu ready, resep terisi', async () => {
  const fetcher = fakeFetcher({ result: recipe('Bubur Sorgum') });
  const session = createRecipeSession(fetcher);

  assert.equal(session.getState().status, 'idle');
  const done = session.open('Bubur Sorgum', SEGMENT);
  assert.equal(session.getState().status, 'loading');
  await done;

  const s = session.getState();
  assert.equal(s.status, 'ready');
  assert.equal(s.recipe.name, 'Bubur Sorgum');
  assert.equal(s.error, null);
  assert.equal(s.menuName, 'Bubur Sorgum');
});

test('sesi: kegagalan yang pesannya sudah untuk pengguna → diteruskan apa adanya', async () => {
  const fetcher = fakeFetcher({
    error: new UserFacingError('Resep dari RAG tidak dapat dibaca. Coba lagi.'),
  });
  const session = createRecipeSession(fetcher);

  await session.open('Bubur Sorgum', SEGMENT);

  const s = session.getState();
  assert.equal(s.status, 'error');
  assert.equal(s.error, 'Resep dari RAG tidak dapat dibaca. Coba lagi.');
  assert.equal(s.recipe, null);
});

test('sesi: galat teknis (tak berkelas) → kalimat pengganti konteks resep dari module errors', async () => {
  const session = createRecipeSession(fakeFetcher({ error: new Error('boom low-level') }));

  await session.open('Bubur Sorgum', SEGMENT);

  assert.equal(session.getState().error, 'Layanan resep tidak merespons. Coba lagi sebentar lagi.');
});

test('sesi: galat berkelas dengan pesan kosong → kalimat tetapnya (bukan string kosong)', async () => {
  const session = createRecipeSession(fakeFetcher({ error: new UserFacingError('   ') }));

  await session.open('Bubur Sorgum', SEGMENT);

  assert.equal(session.getState().error, 'Layanan resep tidak merespons. Coba lagi sebentar lagi.');
});

// ---------------------------------------------------------------------------
// Idempotensi & menu berbeda
// ---------------------------------------------------------------------------

test('sesi: open menu yang sama dua kali tidak mengambil ulang', async () => {
  const fetcher = fakeFetcher({ result: recipe('Bubur Sorgum') });
  const session = createRecipeSession(fetcher);

  await session.open('Bubur Sorgum', SEGMENT);
  await session.open('Bubur Sorgum', SEGMENT);

  assert.equal(fetcher.calls.length, 1);
});

test('sesi: open ulang menu yang SAMA setelah gagal mencoba lagi (bukan menyodorkan galat lama)', async () => {
  let attempt = 0;
  const fetcher = () => {
    attempt += 1;
    return attempt === 1
      ? Promise.reject(new Error('putus'))
      : Promise.resolve(recipe('Bubur Sorgum'));
  };
  const session = createRecipeSession(fetcher);

  await session.open('Bubur Sorgum', SEGMENT);
  assert.equal(session.getState().status, 'error');

  await session.open('Bubur Sorgum', SEGMENT);
  assert.equal(session.getState().status, 'ready');
  assert.equal(attempt, 2);
});

test('sesi: membuka menu lain memicu pengambilan baru', async () => {
  const fetcher = fakeFetcher({ result: recipe('Bubur Sorgum') });
  const session = createRecipeSession(fetcher);

  await session.open('Bubur Sorgum', SEGMENT);
  await session.open('Sup Sorgum', SEGMENT);

  assert.equal(fetcher.calls.length, 2);
  assert.equal(session.getState().menuName, 'Sup Sorgum');
});

// ---------------------------------------------------------------------------
// statusFor: status untuk sebuah menu (menjaga resep menu lain tak berkedip)
// ---------------------------------------------------------------------------

test('sesi: statusFor memakai menuKey — nama beda tipis tetap dianggap menu yang sama', async () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('Bubur Sorgum Ayam') }));
  await session.open('Bubur Sorgum Ayam', SEGMENT);

  // Nama menu dari AI sering beda tipis: tanda hubung, spasi ganda, besar-kecil huruf.
  assert.equal(session.statusFor('bubur sorgum ayam'), 'ready');
  assert.equal(session.statusFor('Bubur  Sorgum-Ayam'), 'ready');
});

test('sesi: statusFor untuk menu lain → loading (jangan sodorkan resep menu lain)', async () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('Menu A') }));
  await session.open('Menu A', SEGMENT);

  assert.equal(session.statusFor('Menu B'), 'loading');
});

test('sesi: statusFor menu apa pun saat sesi kosong → loading', () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('X') }));
  assert.equal(session.statusFor('X'), 'loading');
});

test('sesi: setelah snapshot, statusFor menu apa pun → loading (snapshot tak terikat menu)', () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('X') }));
  session.openSnapshot(recipe('Resep Lama'));

  assert.equal(session.statusFor('Resep Lama'), 'loading');
});

// ---------------------------------------------------------------------------
// Coba lagi
// ---------------------------------------------------------------------------

test('sesi: retry mengulang permintaan terakhir yang gagal lalu berhasil', async () => {
  let attempt = 0;
  const fetcher = () => {
    attempt += 1;
    return attempt === 1
      ? Promise.reject(new Error('putus'))
      : Promise.resolve(recipe('Bubur Sorgum'));
  };
  const session = createRecipeSession(fetcher);

  await session.open('Bubur Sorgum', SEGMENT);
  assert.equal(session.getState().status, 'error');

  await session.retry();
  assert.equal(session.getState().status, 'ready');
  assert.equal(session.getState().recipe.name, 'Bubur Sorgum');
  assert.equal(attempt, 2);
});

test('sesi: retry tanpa permintaan sebelumnya tidak melakukan apa-apa', async () => {
  const fetcher = fakeFetcher({ result: recipe('X') });
  const session = createRecipeSession(fetcher);

  await session.retry();

  assert.equal(fetcher.calls.length, 0);
  assert.equal(session.getState().status, 'idle');
});

// ---------------------------------------------------------------------------
// Balapan: permintaan terbaru menang
// ---------------------------------------------------------------------------

test('sesi: permintaan lebih baru menang, bukan yang terakhir selesai', async () => {
  const fetcher = deferredFetcher();
  const session = createRecipeSession(fetcher);

  const first = session.open('Menu A', SEGMENT);
  const second = session.open('Menu B', SEGMENT);
  assert.equal(fetcher.pending.length, 2);

  // Menu B selesai lebih dulu, lalu Menu A (yang lebih tua) selesai belakangan.
  fetcher.pending[1].resolve(recipe('Menu B'));
  await second;
  fetcher.pending[0].resolve(recipe('Menu A'));
  await first;

  assert.equal(session.getState().recipe.name, 'Menu B');
  assert.equal(session.getState().menuName, 'Menu B');
});

// ---------------------------------------------------------------------------
// Snapshot riwayat (tanpa jaringan, tanpa MenuItem palsu)
// ---------------------------------------------------------------------------

test('sesi: openSnapshot menampilkan resep langsung tanpa memanggil pengambil', () => {
  const fetcher = fakeFetcher({ result: recipe('X') });
  const session = createRecipeSession(fetcher);

  session.openSnapshot(recipe('Resep Lama'));

  const s = session.getState();
  assert.equal(s.status, 'ready');
  assert.equal(s.recipe.name, 'Resep Lama');
  assert.equal(s.error, null);
  assert.equal(fetcher.calls.length, 0);
});

test('sesi: openSnapshot membatalkan pengambilan yang sedang berjalan', async () => {
  const fetcher = deferredFetcher();
  const session = createRecipeSession(fetcher);

  const inflight = session.open('Menu A', SEGMENT);
  session.openSnapshot(recipe('Resep Lama'));
  fetcher.pending[0].resolve(recipe('Menu A'));
  await inflight;

  assert.equal(session.getState().recipe.name, 'Resep Lama');
});

// ---------------------------------------------------------------------------
// reset & langganan
// ---------------------------------------------------------------------------

test('sesi: reset mengembalikan state ke idle', async () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('X') }));
  await session.open('X', SEGMENT);

  session.reset();

  assert.deepEqual(session.getState(), {
    status: 'idle',
    recipe: null,
    error: null,
    menuName: null,
  });
});

test('sesi: perubahan state memberi tahu pelanggan', async () => {
  const session = createRecipeSession(fakeFetcher({ result: recipe('X') }));
  let notified = 0;
  const unsubscribe = session.subscribe(() => {
    notified += 1;
  });

  await session.open('X', SEGMENT);
  assert.equal(notified, 2); // loading + ready

  unsubscribe();
  session.reset();
  assert.equal(notified, 2); // tidak lagi diberi tahu setelah berhenti berlangganan
});
