# 02: Module "giliran percakapan" (satu jalur untuk chat & suara)

**What to build:** Satu module yang memiliki seluruh urutan satu giliran percakapan AI: kirim pesan → kumpulkan token → baca balasan (deteksi kegagalan server, bersihkan teks, tangani jawaban kosong) → petakan galat → hasilkan giliran riwayat. Chat teks dan panggilan suara menjadi adapter di atasnya, bukan dua implementasi paralel. Perilaku pengguna tetap sama; yang berubah adalah sumber kebenarannya kini tunggal.

**Blocked by:** 01.

**Status:** done

- [x] Module baru punya interface sempit (satu fungsi giliran) yang menerima stream sebagai dependensi, bukan membuatnya sendiri.
- [x] Chat teks dan panggilan suara sama-sama memakai module ini; tidak ada lagi dua salinan urutan "stream → baca balasan → tangani galat → riwayat".
- [x] Pesan galat untuk kegagalan yang sama kini identik di chat dan suara.
- [x] Ada tes yang mengunci perilaku: balasan kosong, kegagalan sisi server, dan pemutus arus terbuka — dijalankan tanpa jaringan (stream palsu disuntikkan).
- [x] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
