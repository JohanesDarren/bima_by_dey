/**
 * Regresi: mode BEBAS-TANGAN di mesin panggilan suara.
 *
 * Alasan mode ini ada: tekan-dan-tahan tidak terpakai saat memasak (tangan sibuk).
 * Jadi mikrofon harus menyala sendiri, TETAPI tidak boleh memicu jawaban dari
 * kebisingan dapur. Penyaringan kalimat ada di utils/voiceGate (diuji terpisah);
 * yang diuji di sini adalah perilaku mesin: kapan mikrofon dinyalakan ulang.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('voice_handsfree');
const require = compileForTest({
  sources: ['src/services/voiceCallMachine.ts'],
  outDir: OUT,
});
const { reduceVoiceCall, initialVoiceCallState } = require('./src/services/voiceCallMachine.js');

/** Jalankan satu peristiwa dan kembalikan { state, effects }. */
function step(state, event) {
  return reduceVoiceCall(state, { generation: state.generation, ...event });
}

test('mode handsfree menyiapkan mikrofon lalu langsung mendengarkan', () => {
  let state = initialVoiceCallState('handsfree');
  assert.equal(state.mode, 'handsfree');

  let out = step(state, { type: 'start' });
  state = out.state;
  assert.ok(
    out.effects.some((e) => e.type === 'prepare-mic'),
    'harus menyiapkan mikrofon',
  );

  out = step(state, { type: 'mic-prepared', outcome: 'ready' });
  state = out.state;
  assert.equal(state.phase, 'listening', 'handsfree harus langsung mendengarkan');
  assert.ok(
    out.effects.some((e) => e.type === 'start-mic'),
    'mikrofon harus dinyalakan tanpa menunggu tombol',
  );
});

test('mode handsfree menyalakan ulang mikrofon setelah segmen berakhir', () => {
  // Inilah yang membuatnya bebas-tangan: pengguna tidak perlu menyentuh apa pun.
  // Mikrofon berakhir TANPA pertanyaan (mis. pengenal berhenti karena senyap) —
  // ini kasus yang harus menyalakan ulang.
  let state = initialVoiceCallState('handsfree');
  state = step(state, { type: 'start' }).state;
  state = step(state, { type: 'mic-prepared', outcome: 'ready' }).state;

  const ended = step(state, { type: 'mic-ended' });
  assert.ok(
    ended.effects.some((e) => e.type === 'schedule-restart'),
    'handsfree harus menjadwalkan penyalaan ulang mikrofon',
  );

  const restarted = step(ended.state, { type: 'restart-due' });
  assert.ok(
    restarted.effects.some((e) => e.type === 'prepare-mic'),
    'restart-due harus menyiapkan mikrofon lagi',
  );
});

test('handsfree TIDAK menyalakan ulang mikrofon saat jawaban sedang diproses', () => {
  // Menyalakan mikrofon saat Chef masih menyusun/membacakan jawaban akan
  // merekam suara Chef sendiri lalu memicunya sebagai pertanyaan baru.
  let state = initialVoiceCallState('handsfree');
  state = step(state, { type: 'start' }).state;
  state = step(state, { type: 'mic-prepared', outcome: 'ready' }).state;
  state = step(state, { type: 'heard', text: 'berapa lama merebus sorgum', isFinal: true }).state;
  assert.equal(state.phase, 'thinking');

  const ended = step(state, { type: 'mic-ended' });
  const restarted = step(ended.state, { type: 'restart-due' });
  assert.equal(restarted.effects.length, 0, 'jangan menyiapkan mikrofon selama giliran berjalan');
});

test('mode push tetap TIDAK menyalakan ulang mikrofon', () => {
  // Jangan sampai perubahan ini mengembalikan bug lama pada mode push.
  let state = initialVoiceCallState('push');
  state = step(state, { type: 'start' }).state;
  state = step(state, { type: 'mic-prepared', outcome: 'ready' }).state;
  assert.equal(state.phase, 'ready', 'push harus menunggu tombol');

  const out = step(state, { type: 'mic-ended' });
  assert.equal(out.effects.length, 0, 'push tidak boleh menjadwalkan penyalaan ulang mikrofon');
});

test('mode auto tetap berperilaku seperti sebelumnya', () => {
  let state = initialVoiceCallState('auto');
  state = step(state, { type: 'start' }).state;
  const out = step(state, { type: 'mic-prepared', outcome: 'ready' });
  assert.equal(out.state.phase, 'listening');
  assert.ok(out.effects.some((e) => e.type === 'start-mic'));
});
