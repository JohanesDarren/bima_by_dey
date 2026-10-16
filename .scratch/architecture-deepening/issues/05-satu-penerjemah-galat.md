# 05: Satu penerjemah galat (`describeError`)

**What to build:** Satu module yang menerjemahkan setiap jenis kegagalan (timeout, kegagalan model di sisi server, pemutus arus terbuka, jaringan terputus) menjadi satu kalimat Indonesia yang siap ditampilkan, dengan kalimat pengganti per konteks. Semua layar dan store memakai module ini, bukan menulis teks galat sendiri-sendiri.

**Blocked by:** 02.

**Status:** done

- [x] Hanya ada satu tempat yang memetakan jenis galat ke teks yang dilihat pengguna.
- [x] Galat yang sama tampil dengan kalimat yang sama di chat, panggilan suara, dan pemuatan menu/resep.
- [x] Pemetaan bisa diuji sebagai tabel (jenis galat masuk → kalimat keluar) tanpa jaringan.
- [x] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
