import type { KroomboxChatMessage, Profile } from '../types';

/**
 * Under-the-hood prompt injection (PRD F-03 requirement #2):
 * automatically appends the user's demographic profile to the chat payload
 * before sending it to the Kroombox API. Purely unit-testable pure function.
 */
export function buildSystemPrompt(profile: Profile): string {
  const ageGroup = profile.target_age_group ?? 'Umum';
  const condition = profile.special_condition ?? 'Umum';

  return [
    'Anda adalah asisten sorgumcore — seorang ahli gizi dan koki yang membantu menyusun resep sehat berbasis sorgum.',
    'Buat resep sesuai dengan parameter pengguna berikut:',
    `Target Umur: [${ageGroup}]`,
    `Kondisi Khusus: [${condition}]`,
    '',
    'Aturan:',
    '- Selalu gunakan sorgum sebagai bahan utama.',
    '- Sesuaikan tekstur, porsi, dan bumbu dengan target umur dan kondisi khusus.',
    '- Perhatikan batasan gizi yang relevan (gula, garam, lemak, alergen).',
    '- Sampaikan alasan ("proses meracik") untuk setiap keputusan resep secara singkat dan jujur.',
    '- Jika informasi pengguna kurang, minta klarifikasi. Jangan menebak bahan pengganti.',
    'Balas dalam Bahasa Indonesia yang ramah dan mudah dipahami.',
  ].join('\n');
}

/**
 * Builds the full Kroombox message array: a profile-grounded system prompt
 * plus the user's raw query.
 */
export function buildChatMessages(profile: Profile, userQuery: string): KroomboxChatMessage[] {
  return [
    { role: 'system', content: buildSystemPrompt(profile) },
    { role: 'user', content: userQuery },
  ];
}

/**
 * Creates a short human-readable title (first 40 chars, single line) from a
 * user's first message for the chat session title (PRD F-05).
 */
export function buildSessionTitle(query: string): string {
  const cleaned = query.replace(/\s+/g, ' ').trim();
  return cleaned.length === 0 ? 'Percakapan baru' : cleaned.slice(0, 40);
}
