/**
 * Penyaring kalimat untuk mode bebas-tangan (hands-free).
 *
 * MASALAH YANG DISELESAIKAN
 * Deteksi suara memakai pengenal bawaan HP (`expo-speech-recognition`), jadi
 * ambangnya milik perangkat — bukan milik aplikasi. Pada sebagian HP ambang itu
 * sangat lebar: suara kipas, air keran, atau percakapan di ruangan lain ikut
 * dianggap kalimat. Karena itu mode `auto` bisa merekam terus tanpa pengguna
 * bermaksud bicara.
 *
 * Mode tekan-dan-tahan menyelesaikan itu, tapi tidak masuk akal saat memasak:
 * tangan sedang memegang pisau, mengaduk, atau berlumur tepung. Menekan tombol
 * lebih dulu membuat fitur ini tidak terpakai.
 *
 * JALAN TENGAH
 * Mikrofon tetap menyala sendiri (tidak perlu menyentuh apa pun), tetapi hasil
 * pengenal TIDAK langsung dianggap pertanyaan. Setiap kalimat disaring lebih dulu
 * dengan tiga ukuran yang murah dan bisa diuji:
 *
 *   1. Panjang  — kebisingan biasanya menghasilkan satu-dua kata acak
 *                 ("ya", "eh", "apa itu"). Pertanyaan nyata lebih panjang.
 *   2. Ragu     — pengenal menandai keyakinannya (`confidence`, 0..1). Di bawah
 *                 ambang, teksnya biasanya hasil menebak dari noise.
 *   3. Kata kunci — kalimat harus terdengar seperti permintaan, bukan gumaman.
 *                 Ini yang paling menentukan: "berapa lama merebus?" lolos,
 *                 "hmm" tidak.
 *
 * Yang tersaring hanya DIBUANG tanpa suara — pengguna tidak diganggu dan mikrofon
 * lanjut mendengarkan. Kalau ternyata kalimat sah ikut terbuang, pengguna masih
 * punya tombol "Bicara sekarang" sebagai jalan keluar, jadi tidak pernah buntu.
 *
 * Semua fungsi di sini murni: tanpa jaringan, tanpa state, tanpa timer.
 */

/** Panjang minimum (dalam kata) agar sebuah kalimat dianggap pertanyaan. */
export const MIN_WORDS = 2;

/** Panjang minimum karakter, menangkap kasus "apa?" yang tetap wajar. */
export const MIN_CHARS = 6;

/**
 * Ambang keyakinan pengenal. Nilai -1 berarti perangkat tidak melaporkan
 * keyakinan sama sekali; itu diperlakukan sebagai "tidak diketahui" dan lolos,
 * supaya HP yang tidak mendukung tidak kehilangan semua pertanyaan.
 */
export const MIN_CONFIDENCE = 0.35;

/**
 * Kata yang menandakan permintaan sungguhan seputar memasak.
 *
 * Sengaja lebar: lebih baik menerima kalimat yang agak meleset daripada membuang
 * pertanyaan sah. Penyaring ini untuk membuang GUMAMAN, bukan untuk menilai mutu.
 */
const INTENT_WORDS = [
  // tanya
  'apa',
  'apakah',
  'berapa',
  'bagaimana',
  'gimana',
  'kenapa',
  'mengapa',
  'kapan',
  'mana',
  'boleh',
  'bisa',
  'perlu',
  'harus',
  'sebaiknya',
  'kalau',
  // tindakan memasak
  'masak',
  'memasak',
  'rebus',
  'merebus',
  'rendam',
  'merendam',
  'tumis',
  'menumis',
  'goreng',
  'menggoreng',
  'kukus',
  'mengukus',
  'panggang',
  'bakar',
  'potong',
  'memotong',
  'aduk',
  'mengaduk',
  'campur',
  'masukkan',
  'angkat',
  'sajikan',
  'tiriskan',
  'didihkan',
  'panaskan',
  'lanjut',
  'langkah',
  'selanjutnya',
  // takaran & bahan
  'bahan',
  'takaran',
  'gram',
  'sendok',
  'gelas',
  'liter',
  'jam',
  'menit',
  'suhu',
  'api',
  'porsi',
  'ganti',
  'pengganti',
  'kurang',
  'tambah',
  'matang',
  'lunak',
  'empuk',
  // arahan ke asisten
  'tolong',
  'chef',
  'bantu',
  'diapakan',
  'diapa',
  'dimasak',
  'direbus',
  'digoreng',
  'dikukus',
  'dipotong',
  'dicampur',
  'ditumis',
  'dilakukan',
  'caranya',
  'sekarang',
  'sudah',
  'belum',
  'jelaskan',
  'sebutkan',
  'ulangi',
  'baca',
];

/** Gumaman yang sering dihasilkan pengenal dari kebisingan. */
const FILLER_ONLY =
  /^(?:eh|em|ehm|hmm|hm|ah|oh|uh|uhm|ya|iya|yaa|ok|oke|okay|halo|hai|hei|tes|test|hallo|la|lah|sih|nih|tuh|deh|kok|nah)$/i;

/** Normalisasi ringan: buang tanda baca, rapikan spasi, huruf kecil. */
export function normalizeTranscript(value: string): string {
  return value
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export interface TranscriptVerdict {
  /** `true` bila kalimat ini boleh diproses sebagai pertanyaan. */
  accept: boolean;
  /** Alasan penolakan — untuk log/uji, bukan untuk ditampilkan ke pengguna. */
  reason?: 'empty' | 'too-short' | 'low-confidence' | 'filler' | 'no-intent';
}

/**
 * Putuskan apakah hasil pengenal layak dianggap pertanyaan.
 *
 * `confidence` mengikuti kontrak expo-speech-recognition: 0..1, dan -1 bila
 * perangkat tidak menyediakannya.
 */
export function judgeTranscript(text: string, confidence = -1): TranscriptVerdict {
  const clean = normalizeTranscript(text);
  if (!clean) return { accept: false, reason: 'empty' };

  const words = clean.split(' ');

  // Gumaman diperiksa LEBIH DULU: "ok" dan "ya" pendek, jadi kalau pemeriksaan
  // panjang dijalankan duluan keduanya akan dilaporkan 'too-short' — padahal
  // penyebab sebenarnya adalah isinya memang bukan pertanyaan.
  const first = words[0];
  if (words.length === 1 && first !== undefined && FILLER_ONLY.test(first)) {
    return { accept: false, reason: 'filler' };
  }

  if (clean.length < MIN_CHARS || words.length < MIN_WORDS) {
    return { accept: false, reason: 'too-short' };
  }

  // Keyakinan rendah hanya ditolak bila perangkat MEMANG melaporkannya.
  if (confidence >= 0 && confidence < MIN_CONFIDENCE) {
    return { accept: false, reason: 'low-confidence' };
  }

  // Harus ada minimal satu kata yang terdengar seperti permintaan.
  const hasIntent = words.some((word) => INTENT_WORDS.includes(word));
  if (!hasIntent) {
    // Kalimat panjang tanpa kata kunci tetap diterima: bisa jadi pengguna
    // memakai istilah sendiri ("santannya pecah"). Hanya kalimat PENDEK tanpa
    // kata kunci yang dibuang, karena itulah bentuk khas salah dengar.
    if (words.length >= 5) return { accept: true };
    return { accept: false, reason: 'no-intent' };
  }

  return { accept: true };
}
