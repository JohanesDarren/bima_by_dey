/**
 * Uji perilaku controller panel chat (services/chatController) — pemilik percakapan
 * teks: pesan, kolom tulis, status mengirim, TTS, dan riwayat.
 *
 * Giliran percakapan & suara DISUNTIKKAN (`fakeTurns` / `fakeSpeech` di bawah), jadi
 * seluruh uji ini berjalan tanpa jaringan dan tanpa merender UI.
 *
 * Dijalankan dengan `npm test`; sumber dikompilasi sebagai CommonJS lewat
 * tests/compileForTest.mjs — tanpa test runner pihak ketiga.
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('chat');

const require = compileForTest({
  sources: [
    'src/services/chatController.ts',
    'src/services/ai/conversationTurn.ts',
    'src/services/ai/types.ts',
    'src/services/ai/failures.ts',
    'src/services/assistantReply.ts',
    'src/services/errors.ts',
    'src/services/breaker.ts',
    'src/prompts/chefPrompt.ts',
    'src/utils/assistantText.ts',
    'src/utils/markdown.ts',
    'src/constants/index.ts',
    'src/types/index.ts',
  ],
  outDir: OUT,
});

const { createChatController } = require(path.join(OUT, 'src', 'services', 'chatController.js'));

// ---------------------------------------------------------------------------
// Giliran palsu: merekam permintaan, lalu hasilnya diselesaikan manual.
// ---------------------------------------------------------------------------

function fakeTurns() {
  const calls = [];
  const runTurn = (request, observer) => {
    const call = { request, observer, closed: 0 };
    call.result = new Promise((resolve, reject) => {
      call.resolve = resolve;
      call.reject = reject;
    });
    calls.push(call);
    return { result: call.result, close: () => (call.closed += 1) };
  };
  return { runTurn, calls };
}

function fakeSpeech() {
  const log = [];
  return { log, speak: (t) => log.push(['speak', t]), stop: () => log.push(['stop']) };
}

function setup(overrides = {}) {
  const turns = fakeTurns();
  const speech = fakeSpeech();
  const heard = [];
  const controller = createChatController({
    runTurn: turns.runTurn,
    speech,
    getContext: () => 'konteks resep',
    onAssistantMessage: (t) => heard.push(t),
    autoSpeak: true,
    ...overrides,
  });
  return { controller, turns, speech, heard };
}

const ok = (text) => ({ status: 'ok', text, turn: [] });
const flush = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------

test('kirim: pesan pengguna + balon kosong muncul, kolom tulis dikosongkan, status mengirim', () => {
  const { controller } = setup();
  controller.setInput('  Bisa pakai gula aren?  ');
  controller.send();

  const s = controller.getState();
  assert.equal(s.streaming, true);
  assert.equal(s.input, '');
  assert.equal(s.lastQuestion, 'Bisa pakai gula aren?');
  assert.deepEqual(s.messages, [
    { role: 'user', content: 'Bisa pakai gula aren?' },
    { role: 'assistant', content: '' },
  ]);
});

test('kirim: teks kosong atau saat sedang mengirim diabaikan', () => {
  const { controller, turns } = setup();
  controller.send('   ');
  assert.equal(turns.calls.length, 0);

  controller.send('satu');
  controller.send('dua');
  assert.equal(turns.calls.length, 1, 'giliran kedua ditolak selagi yang pertama berjalan');
  assert.equal(controller.getState().messages.length, 2);
});

test('kirim: permintaan giliran memuat konteks, pertanyaan, batas token & kata', () => {
  const { controller, turns } = setup();
  controller.send('Pengganti santan?');

  const { request } = turns.calls[0];
  assert.equal(request.question, 'Pengganti santan?');
  assert.ok(request.prompt.includes('konteks resep'));
  assert.ok(request.prompt.includes('Pengganti santan?'));
  assert.equal(request.maxTokens, 250);
  assert.ok(request.maxWords > 0);
});

test('partial: balon asisten terisi selagi token mengalir', () => {
  const { controller, turns } = setup();
  controller.send('halo');
  turns.calls[0].observer.onPartial('Ha');
  turns.calls[0].observer.onPartial('Halo, Bunda');

  assert.equal(controller.getState().messages[1].content, 'Halo, Bunda');
});

test('ok: balon final, dibacakan (penanda markdown dibuang), pemanggil diberi tahu', async () => {
  const { controller, turns, speech, heard } = setup();
  controller.send('halo');
  turns.calls[0].resolve(ok('Pakai **gula aren** ya'));
  await flush();

  const s = controller.getState();
  assert.equal(s.streaming, false);
  assert.equal(s.messages[1].content, 'Pakai **gula aren** ya');
  assert.deepEqual(speech.log, [['stop'], ['speak', 'Pakai gula aren ya']]);
  assert.deepEqual(heard, ['Pakai **gula aren** ya']);
});

test('ok: tidak dibacakan bila suara dimatikan', async () => {
  const { controller, turns, speech, heard } = setup({ autoSpeak: false });
  controller.send('halo');
  turns.calls[0].resolve(ok('Jawaban'));
  await flush();

  assert.deepEqual(speech.log, []);
  assert.deepEqual(heard, ['Jawaban'], 'pemanggil tetap diberi tahu');
});

test('ok: suara dimatikan di tengah jawaban → jawaban yang sudah berjalan tetap dibacakan', async () => {
  const { controller, turns, speech } = setup();
  controller.send('halo');
  controller.toggleAutoSpeak();
  turns.calls[0].resolve(ok('Jawaban'));
  await flush();

  assert.deepEqual(speech.log, [['stop'], ['stop'], ['speak', 'Jawaban']]);
});

test('hasil giliran: status & balon berubah dalam SATU notifikasi (tak ada render basi)', async () => {
  const { controller, turns } = setup();
  controller.send('halo');
  const snapshots = [];
  controller.subscribe(() => snapshots.push(controller.getState()));
  turns.calls[0].resolve(ok('Jawaban'));
  await flush();

  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].streaming, false);
  assert.equal(snapshots[0].messages[1].content, 'Jawaban');
});

test('empty / failure: satu balon berisi kalimat modul, tidak dibacakan, pemanggil tidak diberi tahu', async () => {
  for (const status of ['empty', 'failure']) {
    const { controller, turns, speech, heard } = setup();
    controller.send('halo');
    turns.calls[0].resolve({ status, text: 'Kalimat jujur', turn: [] });
    await flush();

    const s = controller.getState();
    assert.equal(s.streaming, false);
    assert.deepEqual(s.messages, [
      { role: 'user', content: 'halo' },
      { role: 'assistant', content: 'Kalimat jujur' },
    ]);
    assert.deepEqual(speech.log, []);
    assert.deepEqual(heard, []);
  }
});

test('error: balon kosong dibuang dan diganti kalimat galat', async () => {
  const { controller, turns } = setup();
  controller.send('halo');
  turns.calls[0].resolve({ status: 'error', text: 'Koneksi putus', turn: [] });
  await flush();

  assert.deepEqual(controller.getState().messages, [
    { role: 'user', content: 'halo' },
    { role: 'assistant', content: 'Koneksi putus' },
  ]);
});

test('error: balon yang sudah terisi sebagian dipertahankan, galat jadi balon baru', async () => {
  const { controller, turns } = setup();
  controller.send('halo');
  turns.calls[0].observer.onPartial('Setengah jawaban');
  turns.calls[0].resolve({ status: 'error', text: 'Koneksi putus', turn: [] });
  await flush();

  assert.deepEqual(controller.getState().messages.slice(1), [
    { role: 'assistant', content: 'Setengah jawaban' },
    { role: 'assistant', content: 'Koneksi putus' },
  ]);
});

test('janji giliran ditolak: status mengirim dilepas, balon berisi kalimat galat', async () => {
  const { controller, turns } = setup();
  controller.send('halo');
  turns.calls[0].reject(new Error('bug di module'));
  await flush();

  const s = controller.getState();
  assert.equal(s.streaming, false, 'panel tidak tersangkut di status mengirim');
  assert.ok(s.messages[1].content.length > 0);
});

test('riwayat: giliran berikutnya membawa percakapan sebelumnya, tanpa giliran berjalan', async () => {
  const { controller, turns } = setup();
  controller.send('Pertanyaan satu');
  turns.calls[0].resolve(ok('Jawaban satu'));
  await flush();

  controller.send('Pertanyaan dua');
  assert.deepEqual(turns.calls[1].request.history, [
    { role: 'user', content: 'Pertanyaan satu' },
    { role: 'assistant', content: 'Jawaban satu' },
  ]);
});

test('stop: menutup giliran, melepas status mengirim', () => {
  const { controller, turns } = setup();
  controller.send('halo');
  controller.stop();

  assert.equal(turns.calls[0].closed, 1);
  assert.equal(controller.getState().streaming, false);
  controller.send('lagi');
  assert.equal(turns.calls.length, 2, 'bisa kirim lagi setelah berhenti');
});

test('ulangi: lastQuestion bisa dikirim ulang', async () => {
  const { controller, turns } = setup();
  controller.send('halo');
  turns.calls[0].resolve(ok('hai'));
  await flush();

  controller.send(controller.getState().lastQuestion);
  assert.equal(turns.calls[1].request.question, 'halo');
});

test('toggleAutoSpeak: mematikan menghentikan suara; menyalakan tidak', () => {
  const { controller, speech } = setup();
  controller.toggleAutoSpeak();
  assert.equal(controller.getState().autoSpeak, false);
  assert.deepEqual(speech.log, [['stop']]);

  controller.toggleAutoSpeak();
  assert.equal(controller.getState().autoSpeak, true);
  assert.deepEqual(speech.log, [['stop']]);
});

test('dispose: menutup giliran berjalan dan menghentikan suara', () => {
  const { controller, turns, speech } = setup();
  controller.send('halo');
  controller.dispose();

  assert.equal(turns.calls[0].closed, 1);
  assert.deepEqual(speech.log, [['stop']]);
});

test('subscribe: pendengar dipanggil saat state berubah, berhenti setelah unsubscribe', () => {
  const { controller } = setup();
  let count = 0;
  const unsubscribe = controller.subscribe(() => (count += 1));
  controller.setInput('a');
  assert.equal(count, 1);

  unsubscribe();
  controller.setInput('ab');
  assert.equal(count, 1);
});
