/**
 * Uji panggilan suara — dua seam:
 *   1. `reduceVoiceCall` (services/voiceCallMachine): reducer murni, keadaan + peristiwa →
 *      keadaan baru + daftar efek. Tanpa perangkat, tanpa timer, tanpa janji.
 *   2. `createVoiceCall` (services/voiceCall): pelaksana efek di atas sebuah PORT suara.
 *      Port (mikrofon/TTS), giliran percakapan, dan timer semuanya palsu di sini.
 *
 * Dijalankan dengan `npm test`; sumber dikompilasi lewat tests/compileForTest.mjs.
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('voice');

const require = compileForTest({
  sources: [
    'src/services/voiceCallMachine.ts',
    'src/services/voiceCall.ts',
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

const { reduceVoiceCall, initialVoiceCallState } = require(
  path.join(OUT, 'src', 'services', 'voiceCallMachine.js'),
);
const { createVoiceCall } = require(path.join(OUT, 'src', 'services', 'voiceCall.js'));
const { HISTORY_LIMIT } = require(path.join(OUT, 'src', 'prompts', 'chefPrompt.js'));

// ---------------------------------------------------------------------------
// Seam 1 — reducer murni
// ---------------------------------------------------------------------------

/** Jalankan urutan peristiwa; kembalikan keadaan akhir + efek tiap langkah. */
function run(events, from = initialVoiceCallState()) {
  let state = from;
  const effects = [];
  for (const event of events) {
    const step = reduceVoiceCall(state, event);
    state = step.state;
    effects.push(step.effects);
  }
  return { state, effects, last: effects[effects.length - 1] };
}

const types = (effects) => effects.map((e) => e.type);
const ok = (
  text,
  turn = [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: text },
  ],
) => ({
  status: 'ok',
  text,
  turn,
});

/** Panggilan yang sudah mendengarkan pada generasi 1. */
const listening = () =>
  run([{ type: 'start' }, { type: 'mic-prepared', generation: 1, outcome: 'ready' }]).state;

test('keadaan awal: menganggur, tak aktif, riwayat kosong', () => {
  const s = initialVoiceCallState();
  assert.equal(s.phase, 'idle');
  assert.equal(s.active, false);
  assert.deepEqual(s.history, []);
  assert.equal(s.errorMsg, null);
});

test('start: aktif, generasi naik, minta mikrofon disiapkan', () => {
  const { state, last } = run([{ type: 'start' }]);
  assert.equal(state.active, true);
  assert.equal(state.generation, 1);
  assert.deepEqual(last, [{ type: 'cancel-restart' }, { type: 'prepare-mic', generation: 1 }]);
});

test('mikrofon siap → mendengarkan, galat lama dihapus, mikrofon dinyalakan', () => {
  const failed = run([
    { type: 'start' },
    { type: 'mic-prepared', generation: 1, outcome: 'denied' },
  ]).state;
  assert.equal(failed.phase, 'error');
  const { state, last } = run([{ type: 'mic-prepared', generation: 1, outcome: 'ready' }], failed);
  assert.equal(state.phase, 'listening');
  assert.equal(state.errorMsg, null);
  assert.deepEqual(last, [{ type: 'start-mic', generation: 1 }]);
});

test('izin ditolak / suara tak tersedia → galat dengan pesan masing-masing', () => {
  const denied = run([
    { type: 'start' },
    { type: 'mic-prepared', generation: 1, outcome: 'denied' },
  ]);
  assert.equal(denied.state.phase, 'error');
  assert.equal(
    denied.state.errorMsg,
    'Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.',
  );
  assert.deepEqual(denied.last, []);

  const missing = run([
    { type: 'start' },
    { type: 'mic-prepared', generation: 1, outcome: 'unavailable' },
  ]);
  assert.equal(missing.state.errorMsg, 'Fitur suara tidak tersedia di perangkat ini.');
});

test('mikrofon gagal menyala → galat memakai pesan gagalnya', () => {
  const { state } = run([
    { type: 'start' },
    { type: 'mic-start-failed', generation: 1, message: 'busy' },
  ]);
  assert.equal(state.phase, 'error');
  assert.equal(state.errorMsg, 'busy');
});

