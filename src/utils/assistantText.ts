export function cleanAssistantText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*|```/g, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`>#~|]/g, '')
    .replace(/^\s*(?:[-+•]|\d+[.)])\s+/gm, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/[\u200B-\u200D\uFE0E\uFE0F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

export function limitSentences(value: string, maximum: number): string {
  const clean = cleanAssistantText(value);
  if (!clean || maximum < 1) return '';
  const sentences = clean.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [clean];
  return sentences.slice(0, maximum).join(' ').replace(/\s+/g, ' ').trim();
}

export const RAG_ANSWER_GUARD = [
  'Gunakan hanya fakta yang tersedia dalam konteks resep dan hasil RAG.',
  'Jangan menebak atau menciptakan bahan, takaran, waktu, suhu, substitusi, kandungan gizi, atau klaim kesehatan.',
  'Jika informasi tidak tersedia atau tidak pasti, katakan itu secara jelas dan singkat.',
  'Jika pertanyaan ambigu, ajukan satu pertanyaan klarifikasi; jangan membuat asumsi.',
].join(' ');

export const COMPACT_RAG_STANDARD = [
  RAG_ANSWER_GUARD,
  'Utamakan informasi yang paling berguna. Jawab ringkas, jelas, lengkap, dan tanpa pengulangan atau basa-basi.',
  'Jangan gunakan emoji, markdown, ikon, logo, emblem, atau simbol dekoratif.',
].join(' ');
