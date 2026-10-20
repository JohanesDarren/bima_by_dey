/**
 * Membaca JSON dari balasan model — murni soal teks, tidak tahu apa-apa soal
 * jaringan, server, atau streaming.
 *
 * Model sering membungkus JSON dengan pagar markdown, menambah prosa pengantar,
 * menulis kunci tanpa tanda kutip, atau terus menulis prosa setelah JSON-nya
 * selesai. Semua penyesuaian itu murni urusan teks, jadi dikumpulkan di satu
 * module kecil yang bisa diuji tanpa memanggil server sama sekali.
 */

/**
 * Potongan JSON pertama yang SUDAH utuh di dalam teks (kurung seimbang, sadar
 * string), atau null bila belum lengkap.
 *
 * Dipakai untuk berhenti lebih awal. Server sering terus menulis prosa setelah
 * JSON-nya selesai (analisis harga per kg, alergen, "Catatan Verifikasi … skor
 * kelayakan") selama puluhan detik. Dulu kita menunggu sampai server bilang
 * selesai: hasilnya lambat, dan permintaan yang lewat batas waktu dibunuh
 * padahal datanya sudah lengkap. Potongan ini baru dianggap utuh bila benar-benar
 * bisa diparse, jadi tidak ada risiko memotong data separuh.
 */
export function completeJsonSlice(text: string): string | null {
  const first = [text.indexOf('{'), text.indexOf('[')]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  if (first === undefined) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = first; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) {
        // Model kadang menulis beberapa array terpisah; jangan berhenti kalau
        // masih ada array berikutnya (hasilnya nanti cuma sebagian).
        if (
          text
            .slice(i + 1)
            .trimStart()
            .startsWith('[')
        )
          return null;
        const slice = text.slice(first, i + 1);
        try {
          JSON.parse(slice);
          return slice;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Beberapa balasan memakai kunci tanpa tanda kutip (mis. `"nutrition": {calories: 480}`)
 * — itu bukan JSON sah, tapi isinya utuh. Contohnya muncul saat template prompt
 * menuliskan contoh kunci tanpa kutip dan model menyalinnya apa adanya. Kutip
 * kuncinya dulu sebelum menyerah: jauh lebih murah daripada mengulang permintaan
 * yang butuh 1-4 menit.
 *
 * PENTING — hanya menambal kunci di LUAR tanda kutip. Versi polos `([{,]\s*)(\w+)(\s*:)`
 * juga cocok di dalam teks biasa, sehingga kalimat seperti `"Bahan, lalu: masukkan"`
 * berubah jadi `"Bahan, "lalu": masukkan"` dan JSON-nya MALAH rusak. Jadi kita
 * telusuri teksnya sambil melacak apakah sedang berada di dalam string.
 */
function quoteBareKeys(value: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  let expectKey = false; // barusan lewat `{` atau `,` di luar string → kunci menyusul
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i]!;
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      expectKey = false;
      out += char;
      continue;
    }
    if (char === '{' || char === ',') {
      expectKey = true;
      out += char;
      continue;
    }
    if (char === ':' || char === '}' || char === ']') {
      expectKey = false;
      out += char;
      continue;
    }
    if (expectKey && /[A-Za-z_$]/.test(char)) {
      // Awal kunci telanjang: kutip sampai sebelum titik dua.
      let end = i;
      while (end < value.length && /[A-Za-z0-9_$]/.test(value[end]!)) end += 1;
      const rest = value.slice(end).match(/^\s*:/);
      if (rest) {
        out += `"${value.slice(i, end)}"`;
        i = end - 1;
        expectKey = false;
        continue;
      }
    }
    if (/\s/.test(char)) {
      out += char;
      continue;
    }
    expectKey = false;
    out += char;
  }
  return out;
}

/**
 * Inti bersama extractJson / extractJsonArray: buang pagar markdown, ambil potongan
 * dari tanda buka pertama sampai tanda tutup terakhir, lalu parse — dengan satu kali
 * percobaan menambal kunci telanjang sebelum menyerah.
 */
function parseJsonSlice<T>(raw: string, open: string, close: string): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1]!.trim() : trimmed;
  const start = candidate.indexOf(open);
  const end = candidate.lastIndexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice) as T;
  } catch {
    try {
      return JSON.parse(quoteBareKeys(slice)) as T;
    } catch {
      return null;
    }
  }
}

/**
 * Ekstrak JSON array dari respons (strip fence) → T[] | null.
 * Respons menu & pencarian berbentuk array — extractJson (objek) tak cukup.
 */
export function extractJsonArray<T>(raw: string): T[] | null {
  const value = parseJsonSlice<T[]>(raw, '[', ']');
  return Array.isArray(value) ? value : null;
}

/**
 * Ekstrak JSON dari respons yang mungkin dibungkus markdown fence
 * (```json ... ```) atau ada teks pengantar. Return null jika tidak ketemu.
 */
export function extractJson<T>(raw: string): T | null {
  return parseJsonSlice<T>(raw, '{', '}');
}
