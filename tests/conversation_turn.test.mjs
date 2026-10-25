/**
 * Uji perilaku module "giliran percakapan" (ai/conversationTurn) — satu-satunya
 * tempat urutan kirim → kumpulkan → baca balasan → petakan galat → riwayat hidup.
 *
 * Stream DISUNTIKKAN sebagai dependensi (lihat fakeStream di bawah), jadi seluruh
 * uji ini berjalan tanpa jaringan sama sekali. Inilah gunanya module ini punya
 * interface sempit: satu fungsi giliran yang menerima stream dari luar.
 *
 * Dijalankan dengan `npm test`. Module yang diuji mengimpor module murni lain
 * (breaker, failures, assistantReply, assistantText), jadi skrip ini mengompilasinya
 * sebagai CommonJS lewat tests/compileForTest.mjs — tanpa test runner pihak ketiga.
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('turn');

const require = compileForTest({
  sources: [
    'src/services/ai/conversationTurn.ts',
    'src/services/ai/types.ts',
    'src/services/ai/failures.ts',
    'src/services/assistantReply.ts',
    'src/services/errors.ts',
    'src/utils/assistantText.ts',
    'src/utils/markdown.ts',
    'src/services/breaker.ts',
    'src/constants/index.ts',
  ],
  outDir: OUT,
});

const { runConversationTurn } = require(
  path.join(OUT, 'src', 'services', 'ai', 'conversationTurn.js'),
);
const { CircuitOpenError } = require(path.join(OUT, 'src', 'services', 'breaker.js'));
const { KroomboxError, KroomboxTimeoutError } = require(
  path.join(OUT, 'src', 'services', 'ai', 'failures.js'),
);

// ---------------------------------------------------------------------------
// Stream palsu: merekam permintaan & penangan, lalu bisa ditembak manual.
// Inilah "stream yang disuntikkan" — module giliran tidak pernah menyentuh jaringan.
// ---------------------------------------------------------------------------

function fakeStream() {
  const state = { request: null, handlers: null, closed: false, closeCalls: 0 };
  const start = (request, handlers) => {
    state.request = request;
    state.handlers = handlers;
    return {
      close: () => {
        state.closed = true;
        state.closeCalls += 1;
      },
    };
  };
  return { start, state };
}

// ---------------------------------------------------------------------------
// Balasan normal
// ---------------------------------------------------------------------------

test('giliran: token mengalir → status ok, teks bersih, riwayat berisi teks mentah', async () => {
  const { start, state } = fakeStream();
  const partials = [];
  const { result } = runConversationTurn(
    { prompt: 'prompt', question: 'Bisa pakai gula aren?', maxWords: 30 },
    start,
    { onPartial: (t) => partials.push(t) },
  );

  state.handlers.onToken('Bisa. ');
  state.handlers.onToken('Gula aren aman dipakai.');
  state.handlers.onDone();

  const out = await result;
  assert.equal(out.status, 'ok');
  assert.equal(out.text, 'Bisa. Gula aren aman dipakai.');
  assert.deepEqual(out.turn, [
    { role: 'user', content: 'Bisa pakai gula aren?' },
    { role: 'assistant', content: 'Bisa. Gula aren aman dipakai.' },
  ]);
  assert.ok(partials.length >= 2, 'onPartial dipanggil saat token mengalir');
});

test('giliran: riwayat & maxTokens diteruskan ke stream apa adanya', async () => {
  const { start, state } = fakeStream();
  const history = [{ role: 'user', content: 'halo' }];
  const { result } = runConversationTurn(
    { prompt: 'prompt', question: 'lanjut?', history, maxTokens: 150 },
    start,
  );
  state.handlers.onToken('Ya.');
  state.handlers.onDone();
  await result;

  assert.equal(state.request.message, 'prompt');
  assert.equal(state.request.maxTokens, 150);
  assert.deepEqual(state.request.history, history);
});

// ---------------------------------------------------------------------------
// Balasan kosong (server menutup tanpa teks berguna)
// ---------------------------------------------------------------------------

test('giliran: balasan kosong → status empty dengan kalimat pengganti dari module', async () => {
  const { start, state } = fakeStream();
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, start);
  state.handlers.onDone();

  const out = await result;
  assert.equal(out.status, 'empty');
  // Kalimatnya milik module, bukan pemanggil — jadi chat & suara pasti sama.
  assert.equal(out.text, 'Layanan tidak mengirim jawaban. Coba kirim lagi.');
});

test('giliran: kalimat balasan kosong identik apa pun pemanggilnya (chat = suara)', async () => {
  const a = fakeStream();
  const b = fakeStream();
  const { result: chatResult } = runConversationTurn(
    { prompt: 'p', question: 'q', maxWords: 30 },
    a.start,
  );
  const { result: voiceResult } = runConversationTurn(
    { prompt: 'p', question: 'q', maxWords: 25 },
    b.start,
  );
  a.state.handlers.onDone();
  b.state.handlers.onDone();

  const [chat, voice] = await Promise.all([chatResult, voiceResult]);
  assert.equal(chat.status, 'empty');
  assert.equal(voice.status, 'empty');
  assert.equal(chat.text, voice.text, 'kegagalan yang sama harus berbunyi sama di kedua jalur');
});

// ---------------------------------------------------------------------------
// startStream melempar sinkron (bukan lewat onError asinkron)
// ---------------------------------------------------------------------------

test('giliran: startStream melempar sinkron → hasil error, bukan promise yang ditolak', async () => {
  const throwing = () => {
    throw new Error('pustaka SSE gagal dibuat');
  };
  const seen = [];
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, throwing, {
    onStreamError: (e) => seen.push(e),
  });

  // Tidak boleh menolak: pemanggil memakai .then tanpa .catch.
  const out = await result;
  assert.equal(out.status, 'error');
  assert.equal(out.text, 'Koneksi terputus. Coba lagi.');
  assert.equal(seen.length, 1);
});

// ---------------------------------------------------------------------------
// Kegagalan model di sisi server (server mengirim pesannya sendiri sebagai "jawaban")
// ---------------------------------------------------------------------------

test('giliran: kegagalan sisi server → status failure dengan kalimat jujur (bukan balon jawaban)', async () => {
  // Giliran mencoba ulang saat server melapor gagal (lihat conversation_retry), jadi
  // stream ini mengirim pesan kegagalan yang sama di SETIAP percobaan.
  const start = (_request, handlers) => {
    setTimeout(() => {
      // Persis seperti yang terukur dari server: pesan kegagalan datang sebagai delta.
      handlers.onToken('Server AI gagal merespons: Error code: 503');
      handlers.onDone();
    }, 0);
    return { close: () => {} };
  };
  const partials = [];
  const { result } = runConversationTurn(
    { prompt: 'prompt', question: 'apa?', maxWords: 30 },
    start,
    { onPartial: (t) => partials.push(t) },
  );

  const out = await result;
  assert.equal(out.status, 'failure');
  assert.match(out.text, /503/);
  assert.match(out.text, /Coba lagi/);
  // Selagi mengalir pun chat sudah melihat kalimat jujurnya, bukan teks teknis.
  assert.ok(partials.some((t) => /503/.test(t)));
});

// ---------------------------------------------------------------------------
// Pemutus arus terbuka
// ---------------------------------------------------------------------------

test('giliran: pemutus arus terbuka → status error, kalimatnya apa adanya (bukan "koneksi terputus")', async () => {
  const { start, state } = fakeStream();
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, start);

  const denied = new CircuitOpenError('Layanan AI sedang bermasalah. Tunggu sebentar.');
  state.handlers.onError(denied);

  const out = await result;
  assert.equal(out.status, 'error');
  assert.equal(out.text, 'Layanan AI sedang bermasalah. Tunggu sebentar.');
  assert.deepEqual(out.turn, []);
});

test('giliran: timeout → kalimat jujurnya sendiri (bukan lagi "koneksi terputus")', async () => {
  const { start, state } = fakeStream();
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, start);
  state.handlers.onError(new KroomboxTimeoutError('Layanan tidak mengirim data terlalu lama.'));

  const out = await result;
  assert.equal(out.status, 'error');
  assert.equal(out.text, 'Layanan tidak mengirim data terlalu lama.');
});

test('giliran: galat asing → kalimat pengganti konteks percakapan', async () => {
  const { start, state } = fakeStream();
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, start);
  state.handlers.onError(new Error('some low-level JS failure'));

  const out = await result;
  assert.equal(out.status, 'error');
  assert.equal(out.text, 'Koneksi terputus. Coba lagi.');
});

test('giliran: KroomboxError biasa → kalimat tetapnya (kegagalan jaringan)', async () => {
  const { start, state } = fakeStream();
  const { result } = runConversationTurn({ prompt: 'prompt', question: 'apa?' }, start);
  state.handlers.onError(new KroomboxError('Layanan RAG mengembalikan jawaban kosong.'));

  const out = await result;
  assert.equal(out.text, 'Layanan RAG mengembalikan jawaban kosong.');
});

test('giliran: onStreamError menerima galat mentah sebelum diterjemahkan', async () => {
  const { start, state } = fakeStream();
  const seen = [];
  const { result } = runConversationTurn({ message: 'prompt', question: 'apa?' }, start, {
    onStreamError: (e) => seen.push(e),
  });
  const raw = new KroomboxTimeoutError('detail teknis untuk log');
  state.handlers.onError(raw);

  const out = await result;
  assert.equal(seen.length, 1);
  assert.equal(seen[0], raw, 'galat mentah diteruskan apa adanya untuk pencatatan');
  assert.equal(out.text, 'detail teknis untuk log');
});

// ---------------------------------------------------------------------------
// Pembatalan oleh pengguna
// ---------------------------------------------------------------------------

test('giliran: close() menutup stream yang disuntikkan', async () => {
  const { start, state } = fakeStream();
  const { result, close } = runConversationTurn({ message: 'prompt', question: 'apa?' }, start);

  close();
  assert.equal(state.closed, true);

  // Menutup setelah selesai juga tidak masalah (idempoten di sisi pemanggil).
  close();
  assert.equal(state.closeCalls, 2);
  void result;
});
