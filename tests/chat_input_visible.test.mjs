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

test('panel tidak memotong isinya sendiri', () => {
  const panel = styleBlock('panel');
  // Hanya nilai deklarasi yang diperiksa — komentar di dalam blok boleh menyebut
  // "hidden" saat menjelaskan riwayat bug tanpa membuat uji gagal.
  const declared = panel
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
    .join(' ');
  assert.doesNotMatch(
    declared,
    /overflow:\s*'hidden'/,
    'panel memakai overflow hidden → baris tulis bisa terpotong',
  );
});

test('daftar pesan boleh menyusut agar baris tulis dapat ruang', () => {
  const messages = styleBlock('messages');
  assert.match(
    messages,
    /flexShrink:\s*1/,
    'messages harus flexShrink:1 supaya tidak mendorong composer keluar',
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
