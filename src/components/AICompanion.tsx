import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Speech from 'expo-speech';
import { colors, radius, spacing, typography } from '../theme';
import type { ChatMessage } from '../types';
import { streamKroomboxChat } from '../services/kroombox';

interface Props {
  /** Konteks yang disuntikkan ke AI (resep / langkah aktif). */
  context: string;
  /** Placeholder input chat. */
  placeholder?: string;
  /** Sembunyikan tombol mic (misal di web yg tak support STT). */
  compact?: boolean;
  /** Dipanggil tiap AI selesai menjawab (utk catatan riwayat). */
  onAssistantMessage?: (text: string) => void;
}

/**
 * Panel "AI menemani" — chat + voice dua arah.
 * - User ketik ATAU bicara (mic → STT).
 * - AI jawab teks + otomatis dibacakan (TTS) bila `autoSpeak` aktif.
 * Dipakai di RecipeDetail (sebelum masak) & CookingScreen (saat masak).
 */
export function AICompanion({ context, placeholder, compact, onAssistantMessage }: Props) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const speak = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text.replace(/[*#_`]/g, ''), { language: 'id-ID', rate: 0.95 });
  }, []);

  const send = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || streaming) return;
      setInput('');
      const userMsg: ChatMessage = { role: 'user', content: text, reasoning_content: null };
      const asstMsg: ChatMessage = { role: 'assistant', content: '', reasoning_content: null };
      setMsgs((m) => [...m, userMsg, asstMsg]);
      setStreaming(true);

      const es = streamKroomboxChat(
        { message: `${context}\n\nPertanyaan user: ${text}`, useRag: true, stream: true },
        {
          onToken: (delta) => {
            setMsgs((cur) => {
              const copy = [...cur];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: last.content + delta };
              }
              return copy;
            });
          },
          onDone: () => {
            setStreaming(false);
            // Bacakan jawaban AI bila autoSpeak aktif + report ke callback.
            setMsgs((cur) => {
              const last = cur[cur.length - 1];
              if (last?.role === 'assistant' && last.content) {
                if (autoSpeak) speak(last.content);
                onAssistantMessage?.(last.content);
              }
              return cur;
            });
          },
          onError: (e) => {
            setStreaming(false);
            setMsgs((cur) => [
              ...cur,
              { role: 'assistant', content: `⚠️ ${e.message}`, reasoning_content: null },
            ]);
          },
        },
      );
      return () => es.close();
    },
    [input, streaming, context, autoSpeak, speak, onAssistantMessage],
  );

  return (
    <View style={[styles.panel, compact && styles.panelCompact]}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖 AI Menemanimu</Text>
        <TouchableOpacity onPress={() => setAutoSpeak((v) => !v)} style={styles.speakToggle}>
          <Text style={[styles.speakText, autoSpeak && styles.speakTextOn]}>
            {autoSpeak ? '🔊 Suara nyala' : '🔇 Suara mati'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.msgs}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {msgs.length === 0 ? (
          <Text style={styles.hint}>
            💡 Tanya apa saja: "Bisa ganti santan dengan susu?", "Berapa lama ayam diungkep?", atau
            tekan 🎤 dan bicara.
          </Text>
        ) : (
          msgs.map((m, i) => (
            <View
              key={i}
              style={[styles.bubble, m.role === 'user' ? styles.bubbleUser : styles.bubbleAI]}
            >
              <Text style={[styles.bubbleText, m.role === 'user' && styles.bubbleTextUser]}>
                {m.content}
              </Text>
            </View>
          ))
        )}
        {streaming ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </ScrollView>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={placeholder || 'Tanya AI…'}
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={() => send()}
          multiline
        />
        <TouchableOpacity onPress={() => send()} style={styles.sendBtn} disabled={streaming}>
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  panelCompact: { marginTop: spacing.sm },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...typography.label, color: colors.text, fontSize: 15 },
  speakToggle: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceAlt,
  },
  speakText: { fontSize: 11, color: colors.textMuted, fontWeight: '600' },
  speakTextOn: { color: colors.success },
  msgs: { maxHeight: 200, marginBottom: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic', padding: spacing.xs },
  bubble: {
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.xs,
    maxWidth: '92%',
  },
  bubbleUser: { backgroundColor: colors.primary, alignSelf: 'flex-end', borderTopRightRadius: 4 },
  bubbleAI: { backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start', borderTopLeftRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 14, lineHeight: 20 },
  bubbleTextUser: { color: colors.textOnPrimary },
  inputRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-end' },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 90,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: colors.textOnPrimary, fontSize: 16 },
});
