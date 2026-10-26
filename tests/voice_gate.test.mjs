/**
 * Regresi: penyaring mode bebas-tangan (utils/voiceGate).
 *
 * Yang dijaga: pertanyaan sungguhan saat memasak HARUS lolos, dan gumaman hasil
 * salah dengar HARUS dibuang. Kalau penyaring terlalu ketat, pengguna tidak bisa
 * bertanya sama sekali — itu lebih buruk daripada bug aslinya. Karena itu daftar
 * "harus lolos" di bawah sengaja dibuat panjang dan beragam.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('voice_gate');
const require = compileForTest({ sources: ['src/utils/voiceGate.ts'], outDir: OUT });
const { judgeTranscript, normalizeTranscript, MIN_WORDS } = require('./src/utils/voiceGate.js');

test('pertanyaan memasak yang wajar DITERIMA', () => {
  const questions = [
    'berapa lama merebus sorgum?',
    'langkah nomor dua apa?',
    'ayamnya diapakan sekarang',
    'boleh pakai santan instan',
    'apakah api harus kecil',
    'tolong jelaskan langkah ini',
    'sorgumnya sudah matang belum',
    'berapa sendok garamnya',
    'kalau tidak ada wortel ganti apa',
    'chef bantu saya',
    'lanjut ke langkah berikutnya',
    'berapa menit lagi',
    'santannya pecah bagaimana',
    'airnya kurang ya',
  ];
  for (const q of questions) {
    const v = judgeTranscript(q, 0.9);
    assert.equal(v.accept, true, `pertanyaan sah ditolak (${v.reason}): ${q}`);
  }
});

test('gumaman dan salah dengar DITOLAK', () => {
  const noise = [
    ['eh', 'filler'],
    ['ya', 'filler'],
    ['hmm', 'filler'],
    ['oke', 'filler'],
    ['uh', 'filler'],
    ['', 'empty'],
    ['   ', 'empty'],
    ['a', 'too-short'],
    ['ok', 'filler'],
  ];
  for (const [text, reason] of noise) {
    const v = judgeTranscript(text, 0.9);
    assert.equal(v.accept, false, `kebisingan lolos: ${JSON.stringify(text)}`);
    assert.equal(v.reason, reason, `alasan salah untuk ${JSON.stringify(text)}`);
  }
});

test('keyakinan rendah dibuang bila perangkat melaporkannya', () => {
  const v = judgeTranscript('berapa lama merebus sorgum', 0.12);
  assert.equal(v.accept, false);
  assert.equal(v.reason, 'low-confidence');
});

test('keyakinan -1 (tidak dilaporkan) tidak menghukum pengguna', () => {
  // Sebagian HP tidak mengisi confidence. Kalimat sah tidak boleh hilang gara-gara itu.
  const v = judgeTranscript('berapa lama merebus sorgum', -1);
  assert.equal(v.accept, true);
});

test('kalimat pendek tanpa kata kunci dibuang, kalimat panjang diterima', () => {
  // Salah dengar khas: dua-tiga kata acak tanpa maksud.
  assert.equal(judgeTranscript('sorghum rice water', 0.9).accept, false);
  // Kalimat panjang dengan istilah sendiri tetap diterima meski tanpa kata kunci baku.
  assert.equal(judgeTranscript('santannya tadi kelihatan agak pecah sedikit', 0.9).accept, true);
});

test('tanda baca dan huruf besar tidak mengganggu', () => {
  assert.equal(normalizeTranscript('  Berapa   LAMA, merebus?!  '), 'berapa lama merebus');
  assert.equal(judgeTranscript('Berapa lama merebus sorgum?', 0.9).accept, true);
});

test('ambang kata minimum konsisten dengan perilaku', () => {
  assert.ok(MIN_WORDS >= 2, 'MIN_WORDS minimal 2 supaya satu kata gumaman tersaring');
  assert.equal(judgeTranscript('merebus', 0.9).accept, false);
  assert.equal(judgeTranscript('merebus sorgum', 0.9).accept, true);
});
