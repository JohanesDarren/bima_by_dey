# 08: Panggilan suara jadi state machine + port suara

**What to build:** Siklus hidup panggilan suara dijadikan sebuah state machine murni (transisi antar keadaan: menganggur → mendengar → berpikir → bicara → galat), terpisah dari modul mikrofon/TTS lewat sebuah port. Hook menjadi adapter tipis yang mengikat port itu. Perilaku panggilan tetap sama; yang berubah adalah logikanya kini bisa diuji tanpa perangkat bersuara.

**Blocked by:** 02.

**Status:** done

- [x] Transisi keadaan panggilan ditentukan oleh satu reducer murni, bukan oleh beberapa efek yang saling terkait.
- [x] Akses ke mikrofon/TTS berada di balik satu port; reducer tidak menyentuhnya langsung.
- [x] Kelas bug "pendengar lama menyalakan ulang mikrofon sesudah panggilan ditutup" tertutup oleh satu kasus di reducer dan dikunci tes.
- [x] Urutan transisi (termasuk galat, mute/unmute yang mempertahankan riwayat, dan berhenti) bisa diuji tanpa perangkat.
- [x] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
