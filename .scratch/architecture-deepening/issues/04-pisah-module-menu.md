# 04: Pisahkan module menu: prompt / penorma / orkestrasi

**What to build:** Module menu dipecah menjadi tiga module dengan satu tanggung jawab masing-masing: pembangun prompt (murni teks), penorma (fungsi murni), dan orkestrasi pencarian (permintaan bersamaan + kebijakan berhenti mengulang + cache). Penyusunan prompt untuk chat, menu, dan suara berkumpul di satu tempat.

**Blocked by:** 01.

**Status:** ready-for-agent

- [ ] Pembangun prompt, penorma, dan orkestrasi berada di module terpisah dengan interface sempit masing-masing.
- [ ] Bagian murni (pembangun prompt + penorma) bisa diuji tanpa jaringan.
- [ ] Kebijakan "kapan berhenti mengulang saat server macet" hidup di satu tempat, bukan tersebar di call-site.
- [ ] `npm run typecheck`, `npm run lint`, dan `npm test` hijau.
