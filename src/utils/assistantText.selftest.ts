import { cleanAssistantText } from './assistantText';

const input = '## Jawaban 👨‍🍳\n- **Aduk** bahan.\n- Masak 10 menit ✅';
const output = cleanAssistantText(input);

if (output !== 'Jawaban Aduk bahan. Masak 10 menit') {
  throw new Error(`Unexpected clean text: ${output}`);
}

console.log('assistantText self-test passed');
