/**
 * Uji "satu penerjemah galat" (services/errors) — pemetaan SETIAP jenis kegagalan
 * menjadi satu kalimat Indonesia siap tampil, sebagai TABEL: jenis galat masuk →
 * kalimat keluar. Tanpa jaringan, tanpa merender layar.
 *
 * Dijalankan dengan `npm test`; module dikompilasi sebagai CommonJS lewat
 * tests/compileForTest.mjs (tanpa test runner pihak ketiga).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest } from './compileForTest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.compiled-errors');

const require = compileForTest({
  sources: [
    'src/services/errors.ts',
    'src/services/ai/failures.ts',
    'src/services/breaker.ts',
    'src/constants/index.ts',
  ],
  outDir: OUT,
});

const {
  describeError,
  humanizeTransportReason,
  httpFailureText,
  serverFailureText,
  UserFacingError,
  TIMEOUT_SENTENCE,
  CIRCUIT_SENTENCE,
  NETWORK_SENTENCE,
  SERVER_SENTENCE,
  TRANSPORT_DROP_SENTENCE,
  NETWORK_DROP_SENTENCE,
  EMPTY_REPLY_SENTENCE,
  RECIPE_UNAVAILABLE_SENTENCE,
} = require(path.join(OUT, 'src', 'services', 'errors.js'));
const { KroomboxError, KroomboxTimeoutError, ServerSideError } = require(
  path.join(OUT, 'src', 'services', 'ai', 'failures.js'),
);
const { CircuitOpenError } = require(path.join(OUT, 'src', 'services', 'breaker.js'));

// ---------------------------------------------------------------------------
// Tabel: jenis galat → kalimat
// ---------------------------------------------------------------------------

test('describeError: empat jenis kegagalan → kalimat tetapnya masing-masing', () => {
  const table = [
    [new CircuitOpenError(CIRCUIT_SENTENCE), CIRCUIT_SENTENCE],
    [new KroomboxTimeoutError(TIMEOUT_SENTENCE), TIMEOUT_SENTENCE],
    [new ServerSideError(SERVER_SENTENCE), SERVER_SENTENCE],
    [new KroomboxError(NETWORK_SENTENCE), NETWORK_SENTENCE],
  ];
  for (const [error, expected] of table) {
    assert.equal(describeError(error, 'chat'), expected, error.name);
  }
});

test('describeError: pesan spesifik dari lapisan transport dipakai apa adanya (kode HTTP tak hilang)', () => {
  assert.equal(
    describeError(new KroomboxError('Layanan RAG sedang bermasalah (HTTP 502).'), 'chat'),
    'Layanan RAG sedang bermasalah (HTTP 502).',
  );
  assert.equal(
    describeError(
      new ServerSideError(
        'Server AI gagal merespons (kode 503 dari model di sisi server). Coba lagi beberapa menit lagi.',
      ),
      'menu',
    ),
    'Server AI gagal merespons (kode 503 dari model di sisi server). Coba lagi beberapa menit lagi.',
  );
});

test('describeError: jenis galat yang sama berbunyi SAMA di keempat konteks (chat/suara/menu/resep)', () => {
  const contexts = ['chat', 'voice', 'menu', 'recipe'];
  for (const make of [
    () => new CircuitOpenError(CIRCUIT_SENTENCE),
    () => new KroomboxTimeoutError(TIMEOUT_SENTENCE),
    () => new ServerSideError(SERVER_SENTENCE),
    () => new KroomboxError(NETWORK_SENTENCE),
  ]) {
    const sentences = contexts.map((context) => describeError(make(), context));
    assert.equal(new Set(sentences).size, 1, sentences.join(' | '));
  }
});

test('describeError: galat tak dikenal → kalimat pengganti per konteks', () => {
  const unknown = () => new Error('some low-level JS failure');
  assert.equal(describeError(unknown(), 'chat'), 'Koneksi terputus. Coba lagi.');
  assert.equal(describeError(unknown(), 'voice'), 'Koneksi terputus. Coba lagi.');
  assert.equal(describeError(unknown(), 'menu'), 'RAG belum menghasilkan menu baru. Coba lagi.');
  assert.equal(
    describeError(unknown(), 'recipe'),
    'Layanan resep tidak merespons. Coba lagi sebentar lagi.',
  );
  // Nilai aneh sekalipun (bukan Error) tetap dapat kalimat, bukan crash.
  assert.equal(describeError(undefined, 'chat'), 'Koneksi terputus. Coba lagi.');
  assert.equal(describeError('bukan error', 'voice'), 'Koneksi terputus. Coba lagi.');
});

test('describeError: pesan kosong pada galat berkelas → kalimat tetapnya (bukan string kosong)', () => {
  assert.equal(describeError(new KroomboxTimeoutError('   '), 'chat'), TIMEOUT_SENTENCE);
  assert.equal(describeError(new CircuitOpenError(''), 'voice'), CIRCUIT_SENTENCE);
  assert.equal(describeError(new KroomboxError(''), 'menu'), NETWORK_SENTENCE);
  assert.equal(describeError(new ServerSideError(''), 'recipe'), SERVER_SENTENCE);
});

test('describeError: galat yang pesannya sudah untuk pengguna (UserFacingError) → pesannya dipakai apa adanya', () => {
  assert.equal(
    describeError(new UserFacingError('Pilih kelompok umur dan kondisi khusus.'), 'menu'),
    'Pilih kelompok umur dan kondisi khusus.',
  );
  assert.equal(
    describeError(new UserFacingError('Resep dari RAG tidak dapat dibaca. Coba lagi.'), 'recipe'),
    'Resep dari RAG tidak dapat dibaca. Coba lagi.',
  );
  // Pesan kosong → kalimat pengganti konteks (bukan string kosong).
  assert.equal(describeError(new UserFacingError('   '), 'chat'), 'Koneksi terputus. Coba lagi.');
});

test('describeError: konteks tak dikenal → tidak melempar (union tertutup di TS)', () => {
  // `ErrorContext` adalah union tertutup, jadi pemanggil TS tak bisa mengirim konteks
  // asing. Ini hanya memastikan pemanggil dinamis tak membuat proses crash.
  assert.doesNotThrow(() => describeError(new Error('x'), 'entah'));
});

// ---------------------------------------------------------------------------
// Kalimat transport — satu sumber untuk teks yang dipilih lapisan transport
// ---------------------------------------------------------------------------

test('httpFailureText: kode status disebut supaya sebabnya terlihat', () => {
  assert.equal(httpFailureText(502), 'Layanan RAG sedang bermasalah (HTTP 502).');
});

test('kalimat transport: konstanta tetap, tanpa duplikasi literal di call-site', () => {
  assert.equal(
    TRANSPORT_DROP_SENTENCE,
    'Koneksi ke layanan RAG terputus di tengah jalan. Coba lagi.',
  );
  assert.equal(NETWORK_DROP_SENTENCE, 'Koneksi ke layanan RAG terputus. Coba lagi.');
  assert.equal(EMPTY_REPLY_SENTENCE, 'Layanan RAG mengembalikan jawaban kosong. Coba lagi.');
  assert.equal(
    RECIPE_UNAVAILABLE_SENTENCE,
    'Layanan sedang tidak mengirim resep yang bisa dibaca. Coba lagi.',
  );
});

// ---------------------------------------------------------------------------
// Penerjemah teks mentah (dipakai lapisan transport sebelum ada objek galat)
// ---------------------------------------------------------------------------

test('humanizeTransportReason: istilah Inggris diterjemahkan ke kalimat Indonesia', () => {
  assert.equal(
    humanizeTransportReason('fetch failed'),
    'Koneksi ke layanan RAG terputus di tengah jalan. Coba lagi.',
  );
  assert.equal(
    humanizeTransportReason('ECONNRESET'),
    'Koneksi ke layanan RAG terputus di tengah jalan. Coba lagi.',
  );
});

test('humanizeTransportReason: pesan yang sudah Indonesia dibiarkan apa adanya', () => {
  const indonesian = 'Layanan RAG sedang bermasalah (HTTP 502).';
  assert.equal(humanizeTransportReason(indonesian), indonesian);
});

test('serverFailureText: kegagalan model di sisi server → kalimat siap tampil dengan kodenya', () => {
  assert.equal(
    serverFailureText('Server AI gagal merespons: Error code: 503'),
    'Server AI gagal merespons (kode 503 dari model di sisi server). Coba lagi beberapa menit lagi.',
  );
  assert.match(
    serverFailureText('[502]: fetch failed (cause: ETIMEDOUT)'),
    /Server AI gagal merespons/,
  );
});

test('serverFailureText: balasan normal → null', () => {
  assert.equal(serverFailureText('Tumis bumbu sampai harum, lalu masukkan sorgum.'), null);
});
