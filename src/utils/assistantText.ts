/** Awal blok catatan mutu RAG yang ditempel server di akhir jawaban. */
const VERIFICATION_BLOCK = /(^|\n)[\s#>*_-]*Catatan Verifikasi/i;

/** Baris skor kelayakan (mis. "Skor kelayakan: 55/100"). */
const SCORE_LINE = /(^|\n)[^\n]*Skor kelayakan[^\n]*/i;

/**
 * Potong blok laporan mutu RAG dari jawaban.
 *
 * Server menempel "Catatan Verifikasi … Skor kelayakan: 55/100" di ujung jawaban.
 * Itu laporan internal RAG, bukan jawaban koki: bikin pembaca awam bingung
 * ("resep ini belum layak?") dan, di mode suara, ikut dibacakan.
 */
function cutVerificationBlock(value: string): string {
  const cut = value.search(VERIFICATION_BLOCK);
  return (cut === -1 ? value : value.slice(0, cut)).replace(SCORE_LINE, '');
}

export function cleanAssistantText(value: string): string {
  return cutVerificationBlock(value)
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
