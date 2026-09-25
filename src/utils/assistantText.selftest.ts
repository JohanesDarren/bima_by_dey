import { cleanAssistantText } from './assistantText';

/**
 * Pemeriksaan cepat pembersih jawaban. Bukan bagian aplikasi (tidak diimpor layar
 * mana pun) — dijalankan manual saat mengubah `assistantText.ts`.
 */
const cases: { name: string; input: string; expect: string; maxWords?: number }[] = [
  {
    name: 'markdown, emoji, dan label judul dibuang',
    input: '## Jawaban 👨‍🍳\n- **Aduk** bahan.\n- Masak 10 menit ✅',
    expect: 'Aduk bahan. Masak 10 menit',
  },
  {
    name: 'label pembuka "Jawaban:" dibuang',
    input: 'Jawaban: Tumis bumbu sampai harum.',
    expect: 'Tumis bumbu sampai harum.',
  },
  {
    name: 'label bahasa Inggris dibuang',
    input: 'Answer - Masukkan tumisan bumbu tadi.',
    expect: 'Masukkan tumisan bumbu tadi.',
  },
  {
    name: 'kalimat harga dibuang, sisanya utuh',
    input: 'Tumis bumbu sampai harum. Harga sorgum sekitar Rp 15.000 per kg. Lalu masukkan air.',
    expect: 'Tumis bumbu sampai harum. Lalu masukkan air.',
  },
  {
    name: 'blok "Catatan Verifikasi" dipotong',
    input: 'Aduk rata.\n\nCatatan Verifikasi\nSkor kelayakan: 65/100',
    expect: 'Aduk rata.',
  },
  {
    name: 'tempelan dokumen "Konsep Produk" dipotong, jawabannya tetap',
    input:
      'Pakai jahe bubuk setengah sendok teh sebagai pengganti merica.\n\n## Konsep Produk\n\nBola-bola ayam berbasis tepung sorgum yang direbus dalam sop bening sederhana.',
    expect: 'Pakai jahe bubuk setengah sendok teh sebagai pengganti merica.',
  },
  {
    name: 'jawaban yang seluruhnya soal harga dibiarkan',
    input: 'Harga sorgum sekitar Rp 15.000 per kg.',
    expect: 'Harga sorgum sekitar Rp 15.000 per kg.',
  },
  {
    name: 'batas kata: resep panjang dipotong di batas kalimat',
    input:
      'Ya bisa, karena tepung sorgum tidak mengandung gluten. Resep lengkapnya: campur tepung, gula, dan air. Aduk rata lalu kukus selama tiga puluh menit sampai matang.',
    expect: 'Ya bisa, karena tepung sorgum tidak mengandung gluten.',
    maxWords: 12,
  },
  {
    name: 'batas kata: jawaban pendek tidak disentuh',
    input: 'Ya bisa, karena tepung sorgum tidak mengandung gluten.',
    expect: 'Ya bisa, karena tepung sorgum tidak mengandung gluten.',
    maxWords: 12,
  },
  {
    name: 'tanda "±" tidak mengganggu pemotongan kalimat',
    input: 'Boleh, tambahkan air ± 200 ml. Lanjutkan mengukus sampai matang.',
    expect: 'Boleh, tambahkan air ± 200 ml.',
    maxWords: 6,
  },
  {
    name: 'jawaban diawali blok dokumen: judul dibuang, isinya TETAP tampil (jangan kosong)',
    input:
      '## Konsep Produk Sop Bola-Bola Daging Sorgum - bola-bola daging ayam giling yang diikat tepung sorgum dan tepung tapioka, direbus dalam kaldu ayam bening hangat.',
    expect:
      'Sop Bola-Bola Daging Sorgum - bola-bola daging ayam giling yang diikat tepung sorgum dan tepung tapioka, direbus dalam kaldu ayam bening hangat.',
  },
  {
    name: 'jawaban + "Skor kelayakan" di baris yang sama: jawabannya tidak ikut terhapus',
    input: 'Ya, bisa. Ganti merica dengan bubuk cabai kering 3 g. Skor kelayakan: 70/100',
    expect: 'Ya, bisa. Ganti merica dengan bubuk cabai kering 3 g.',
  },
  {
    name: 'sisanya cuma skor kelayakan: tidak boleh kosong',
    input: 'Skor kelayakan: 55/100',
    expect: '55/100',
  },
];

for (const item of cases) {
  const got = cleanAssistantText(item.input, { maxWords: item.maxWords });
  if (got !== item.expect) {
    throw new Error(`[${item.name}] harap "${item.expect}", dapat "${got}"`);
  }
}

console.log('assistantText self-test passed');
