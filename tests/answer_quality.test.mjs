/**
 * Regresi: pemeriksa mutu jawaban (utils/answerQuality).
 *
 * Tujuan: menandai jawaban yang JELAS tidak menjawab, tanpa salah menuduh
 * jawaban yang sudah baik. Salah tuduh berarti percobaan ulang yang sia-sia dan
 * waktu tunggu dua kali lipat — padahal kecepatan menjawab adalah syarat aplikasi.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('answer_quality');

const require = compileForTest({
  sources: ['src/utils/answerQuality.ts'],
  outDir: OUT,
});
const { answersQuestion } = require('./src/utils/answerQuality.js');

test('pertanyaan waktu + angka: jawaban tanpa angka dianggap meleset', () => {
  // Kasus nyata dari aplikasi.
  const q = 'berapa lama merendam sorgum?';
  const bad =
    'Sup Ayam Sorgum adalah hidangan berkuah berbasis beras sorgum dan ayam, cocok sebagai menu utama hangat.';
  assert.equal(answersQuestion(q, bad), false);
});

test('pertanyaan waktu + angka: jawaban yang menyebut angkanya lolos', () => {
  const q = 'berapa lama merendam sorgum?';
  const good = 'Rendam beras sorgum selama 8 jam, lalu tiriskan.';
  assert.equal(answersQuestion(q, good), true);
});

test('angka dalam bentuk kata juga diterima', () => {
  const q = 'berapa lama merebus sorgum?';
  const good = 'Rebus selama 20 menit sampai lunak.';
  assert.equal(answersQuestion(q, good), true);
});

test('pertanyaan tindakan: deskripsi hidangan tanpa kata kerja dianggap meleset', () => {
  const q = 'untuk langkah nomor 2 apa yang harus saya lakukan?';
  const bad = 'Sup ayam sorgum merupakan hidangan berkuah gurih yang cocok untuk keluarga.';
  assert.equal(answersQuestion(q, bad), false);
});

test('pertanyaan tindakan: jawaban berisi kata kerja memasak lolos', () => {
  const q = 'untuk langkah nomor 2 apa yang harus saya lakukan?';
  const good = 'Didihkan 600 ml air, masukkan beras sorgum, rebus 20 menit hingga lunak.';
  assert.equal(answersQuestion(q, good), true);
});

test('jawaban yang benar tidak boleh dianggap meleset (anti salah tuduh)', () => {
  const cases = [
    [
      'kalau langkah 4, ayamnya diapakan?',
      'Pada langkah 4, 500 g dada ayam dimasak hingga matang.',
    ],
    ['apa langkah selanjutnya setelah rendam?', 'Setelah rendam 8 jam, lanjut merebus sorgum.'],
    ['berapa lama mengukus bolu?', 'Kukus 20 menit dengan api sedang.'],
    ['boleh pakai gula pasir?', 'Boleh, gula pasir bisa dipakai.'],
    ['apa pengganti santan?', 'Bisa pakai susu evaporasi.'],
  ];
  for (const [q, a] of cases) {
    assert.equal(answersQuestion(q, a), true, `salah tuduh: ${q} -> ${a}`);
  }
});

test('pertanyaan tanpa angka tidak dipaksa mencocokkan angka', () => {
  const q = 'apa langkah selanjutnya?';
  const a = 'Lanjut menumis bumbu sampai harum.';
  assert.equal(answersQuestion(q, a), true);
});

test('jawaban kosong tidak dianggap meleset (biar jalur galat yang menangani)', () => {
  assert.equal(answersQuestion('berapa lama?', ''), true);
});
