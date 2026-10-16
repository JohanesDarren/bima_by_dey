/**
 * Uji perilaku untuk module AI yang MURNI (tanpa jaringan): pembacaan JSON dari
 * balasan model (ai/json) dan taksonomi kegagalan (ai/failures).
 *
 * Dijalankan dengan `npm test` (atau `node --test tests/`). Kedua module itu tidak
 * mengimpor apa pun, jadi skrip ini mengompilasinya sendiri ke tests/.compiled —
 * tidak butuh test runner pihak ketiga, sama seperti .scratch/perf-latency/breaker_check.js.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.join(HERE, '.compiled');

const SOURCES = [
  path.join(REPO, 'src', 'services', 'ai', 'json.ts'),
  path.join(REPO, 'src', 'services', 'ai', 'failures.ts'),
];

// Kompilasi ulang bila salah satu sumber lebih baru dari hasil sebelumnya.
const newest = Math.max(...SOURCES.map((s) => fs.statSync(s).mtimeMs));
const marker = path.join(OUT, '.stamp');
const fresh = fs.existsSync(marker) && Number(fs.readFileSync(marker, 'utf8')) >= newest;

if (!fresh) {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  execFileSync(
    'npx',
    [
      'tsc',
      ...SOURCES,
      '--ignoreConfig',
      '--rootDir',
      REPO,
      '--outDir',
      OUT,
      '--module',
      'esnext',
      '--target',
      'es2020',
      '--moduleResolution',
      'bundler',
      '--skipLibCheck',
    ],
    { cwd: REPO, stdio: 'inherit' },
  );
  fs.writeFileSync(marker, String(Date.now()));
}

const { completeJsonSlice, extractJson, extractJsonArray } = await import(
  path.join(OUT, 'src', 'services', 'ai', 'json.js')
);
const {
  serverFailureText,
  humanizeTransportReason,
  KroomboxError,
  KroomboxTimeoutError,
  ServerSideError,
} = await import(path.join(OUT, 'src', 'services', 'ai', 'failures.js'));

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
// serverFailureText — mendeteksi kegagalan model di sisi server
// ---------------------------------------------------------------------------

test('serverFailureText: kode 503 disebut ke pengguna', () => {
  const text = serverFailureText('Server AI gagal merespons: Error code: 503');
  assert.match(text, /503/);
  assert.match(text, /Coba lagi/);
});

test('serverFailureText: fetch failed/ETIMEDOUT dianggap kegagalan server', () => {
  assert.ok(serverFailureText('[502]: fetch failed (cause: ETIMEDOUT)'));
});

test('serverFailureText: balasan normal → null', () => {
  assert.equal(serverFailureText('Tumis bumbu sampai harum, lalu masukkan sorgum.'), null);
});

// ---------------------------------------------------------------------------
// humanizeTransportReason — pesan teknis Inggris → kalimat Indonesia
// ---------------------------------------------------------------------------

test('humanizeTransportReason: istilah Inggris diterjemahkan', () => {
  assert.match(humanizeTransportReason('fetch failed'), /terputus di tengah jalan/);
});

test('humanizeTransportReason: pesan Indonesia dibiarkan apa adanya', () => {
  const id = 'Koneksi ke BIMA terputus.';
  assert.equal(humanizeTransportReason(id), id);
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
