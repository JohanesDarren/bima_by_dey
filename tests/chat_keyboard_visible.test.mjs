/**
 * Regresi: kolom tulis chat harus berada DI ATAS keyboard.
 *
 * Bug yang dijaga (dilaporkan dengan tangkapan layar): keyboard menutupi seluruh
 * baris tulis sehingga pengguna tidak melihat teks yang diketik. Penyebabnya
 * bukan warna, melainkan dua hal sekaligus:
 *
 *   1. Panel chat berada DI DALAM ScrollView layar masak, sehingga kolom tulisnya
 *      bisa tergulir ke bawah keyboard dan hilang sepenuhnya.
 *   2. Aplikasi berjalan edge-to-edge (`edgeToEdgeEnabled=true`, Expo SDK 57,
 *      targetSdk 36). Pada mode itu `windowSoftInputMode="adjustResize"` tidak
 *      lagi mengecilkan jendela — keyboard hanya menimpa isi layar.
 *
 * Perbaikannya: panel chat dipindah KE LUAR ScrollView, dan diberi padding bawah
 * sebesar tinggi keyboard yang dibaca dari peristiwa native.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const cooking = read('src/screens/CookingScreen.tsx');
const hook = read('src/hooks/useKeyboardVisible.ts');
const companion = read('src/components/AICompanion.tsx');

test('panel chat berada di LUAR ScrollView', () => {
  const scrollEnd = cooking.indexOf('</ScrollView>');
  const dock = cooking.indexOf('styles.chatDock');
  const companionUse = cooking.indexOf('<AICompanion');
  assert.ok(scrollEnd > 0, 'ScrollView harus ada');
  assert.ok(dock > 0, 'wadah chatDock harus ada');
  assert.ok(
    companionUse > scrollEnd,
    'AICompanion harus dirender SETELAH </ScrollView>, bukan di dalamnya',
  );
});

test('wadah chat memakai tinggi keyboard sebagai padding bawah', () => {
  assert.match(
    cooking,
    /paddingBottom:\s*keyboardInset/,
    'chatDock harus memberi padding bawah sebesar tinggi keyboard',
  );
  assert.match(cooking, /useKeyboardInset\(\)/, 'CookingScreen harus membaca tinggi keyboard');
});

test('tinggi keyboard dibaca dari peristiwa native', () => {
  assert.match(hook, /export function useKeyboardInset/, 'hook useKeyboardInset harus tersedia');
  assert.match(hook, /keyboardDidShow/, 'harus mendengarkan keyboardDidShow');
  assert.match(
    hook,
    /endCoordinates/,
    'tinggi keyboard harus diambil dari endCoordinates, bukan angka tebakan',
  );
});

test('wadah chat punya batas tinggi agar daftar pesan tidak menciut', () => {
  // flex:1 di dalam induk tanpa tinggi akan menciut jadi nol — daftar pesan hilang.
  assert.match(cooking, /dockMaxHeight/, 'chatDock butuh maxHeight');
  assert.match(cooking, /maxHeight:\s*dockMaxHeight/, 'maxHeight harus dipakai di style');
});

test('tidak ada penghindar keyboard ganda di dalam panel', () => {
  // CookingScreen sudah memberi padding; KeyboardAvoidingView di dalamnya akan
  // menggeser kolom tulis dua kali sehingga justru terdorong keluar layar.
  const code = companion.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(
    code,
    /<KeyboardAvoidingView/,
    'AICompanion tidak boleh memasang KeyboardAvoidingView sendiri',
  );
});
