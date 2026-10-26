/**
 * Regresi: mode PUSH-TO-TALK.
 *
 * Alasan fitur ini ada: deteksi suara otomatis bergantung pada perangkat. Sebagian
 * HP berambang sangat lebar sehingga mikrofon terus menangkap suara latar walau
 * pengguna diam. Pada mode push, mikrofon HANYA menyala selama tombol ditahan dan
 * TIDAK PERNAH dinyalakan ulang sendiri.
 *
 * Uji ini menjalankan reducer asli (dikompilasi dari TypeScript) tanpa perangkat.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('voice_push');

const require = compileForTest({
  sources: ['src/services/voiceCallMachine.ts', 'src/prompts/chefPrompt.ts'],
  outDir: OUT,
});
const { reduceVoiceCall, initialVoiceCallState } = require('./src/services/voiceCallMachine.js');

/** Jalankan satu peristiwa, kembalikan state + efeknya. */
const step = (state, event) => reduceVoiceCall(state, event);

/** Bawa state ke fase siap pada mode push. */
function ready(mode = 'push') {
  let s = initialVoiceCallState(mode);
  s = step(s, { type: 'start' }).state;
  const gen = s.generation;
  const prepared = step(s, { type: 'mic-prepared', generation: gen, outcome: 'ready' });
  return { state: prepared.state, effects: prepared.effects, gen };
}

test('mode push berhenti di "ready" dan TIDAK menyalakan mikrofon', () => {
  const { state, effects } = ready();
  assert.equal(state.phase, 'ready');
  assert.equal(state.mode, 'push');
  // Inilah inti perbaikannya: tidak ada start-mic saat panggilan dimulai.
  assert.equal(
    effects.some((e) => e.type === 'start-mic'),
    false,
    'mikrofon tidak boleh menyala sebelum tombol ditekan',
  );
});

test('mode auto tetap menyalakan mikrofon seperti sebelumnya', () => {
  const { state, effects } = ready('auto');
  assert.equal(state.phase, 'listening');
  assert.equal(
    effects.some((e) => e.type === 'start-mic'),
    true,
    'mode auto harus tetap menyala otomatis',
  );
});

test('menekan tombol memulai rekaman', () => {
  const { state, gen } = ready();
  const pressed = step(state, { type: 'press-start', generation: gen });
  assert.equal(pressed.state.phase, 'listening');
  assert.deepEqual(pressed.effects, [{ type: 'start-mic', generation: gen }]);
});

test('melepas tombol mengakhiri rekaman', () => {
  const { state, gen } = ready();
  const pressed = step(state, { type: 'press-start', generation: gen }).state;
  const released = step(pressed, { type: 'press-end', generation: gen });
  assert.deepEqual(released.effects, [{ type: 'finish-mic' }]);
});

test('KELAS BUG: mikrofon berakhir sendiri TIDAK dijadwalkan menyala lagi', () => {
  const { state, gen } = ready();
  const pressed = step(state, { type: 'press-start', generation: gen }).state;
  const ended = step(pressed, { type: 'mic-ended', generation: gen });
  assert.equal(
    ended.effects.some((e) => e.type === 'schedule-restart'),
    false,
    'mode push tidak boleh menjadwalkan restart mikrofon',
  );
  assert.equal(ended.state.phase, 'ready');
});

test('KELAS BUG: restart-due diabaikan pada mode push', () => {
  const { state, gen } = ready();
  const due = step(state, { type: 'restart-due', generation: gen });
  assert.deepEqual(due.effects, []);
});

test('setelah Chef selesai bicara, kembali "ready" tanpa menyala sendiri', () => {
  const { state, gen } = ready();
  // tekan → hasil final → giliran sukses → dibacakan → selesai
  let s = step(state, { type: 'press-start', generation: gen }).state;
  s = step(s, {
    type: 'heard',
    generation: gen,
    text: 'berapa lama mengukus?',
    isFinal: true,
  }).state;
  assert.equal(s.phase, 'thinking');
  s = step(s, {
    type: 'turn-settled',
    generation: gen,
    result: {
      status: 'ok',
      text: 'Kukus dua puluh menit.',
      turn: [
        { role: 'user', content: 'berapa lama mengukus?' },
        { role: 'assistant', content: 'Kukus dua puluh menit.' },
      ],
    },
  }).state;
  assert.equal(s.phase, 'speaking');
  const done = step(s, { type: 'spoken', generation: gen });
  assert.equal(done.state.phase, 'ready');
  assert.deepEqual(done.effects, [], 'tidak boleh menyiapkan mikrofon lagi');
});

test('tekan diabaikan saat Chef masih berpikir atau bicara', () => {
  const { state, gen } = ready();
  let s = step(state, { type: 'press-start', generation: gen }).state;
  s = step(s, { type: 'heard', generation: gen, text: 'halo', isFinal: true }).state;
  const pressed = step(s, { type: 'press-start', generation: gen });
  assert.equal(pressed.state.phase, 'thinking', 'tidak boleh memotong giliran');
});

test('tekan dari keadaan galat memulai percobaan baru', () => {
  const { state, gen } = ready();
  const failed = { ...state, phase: 'error', errorMsg: 'gangguan' };
  const pressed = step(failed, { type: 'press-start', generation: gen });
  assert.equal(pressed.state.phase, 'listening');
  assert.equal(pressed.state.errorMsg, null);
});

test('press-start diabaikan pada mode auto', () => {
  const { state, gen } = ready('auto');
  const pressed = step(state, { type: 'press-start', generation: gen });
  assert.equal(pressed.state.phase, 'listening');
  assert.deepEqual(pressed.effects, [], 'mode auto tidak bereaksi pada tombol');
});