test('kalimat final → berpikir; mikrofon diselesaikan dan giliran dijalankan dengan riwayat', () => {
  const { state, last } = run(
    [{ type: 'heard', generation: 1, text: '  berapa lama?  ', isFinal: true }],
    listening(),
  );
  assert.equal(state.phase, 'thinking');
  assert.equal(state.processing, true);
  assert.deepEqual(last, [
    { type: 'finish-mic' },
    { type: 'run-turn', generation: 1, question: 'berapa lama?', history: [] },
  ]);
});

test('hasil bukan-final, kosong, atau saat sedang memproses diabaikan (keadaan sama persis)', () => {
  const base = listening();
  for (const event of [
    { type: 'heard', generation: 1, text: 'halo', isFinal: false },
    { type: 'heard', generation: 1, text: '   ', isFinal: true },
  ]) {
    const step = reduceVoiceCall(base, event);
    assert.equal(step.state, base);
    assert.deepEqual(step.effects, []);
  }
  const busy = run([{ type: 'heard', generation: 1, text: 'satu', isFinal: true }], base).state;
  const again = reduceVoiceCall(busy, {
    type: 'heard',
    generation: 1,
    text: 'satu',
    isFinal: true,
  });
  assert.equal(again.state, busy);
  assert.deepEqual(again.effects, []);
});

test('jawaban ok → bicara, riwayat bertambah (dibatasi), teks dibacakan', () => {
  const thinking = run(
    [{ type: 'heard', generation: 1, text: 'q', isFinal: true }],
    listening(),
  ).state;
  const { state, last } = run(
    [{ type: 'turn-settled', generation: 1, result: ok('Aduk pelan') }],
    thinking,
  );
  assert.equal(state.phase, 'speaking');
  assert.deepEqual(state.history, [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'Aduk pelan' },
  ]);
  assert.deepEqual(last, [{ type: 'speak', generation: 1, text: 'Aduk pelan' }]);

  // Riwayat tidak tumbuh tanpa batas.
  let s = thinking;
  for (let i = 0; i < HISTORY_LIMIT + 3; i += 1) {
    s = reduceVoiceCall(s, {
      type: 'turn-settled',
      generation: 1,
      result: ok(`a${i}`, [
        { role: 'user', content: `q${i}` },
        { role: 'assistant', content: `a${i}` },
      ]),
    }).state;
  }
  assert.equal(s.history.length, HISTORY_LIMIT);
  assert.equal(s.history[s.history.length - 1].content, `a${HISTORY_LIMIT + 2}`);
});

test('jawaban tak berguna (empty/failure/error) → galat tertampil, tidak dibacakan, riwayat utuh', () => {
  for (const status of ['empty', 'failure', 'error']) {
    const thinking = run(
      [{ type: 'heard', generation: 1, text: 'q', isFinal: true }],
      listening(),
    ).state;
    const { state, last } = run(
      [
        {
          type: 'turn-settled',
          generation: 1,
          result: { status, text: `pesan ${status}`, turn: [] },
        },
      ],
      thinking,
    );
    assert.equal(state.phase, 'error');
    assert.equal(state.errorMsg, `pesan ${status}`);
    assert.equal(state.processing, false);
    assert.deepEqual(state.history, []);
    assert.deepEqual(last, []);
  }
});

test('giliran runtuh tak terduga → galat dengan pesan yang diberikan, tidak tersangkut berpikir', () => {
  const thinking = run(
    [{ type: 'heard', generation: 1, text: 'q', isFinal: true }],
    listening(),
  ).state;
  const { state } = run(
    [{ type: 'turn-crashed', generation: 1, message: 'jaringan putus' }],
    thinking,
  );
  assert.equal(state.phase, 'error');
  assert.equal(state.errorMsg, 'jaringan putus');
  assert.equal(state.processing, false);
});

test('selesai bicara → mendengarkan lagi (siapkan mikrofon)', () => {
  const speaking = run(
    [
      { type: 'heard', generation: 1, text: 'q', isFinal: true },
      { type: 'turn-settled', generation: 1, result: ok('jawab') },
    ],
    listening(),
  ).state;
  const { state, last } = run([{ type: 'spoken', generation: 1 }], speaking);
  assert.equal(state.processing, false);
  assert.deepEqual(last, [{ type: 'prepare-mic', generation: 1 }]);
});

