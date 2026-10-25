/**
 * Uji pembacaan balasan speech-to-text (services/speechToText → readTranscript):
 * berbagai bentuk JSON balasan → teks transkrip. Tanpa jaringan.
 *
 * Dijalankan dengan `npm test`; module dikompilasi sebagai CommonJS lewat
 * tests/compileForTest.mjs (tanpa test runner pihak ketiga).
 */
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileForTest, testBuildDir } from './compileForTest.mjs';

const OUT = testBuildDir('stt');

const require = compileForTest({
  sources: ['src/services/speechToText.ts', 'tests/expoEnv.d.ts'],
  outDir: OUT,
});

const { readTranscript } = require(path.join(OUT, 'src', 'services', 'speechToText.js'));

const CASES = [
  ['openai text', { text: '  halo dunia  ' }, 'halo dunia'],
  ['transcript key', { transcript: ' rendam sorgum ' }, 'rendam sorgum'],
  ['choices message', { choices: [{ message: { content: ' dari chat ' } }] }, 'dari chat'],
  ['choices text', { choices: [{ text: ' pilihan ' }] }, 'pilihan'],
  ['empty object', {}, ''],
  ['null', null, ''],
  ['string', 'bukan objek', ''],
  ['array', [1, 2], ''],
];

for (const [name, payload, expected] of CASES) {
  test(`readTranscript: ${name}`, () => {
    assert.equal(readTranscript(payload), expected);
  });
}
