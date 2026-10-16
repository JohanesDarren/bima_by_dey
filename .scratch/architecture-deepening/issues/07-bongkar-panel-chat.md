# 07: Bongkar panel chat jadi controller + view

**What to build:** Komponen panel chat besar dipecah menjadi dua: sebuah controller (hook) yang menangani percakapan, TTS, dan pengelolaan riwayat — dibangun di atas module giliran percakapan dari tiket 02 — dan sebuah komponen tampilan yang murni merender. Tidak ada perubahan tampilan atau perilaku bagi pengguna.

**Blocked by:** 02.

**Status:** ready-for-agent

- [ ] Logika percakapan/TTS/riwayat keluar dari komponen tampilan ke sebuah controller.
- [ ] Komponen tampilan tidak lagi menyimpan alur pengiriman/penanganan balasan sendiri.
- [ ] Controller bisa diuji dengan module giliran palsu (tanpa jaringan, tanpa merender UI).
- [ ] Tampilan dan perilaku bagi pengguna tidak berubah.
- [ ] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