test('galat mikrofon: aborted / tidak ada suara diabaikan; lainnya jadi galat', () => {
  const base = listening();
  for (const code of ['aborted', 'speech-timeout', 'no-speech']) {
    const step = reduceVoiceCall(base, { type: 'mic-error', generation: 1, code, message: 'x' });
    assert.equal(step.state, base);
  }
  const { state } = run(
    [{ type: 'mic-error', generation: 1, code: 'network', message: 'putus' }],
    base,
  );
  assert.equal(state.phase, 'error');
  assert.equal(state.errorMsg, 'Mikrofon terganggu: putus');
  const noMessage = run(
    [{ type: 'mic-error', generation: 1, code: 'audio-capture', message: '' }],
    base,
  );
  assert.equal(noMessage.state.errorMsg, 'Mikrofon terganggu: audio-capture');
});

test('pendengar berakhir → jadwalkan mulai ulang; saat jatuh tempo dengar lagi kecuali sedang memproses', () => {
  const base = listening();
  const ended = run([{ type: 'mic-ended', generation: 1 }], base);
  assert.deepEqual(ended.last, [{ type: 'schedule-restart', generation: 1, delayMs: 500 }]);

  const due = run([{ type: 'restart-due', generation: 1 }], base);
  assert.deepEqual(due.last, [{ type: 'prepare-mic', generation: 1 }]);

  const busy = run([{ type: 'heard', generation: 1, text: 'q', isFinal: true }], base).state;
  const dueBusy = reduceVoiceCall(busy, { type: 'restart-due', generation: 1 });
  assert.equal(dueBusy.state, busy);
  assert.deepEqual(dueBusy.effects, []);
});

test('berhenti: menganggur, semua efek pembersihan, riwayat dihapus', () => {
  const speaking = run(
    [
      { type: 'heard', generation: 1, text: 'q', isFinal: true },
      { type: 'turn-settled', generation: 1, result: ok('jawab') },
    ],
    listening(),
  ).state;
  assert.equal(speaking.history.length, 2);
  const { state, last } = run([{ type: 'stop' }], speaking);
  assert.equal(state.phase, 'idle');
  assert.equal(state.active, false);
  assert.equal(state.processing, false);
  assert.deepEqual(state.history, []);
  assert.deepEqual(types(last).sort(), [
    'abort-mic',
    'cancel-restart',
    'close-turn',
    'stop-speaking',
  ]);
});

test('mute/unmute (berhenti keepHistory lalu mulai) mempertahankan riwayat percakapan', () => {
  const speaking = run(
    [
      { type: 'heard', generation: 1, text: 'pertama', isFinal: true },
      { type: 'turn-settled', generation: 1, result: ok('jawab satu') },
    ],
    listening(),
  ).state;
  const resumed = run(
    [
      { type: 'stop', keepHistory: true },
      { type: 'start' },
      { type: 'mic-prepared', generation: 3, outcome: 'ready' },
      { type: 'heard', generation: 3, text: 'kedua', isFinal: true },
    ],
    speaking,
  );
  const turn = resumed.last.find((e) => e.type === 'run-turn');
  assert.deepEqual(turn.history, [
    { role: 'user', content: 'q' },
    { role: 'assistant', content: 'jawab satu' },
  ]);
  assert.equal(turn.question, 'kedua');
});

test('KELAS BUG: pendengar/penutup lama tidak menghidupkan panggilan yang sudah ditutup', () => {
  // Panggilan berjalan pada generasi 1, ditutup (generasi 2). Semua callback yang
  // tertinggal dari generasi 1 tiba terlambat: tak satu pun boleh menyalakan mikrofon,
  // mengubah tampilan, atau menjadwalkan apa pun.
  const closed = run([{ type: 'stop' }], listening()).state;
  const late = [
    { type: 'restart-due', generation: 1 },
    { type: 'mic-ended', generation: 1 },
    { type: 'spoken', generation: 1 },
    { type: 'mic-prepared', generation: 1, outcome: 'ready' },
    { type: 'heard', generation: 1, text: 'halo', isFinal: true },
    { type: 'mic-error', generation: 1, code: 'network', message: 'x' },
    { type: 'turn-settled', generation: 1, result: ok('terlambat') },
    { type: 'turn-crashed', generation: 1, message: 'x' },
    { type: 'mic-start-failed', generation: 1, message: 'x' },
  ];
  for (const event of late) {
    const step = reduceVoiceCall(closed, event);
    assert.equal(step.state, closed, `${event.type} mengubah keadaan`);
    assert.deepEqual(step.effects, [], `${event.type} menghasilkan efek`);
  }
});

