/**
 * Regresi: KECEPATAN permintaan menu.
 *
 * Rekan tim (0x1) mengukur sendiri dan sengaja mematikan retrieval:
 *
 *   "Default MATI: retrieval di sisi server terbukti tidak relevan untuk app ini
 *    (sumber terukur skor ≈0.005, +3-13 detik per permintaan)."
 *
 * Saya pernah membalik default itu menjadi `true` demi "RAG yang sebenarnya", dan
 * akibatnya menu tidak bisa dimuat sama sekali. Diukur ulang 2026-10-26 dengan
 * prompt menu yang sama:
 *
 *   useRag true  → 180 detik tanpa satu byte (habis waktu)
 *   useRag false → 8,5 detik, JSON valid
 *
 * Uji ini menjaga keputusan itu — bukan karena retrieval buruk, tetapi karena
 * server melambat drastis saat retrieval dinyalakan, dan aplikasi ini menuntut
 * jawaban cepat.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const transport = fs.readFileSync(path.join(ROOT, 'src', 'services', 'ai', 'transport.ts'), 'utf8');

test('useRag default MATI — keputusan kecepatan rekan tim dipertahankan', () => {
  assert.match(
    transport,
    /useRag:\s*req\.useRag\s*\?\?\s*false/,
    'useRag harus default false; menyalakannya membuat menu gagal dimuat (180 detik)',
  );
  assert.doesNotMatch(
    transport,
    /useRag:\s*req\.useRag\s*\?\?\s*true/,
    'useRag default true pernah mematikan pemuatan menu',
  );
});

test('model dipatok — rute default server tidak melayani', () => {
  // Diukur 2026-10-26: model null → 60 detik tanpa byte; nemotron → 1,5 detik.
  assert.match(
    transport,
    /model:\s*req\.model\s*\?\?\s*KROOMBOX_MODEL/,
    'model harus dipatok ke KROOMBOX_MODEL',
  );
  assert.doesNotMatch(
    transport,
    /model:\s*req\.model\s*\?\?\s*null/,
    'model null menggantung tanpa jawaban',
  );
});

test('streaming tetap menyala', () => {
  // Tanpa streaming, jawaban RAG panjang memicu 502 dari proxy.
  assert.match(transport, /stream:\s*true/, 'stream harus selalu true');
});
