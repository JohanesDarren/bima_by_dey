import { readTranscript } from './speechToText';

const cases: [string, unknown, string][] = [
  ['openai text', { text: '  halo dunia  ' }, 'halo dunia'],
  ['transcript key', { transcript: ' rendam sorgum ' }, 'rendam sorgum'],
  ['choices message', { choices: [{ message: { content: ' dari chat ' } }] }, 'dari chat'],
  ['choices text', { choices: [{ text: ' pilihan ' }] }, 'pilihan'],
  ['empty object', {}, ''],
  ['null', null, ''],
  ['string', 'bukan objek', ''],
  ['array', [1, 2], ''],
];

let failed = 0;
for (const [name, payload, expected] of cases) {
  const actual = readTranscript(payload);
  if (actual !== expected) {
    console.error(
      `FAIL ${name}: expected ${JSON.stringify(expected)} got ${JSON.stringify(actual)}`,
    );
    failed += 1;
  }
}

if (failed > 0) throw new Error(`${failed} transcript parse case(s) failed`);
console.log('speechToText self-test passed');
