import { cleanAssistantText, compactAssistantAnswer, limitSentences } from './assistantText';

const input = '## Jawaban 👨‍🍳\n- **Aduk** bahan.\n- Masak 10 menit ✅';
const output = cleanAssistantText(input);

if (output !== 'Jawaban Aduk bahan. Masak 10 menit') {
  throw new Error(`Unexpected clean text: ${output}`);
}

const limited = limitSentences('Pertama jelas. Kedua tepat! Ketiga dibuang.', 2);
if (limited !== 'Pertama jelas. Kedua tepat!') {
  throw new Error(`Unexpected sentence limit: ${limited}`);
}

const numeric = limitSentences('Gunakan 1.5 liter air. Tambahkan sesuai resep. Selesai.', 2);
if (numeric !== 'Gunakan 1.5 liter air. Tambahkan sesuai resep.') {
  throw new Error(`Decimal sentence was corrupted: ${numeric}`);
}

const abbreviation = limitSentences('Konsultasikan dengan dr. ahli. Ikuti resep. Selesai.', 2);
if (abbreviation !== 'Konsultasikan dengan dr. ahli. Ikuti resep.') {
  throw new Error(`Abbreviation sentence was corrupted: ${abbreviation}`);
}

const deduplicated = compactAssistantAnswer('Aduk hingga rata. Aduk hingga rata. Sajikan.', 5, 80);
if (deduplicated !== 'Aduk hingga rata. Sajikan.') {
  throw new Error(`Duplicate sentence survived: ${deduplicated}`);
}

const wordLimited = compactAssistantAnswer('satu dua tiga empat lima enam tujuh', 5, 5);
if (wordLimited !== 'satu dua tiga empat lima.') {
  throw new Error(`Word limit failed: ${wordLimited}`);
}

console.log('assistantText self-test passed');