test('panggilan baru tak menerima callback dari generasi sebelumnya', () => {
  // stop → start: generasi 3. Callback generasi 1 dan 2 tetap mati walau panggilan aktif lagi.
  const reopened = run([{ type: 'stop' }, { type: 'start' }], listening()).state;
  assert.equal(reopened.active, true);
  for (const generation of [1, 2]) {
    for (const event of [
      { type: 'restart-due', generation },
      { type: 'spoken', generation },
      { type: 'mic-prepared', generation, outcome: 'ready' },
    ]) {
      const step = reduceVoiceCall(reopened, event);
      assert.equal(step.state, reopened);
      assert.deepEqual(step.effects, []);
    }
  }
});

test('mulai lagi saat panggilan masih aktif membuang giliran yang berjalan (tidak tersangkut berpikir)', () => {
  const thinking = run(
    [{ type: 'heard', generation: 1, text: 'q', isFinal: true }],
    listening(),
  ).state;
  const { state, last } = run([{ type: 'start' }], thinking);
  assert.equal(state.processing, false);
  assert.equal(state.generation, 2);
  assert.deepEqual(types(last), ['cancel-restart', 'close-turn', 'stop-speaking', 'prepare-mic']);
});

test('urutan lengkap: menganggur → mendengar → berpikir → bicara → mendengar → galat → menganggur', () => {
  const phases = [];
  let state = initialVoiceCallState();
  for (const event of [
    { type: 'start' },
    { type: 'mic-prepared', generation: 1, outcome: 'ready' },
    { type: 'heard', generation: 1, text: 'q', isFinal: true },
    { type: 'turn-settled', generation: 1, result: ok('a') },
    { type: 'spoken', generation: 1 },
    { type: 'mic-prepared', generation: 1, outcome: 'ready' },
    { type: 'mic-error', generation: 1, code: 'network', message: 'putus' },
    { type: 'stop' },
  ]) {
    state = reduceVoiceCall(state, event).state;
    phases.push(state.phase);
  }
  assert.deepEqual(phases, [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'speaking',
    'listening',
    'error',
    'idle',
  ]);
});

// ---------------------------------------------------------------------------
// Seam 2 — controller di atas port palsu
// ---------------------------------------------------------------------------

/** Port suara palsu: merekam panggilan; penyiapan mikrofon diselesaikan manual. */
function fakePort() {
  const log = [];
  const prepares = [];
  const port = {
    log,
    sinks: [],
    prepares,
    prepareMic: () => {
      log.push('prepareMic');
      return new Promise((resolve, reject) => prepares.push({ resolve, reject }));
    },
    startMic: (sink) => {
      log.push('startMic');
      port.sinks.push(sink);
    },
    finishMic: () => log.push('finishMic'),
    abortMic: () => log.push('abortMic'),
    speak: (text, onSettled) => {
      log.push(`speak:${text}`);
      port.settleSpeech = onSettled;
    },
    stopSpeaking: () => log.push('stopSpeaking'),
  };
  return port;
}

