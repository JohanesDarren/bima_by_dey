import { cleanAssistantText, limitSentences } from './assistantText';

const input = '## Jawaban 👨‍🍳\n- **Aduk** bahan.\n- Masak 10 menit ✅';
const output = cleanAssistantText(input);

if (output !== 'Jawaban Aduk bahan. Masak 10 menit') {
  throw new Error(`Unexpected clean text: ${output}`);
}

const limited = limitSentences('Pertama jelas. Kedua tepat! Ketiga dibuang.', 2);
if (limited !== 'Pertama jelas. Kedua tepat!') {
  throw new Error(`Unexpected sentence limit: ${limited}`);
}

console.log('assistantText self-test passed');
