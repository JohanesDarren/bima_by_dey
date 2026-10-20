# 01: Sapu kode mati & seam bocor (prefactor)

**What to build:** Codebase bersih dari sisa-sisa yang tidak lagi punya pemanggil, supaya pekerjaan deepening berikutnya lebih mudah dibaca dan dikerjakan. Tidak ada perubahan perilaku yang terlihat pengguna — ini murni menyingkirkan derau ("make the change easy, then make the easy change").

**Blocked by:** None (can start immediately).

**Status:** done

- [x] Panel chat lama yang sudah dihapus tidak lagi menyisakan style mati di layar masak (13 style tak terpakai).
- [x] Field `reasoning_content` — selalu `null`, tidak pernah dibaca — dihapus dari tipe pesan chat beserta semua penulisannya.
- [x] Setelan `ai_reasoning_enabled`, yang selama ini ditulis tapi tidak pernah dibaca untuk mengubah perilaku, dihapus dari tipe, penyimpanan, dan layar profil.
- [x] Dua nama berbeda untuk batas riwayat yang sama (`HISTORY_LIMIT` dan `VOICE_HISTORY_LIMIT`, keduanya 6) disatukan menjadi satu nilai.
- [x] Konstanta batas idle chat yang tidak dipakai di luar modulnya berhenti di-`export`.
- [x] `npm run typecheck`, `npm run lint`, dan `npm test` semuanya hijau.
