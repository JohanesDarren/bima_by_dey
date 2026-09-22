/**
 * Pembersih teks isi resep & menu (kolom pendek).
 *
 * Dipakai untuk bahan, judul/isi langkah, deskripsi menu, dan butir
 * kelebihan/kekurangan. Dua hal yang dibereskan:
 *
 * 1. Penanda markdown dibuang (AI sering menulis **tebal**, "# judul", "- butir").
 * 2. Keterangan dalam tanda kurung yang tidak berguna dibuang. Contoh nyata dari
 *    lapangan: "150 g tepung sorgum (±55% dari tepung)" — angka persen begitu cuma
 *    menyesatkan pembaca dan tidak dipakai saat memasak.
 *
 * Untuk jawaban chat/panggilan suara dipakai cleanAssistantText
 * (utils/assistantText.ts), yang juga memotong blok "Catatan Verifikasi" dari server.
 */

/** Buang penanda tingkat baris (judul, kutipan, butir, garis pemisah). */
export function cleanBlockMarkers(line: string): string {
  return line
    .replace(/^\s{0,3}#{1,6}\s*/, '')
    .replace(/^\s{0,3}>\s?/, '')
    .replace(/^\s*[-*+]\s+/, '• ')
    .replace(/^\s*([-*_]\s*){3,}$/, '')
    .replace(/\s+$/, '');
}

/** Versi teks polos: penanda markdown dibuang, baris & butir dipertahankan. */
export function stripMarkdown(text: string): string {
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

/** Ciri keterangan yang hanya mengganggu di kolom bahan/langkah. */
const JUNK_NOTE = [/%/, /^\s*dari\b/i, /(campuran|total|kandungan|setara|catatan|perbandingan)/i];

/**
 * Panjang maksimal keterangan dalam kurung yang masih dianggap berguna. Di atas
 * ini hampir pasti penjelasan panjang (mis. "(yang sudah matang sekali supaya
 * manis alami)") yang tidak dipakai saat memasak.
 */
const NOTE_MAX_CHARS = 30;

function isJunkNote(inner: string): boolean {
  const t = inner.trim();
  if (!t) return true;
  if (t.length > NOTE_MAX_CHARS) return true;
  return JUNK_NOTE.some((re) => re.test(t));
}

/** Potong di batas kata terdekat sebelum batas panjang. */
export function truncateAt(text: string, max: number): string {
  const s = text.trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(' ');
  const head = space > max * 0.6 ? cut.slice(0, space) : cut;
  return `${head.trim()}…`;
}

interface CleanOptions {
  /** > 0 → dipotong di batas kata terdekat. */
  maxLength?: number;
  /**
   * 'junk' (bawaan): hanya keterangan kurung yang mengganggu yang dibuang —
   *   dipakai untuk kalimat (isi langkah, deskripsi).
   * 'all': SEMUA keterangan kurung dibuang — dipakai untuk baris bahan, yang
   *   seharusnya cuma nama + jumlah + satuan.
   */
  notes?: 'junk' | 'all';
}

/**
 * Bersihkan kolom pendek dari AI: buang markdown, buang keterangan kurung yang
 * tidak berguna (persentase, alasan panjang), rapikan spasi & tanda baca ganda.
 */
export function cleanFoodText(text: string, options: CleanOptions = {}): string {
  const { maxLength = 0, notes = 'junk' } = options;
  const isNoise = (inner: string) => notes === 'all' || isJunkNote(inner);

  const cleaned = stripMarkdown(text)
    .replace(/\(([^()]*)\)/g, (_all, inner: string) => (isNoise(inner) ? ' ' : `(${inner.trim()})`))
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\(\s*\)/g, '')
    .replace(/^[-•]\s*/, '')
    .replace(/[\s,;:-]+$/, '')
    .trim();

  return maxLength > 0 ? truncateAt(cleaned, maxLength) : cleaned;
}