function fakeTurnRunner() {
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

/** Timer palsu: tidak jalan sendiri; `fire()` menjalankan yang tertunda. */
function fakeTimers() {
  const pending = [];
  const schedule = (fn, ms) => {
    const timer = { fn, ms, cancelled: false };
    pending.push(timer);
    return () => (timer.cancelled = true);
  };
  const fire = () => {
    for (const timer of pending.splice(0)) if (!timer.cancelled) timer.fn();
  };
  return { schedule, fire, pending };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup() {
  const port = fakePort();
  const turns = fakeTurnRunner();
  const timers = fakeTimers();
  const context = {
    segment: { ageGroup: 'dewasa', condition: 'umum' },
    recipeName: 'Nasi Goreng',
    stepLabel: 'Tumis bawang',
    recipeIngredients: 'nasi, bawang',
  };
  const call = createVoiceCall({
    port,
    runTurn: turns.runTurn,
    getContext: () => context,
    schedule: timers.schedule,
    warn: () => undefined,
  });
  return { call, port, turns, timers, context };
}

/** Panggilan sudah mendengarkan (mikrofon menyala). */
async function startListening(env) {
  env.call.start();
  env.port.prepares[env.port.prepares.length - 1].resolve('ready');
  await flush();
}

test('controller: start menyiapkan mikrofon lalu menyalakannya; fase jadi mendengar', async () => {
  const env = setup();
  const seen = [];
  env.call.subscribe(() => seen.push(env.call.getState().phase));
  await startListening(env);
  assert.deepEqual(env.port.log, ['prepareMic', 'startMic']);
  assert.equal(env.call.getState().phase, 'listening');
  assert.ok(seen.includes('listening'));
});

test('controller: kalimat final → giliran dijalankan dengan prompt berisi konteks & pertanyaan → dibacakan → mendengar lagi', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'berapa lama?', isFinal: true });
  assert.equal(env.call.getState().phase, 'thinking');
  assert.equal(env.port.log.at(-1), 'finishMic');

  const [turn] = env.turns.calls;
  assert.equal(turn.request.question, 'berapa lama?');
  assert.equal(turn.request.maxTokens, 150);
  assert.match(turn.request.prompt, /Resep: Nasi Goreng\./);
  assert.match(turn.request.prompt, /Langkah aktif: Tumis bawang\./);
  assert.match(turn.request.prompt, /Bahan resep ini: nasi, bawang\./);
  assert.match(turn.request.prompt, /dewasa, umum/);
  assert.ok(turn.request.prompt.endsWith('Pertanyaan: berapa lama?'));

  turn.resolve({
    status: 'ok',
    text: 'Dua menit',
    turn: [
      { role: 'user', content: 'berapa lama?' },
      { role: 'assistant', content: 'Dua menit' },
    ],
  });
  await flush();
  assert.equal(env.call.getState().phase, 'speaking');
  assert.equal(env.port.log.at(-1), 'speak:Dua menit');

  env.port.settleSpeech();
  assert.equal(env.port.log.at(-1), 'prepareMic');
});

test('controller: riwayat giliran sebelumnya ikut terkirim pada pertanyaan berikutnya', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'satu', isFinal: true });
  env.turns.calls[0].resolve({
    status: 'ok',
    text: 'jawab satu',
    turn: [
      { role: 'user', content: 'satu' },
      { role: 'assistant', content: 'jawab satu' },
    ],
  });
  await flush();
  env.port.settleSpeech();
  env.port.prepares[1].resolve('ready');
  await flush();
  env.port.sinks[1].onResult({ text: 'dua', isFinal: true });
  assert.deepEqual(env.turns.calls[1].request.history, [
    { role: 'user', content: 'satu' },
    { role: 'assistant', content: 'jawab satu' },
  ]);
});

test('controller: giliran gagal tampil sebagai galat dengan kalimat pengganti, tidak dibacakan', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'halo', isFinal: true });
  env.turns.calls[0].resolve({
    status: 'empty',
    text: 'Layanan tidak mengirim jawaban.',
    turn: [],
  });
  await flush();
  assert.equal(env.call.getState().phase, 'error');
  assert.equal(env.call.getState().errorMsg, 'Layanan tidak mengirim jawaban.');
  assert.ok(!env.port.log.some((l) => l.startsWith('speak:')));
});

test('controller: janji giliran yang ditolak tidak membuat panggilan tersangkut berpikir', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'halo', isFinal: true });
  env.turns.calls[0].reject(new Error('boom'));
  await flush();
  assert.equal(env.call.getState().phase, 'error');
  assert.equal(typeof env.call.getState().errorMsg, 'string');
  assert.equal(env.call.getState().processing, false);
});

test('controller: stop menutup giliran, menghentikan suara, dan membatalkan mikrofon', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'halo', isFinal: true });
  env.call.stop();
  assert.equal(env.turns.calls[0].closed, 1);
  assert.deepEqual(env.port.log.slice(-2), ['stopSpeaking', 'abortMic']);
  assert.equal(env.call.getState().phase, 'idle');
});

