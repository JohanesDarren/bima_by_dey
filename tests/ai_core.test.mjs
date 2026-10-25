/**
 * Uji perilaku untuk module AI yang MURNI (tanpa jaringan): pembacaan JSON dari
 * balasan model (ai/json) dan taksonomi kegagalan (ai/failures).
 *
 * Dijalankan dengan `npm test`. Kedua module itu tidak
 * mengimpor apa pun, jadi skrip ini mengompilasinya sendiri lewat tests/compileForTest.mjs
 * — tidak butuh test runner pihak ketiga.
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('ai-core');

const require = compileForTest({
  sources: ['src/services/ai/json.ts', 'src/services/ai/failures.ts'],
  outDir: OUT,
});

const { completeJsonSlice, extractJson, extractJsonArray } = require(
  path.join(OUT, 'src', 'services', 'ai', 'json.js'),
);
const { KroomboxError, KroomboxTimeoutError, ServerSideError } = require(
  path.join(OUT, 'src', 'services', 'ai', 'failures.js'),
);

// ---------------------------------------------------------------------------
// completeJsonSlice — berhenti lebih awal saat JSON sudah utuh
// ---------------------------------------------------------------------------

test('completeJsonSlice: objek utuh → potongannya', () => {
  assert.equal(completeJsonSlice('{"a":1}'), '{"a":1}');
});

test('completeJsonSlice: prosa sesudah JSON diabaikan', () => {
  assert.equal(completeJsonSlice('{"a":1} lalu analisis harga …'), '{"a":1}');
});

test('completeJsonSlice: JSON belum lengkap → null', () => {
  assert.equal(completeJsonSlice('{"a":1'), null);
});

test('completeJsonSlice: kurung di dalam string tidak dihitung', () => {
  assert.equal(completeJsonSlice('{"a":"{bukan kurung}"}'), '{"a":"{bukan kurung}"}');
});

test('completeJsonSlice: array kedua menyusul → null (jangan berhenti separuh)', () => {
  assert.equal(completeJsonSlice('[{"a":1}] [{"b":2}]'), null);
});

test('completeJsonSlice: tanpa pembuka JSON → null', () => {
  assert.equal(completeJsonSlice('maaf, tidak ada teks'), null);
});

// ---------------------------------------------------------------------------
// extractJson / extractJsonArray — bersihkan pagar markdown & kunci telanjang
// ---------------------------------------------------------------------------

test('extractJson: objek polos', () => {
  assert.deepEqual(extractJson('{"name":"Sorgum"}'), { name: 'Sorgum' });
});

test('extractJson: membuang pagar markdown', () => {
  assert.deepEqual(extractJson('```json\n{"name":"Sorgum"}\n```'), { name: 'Sorgum' });
});

test('extractJson: mengabaikan teks pengantar', () => {
  assert.deepEqual(extractJson('Berikut jawabannya: {"name":"Sorgum"} selesai.'), {
    name: 'Sorgum',
  });
});

test('extractJson: menambal kunci tanpa tanda kutip', () => {
  assert.deepEqual(extractJson('{"nutrition": {calories: 480}}'), { nutrition: { calories: 480 } });
});

test('extractJson: kunci telanjang tidak merusak titik dua DI DALAM string', () => {
  // Versi regex polos akan mengubah "Bahan, lalu: masukkan" jadi rusak.
  assert.deepEqual(extractJson('{"step": "Bahan, lalu: masukkan"}'), {
    step: 'Bahan, lalu: masukkan',
  });
});

test('extractJson: sampah → null', () => {
  assert.equal(extractJson('tidak ada json di sini'), null);
});

test('extractJsonArray: array menu', () => {
  assert.deepEqual(extractJsonArray('[{"name":"A"},{"name":"B"}]'), [{ name: 'A' }, { name: 'B' }]);
});

test('extractJsonArray: objek (bukan array) → null', () => {
  assert.equal(extractJsonArray('{"name":"A"}'), null);
});

test('extractJsonArray: pagar markdown', () => {
  assert.deepEqual(extractJsonArray('```json\n[{"name":"A"}]\n```'), [{ name: 'A' }]);
});

// ---------------------------------------------------------------------------
// Hirarki error — pemanggil bisa membedakan timeout & kegagalan server
// ---------------------------------------------------------------------------

test('hirarki error: Timeout & ServerSide tetap KroomboxError', () => {
  assert.ok(new KroomboxTimeoutError('x') instanceof KroomboxError);
  assert.ok(new ServerSideError('y') instanceof KroomboxError);
  assert.equal(new KroomboxTimeoutError('x').name, 'KroomboxTimeoutError');
  assert.equal(new ServerSideError('y').name, 'ServerSideError');
});
