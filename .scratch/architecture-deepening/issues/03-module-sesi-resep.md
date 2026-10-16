# 03: Module "sesi resep" (satu pemilik state resep)

**What to build:** Satu module yang memiliki siklus hidup membuka satu resep: ambil (dari cache perangkat atau RAG), status loading/error, retry, dan resep aktif. Layar detail resep dan layar riwayat menjadi pemakai pasif. Tidak ada lagi state resep yang hidup di dua tempat sekaligus, tidak ada lagi mengintip store langsung dari dalam layar, dan riwayat membuka resep lewat snapshot tanpa mengarang objek menu palsu.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Hanya ada satu pemilik state resep (status, resep, galat); layar detail resep tidak lagi menyimpan salinan loading/error sendiri.
- [ ] Akses langsung ke state store dari dalam layar (`getState()`) hilang.
- [ ] Riwayat membuka sesi lama tanpa membuat objek MenuItem palsu.
- [ ] Status loading / gagal-baca / galat bisa diuji tanpa merender layar.
- [ ] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
