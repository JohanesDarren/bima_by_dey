import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography, elevation } from '../theme';
import type { ChatMessage } from '../types';
import { serverFailureText, streamKroomboxChat } from '../services/kroombox';
import { CHAT_MAX_WORDS, CHAT_LOADING_STAGES, cleanAssistantText } from '../utils/assistantText';
import { buildChefHistory, buildChefMessage } from '../utils/chefPrompt';

interface Props {
  context: string;
  recipeName: string;
  recipeMeta?: string;
  placeholder?: string;
  compact?: boolean;
  simple?: boolean;
  onVoiceCall?: () => void;
  onAssistantMessage?: (text: string) => void;
}

const SUGGESTIONS = ['Pengganti bahan?', 'Ubah jumlah porsi?', 'Jelaskan langkah ini'];

export function AICompanion({
  context,
  recipeName,
  recipeMeta,
  placeholder,
  compact,
  simple = false,
  onVoiceCall,
  onAssistantMessage,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(!simple);
  const [lastQuestion, setLastQuestion] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  /** Keyboard terbuka → panel chat yang mengisi seluruh ruang sisa layar. */
  const [keyboardUp, setKeyboardUp] = useState(false);
  /** Tahapan menunggu jawaban (teks bergantian) — lihat CHAT_LOADING_STAGES. */
  const [loadingStage, setLoadingStage] = useState(0);

  useEffect(() => {
    if (!streaming) {
      setLoadingStage(0);
      return;
    }
    const timer = setInterval(() => setLoadingStage((value) => value + 1), 2500);
    return () => clearInterval(timer);
  }, [streaming]);

  /**
   * Kenapa begini, bukan sekadar "gulir ke bawah saat keyboard muncul": panel ini
   * berada di dalam guliran layar, dan jendela Android berubah ukuran SETELAH
   * perintah gulir berjalan — jadi posisinya meleset dan kolom tulis tetap
   * tertutup. Di sini tidak ada tebakan waktu: saat keyboard muncul, panel dipaksa
   * mengisi ruang sisa (flex), sehingga kolom tulis selalu tepat di atas keyboard.
   */
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => {
      setKeyboardUp(true);
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(
    () => () => {
      streamRef.current?.close();
      Speech.stop();
    },
    [],
  );

  const speak = useCallback((text: string) => {
    Speech.stop();
    Speech.speak(text.replace(/[*#_`]/g, ''), { language: 'id-ID', rate: 0.95 });
  }, []);

  const send = useCallback(
    (overrideText?: string) => {
      const text = (overrideText ?? input).trim();
      if (!text || streaming) return;
      setLastQuestion(text);
      setInput('');
      setMessages((current) => [
        ...current,
        { role: 'user', content: text, reasoning_content: null },
        { role: 'assistant', content: '', reasoning_content: null },
      ]);
      setStreaming(true);
      let assistantText = '';

      streamRef.current = streamKroomboxChat(
        {
          // Susunan pesan (persona + konteks + aturan dasar upstream + tambahan kita +
          // pertanyaan di ujung) ada di chefPrompt.ts supaya aturannya satu tempat.
          message: buildChefMessage(context, text),
          // Riwayat percakapan ikut dikirim supaya pertanyaan lanjutan nyambung.
          history: buildChefHistory(messages),
          useRag: true,
          stream: true,
          // Kuota token keluaran (dipungut dari versi upstream). 250 ≈ 3x batas 30 kata
          // kita, jadi longgar untuk jawaban benar dan hanya memotong yang berlarut.
          maxTokens: 250,
        },
        {
          onToken: (delta) => {
            assistantText += delta;
            // Kalau server mengirim pesan kegagalannya sendiri, tampilkan kalimat
            // jujurnya — jangan biarkan teks teknis "Error code: 503 …" jadi balon jawaban.
            const failure = serverFailureText(assistantText);
            const clean =
              failure ?? cleanAssistantText(assistantText, { maxWords: CHAT_MAX_WORDS });
            setMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') {
                next[next.length - 1] = { ...last, content: clean };
              }
              return next;
            });
          },
          onDone: () => {
            setStreaming(false);
            streamRef.current = null;
            setMessages((current) => {
              const last = current[current.length - 1];
              if (last?.role !== 'assistant') return current;
              if (!last.content.trim()) {
                // Server menutup koneksi tanpa satu pun potongan jawaban. Jangan
                // biarkan balon KOSONG menggantung — pengguna merasa tidak dijawab
                // dan tidak tahu kenapa. Katakan apa adanya.
                return [
                  ...current.slice(0, -1),
                  { ...last, content: 'Layanan tidak mengirim jawaban. Coba kirim lagi.' },
                ];
              }
              const failure = serverFailureText(last.content);
              const clean =
                failure ?? cleanAssistantText(last.content, { maxWords: CHAT_MAX_WORDS });
              if (autoSpeak && !failure) speak(clean);
              onAssistantMessage?.(clean);
              return [...current.slice(0, -1), { ...last, content: clean }];
            });
          },
          onError: () => {
            setStreaming(false);
            streamRef.current = null;
            setMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === 'assistant' && !last.content) next.pop();
              return [
                ...next,
                {
                  role: 'assistant',
                  content: 'Koneksi terputus. Coba kirim lagi.',
                  reasoning_content: null,
                },
              ];
            });
          },
        },
      );
    },
    // `messages` ikut jadi dependensi: riwayat percakapan dibangun saat kirim,
    // jadi kalau tidak, yang terkirim bisa riwayat dari render lama (basi).
    [autoSpeak, context, input, messages, onAssistantMessage, speak, streaming],
  );

  const stop = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setStreaming(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={keyboardUp ? styles.fill : undefined}
    >
      <View
        style={[
          styles.panel,
          compact && styles.panelCompact,
          keyboardUp && styles.fill,
          elevation.sm,
        ]}
      >
        <View style={[styles.recipeCard, simple && styles.hidden]}>
          <View style={styles.recipeInitials}>
            <Text style={styles.recipeInitialsText}>
              {recipeName
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join('')
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.recipeCopy}>
            <Text style={styles.recipeBadge}>RESEP AKTIF</Text>
            <Text style={styles.recipeTitle} numberOfLines={1}>
              {recipeName}
            </Text>
            {recipeMeta ? <Text style={styles.recipeMeta}>{recipeMeta}</Text> : null}
          </View>
          <MaterialIcons name="chevron-right" size={20} color={colors.accent} />
        </View>

        <View style={styles.modeToggle} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: false }}
            onPress={onVoiceCall}
            disabled={!onVoiceCall}
            style={styles.modeButton}
          >
            <MaterialIcons name="phone-in-talk" size={16} color={colors.textMuted} />
            <Text style={styles.modeText}>Panggilan Suara</Text>
          </Pressable>
          <View
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.modeButton, styles.modeButtonActive]}
          >
            <MaterialIcons name="chat-bubble-outline" size={16} color={colors.accent} />
            <Text style={styles.modeTextActive}>Chat Teks</Text>
          </View>
        </View>

        <View style={[styles.dateRow, simple && styles.hidden]}>
          <Text style={styles.dateText}>HARI INI</Text>
        </View>

        <View style={[styles.header, simple && styles.hidden]}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <MaterialIcons name="grain" size={18} color={colors.primaryDark} />
            </View>
            <View>
              <Text style={styles.title}>Chef Sorghum AI</Text>
              <Text style={styles.subtitle}>Jawaban langsung dari RAG sorgum</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: autoSpeak }}
            accessibilityLabel={
              autoSpeak ? 'Matikan pembacaan jawaban' : 'Aktifkan pembacaan jawaban'
            }
            onPress={() => {
              setAutoSpeak((value) => !value);
              if (autoSpeak) Speech.stop();
            }}
            style={({ pressed }) => [
              styles.speakToggle,
              autoSpeak && styles.speakToggleOn,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name={autoSpeak ? 'volume-up' : 'volume-off'}
              size={18}
              color={autoSpeak ? colors.primaryDark : colors.textMuted}
            />
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          style={[styles.messages, keyboardUp && styles.messagesKeyboard]}
          contentContainerStyle={styles.messagesContent}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 ? (
            <View style={styles.tip}>
              <Text style={styles.tipText}>
                Tanyakan takaran, pengganti bahan, atau langkah yang belum jelas pada resep ini.
              </Text>
            </View>
          ) : (
            messages.map((message, index) => (
              <View
                key={`${message.role}-${index}`}
                style={[styles.messageRow, message.role === 'user' && styles.messageRowUser]}
              >
                {message.role === 'assistant' ? (
                  <View style={styles.avatarSmall}>
                    <MaterialIcons name="grain" size={13} color={colors.primary} />
                  </View>
                ) : null}
                <View
                  style={[
                    styles.bubble,
                    message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant,
                  ]}
                >
                  <Text
                    style={[styles.bubbleText, message.role === 'user' && styles.bubbleTextUser]}
                  >
                    {message.content || '…'}
                  </Text>
                </View>
              </View>
            ))
          )}
          {streaming ? (
            <Text style={styles.streamLabel} accessibilityLiveRegion="polite">
              {CHAT_LOADING_STAGES[loadingStage % CHAT_LOADING_STAGES.length]}
            </Text>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
          style={simple ? styles.hidden : undefined}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestions}
          keyboardShouldPersistTaps="handled"
        >
          {SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              onPress={() => send(suggestion)}
              disabled={streaming}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <Text style={styles.suggestionText}>{suggestion}</Text>
            </Pressable>
          ))}
          {lastQuestion && !streaming ? (
            <Pressable
              onPress={() => send(lastQuestion)}
              style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
            >
              <MaterialIcons name="refresh" size={14} color={colors.primary} />
              <Text style={styles.suggestionText}>Ulangi</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Pesan untuk pendamping resep"
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={placeholder || 'Tulis pertanyaan…'}
            placeholderTextColor={colors.textSubtle}
            onSubmitEditing={() => send()}
            multiline
          />
          <Pressable
            accessibilityLabel={streaming ? 'Hentikan jawaban' : 'Kirim pesan'}
            onPress={streaming ? stop : () => send()}
            disabled={!streaming && !input.trim()}
            style={({ pressed }) => [
              styles.sendButton,
              !streaming && !input.trim() && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            {streaming ? (
              <MaterialIcons name="stop" size={18} color={colors.primaryDark} />
            ) : (
              <MaterialIcons name="arrow-upward" size={19} color={colors.primaryDark} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.lg,
    overflow: 'hidden',
  },
  panelCompact: { marginTop: spacing.sm },
  hidden: { display: 'none' },
  recipeCard: {
    margin: spacing.md,
    marginBottom: spacing.sm,
    minHeight: 82,
    borderRadius: radius.xl,
    padding: spacing.md,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.surfaceDarkAlt,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  recipeInitials: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDarkAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeInitialsText: { ...typography.h3, color: colors.accent, fontSize: 16 },
  recipeCopy: { flex: 1, minWidth: 0 },
  recipeBadge: { ...typography.label, color: colors.accent, fontSize: 9 },
  recipeTitle: {
    ...typography.bodySm,
    color: colors.textOnPrimary,
    fontWeight: '800',
    marginTop: 2,
  },
  recipeMeta: { ...typography.caption, color: '#B8C5BB', marginTop: 2 },
  modeToggle: {
    marginHorizontal: spacing.md,
    padding: 4,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
  },
  modeButton: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modeButtonActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.accent },
  modeText: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  modeTextActive: { ...typography.caption, color: colors.primary, fontWeight: '800' },
  dateRow: { alignItems: 'center', paddingTop: spacing.md },
  dateText: {
    ...typography.label,
    fontSize: 9,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.h3, fontSize: 17, color: colors.text },
  subtitle: { ...typography.caption, color: colors.textMuted },
  speakToggle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakToggleOn: { backgroundColor: colors.accent },
  messages: { maxHeight: 280, minHeight: 130 },
  /** Keyboard terbuka: panel & daftar pesan mengisi ruang sisa, bukan tinggi tetap. */
  fill: { flex: 1 },
  messagesKeyboard: { flex: 1, minHeight: 96, maxHeight: 9999 },
  messagesContent: { padding: spacing.md },
  tip: {
    borderLeftWidth: 3,
    borderLeftColor: colors.accent,
    paddingLeft: spacing.md,
    paddingVertical: spacing.xs,
  },
  tipText: { ...typography.bodySm, color: colors.textMuted, marginTop: 3 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginBottom: spacing.sm },
  messageRowUser: { justifyContent: 'flex-end' },
  avatarSmall: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.lg,
  },
  bubbleAssistant: { backgroundColor: colors.surfaceAlt, borderBottomLeftRadius: 4 },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  bubbleText: { ...typography.bodySm, color: colors.text },
  bubbleTextUser: { color: colors.textOnPrimary },
  streamLabel: { ...typography.caption, color: colors.textMuted, marginLeft: 32 },
  suggestions: { gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  suggestion: {
    minHeight: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: { fontSize: 12, fontWeight: '700', color: colors.primary },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    padding: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.text,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: { opacity: 0.38 },
  pressed: { opacity: 0.7 },
});
