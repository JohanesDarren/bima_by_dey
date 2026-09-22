import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';
import { cleanBlockMarkers } from '../utils/cleanText';
import { colors, radius } from '../theme';

/**
 * Teks jawaban AI sering memakai penanda markdown (**tebal**, _miring_, `kode`,
 * "# judul", "- butir"). Di layar, penanda itu ikut terlihat dan mengganggu.
 *
 * FormattedText menampilkan teks rapi: penanda hilang, tapi maknanya tetap
 * terbaca (tebal tetap tebal, butir jadi "•"). Tanpa pustaka markdown tambahan.
 *
 * Pembersih teks polos (stripMarkdown, cleanFoodText) ada di utils/cleanText.
 */

interface Segment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
}

/** Penanda sebaris: **tebal**, __tebal__, `kode`, *miring*, _miring_. */
const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\n]+\*|_[^_\n]+_)/g;

/** Ubah satu baris menjadi potongan teks berformat. */
function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  for (const match of line.matchAll(INLINE)) {
    const raw = match[0];
    const at = match.index ?? 0;
    if (at > cursor) segments.push({ text: line.slice(cursor, at) });

    if (raw.startsWith('**') || raw.startsWith('__')) {
      segments.push({ text: raw.slice(2, -2), bold: true });
    } else if (raw.startsWith('`')) {
      segments.push({ text: raw.slice(1, -1), code: true });
    } else {
      segments.push({ text: raw.slice(1, -1), italic: true });
    }
    cursor = at + raw.length;
  }

  if (cursor < line.length) segments.push({ text: line.slice(cursor) });

  // Sisa penanda yang tidak berpasangan jangan sampai ikut tampil.
  return segments.map((s) =>
    s.bold || s.italic || s.code ? s : { ...s, text: s.text.replace(/\*\*|__|`/g, '') },
  );
}

interface Props {
  text: string;
  style?: StyleProp<TextStyle>;
  /** Teks di dalam balon pengguna (warna terang) → gaya kode disesuaikan. */
  onDarkBubble?: boolean;
}

/** Teks jawaban AI siap tampil: penanda markdown sudah dirapikan. */
export function FormattedText({ text, style, onDarkBubble }: Props) {
  const lines = text.split('\n');

  return (
    <View>
      {lines.map((line, index) => {
        const cleaned = cleanBlockMarkers(line);
        if (!cleaned.trim()) return <View key={index} style={styles.gap} />;

        return (
          <Text key={index} style={[styles.line, style]}>
            {parseInline(cleaned).map((segment, inner) => (
              <Text
                key={inner}
                style={[
                  segment.bold && styles.bold,
                  segment.italic && styles.italic,
                  segment.code && styles.code,
                  segment.code && onDarkBubble && styles.codeOnDark,
                ]}
              >
                {segment.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  line: { marginBottom: 2 },
  gap: { height: 6 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
  },
  codeOnDark: { backgroundColor: 'rgba(0,0,0,0.18)' },
});
