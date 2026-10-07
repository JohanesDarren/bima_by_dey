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
import { ChefLoader } from './ChefLoader';
import { ChefMark } from './ChefMark';
import { useLoadingNarration } from '../hooks/useLoadingNarration';
import { colors, radius, spacing, typography } from '../theme';
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
  recipeMeta?: string;
  placeholder?: string;
  onAssistantMessage?: (text: string) => void;
}

const SUGGESTIONS = ['Pengganti bahan?', 'Ubah jumlah porsi?', 'Jelaskan langkah ini'];

/**
 * Chat pendamping resep bergaya messenger: kepala obrolan tipis, daftar balon
 * pesan yang mengisi sisa tinggi layar, saran singkat, lalu kolom tulis di
 * bawah. Pengalih mode (chat/suara) tidak lagi di sini — ia milik halaman masak,
 * supaya widget langkah dan tombol mode tetap terlihat di kedua mode.
 */
export function AICompanion({ context, recipeMeta, placeholder, onAssistantMessage }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [lastQuestion, setLastQuestion] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Status berputar + maskot selama balasan disusun.
  const chatStatus = useLoadingNarration('chat', streaming);
  const scrollRef = useRef<ScrollView>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const speechModuleRef = useRef<SpeechModule | null>(null);
  const speechListenersRef = useRef<EventSubscription[]>([]);

  const cleanupVoiceMessage = useCallback(() => {
    speechListenersRef.current.forEach((listener) => listener.remove());
    speechListenersRef.current = [];
    setRecording(false);
  }, []);

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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.flex}>
        {/* Kepala obrolan bergaya messenger. */}
        <View style={styles.chatHeader}>
          <View style={styles.avatar}>
            <ChefMark size={36} halo={false} accessibilityLabel="Chef Sorghum AI" />
          </View>
          <View style={styles.identity}>
            <Text style={styles.title}>Chef Sorghum AI</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {streaming ? chatStatus : recipeMeta || 'Siap menemani memasak'}
            </Text>
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

        {/* Balon pesan mengisi sisa tinggi layar. */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          <View style={styles.messageRow}>
            <View style={styles.avatarSmall}>
              <MaterialIcons name="grain" size={13} color={colors.primary} />
            </View>
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <Text style={styles.bubbleText}>
                Halo! Saya dampingi dari sini. Tanyakan takaran, pengganti bahan, atau langkah yang
                belum jelas pada resep ini.
              </Text>
            </View>
          </View>

          {messages.map((message, index) => (
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
                <Text style={[styles.bubbleText, message.role === 'user' && styles.bubbleTextUser]}>
                  {message.content || '…'}
                </Text>
              </View>
            </View>
          ))}

          {streaming ? (
            <View style={styles.streamingRow} accessibilityLiveRegion="polite">
              <ChefLoader size={56} accessibilityLabel="Chef AI sedang menyusun jawaban" />
              <Text style={styles.streamLabel}>{chatStatus}</Text>
            </View>
          ) : null}
        </ScrollView>

        {/* Saran singkat + ulangi pertanyaan terakhir. */}
        <View style={styles.suggestionsWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestionsContent}
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
                <MaterialIcons name="refresh" size={13} color={colors.primary} />
                <Text style={styles.suggestionText}>Ulangi</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        {/* Kolom tulis. */}
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
  flex: { flex: 1 },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  identity: { flex: 1, minWidth: 0 },
  title: { ...typography.bodySm, color: colors.text, fontWeight: '800' },
  subtitle: { ...typography.caption, color: colors.textMuted },
  speakToggle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakToggleOn: { backgroundColor: colors.accent },
  messages: { flex: 1 },
  messagesContent: { padding: spacing.md, paddingBottom: spacing.lg },
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
  streamingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingVertical: spacing.xs,
  },
  streamLabel: { ...typography.caption, color: colors.textMuted, flex: 1 },
  suggestionsWrap: {
    height: 38,
    marginVertical: 4,
    justifyContent: 'center',
  },
  suggestionsContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: 8,
  },
  /** Saran dibuat ringkas supaya tidak memakan ruang layar HP. */
  suggestion: {
    height: 30,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
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
