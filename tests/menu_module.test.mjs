/**
 * Uji perilaku module yang dipecah pada tiket 04 — semuanya MURNI (tanpa jaringan):
 *   - prompts/menuPrompts     → teks prompt menu & resep
 *   - prompts/chefPrompt      → susunan pesan & riwayat percakapan Chef
 *   - services/menuNormalizer → perapian item menu dari model
 *   - services/ai/retryPolicy → kapan berhenti mengulang saat server macet
 *
 * Inilah gunanya pemisahan ini: tiap potongan bisa diuji sebagai tabel (masuk →
 * keluar) tanpa memanggil server. Dijalankan lewat `npm test`; sumber dikompilasi
 * sebagai CommonJS oleh tests/compileForTest.mjs, tanpa test runner pihak ketiga.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest } from './compileForTest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.compiled-menu');

const require = compileForTest({
  sources: [
    'src/prompts/menuPrompts.ts',
    'src/prompts/chefPrompt.ts',
    'src/services/menuNormalizer.ts',
    'src/services/ai/retryPolicy.ts',
    'src/services/ai/failures.ts',
    'src/services/breaker.ts',
    'src/utils/assistantText.ts',
    'src/utils/markdown.ts',
    'src/utils/cleanText.ts',
  ],
  outDir: OUT,
});

const { buildRecipePrompt, buildMenuPrompt, RECIPE_MAX_TOKENS, MENU_MAX_TOKENS } = require(
  path.join(OUT, 'src', 'prompts', 'menuPrompts.js'),
);
const { buildChefMessage, buildChefHistory, HISTORY_LIMIT } = require(
  path.join(OUT, 'src', 'prompts', 'chefPrompt.js'),
);
const { normalizeMenuList } = require(path.join(OUT, 'src', 'services', 'menuNormalizer.js'));
const { isFatalFailure } = require(path.join(OUT, 'src', 'services', 'ai', 'retryPolicy.js'));
const { ServerSideError, KroomboxTimeoutError } = require(
  path.join(OUT, 'src', 'services', 'ai', 'failures.js'),
);
const { CircuitOpenError } = require(path.join(OUT, 'src', 'services', 'breaker.js'));

const SEG = { ageGroup: 'Dewasa', condition: 'Umum' };

// ---------------------------------------------------------------------------
// menuPrompts — bentuk permintaan ke model
// ---------------------------------------------------------------------------

test('buildRecipePrompt: memuat nama menu, segmentasi, dan bentuk JSON di UJUNG', () => {
  const p = buildRecipePrompt('Bubur Sorgum', SEG);
  assert.match(p, /Bubur Sorgum/);
  assert.match(p, /Target Umur: \[Dewasa\]/);
  assert.match(p, /Kondisi Khusus: \[Umum\]/);
  // Bentuk keluaran harus di ujung (bukan di awal) — kalau di awal, model menyalin
  // dokumen basis pengetahuan dan JSON-nya tidak pernah keluar.
  const jsonIndex = p.indexOf('{"name": string');
  assert.ok(jsonIndex > p.length * 0.5, 'bentuk JSON harus di paruh akhir prompt');
  assert.match(p.slice(jsonIndex), /"steps":/);
});

test('buildRecipePrompt: segmentasi kosong ditampilkan sebagai Umum', () => {
  const p = buildRecipePrompt('X', { ageGroup: null, condition: null });
  assert.match(p, /Target Umur: \[Umum\], Kondisi Khusus: \[Umum\]/);
});

test('buildMenuPrompt: memuat label kategori yang diminta', () => {
  assert.match(buildMenuPrompt(SEG, 'dessert', []), /dessert \(hidangan penutup\)/);
  assert.match(buildMenuPrompt(SEG, 'soup', []), /soup \(berkuah\)/);
});

test('buildMenuPrompt: daftar larangan muncul hanya bila ada nama yang dikecualikan', () => {
  assert.doesNotMatch(buildMenuPrompt(SEG, 'snack', []), /JANGAN memakai menu berikut/);
  const p = buildMenuPrompt(SEG, 'snack', ['Menu A', 'Menu B']);
  assert.match(p, /JANGAN memakai menu berikut: "Menu A", "Menu B"/);
});

test('batas token keluaran: tidak dipatok (model penalaran butuh ruang untuk berpikir + JSON)', () => {
  assert.equal(RECIPE_MAX_TOKENS, undefined);
  assert.equal(MENU_MAX_TOKENS, undefined);
});

// ---------------------------------------------------------------------------
// menuNormalizer — perapian item menu dari model (lewat interface nyata:
// normalizeMenuList; perapian satu item bersifat internal)
// ---------------------------------------------------------------------------

/** Rapikan satu item lewat pintu masuk module. */
const normOne = (raw) => normalizeMenuList([raw])[0];

