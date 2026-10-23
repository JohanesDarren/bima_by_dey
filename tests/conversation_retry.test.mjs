/**
 * Regresi: kegagalan model di sisi server BERSIFAT SEMENTARA, jadi satu giliran
 * harus dicoba ulang alih-alih langsung menampilkan "Server AI gagal merespons".
 *
 * Uji ini memakai stream palsu (tidak menyentuh jaringan): percobaan pertama
 * mengirim pesan kegagalan server, percobaan kedua mengirim jawaban sungguhan.
 * Yang diperiksa: hasil akhirnya `ok`, dan stream dipanggil lebih dari sekali.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileForTest } from './compileForTest.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.compiled-retry');

const require = compileForTest({
  sources: [
    'src/services/ai/conversationTurn.ts',
    'src/services/ai/types.ts',
    'src/services/ai/failures.ts',
    'src/services/assistantReply.ts',
    'src/services/errors.ts',
    'src/services/breaker.ts',
    'src/utils/assistantText.ts',
    'src/utils/markdown.ts',
    'src/constants/index.ts',
    'src/types/index.ts',
  ],
  outDir: OUT,
});

const { runConversationTurn } = require(
  path.join(OUT, 'src', 'services', 'ai', 'conversationTurn.js'),
);

const SERVER_FAILURE =
  'Server AI gagal merespons: Error code: 503 - upstream fetch failed (cause: ETIMEDOUT)';

/** Stream palsu: `responses` berisi daftar teks yang dikirim tiap percobaan. */
function fakeStream(responses, counter) {
  return (_request, handlers) => {
    const text = responses[Math.min(counter.calls, responses.length - 1)];
    counter.calls += 1;
    setTimeout(() => {
      handlers.onToken(text);
      handlers.onDone();
    }, 0);
    return { close: () => {} };
  };
}

test('retries when the server reports its own failure, then succeeds', async () => {
  const counter = { calls: 0 };
  const startStream = fakeStream([SERVER_FAILURE, 'Rendam sorgum 8 jam agar lunak.'], counter);

  const { result } = runConversationTurn({ prompt: 'p', question: 'q', maxWords: 40 }, startStream);

  const out = await result;
  assert.equal(counter.calls, 2, 'harus mencoba dua kali');
  assert.equal(out.status, 'ok', 'percobaan kedua harus menghasilkan jawaban');
  assert.match(out.text, /Rendam sorgum/);
});

test('gives up after the retry budget and surfaces the honest failure', async () => {
  const counter = { calls: 0 };
  const startStream = fakeStream([SERVER_FAILURE], counter);

  const { result } = runConversationTurn({ prompt: 'p', question: 'q', maxWords: 40 }, startStream);

  const out = await result;
  assert.equal(counter.calls, 3, 'berhenti setelah jatah percobaan habis');
  assert.equal(out.status, 'failure');
  assert.match(out.text, /Server AI gagal merespons/);
});

test('a real answer is not retried', async () => {
  const counter = { calls: 0 };
  const startStream = fakeStream(['Sorgum direndam untuk mengurangi tanin.'], counter);

  const { result } = runConversationTurn({ prompt: 'p', question: 'q', maxWords: 40 }, startStream);

  const out = await result;
  assert.equal(counter.calls, 1);
  assert.equal(out.status, 'ok');
});
