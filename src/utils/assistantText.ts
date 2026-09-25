/**
 * Awal blok dokumen internal server yang ikut tercetak di balasan: "Konsep Produk"
 * (deskripsi dokumen basis pengetahuan), "Catatan Verifikasi"/"Skor kelayakan"
 * (laporan mutu RAG). Semuanya BUKAN jawaban untuk pengguna. Polanya dikunci di awal
 * baris (dan diizinkan ada tanda markdown di depannya) supaya kalimat biasa yang
 * kebetulan memuat kata itu di tengah tidak ikut terpotong.
 */
const VERIFICATION_BLOCK = /(^|\n)[\s#>*_-]*(?:Catatan Verifikasi|Konsep Produk|Skor kelayakan)\b/i;

/** Baris skor kelayakan (mis. "Skor kelayakan: 55/100"). Hanya frasanya yang dibuang. */
const SCORE_LINE = /Skor kelayakan[^\n]*/i;

/**
 * Label pembuka yang kadang ditulis model/server ("Jawaban:", "Answer –", "Chef AI").
 * Panjangnya cuma beberapa kata, tapi terbaca canggung — dan di mode suara label itu
 * ikut diucapkan ("jawaban…").
 */
const LEADING_LABEL =
  /^\s*(?:jawaban|balasan|answer|response|respons|asisten|assistant|chef(?:\s+ai|\s+sorgum)?)\s*[:：\-–—]?\s*/i;

/** Label yang menggantung di ujung jawaban. */
const TRAILING_LABEL = /\s*(?:jawaban|balasan|answer|response|respons)\s*[:：]?\s*$/i;

/**
 * Petunjuk harga/biaya. Server kadang menyisipkan analisis harga (per kg, Rupiah)
 * walau aplikasi ini tidak pernah menampilkannya — dan di mode suara ikut dibacakan.
 */
const PRICE_HINT =
  /(?:\brp\b|\bidr\b|rupiah|\bharga\b|\bbiaya\b|\bongkos\b|per\s?kg\b|per\s?kilogram\b)/i;

/**
 * Potong blok laporan mutu RAG dari jawaban.
 *
 * Server menempel "Catatan Verifikasi … Skor kelayakan: 55/100" di ujung jawaban.
 * Itu laporan internal RAG, bukan jawaban koki: bikin pembaca awam bingung
 * ("resep ini belum layak?") dan, di mode suara, ikut dibacakan.
 */
function cutVerificationBlock(value: string): string {
  const cut = value.search(VERIFICATION_BLOCK);
  if (cut === -1) return value.replace(SCORE_LINE, '');
  const before = value.slice(0, cut);
  if (before.trim().length > 0) return before.replace(SCORE_LINE, '');
  // Blok dokumen ada di AWAL jawaban → memotong dari situ menghapus SELURUH jawaban
  // dan pengguna melihat balon KOSONG (kejadian nyata di HP). Buang judulnya saja,
  // sisakan isi baris sesudahnya.
  return value.replace(VERIFICATION_BLOCK, '$1').replace(SCORE_LINE, '');
}

/**
 * Pecah jadi kalimat dengan tanda baca tetap menempel. Tanpa lookbehind (didukung
 * lebih luas di mesin JS di HP).
 */
function splitSentences(value: string): string[] {
  const parts = value.split(/([.!?]+)\s+/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const body = (parts[i] ?? '').trim();
    if (body) out.push(body + (parts[i + 1] ?? ''));
  }
  return out;
}

/** Buang kalimat yang membahas harga/biaya. */
function dropPriceSentences(value: string): string {
  const kept = splitSentences(value).filter((sentence) => !PRICE_HINT.test(sentence));
  const joined = kept
    .join(' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Jangan pernah mengosongkan jawaban: kalau SELURUH jawabannya soal harga
  // (mis. pengguna memang bertanya harga), biarkan apa adanya.
  return joined || value.trim();
}

/**
 * Batas panjang keras, dipotong pada batas KALIMAT terdekat — tidak pernah memotong
 * di tengah kalimat. Ini lapis kedua setelah aturan prompt: server RAG kadang tidak
 * menuruti "maksimal N kata" dan menulis ulang seluruh resep padahal ditanya soal
 * pengganti satu bahan. Kalimat pertama selalu dipertahankan walau ia sendiri panjang.
 */
function limitWords(value: string, maxWords: number): string {
  const sentences = splitSentences(value);
  if (sentences.length <= 1) return value;
  const kept: string[] = [];
  let words = 0;
  for (const sentence of sentences) {
    const count = sentence.split(/\s+/).filter(Boolean).length;
    if (kept.length > 0 && words + count > maxWords) break;
    kept.push(sentence);
    words += count;
  }
  return kept.join(' ');
}

/** Batas panjang jawaban yang DITAMPILKAN, dalam kata. Lapis kedua setelah prompt. */
export const CHAT_MAX_WORDS = 30;
export const VOICE_MAX_WORDS = 25;

export function cleanAssistantText(value: string, options?: { maxWords?: number }): string {
  const cleaned = cutVerificationBlock(value)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*|```/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~|]/g, '')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();

  const filtered = dropPriceSentences(
    cleaned
      .replace(LEADING_LABEL, '')
      .replace(TRAILING_LABEL, '')
      // Sisa tanda bekas potongan blok dokumen (mis. ": 55/100") dibuang di awal saja.
      .replace(/^\s*[:;,\-–—]\s*/, ''),
  ).trim();

  const out = (options?.maxWords ? limitWords(filtered, options.maxWords) : filtered).trim();
  if (out) return out;
  // Jaring pengaman terakhir: JANGAN pernah menampilkan balon kosong. Kalau seluruh isi
  // jawaban habis terpotong oleh aturan di atas, tampilkan versi paling sederhana.
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*|```/g, ''))
    .replace(/[*_`>#~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