test('normalizeMenuList: deskripsi dipangkas jadi satu kalimat', () => {
  assert.equal(normOne({ name: 'A', description: 'Satu. Dua. Tiga.' }).description, 'Satu.');
});

test('normalizeMenuList: kelebihan & kekurangan maksimal dua butir, satu kalimat masing-masing', () => {
  const menu = normOne({
    name: 'A',
    strengths: ['Satu. Dua.', 'Tiga.', 'Empat.', 'Lima.'],
    weaknesses: ['Kurang. Lagi.'],
  });
  assert.deepEqual(menu.strengths, ['Satu.', 'Tiga.']);
  assert.deepEqual(menu.weaknesses, ['Kurang.']);
});

test('normalizeMenuList: kategori bebas dipetakan ke enum yang aman', () => {
  assert.equal(normOne({ name: 'A', category: 'Dessert manis' }).category, 'dessert');
  assert.equal(normOne({ name: 'A', category: 'sop berkuah' }).category, 'soup');
  assert.equal(normOne({ name: 'A', category: 'makanan utama' }).category, 'main_course');
  assert.equal(normOne({ name: 'A', category: 'entah apa' }).category, 'other');
  assert.equal(normOne({ name: 'A' }).category, 'other');
});

test('normalizeMenuList: gizi dipangkas satu kalimat per kunci, bukan objek → kosong', () => {
  const menu = normOne({ name: 'A', nutrition: { calories: '480 kkal. Catatan.' } });
  assert.equal(menu.nutrition.calories, '480 kkal.');
  assert.deepEqual(normOne({ name: 'B', nutrition: undefined }).nutrition, {});
});

test('normalizeMenuList: item tanpa nama dibuang, sisanya dirapikan', () => {
  const list = normalizeMenuList([{ name: 'A' }, {}, { name: 'B', category: 'dessert' }]);
  assert.deepEqual(
    list.map((m) => m.name),
    ['A', 'B'],
  );
  assert.equal(list[1].category, 'dessert');
});

// ---------------------------------------------------------------------------
// retryPolicy — kapan berhenti mengulang
// ---------------------------------------------------------------------------

test('isFatalFailure: kegagalan server/waktu/pemutus → true (jangan diulang)', () => {
  assert.equal(isFatalFailure(new ServerSideError('x')), true);
  assert.equal(isFatalFailure(new KroomboxTimeoutError('x')), true);
  assert.equal(isFatalFailure(new CircuitOpenError('x')), true);
});

test('isFatalFailure: galat biasa → false (masih layak diulang)', () => {
  assert.equal(isFatalFailure(new Error('bentuk jawaban rusak')), false);
  assert.equal(isFatalFailure('bukan error'), false);
  assert.equal(isFatalFailure(undefined), false);
});

// ---------------------------------------------------------------------------
// chefPrompt — susunan pesan & riwayat
// ---------------------------------------------------------------------------

test('buildChefMessage: persona + konteks + aturan, pertanyaan di UJUNG', () => {
  const m = buildChefMessage('Resep A', 'Bisa pakai madu?');
  assert.match(m, /Chef Sorghum/);
  assert.match(m, /Konteks: Resep A/);
  assert.match(m, /TAMBAHAN WAJIB/);
  assert.ok(m.trimEnd().endsWith('Pertanyaan user: Bisa pakai madu?'));
});

test('buildChefHistory: pesan sistem dibuang, markdown dibersihkan', () => {
  const history = buildChefHistory([
    { role: 'system', content: 'aturan internal' },
    { role: 'user', content: '**halo**' },
    { role: 'assistant', content: 'hai' },
  ]);
  assert.equal(history.length, 2);
  assert.deepEqual(history[0], { role: 'user', content: 'halo' });
  assert.deepEqual(history[1], { role: 'assistant', content: 'hai' });
});

test('buildChefHistory: hanya beberapa pesan terakhir yang ikut', () => {
  const many = Array.from({ length: HISTORY_LIMIT + 4 }, (_, i) => ({
    role: 'user',
    content: `pesan ${i}`,
  }));
  const history = buildChefHistory(many);
  assert.equal(history.length, HISTORY_LIMIT);
  assert.equal(history[history.length - 1].content, `pesan ${HISTORY_LIMIT + 3}`);
});
