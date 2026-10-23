/**
 * Uji tiket 06 — satu inti pembuang markdown (`utils/markdown.ts`) yang dipakai dua
 * pintu masuk:
 *   - cleanFoodText      (utils/cleanText.ts)     → kolom pendek: bahan, langkah, menu
 *   - cleanAssistantText (utils/assistantText.ts) → jawaban panjang chat/suara
 *
 * Tiga seam, semuanya MURNI (masuk → keluar, tanpa jaringan):
 *   1. inti bersama   → `stripMarkdown(text, layout)` dengan dua layout
 *   2. pintu kolom pendek
 *   3. pintu jawaban panjang
 * Seam 2 dan 3 mengunci perilaku yang sudah ada sebelum inti diekstrak (refactor
 * tidak boleh mengubahnya); seam 1 mengunci kontrak inti itu sendiri.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest } from './compileForTest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.compiled-markdown');

const require = compileForTest({
  sources: ['src/utils/markdown.ts', 'src/utils/cleanText.ts', 'src/utils/assistantText.ts'],
  outDir: OUT,
});

const { stripMarkdown, stripMarkerChars } = require(path.join(OUT, 'src', 'utils', 'markdown.js'));
const { cleanFoodText } = require(path.join(OUT, 'src', 'utils', 'cleanText.js'));
const { cleanAssistantText } = require(path.join(OUT, 'src', 'utils', 'assistantText.js'));

// ---------------------------------------------------------------------------
// Seam 1 — inti bersama
// ---------------------------------------------------------------------------

test('inti, layout "lines": penanda dibuang, baris & butir dipertahankan', () => {
  const table = [
    ['**tebal** dan __juga__', 'tebal dan juga'],
    ['*miring* dan _juga_', 'miring dan juga'],
    ['pakai `kode` di sini', 'pakai kode di sini'],
    ['# Judul\nisi', 'Judul\nisi'],
    ['### Judul kecil', 'Judul kecil'],
    ['> kutipan', 'kutipan'],
    ['- satu\n* dua\n+ tiga', '• satu\n• dua\n• tiga'],
    ['atas\n\n\n\nbawah', 'atas\n\nbawah'],
    ['atas\n---\nbawah', 'atas\n\nbawah'],
    ['snake_case_nama tetap', 'snake_case_nama tetap'],
  ];
  for (const [input, expected] of table) {
    assert.equal(stripMarkdown(input, 'lines'), expected, JSON.stringify(input));
  }
});

test('inti, layout "inline": semua penanda & awalan daftar dibuang, tautan jadi teksnya', () => {
  const table = [
    ['**tebal** dan __juga__', 'tebal dan juga'],
    ['# Judul\nisi', ' Judul\nisi'],
    ['> kutipan', ' kutipan'],
    ['- satu\n* dua\n1. tiga\n2) empat', 'satu\n dua\ntiga\nempat'],
    ['lihat [resep ini](https://x.id/r) ya', 'lihat resep ini ya'],
    ['![foto bubur](https://x.id/a.png)', 'foto bubur'],
    ['```js\nkode\n```', '\nkode\n'],
    ['kolom | kolom ~coret~', 'kolom  kolom coret'],
  ];
  for (const [input, expected] of table) {
    assert.equal(stripMarkdown(input, 'inline'), expected, JSON.stringify(input));
  }
});

test('inti: stripMarkerChars hanya membuang pagar kode & karakter penanda, tanpa menyentuh tautan/daftar', () => {
  assert.equal(stripMarkerChars('```js\nx **y**\n``` [a](b)'), '\nx y\n [a](b)');
  assert.equal(stripMarkerChars('- butir'), '- butir');
});

test('inti: layout bawaan adalah "lines"', () => {
  assert.equal(stripMarkdown('- a'), '• a');
});

// ---------------------------------------------------------------------------
// Seam 2 — pintu kolom pendek (cleanFoodText): perilaku lama, tidak boleh berubah
// ---------------------------------------------------------------------------

test('cleanFoodText: markdown dibuang, keterangan kurung sampah dibuang', () => {
  const table = [
    ['**150 g** tepung sorgum (±55% dari tepung)', '150 g tepung sorgum'],
    ['- 2 butir telur', '2 butir telur'],
    ['## Aduk rata', 'Aduk rata'],
    ['Tambahkan *sedikit* garam (secukupnya)', 'Tambahkan sedikit garam (secukupnya)'],
    ['`1 sdt` garam,', '1 sdt garam'],
    ['> Panaskan   minyak', 'Panaskan minyak'],
  ];
  for (const [input, expected] of table) {
    assert.equal(cleanFoodText(input), expected, JSON.stringify(input));
  }
  assert.equal(cleanFoodText('1 sdt garam (halus)', { notes: 'all' }), '1 sdt garam');
  assert.equal(
    cleanFoodText('Kocok telur sampai mengembang dan pucat', { maxLength: 20 }),
    'Kocok telur sampai…',
  );
});

// ---------------------------------------------------------------------------
// Seam 3 — pintu jawaban panjang (cleanAssistantText): perilaku lama, tidak boleh berubah
// ---------------------------------------------------------------------------

test('cleanAssistantText: markdown jadi satu baris teks polos', () => {
  const table = [
    ['**Halo** _Bunda_, ini jawabannya.', 'Halo Bunda, ini jawabannya.'],
    ['# Judul\n\nIsi jawaban.', 'Judul Isi jawaban.'],
    ['- satu\n- dua\n1. tiga', 'satu dua tiga'],
    ['Lihat [resep ini](https://x.id/r).', 'Lihat resep ini.'],
    ['![foto](https://x.id/a.png) cantik', 'foto cantik'],
    ['Pakai ```js\nkode\n``` ya', 'Pakai kode ya'],
    ['Ganti dengan ubi 😀 ya.', 'Ganti dengan ubi ya.'],
    ['Jawaban: Pakai ubi.', 'Pakai ubi.'],
  ];
  for (const [input, expected] of table) {
    assert.equal(cleanAssistantText(input), expected, JSON.stringify(input));
  }
});

test('cleanAssistantText: jawaban yang SELURUHNYA soal harga tidak dikosongkan', () => {
  assert.equal(cleanAssistantText('**Biaya** per kg'), 'Biaya per kg');
});