test('controller KELAS BUG: izin mikrofon tiba SETELAH panggilan ditutup → mikrofon tidak dinyalakan', async () => {
  const env = setup();
  env.call.start();
  env.call.stop();
  env.port.prepares[0].resolve('ready');
  await flush();
  assert.ok(!env.port.log.includes('startMic'));
  assert.equal(env.call.getState().phase, 'idle');
});

test('controller KELAS BUG: pendengar lama berakhir sesudah panggilan ditutup → tidak ada mulai ulang', async () => {
  const env = setup();
  await startListening(env);
  const oldSink = env.port.sinks[0];
  env.call.stop();
  oldSink.onEnd();
  env.timers.fire();
  await flush();
  assert.equal(env.timers.pending.length, 0);
  assert.equal(env.port.log.filter((l) => l === 'prepareMic').length, 1);
});

test('controller KELAS BUG: timer mulai-ulang yang sudah terjadwal dibatalkan oleh stop', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onEnd();
  assert.equal(env.timers.pending.length, 1);
  assert.equal(env.timers.pending[0].ms, 500);
  env.call.stop();
  assert.equal(env.timers.pending[0].cancelled, true);
});

test('controller: pendengar berakhir sendiri → dengar lagi setelah jeda', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onEnd();
  env.timers.fire();
  assert.equal(env.port.log.filter((l) => l === 'prepareMic').length, 2);
});

test('controller KELAS BUG: selesai bicara dari panggilan lama tidak menghidupkan panggilan baru', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'halo', isFinal: true });
  env.turns.calls[0].resolve({
    status: 'ok',
    text: 'jawab',
    turn: [{ role: 'assistant', content: 'jawab' }],
  });
  await flush();
  const staleSettle = env.port.settleSpeech;
  env.call.stop();
  env.call.start();
  const before = env.port.log.filter((l) => l === 'prepareMic').length;
  staleSettle();
  assert.equal(env.port.log.filter((l) => l === 'prepareMic').length, before);
});

test('controller: mute (stop keepHistory) lalu nyalakan lagi — riwayat terbawa; stop biasa menghapusnya', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'satu', isFinal: true });
  env.turns.calls[0].resolve({
    status: 'ok',
    text: 'jawab',
    turn: [
      { role: 'user', content: 'satu' },
      { role: 'assistant', content: 'jawab' },
    ],
  });
  await flush();

  env.call.stop({ keepHistory: true });
  assert.equal(env.call.getState().history.length, 2);
  env.call.start();
  env.call.stop();
  assert.deepEqual(env.call.getState().history, []);
});

test('controller: mikrofon tak tersedia / gagal disiapkan → galat, bukan tersangkut', async () => {
  const unavailable = setup();
  unavailable.call.start();
  unavailable.port.prepares[0].resolve('unavailable');
  await flush();
  assert.equal(
    unavailable.call.getState().errorMsg,
    'Fitur suara tidak tersedia di perangkat ini.',
  );

  const crashed = setup();
  crashed.call.start();
  crashed.port.prepares[0].reject(new Error('izin error'));
  await flush();
  assert.equal(crashed.call.getState().phase, 'error');
  assert.equal(crashed.call.getState().errorMsg, 'izin error');
});

test('controller: startMic melempar → galat dengan pesan lemparannya', async () => {
  const env = setup();
  env.port.startMic = () => {
    throw new Error('mic sibuk');
  };
  await startListening(env);
  assert.equal(env.call.getState().phase, 'error');
  assert.equal(env.call.getState().errorMsg, 'mic sibuk');
});

test('controller: dispose menutup panggilan (mikrofon, suara, giliran) tanpa menghapus riwayat', async () => {
  const env = setup();
  await startListening(env);
  env.port.sinks[0].onResult({ text: 'halo', isFinal: true });
  env.call.dispose();
  assert.equal(env.turns.calls[0].closed, 1);
  assert.deepEqual(env.port.log.slice(-2), ['stopSpeaking', 'abortMic']);
  assert.equal(env.call.getState().phase, 'idle');
});
