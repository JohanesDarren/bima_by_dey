/**
 * Pemeriksa mutu jawaban: apakah jawaban benar-benar MENJAWAB pertanyaannya?
 *
 * Kenapa modul terpisah, bukan ditambahkan ke `ai/conversationTurn`:
 * giliran percakapan di sana adalah milik refactor rekan tim — ia punya jatah
 * percobaan (`MAX_ATTEMPTS = 3`) dan uji sendiri yang mengunci perilakunya.
 * Menambah percobaan ulang di sana akan menggeser hitungan percobaan pada uji
 * tersebut. Modul ini murni (tanpa jaringan, tanpa state) sehingga bisa dipakai
 * lapisan pemanggil tanpa menyentuh satu baris pun kode giliran.
 *
 * Masalah yang ditangani (terukur 2026-10-24): server RAG menyuntikkan dokumen
 * ke prompt walau `useRag:false`, lalu model menjawab dengan DESKRIPSI resep
 * alih-alih menjawab pertanyaan. Contoh nyata: "berapa lama merendam sorgum?"
 * dijawab "Sup Ayam Sorgum adalah hidangan berkuah berbasis beras sorgum…"
 * tanpa pernah menyebut 8 jam.
 *
 * Strategi: kalau pertanyaan memuat ANGKA atau satuan yang bisa dicocokkan,
 * jawaban harus memuat angka itu. Ini sengaja konservatif — hanya menandai
 * kasus yang jelas meleset, supaya tidak memicu percobaan ulang yang sia-sia
 * (percobaan ulang menggandakan waktu tunggu, dan kecepatan itu penting).
 */

/** Angka yang muncul di pertanyaan: `8`, `20`, `1.5`, `200`. */
const NUMBER_IN_QUESTION = /\b(\d+(?:[.,]\d+)?)\b/g;

/**
 * Pertanyaan yang meminta kuantitas/waktu — hanya untuk ini pemeriksaan angka
 * diberlakukan. Pertanyaan seperti "apa langkah selanjutnya?" tidak punya angka
 * dan tidak bisa dinilai dengan cara ini.
 */
const ASKS_QUANTITY =
  /\b(berapa|brp|berapa lama|berapa banyak|sampai berapa|seberapa|takaran|jumlah|ukur)\b/i;

/** Kata tanya yang jawabannya berupa tindakan, bukan angka. */
const ASKS_ACTION = /\b(apa|bagaimana|gimana|diapakan|harus apa|langkah|caranya)\b/i;

/**
 * Satuan waktu/jumlah yang diminta pertanyaan.
 *
 * Pertanyaan seperti "berapa lama merendam sorgum?" TIDAK memuat angka, jadi
 * pencocokan angka saja tidak cukup — yang harus muncul di jawaban adalah
 * besarannya: "8 jam", "20 menit", "200 g".
 */
const UNIT_IN_QUESTION =
  /\b(jam|menit|detik|hari|malam|gram|gr|g|kg|ml|liter|l|sendok|sdm|sdt|butir|siung|porsi|derajat|celsius)\b/i;

/**
 * Pertanyaan yang menanyakan LAMA waktu tanpa menyebut satuan
 * (mis. "berapa lama merendam sorgum?"). Jawaban wajib memuat satuan waktu.
 */
const ASKS_DURATION = /\b(berapa\s+lama|brp\s+lama|seberapa\s+lama)\b/i;

/** Satuan waktu yang harus muncul pada jawaban pertanyaan "berapa lama". */
const TIME_UNIT = /\b(jam|menit|detik|hari|malam)\b/i;

/** Buang penanda format supaya pencocokan angka tidak terganggu markdown. */
function normalize(value: string): string {
  return value
    .replace(/[*_`~#|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Apakah jawaban tampak menjawab pertanyaan.
 *
 * Mengembalikan `false` HANYA bila ada bukti jelas bahwa jawaban meleset:
 * pertanyaan meminta kuantitas DAN memuat angka, tetapi angka itu tidak muncul
 * di jawaban. Selain itu dianggap cukup — lebih baik membiarkan jawaban agak
 * meleset daripada mengulang permintaan yang mungkin sudah benar.
 */
export function answersQuestion(question: string, answer: string): boolean {
  const q = normalize(question);
  const a = normalize(answer);

  if (!q || !a) return true; // tidak ada dasar untuk menilai

  if (ASKS_QUANTITY.test(q)) {
    // (a) Pertanyaan menyebut angka tertentu → angka itu harus muncul.
    const numbers = [...q.matchAll(NUMBER_IN_QUESTION)]
      .map((m) => m[1])
      .filter((n): n is string => Boolean(n));
    if (numbers.length > 0 && !numbers.some((n) => a.includes(n))) return false;

    // (b) Pertanyaan meminta besaran (waktu/takaran) → jawaban harus menyebut
    //     satuan yang sama. "Berapa lama?" dijawab deskripsi hidangan tanpa
    //     "jam"/"menit" berarti tidak menjawab.
    const unit = q.match(UNIT_IN_QUESTION)?.[1];
    if (unit) {
      const sameUnit = new RegExp(`\\b${unit}\\b`, 'i');
      if (!sameUnit.test(a)) return false;
    }

    // "Berapa lama?" tanpa satuan di pertanyaan tetap menuntut satuan waktu di
    // jawaban. Deskripsi hidangan tidak memuat "jam"/"menit" → dianggap meleset.
    if (ASKS_DURATION.test(q) && !TIME_UNIT.test(a)) return false;
  }

  // Pertanyaan meminta tindakan → jawaban tidak boleh hanya deskripsi produk.
  if (ASKS_ACTION.test(q)) {
    // Ciri jawaban "deskripsi resep" yang tidak menjawab: kalimatnya tentang
    // hidangan secara umum dan tidak memuat kata kerja memasak apa pun.
    const describesDish = /\b(adalah|merupakan|hidangan|cocok|berbasis|berkuah|gurih)\b/.test(a);
    const hasAction =
      /\b(rebus|rendam|tumis|masak|masukkan|didihkan|angkat|sajikan|aduk|tiriskan|potong|haluskan|kukus|goreng|panggang|bakar|campur|tuang|sisihkan)\b/.test(
        a,
      );
    if (describesDish && !hasAction) return false;
  }

  return true;
}

/**
 * Pertanyaan lanjutan yang lebih tegas untuk percobaan kedua.
 *
 * Ditempel di AKHIR prompt (bukan mengganti isinya), karena model cenderung
 * mengikuti instruksi terakhir.
 */
export const RETRY_ANSWER_INSTRUCTION = [
  'PENTING: jawab pertanyaannya secara langsung pada kalimat pertama.',
  'Jangan mendeskripsikan hidangannya. Jangan menyalin dokumen.',
  'Kalau pertanyaan meminta waktu, takaran, atau jumlah, sebutkan angkanya.',
].join(' ');
