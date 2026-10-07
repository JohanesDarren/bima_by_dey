import { extractJson, extractJsonArray } from './kroombox';

/**
 * Uji perbaikan JSON: kunci telanjang DITAMBAL, tapi teks di dalam string TIDAK
 * ikut dirusak (dulu pola polos menambahkan tanda kutip di dalam kalimat biasa).
 */
const kasus: { nama: string; input: string; cek: (hasil: unknown) => boolean }[] = [
  {
    nama: 'kunci telanjang ditambal',
    input: '{"nutrition": {calories: 480, protein: 12}}',
    cek: (h) => (h as { nutrition: { calories: number } }).nutrition?.calories === 480,
  },
  {
    nama: 'teks berisi koma+titik dua TIDAK dirusak',
    input: '{"name": "Bahan, lalu: masukkan", "servings": 2}',
    cek: (h) => (h as { name: string }).name === 'Bahan, lalu: masukkan',
  },
  {
    nama: 'teks berisi kurung kurawal di dalam string',
    input: '{"note": "pakai {ini}, campur: rata", "servings": 3}',
    cek: (h) => (h as { note: string }).note === 'pakai {ini}, campur: rata',
  },
  {
    nama: 'fence markdown dibuang',
    input: '```json\n{"name": "Sop Sorgum", "servings": 4}\n```',
    cek: (h) => (h as { name: string }).name === 'Sop Sorgum',
  },
  {
    nama: 'teks pengantar sebelum JSON',
    input: 'Baik, ini resepnya:\n{"name": "Bubur Sorgum", "servings": 2}',
    cek: (h) => (h as { name: string }).name === 'Bubur Sorgum',
  },
  {
    nama: 'array menu dengan kunci telanjang',
    input: '[{name: "Nasi Sorgum", description: "Enak, gurih: mantap"}]',
    cek: (h) => {
      const arr = h as { name: string; description: string }[];
      return arr[0]?.name === 'Nasi Sorgum' && arr[0]?.description === 'Enak, gurih: mantap';
    },
  },
  {
    nama: 'JSON rusak tetap null (tidak memaksa)',
    input: 'ini bukan json sama sekali',
    cek: (h) => h === null,
  },
];

let gagal = 0;
for (const k of kasus) {
  const pakaiArray = k.input.trimStart().startsWith('[') || k.input.includes('[{');
  const hasil = pakaiArray ? extractJsonArray(k.input) : extractJson(k.input);
  const lulus = k.cek(hasil);
  if (!lulus) gagal += 1;
  const tanda = lulus ? '' : ` → ${JSON.stringify(hasil)}`;
  console.log(`${lulus ? 'LULUS' : 'GAGAL'}  ${k.nama}${tanda}`);
}
if (gagal > 0) throw new Error(`${gagal} kasus JSON gagal`);
console.log(`\njson self-test passed (${kasus.length} kasus)`);
