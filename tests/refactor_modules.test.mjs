/**
 * Uji module murni hasil pemecahan layar masak & pencarian menu:
 *   - services/stepTimer      → timer hitung mundur langkah masak (reducer)
 *   - services/menuReply      → membaca balasan server jadi menu/resep
 *   - prompts/cookingContext  → teks konteks Chef AI selama mode masak
 *
 * Semua tanpa jaringan & tanpa React. Dijalankan dengan `npm test`.
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('refactor');

const require = compileForTest({
  sources: [
    'src/services/stepTimer.ts',
    'src/services/menuReply.ts',
    'src/services/ai/json.ts',
    'src/services/ai/failures.ts',
    'src/services/errors.ts',
    'src/services/breaker.ts',
    'src/services/recipeNormalizer.ts',
    'src/services/menuNormalizer.ts',
    'src/prompts/cookingContext.ts',
    'src/utils/assistantText.ts',
    'src/utils/markdown.ts',
    'src/constants/index.ts',
  ],
  outDir: OUT,
});

const load = (...parts) => require(path.join(OUT, 'src', ...parts));
const { stepTimerReducer, initialStepTimer, formatTimer } = load('services', 'stepTimer.js');
const { readMenuReply, readRecipeReply } = load('services', 'menuReply.js');
const { ServerSideError } = load('services', 'ai', 'failures.js');
const { buildCookingChatContext, buildCookingStepLabel, ingredientList } = load(
  'prompts',
  'cookingContext.js',
);

const run = (state, ...actions) => actions.reduce(stepTimerReducer, state);
const tick = { type: 'tick' };

// ---------------------------------------------------------------------------
// stepTimer
// ---------------------------------------------------------------------------

test('stepTimer: langkah berdurasi langsung berjalan; tanpa durasi → tanpa timer', () => {
  assert.deepEqual(initialStepTimer(2), { secondsLeft: 120, running: true, durationSeconds: 120 });
  for (const none of [null, undefined, 0, -3]) {
    assert.deepEqual(initialStepTimer(none), {
      secondsLeft: null,
      running: false,
      durationSeconds: null,
    });
  }
});

test('stepTimer: tick menghitung mundur dan berhenti tepat di 0', () => {
  const end = run(initialStepTimer(0.05), tick, tick, tick); // 3 detik
  assert.deepEqual(end, { secondsLeft: 0, running: false, durationSeconds: 3 });
  assert.equal(run(end, tick), end, 'tick setelah selesai tidak mengubah apa pun');
});

test('stepTimer: REGRESI — pindah langkah saat timer berjalan tetap berjalan dengan durasi baru', () => {
  // Dulu: timer langkah 1 berjalan → lanjut ke langkah 2 → hitung mundur macet.
  const step1 = run(initialStepTimer(5), tick, tick);
  assert.equal(step1.running, true);
  const step2 = stepTimerReducer(step1, { type: 'reset', durationSeconds: 600 });
  assert.deepEqual(step2, { secondsLeft: 600, running: true, durationSeconds: 600 });
  assert.equal(run(step2, tick).secondsLeft, 599, 'tick berikutnya langsung menghitung langkah 2');
});

test('stepTimer: pindah ke langkah tanpa durasi mematikan timer', () => {
  const s = stepTimerReducer(initialStepTimer(5), { type: 'reset', durationSeconds: null });
  assert.deepEqual(s, { secondsLeft: null, running: false, durationSeconds: null });
  assert.equal(run(s, tick), s);
});

test('stepTimer: jeda menahan hitungan, lanjut meneruskannya', () => {
  const paused = run(initialStepTimer(1), tick, { type: 'toggle' });
  assert.equal(paused.running, false);
  assert.equal(run(paused, tick, tick).secondsLeft, 59);
  const resumed = run(paused, { type: 'toggle' }, tick);
  assert.equal(resumed.running, true);
  assert.equal(resumed.secondsLeft, 58);
});

test('stepTimer: toggle tidak berlaku saat waktu habis atau tanpa timer', () => {
  const done = run(initialStepTimer(0.05), tick, tick, tick);
  assert.equal(stepTimerReducer(done, { type: 'toggle' }), done);
  const none = initialStepTimer(null);
  assert.equal(stepTimerReducer(none, { type: 'toggle' }), none);
});

test('stepTimer: restart mengisi ulang durasi penuh & berjalan (juga dari jeda/selesai)', () => {
  const done = run(initialStepTimer(0.05), tick, tick, tick);
  assert.deepEqual(stepTimerReducer(done, { type: 'restart' }), initialStepTimer(0.05));
  const paused = run(initialStepTimer(1), tick, { type: 'toggle' });
  assert.deepEqual(stepTimerReducer(paused, { type: 'restart' }), initialStepTimer(1));
  const none = initialStepTimer(null);
  assert.equal(stepTimerReducer(none, { type: 'restart' }), none);
});

test('formatTimer: MM:SS', () => {
  assert.equal(formatTimer(0), '00:00');
  assert.equal(formatTimer(65), '01:05');
  assert.equal(formatTimer(3600), '60:00');
});

// ---------------------------------------------------------------------------
// menuReply
// ---------------------------------------------------------------------------

const RECIPE = {
  name: 'Apa saja',
  servings: 2,
  totalMinutes: 30,
  ingredients: ['200 g sorgum', '503 ml air'],
  steps: [
    { order: 1, title: 'Rebus sorgum', instruction: 'Rebus sampai empuk.', durationMinutes: 20 },
  ],
};
const MENU = {
  name: 'Bubur Sorgum',
  description: 'Bubur lembut.',
  nutrition: { calories: '503 kkal' },
  strengths: ['Tinggi serat.'],
  weaknesses: ['Perlu direndam.'],
  category: 'main_course',
};
const SERVER_FAILURE =
  'Server AI gagal merespons: Error code: 503 - fetch failed (cause: ETIMEDOUT)';

test('readRecipeReply: REGRESI — angka 503 di dalam resep sah bukan kegagalan server', () => {
  const recipe = readRecipeReply(JSON.stringify(RECIPE), 'Bubur Sorgum');
  assert.ok(recipe, 'resep sah harus terbaca');
  assert.equal(recipe.name, 'Bubur Sorgum', 'nama resep dipaksa sama dengan nama menu');
});

test('readRecipeReply: pesan kegagalan server → ServerSideError', () => {
  assert.throws(() => readRecipeReply(SERVER_FAILURE, 'Bubur'), ServerSideError);
});

test('readRecipeReply: prosa tak terbaca (bukan kegagalan) → null, layak diulang', () => {
  assert.equal(readRecipeReply('Berikut resepnya, sebentar ya.', 'Bubur'), null);
  assert.equal(readRecipeReply('', 'Bubur'), null);
});

test('readMenuReply: REGRESI — kalori 503 di menu sah tetap terbaca', () => {
  const menus = readMenuReply(JSON.stringify([MENU]));
  assert.equal(menus.length, 1);
  assert.equal(menus[0].name, 'Bubur Sorgum');
});

test('readMenuReply: REGRESI — kata "maaf" sebelum JSON tidak membuang menu yang sah', () => {
  const menus = readMenuReply(`Mohon maaf menunggu, ini menunya:\n${JSON.stringify([MENU])}`);
  assert.equal(menus.length, 1);
});

test('readMenuReply: pesan kegagalan server → ServerSideError', () => {
  assert.throws(() => readMenuReply(SERVER_FAILURE), ServerSideError);
  assert.throws(
    () =>
      readMenuReply(
        'Maaf, model AI dari provider saat ini mengalami kendala atau *timeout* (tidak mengembalikan respon).',
      ),
    ServerSideError,
  );
});

test('readMenuReply: kosong / permintaan maaf biasa → daftar kosong (bukan galat)', () => {
  assert.deepEqual(readMenuReply(''), []);
  assert.deepEqual(readMenuReply('   '), []);
  assert.deepEqual(readMenuReply('Maaf, tidak ada teks yang bisa saya berikan.'), []);
});

// ---------------------------------------------------------------------------
// cookingContext — teksnya harus sama persis dengan versi inline sebelumnya
// ---------------------------------------------------------------------------

const COOK = {
  name: 'Bubur Sorgum',
  servings: 2,
  totalMinutes: 30,
  ingredients: ['sorgum', 'santan'],
  steps: [
    { order: 1, title: 'Rendam', instruction: 'Rendam semalam', durationMinutes: null },
    { order: 2, title: 'Rebus', instruction: 'Rebus 20 menit', durationMinutes: 20 },
  ],
};

test('cookingContext: konteks chat per langkah', () => {
  assert.equal(
    buildCookingChatContext(COOK, 1),
    'Saya sedang memasak "Bubur Sorgum". Bahan resep ini: sorgum, santan. Langkah 2/2: Rebus. Rebus 20 menit. Bantu & temani saya selama proses masak, jawab pertanyaan saat saya ragu.',
  );
  assert.equal(
    buildCookingChatContext({ ...COOK, ingredients: [] }, 5),
    'Saya sedang memasak "Bubur Sorgum". Bahan resep ini: belum tercatat. Temani & bantu saya.',
  );
});

test('cookingContext: label langkah suara & daftar bahan', () => {
  assert.equal(buildCookingStepLabel(COOK, 0), 'Langkah 1/2: Rendam. Rendam semalam');
  assert.equal(buildCookingStepLabel(COOK, 4), 'Langkah 5 dari 2');
  assert.equal(ingredientList(COOK), 'sorgum, santan');
  assert.equal(ingredientList({ ...COOK, ingredients: [] }), null);
});
