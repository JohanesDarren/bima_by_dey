# 06: Satu inti pembersih teks

**What to build:** Satu inti bersama untuk membuang penanda markdown, dipakai oleh dua pintu masuk yang ada sekarang (pembersih kolom pendek untuk bahan/langkah, dan pembersih jawaban panjang untuk chat/suara). Kedua pintu masuk tetap ada karena melayani bentuk teks yang berbeda, tetapi aturan pembuangan markdown-nya tidak lagi terduplikasi.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Aturan membuang markdown hidup di satu inti, bukan dua salinan dengan aturan berbeda.
- [ ] Pembersih kolom pendek dan pembersih jawaban panjang sama-sama memakai inti tersebut.
- [ ] Perilaku kedua pemakai tidak berubah untuk masukan yang sudah didukung hari ini.
- [ ] Ada tes inti bersama yang mengunci perilaku pembersihan markdown.
- [ ] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
