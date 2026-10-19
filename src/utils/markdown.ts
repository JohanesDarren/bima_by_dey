/**
 * Inti pembuang markdown — SATU-satunya tempat aturan "penanda markdown → teks polos"
 * hidup. AI sering menulis **tebal**, "# judul", "- butir", tautan, blok kode; layar
 * dan suara tidak merender markdown, jadi penandanya harus dibuang.
 *
 * Dua pintu masuk memakainya karena bentuk teksnya beda:
 * - `cleanFoodText` (utils/cleanText.ts): kolom pendek (bahan, langkah, menu) →
 *   layout 'lines'.
 * - `cleanAssistantText` (utils/assistantText.ts): jawaban panjang chat/suara →
 *   layout 'inline'.
 *
 * Mana yang bersama, mana yang khusus layout:
 * - Bersama: tidak ada penanda markdown yang tersisa di keluaran; pagar blok kode
 *   (`unwrapFences`) dan daftar karakter penanda (`MARKER_CHARS`) hidup di sini saja.
 * - Khusus 'lines': butir jadi "• ", garis pemisah & judul dibuang per baris, huruf
 *   miring dibuka hanya bila berpasangan (jadi `snake_case` aman), baris dipertahankan.
 * - Khusus 'inline': tautan/gambar jadi teksnya, karakter penanda disapu di mana pun
 *   posisinya, awalan butir/nomor dibuang. Dua layout sengaja tidak disatukan lebih
 *   jauh: keluaran masing-masing sudah dikunci tests/markdown.test.mjs, dan menyatukan
 *   aturannya mengubah apa yang dilihat pengguna.
 */

/** Karakter penanda yang disapu habis di layout 'inline' (di mana pun posisinya). */
const MARKER_CHARS = /[*_`>#~|]/g;

/** Pagar blok kode dibuang bersama label bahasanya; isi blok tetap. */
function unwrapFences(text: string): string {
  return text.replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*|```/g, ''));
}

/** Pagar kode + semua karakter penanda; tautan dan awalan daftar tidak disentuh. */
export function stripMarkerChars(text: string): string {
  return unwrapFences(text).replace(MARKER_CHARS, '');
}

/** Buang penanda tingkat baris (judul, kutipan, butir, garis pemisah). */
function cleanBlockMarkers(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^\s*[-*+]\s+/, '• ')
    .replace(/^\s*([-*_]\s*){3,}$/, '')
    .replace(/\s+$/, '');
}

/** Layout 'lines': baris & butir dipertahankan, hanya penanda yang pergi. */
function stripToLines(text: string): string {
  return text
    .split('\n')
    .map(cleanBlockMarkers)
    .join('\n')
    .replace(/\*\*|__/g, '')
    .replace(/`/g, '')
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/(^|\s)_([^_\n]+)_/g, '$1$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Layout 'inline': teks polos untuk dibaca/diucapkan. Tautan & gambar jadi teksnya,
 * semua karakter penanda disapu, awalan butir/nomor dibuang. Baris TIDAK diratakan di
 * sini — itu urusan pemanggil, karena ia masih perlu membuang emoji dulu.
 */
function stripToInline(text: string): string {
  return unwrapFences(text)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(MARKER_CHARS, '')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+/gm, '');
}

export type MarkdownLayout = 'lines' | 'inline';

/** Buang penanda markdown dari `text` menurut `layout` (bawaan 'lines'). */
export function stripMarkdown(text: string, layout: MarkdownLayout = 'lines'): string {
  return layout === 'inline' ? stripToInline(text) : stripToLines(text);
}
