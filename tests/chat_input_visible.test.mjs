/**
 * Regresi: baris tulis chat harus selalu terlihat.
 *
 * Bug yang dijaga (dilaporkan di HP): teks yang sedang diketik tidak tampak.
 * Penyebabnya tata letak, bukan warna:
 *   1. panel memakai `overflow: 'hidden'`;
 *   2. daftar pesan dipatok `maxHeight: 280` TANPA `flexShrink`;
 *   3. panel diletakkan di dalam ScrollView layar masak, yang tingginya tidak
 *      dibatasi — sehingga daftar pesan yang panjang mendorong baris tulis
 *      keluar panel dan terpotong.
 *
 * Uji ini membaca berkas komponen dan memastikan ketiga sifat tata letak yang
 * membuat baris tulis terlihat tetap terpasang. Murah, tapi menangkap regresi
 * yang tidak bisa dilihat typecheck.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(HERE, '..', 'src', 'components', 'AICompanion.tsx');
const src = fs.readFileSync(FILE, 'utf8');

/** Ambil isi satu kunci StyleSheet. */
function styleBlock(key) {
  const re = new RegExp(`\\n  ${key}: \\{([\\s\\S]*?)\\n  \\},`);
  const m = src.match(re);
  assert.ok(m, `style "${key}" tidak ditemukan`);
  return m[1];
}

test('wadah tata letak tidak memotong isinya sendiri', () => {
  // `overflow: 'hidden'` pada `avatar` memang disengaja (memotong karakter jadi
  // bulat). Yang berbahaya hanya wadah TATA LETAK yang membungkus daftar pesan
  // atau baris tulis — itu yang dulu memotong teks yang sedang diketik.
  const LAYOUT_KEYS = ['panel', 'messages', 'composer', 'chatHeader'];
  const offenders = [];
  for (const key of LAYOUT_KEYS) {
    const re = new RegExp(`\\n  ${key}: \\{([\\s\\S]*?)\\n  \\},`);
    const m = src.match(re);
    if (!m) continue;
    const declared = m[1].replace(/\/\/.*$/gm, '');
    if (/overflow:\s*'hidden'/.test(declared)) offenders.push(key);
  }
  assert.deepEqual(offenders, [], `wadah tata letak memotong isinya: ${offenders.join(', ')}`);
});

test('daftar pesan mengisi sisa ruang tanpa memotong baris tulis', () => {
  const messages = styleBlock('messages');
  // `flex: 1` membuat daftar pesan mengambil ruang tersisa dan TIDAK mendorong
  // baris tulis keluar layar (dulu dipatok maxHeight tanpa flexShrink).
  assert.match(messages, /flex:\s*1/, 'messages harus flex:1');
  assert.doesNotMatch(
    messages.replace(/\/\/.*$/gm, ''),
    /maxHeight/,
    'messages tidak boleh dipatok maxHeight tanpa flexShrink',
  );
});

test('baris tulis tidak ikut menyusut', () => {
  const composer = styleBlock('composer');
  assert.match(composer, /flexShrink:\s*0/, 'composer harus flexShrink:0 supaya tidak terhimpit');
});

test('teks masukan punya warna dan perataan eksplisit', () => {
  const input = styleBlock('input');
  assert.match(input, /color:\s*colors\.text/, 'warna teks input harus eksplisit');
  assert.match(input, /textAlignVertical/, 'perataan vertikal input harus eksplisit');
  assert.match(input, /minHeight/, 'input butuh tinggi minimum agar teks terlihat');
});

test('TextInput terikat ke state dan menerima ketikan', () => {
  assert.match(src, /value=\{input\}/, 'TextInput harus controlled oleh state input');
  assert.match(src, /onChangeText=\{chat\.setInput\}/, 'perubahan teks harus masuk ke controller');
});
