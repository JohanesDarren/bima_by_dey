import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import { streamKroomboxChat } from '../services/kroombox';
import {
  cleanAssistantText,
  compactAssistantAnswer,
  COMPACT_RAG_STANDARD,
} from '../utils/assistantText';
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from 'expo-speech-recognition';

type SpeechModule = (typeof import('expo-speech-recognition'))['ExpoSpeechRecognitionModule'];
type EventSubscription = { remove: () => void };

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
const LOADING_STAGES = [
  'Menghubungkan ke pengetahuan sorgum…',
  'Mencari konteks yang relevan…',
  'Memeriksa kecocokan dengan resep…',
  'Merangkum jawaban terbaik…',
];

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
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [loadingStage, setLoadingStage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const speechModuleRef = useRef<SpeechModule | null>(null);
  const speechListenersRef = useRef<EventSubscription[]>([]);

  const cleanupVoiceMessage = useCallback(() => {
    speechListenersRef.current.forEach((listener) => listener.remove());
    speechListenersRef.current = [];
    setRecording(false);
  }, []);

  useEffect(() => {
    if (!streaming) {
      setLoadingStage(0);
      return;
    }
    const timer = setInterval(
      () => setLoadingStage((current) => Math.min(current + 1, LOADING_STAGES.length - 1)),
      2200,
    );
    return () => clearInterval(timer);
  }, [streaming]);

  useEffect(
    () => () => {
      streamRef.current?.close();
      Speech.stop();
      cleanupVoiceMessage();
      try {
        speechModuleRef.current?.abort();
      } catch {
        // Recognizer may already be stopped.
      }
    },
    [cleanupVoiceMessage],
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
      const history = messages
        .filter((message) => message.content.trim())
        .slice(-10)
        .map((message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.content,
        }));
      setMessages((current) => [
        ...current,
        { role: 'user', content: text, reasoning_content: null },
        { role: 'assistant', content: '', reasoning_content: null },
      ]);
      setStreaming(true);
      let assistantText = '';

      streamRef.current = streamKroomboxChat(
        {
          message: [
            context,
            `Pertanyaan pengguna: ${text}`,
            COMPACT_RAG_STANDARD,
            'Berikan jawaban inti pada kalimat pertama. Maksimal 5 kalimat atau 80 kata, ringkas, lengkap, dan relevan.',
            'Gunakan paragraf biasa. Jangan gunakan emoji, logo, emblem, ikon, markdown, heading, atau simbol dekoratif.',
            'Hindari pembuka, pengulangan pertanyaan, dan penutup basa-basi yang tidak perlu.',
          ].join('\n\n'),
          useRag: true,
          stream: true,
          maxTokens: 250,
          history,
        },
        {
          onToken: (delta) => {
            assistantText += delta;
            const clean = cleanAssistantText(assistantText);
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
            const clean = compactAssistantAnswer(assistantText, 5, 80);
            if (!clean) {
              setMessages((current) => {
                const next = [...current];
                if (next[next.length - 1]?.role === 'assistant') next.pop();
                return [
                  ...next,
                  {
                    role: 'assistant',
                    content: 'RAG belum memberikan jawaban. Coba lagi.',
                    reasoning_content: null,
                  },
                ];
              });
              return;
            }
            if (autoSpeak) speak(clean);
            onAssistantMessage?.(clean);
            setMessages((current) => {
              const last = current[current.length - 1];
              if (last?.role === 'assistant' && last.content) {
                return [...current.slice(0, -1), { ...last, content: clean }];
              }
              return current;
            });
          },
          onError: () => {
            setStreaming(false);
            streamRef.current = null;
            setMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              const partial = last?.role === 'assistant' ? cleanAssistantText(last.content) : '';
              if (last?.role === 'assistant') next.pop();
              return [
                ...next,
                {
                  role: 'assistant',
                  content: partial
                    ? `Jawaban terputus dan mungkin belum lengkap: ${partial}`
                    : 'Koneksi terputus. Coba kirim lagi.',
                  reasoning_content: null,
                },
              ];
            });
          },
        },
      );
    },
    [autoSpeak, context, input, messages, onAssistantMessage, speak, streaming],
  );

  const stop = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setStreaming(false);
    setMessages((current) => {
      const last = current[current.length - 1];
      return last?.role === 'assistant' && !last.content ? current.slice(0, -1) : current;
    });
  };

  const toggleVoiceMessage = useCallback(async () => {
    if (streaming) return;
    if (recording) {
      speechModuleRef.current?.stop();
      cleanupVoiceMessage();
      return;
    }

    setVoiceError(null);
    try {
      const imported = await import('expo-speech-recognition');
      const speechModule = imported.ExpoSpeechRecognitionModule;
      speechModuleRef.current = speechModule;
      const permission = await speechModule.requestPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Izin mikrofon diperlukan.');
        return;
      }

      cleanupVoiceMessage();
      const resultListener = speechModule.addListener(
        'result',
        (event: ExpoSpeechRecognitionResultEvent) => {
          const transcript = event.results[0]?.transcript?.trim() ?? '';
          if (transcript) setInput(transcript);
          if (event.isFinal && transcript) {
            cleanupVoiceMessage();
            try {
              speechModule.stop();
            } catch {
              // Final recognition may stop itself.
            }
            send(transcript);
          }
        },
      );
      const errorListener = speechModule.addListener(
        'error',
        (event: ExpoSpeechRecognitionErrorEvent) => {
          cleanupVoiceMessage();
          if (event.error !== 'aborted') {
            setVoiceError(
              event.error === 'no-speech' || event.error === 'speech-timeout'
                ? 'Suara belum terdengar. Coba lagi.'
                : 'Pesan suara gagal direkam.',
            );
          }
        },
      );
      const endListener = speechModule.addListener('end', cleanupVoiceMessage);
      speechListenersRef.current = [resultListener, errorListener, endListener];
      setRecording(true);
      speechModule.start({ lang: 'id-ID', interimResults: true, continuous: false });
    } catch (error: unknown) {
      console.warn('[AICompanion] Voice message unavailable', error);
      cleanupVoiceMessage();
      setVoiceError('Pesan suara tidak tersedia di perangkat ini.');
    }
  }, [cleanupVoiceMessage, recording, send, streaming]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.panel, compact && styles.panelCompact, elevation.sm]}>
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
            <Text style={styles.modeText}>Suara</Text>
          </Pressable>
          <View
            accessibilityRole="tab"
            accessibilityState={{ selected: true }}
            style={[styles.modeButton, styles.modeButtonActive]}
          >
            <Text style={styles.modeTextActive}>Chat</Text>
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
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
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
              {LOADING_STAGES[loadingStage]}
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
            placeholder={recording ? 'Sedang mendengarkan…' : placeholder || 'Tulis pertanyaan…'}
            placeholderTextColor={colors.textSubtle}
            onSubmitEditing={() => send()}
            editable={!recording}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Hentikan pesan suara' : 'Kirim pesan suara'}
            accessibilityState={{ selected: recording, disabled: streaming }}
            onPress={toggleVoiceMessage}
            disabled={streaming}
            style={({ pressed }) => [
              styles.voiceButton,
              recording && styles.voiceButtonRecording,
              streaming && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name={recording ? 'stop' : 'mic'}
              size={20}
              color={recording ? colors.white : colors.primary}
            />
          </Pressable>
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
        {voiceError ? (
          <Text style={styles.voiceError} accessibilityLiveRegion="polite">
            {voiceError}
          </Text>
        ) : null}
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
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryDark,
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
  modeButtonActive: { backgroundColor: colors.accent },
  modeText: { ...typography.caption, color: colors.textOnPrimary, fontWeight: '700' },
  modeTextActive: { ...typography.caption, color: colors.primaryDark, fontWeight: '800' },
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
  voiceButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButtonRecording: { backgroundColor: colors.danger, borderColor: colors.danger },
  voiceError: {
    ...typography.caption,
    color: colors.danger,
    backgroundColor: colors.surfaceAlt,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
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
