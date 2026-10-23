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
import { serverFailureText, streamKroomboxChat } from '../services/kroombox';
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  isTranscriptionConfigured,
  transcribeAudio,
  TranscriptionError,
  TRANSCRIPTION_MESSAGES,
} from '../services/speechToText';
import {
  cleanAssistantText,
  compactAssistantAnswer,
  COMPACT_RAG_STANDARD,
} from '../utils/assistantText';

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
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // Status berputar + maskot selama balasan disusun.
  const chatStatus = useLoadingNarration('chat', streaming);
  const scrollRef = useRef<ScrollView>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);
  const speechModuleRef = useRef<SpeechModule | null>(null);
  const speechListenersRef = useRef<EventSubscription[]>([]);
  /** Ditandai saat pengguna menekan berhenti, supaya percobaan ulang yang masih
   *  menunggu (setTimeout) tidak menghidupkan stream baru setelah dihentikan. */
  const stopRequestedRef = useRef(false);
  /** Perekam audio untuk pesan suara (9router STT). */
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [transcribing, setTranscribing] = useState(false);

  const cleanupVoiceMessage = useCallback(() => {
    speechListenersRef.current.forEach((listener) => listener.remove());
    speechListenersRef.current = [];
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
      let attempt = 0;
      stopRequestedRef.current = false;

      /**
       * Server kadang mengirim pesan kegagalannya sendiri sebagai "jawaban"
       * (mis. "Server AI gagal merespons: Error code: 503 …"), lalu [DONE].
       * Kegagalan itu SEMENTARA — terukur 2026-10-23: permintaan berturut-turut
       * sukses dalam 3–12 detik. Satu percobaan saja membuat gangguan sekejap
       * terasa seperti kerusakan permanen, jadi diulang maksimal 3 kali.
       */
      const startAttempt = () => {
        attempt += 1;
        assistantText = '';

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
              if (stopRequestedRef.current) return;
              streamRef.current = null;

              // Kegagalan dari server → ulangi selama jatah tersisa.
              const failure = serverFailureText(assistantText);
              if (failure && attempt < 3) {
                setTimeout(
                  () => {
                    if (!stopRequestedRef.current) startAttempt();
                  },
                  attempt === 1 ? 400 : 900,
                );
                return;
              }

              setStreaming(false);
              const clean = compactAssistantAnswer(assistantText, 5, 80);

              if (failure) {
                setMessages((current) => {
                  const next = [...current];
                  if (next[next.length - 1]?.role === 'assistant') next.pop();
                  return [
                    ...next,
                    { role: 'assistant', content: failure, reasoning_content: null },
                  ];
                });
                return;
              }

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
              stopRequestedRef.current = true;
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
      };

      startAttempt();
    },
    [autoSpeak, context, input, messages, onAssistantMessage, speak, streaming],
  );

  const stop = () => {
    stopRequestedRef.current = true;
    streamRef.current?.close();
    streamRef.current = null;
    setStreaming(false);
    setMessages((current) => {
      const last = current[current.length - 1];
      return last?.role === 'assistant' && !last.content ? current.slice(0, -1) : current;
    });
  };

  /**
   * Rekaman suara → teks lewat 9router, lalu masuk ke jalur chat yang sama.
   *
   * Dulu bagian ini memakai pengenal suara bawaan perangkat (expo-speech-recognition).
   * Sekarang audionya direkam (expo-audio) dan ditranskrip oleh 9router
   * (`groq/whisper-large-v3`), sesuai permintaan. Hasilnya tetap teks biasa yang
   * dikirim lewat `send()`, jadi aturan jawaban RAG tidak berubah sedikit pun.
   */
  const toggleVoiceMessage = useCallback(async () => {
    if (streaming || transcribing) return;

    if (recorder.isRecording) {
      setTranscribing(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new TranscriptionError(TRANSCRIPTION_MESSAGES.emptyAudio);
        const transcript = await transcribeAudio({ uri, language: 'id' });
        setInput(transcript);
        send(transcript);
      } catch (error) {
        setVoiceError(
          error instanceof TranscriptionError ? error.message : TRANSCRIPTION_MESSAGES.failed,
        );
      } finally {
        setTranscribing(false);
      }
      return;
    }

    if (!isTranscriptionConfigured()) {
      setVoiceError(TRANSCRIPTION_MESSAGES.missingConfig);
      return;
    }

    setVoiceError(null);
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setVoiceError('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error: unknown) {
      console.warn('[AICompanion] Voice message unavailable', error);
      setVoiceError(TRANSCRIPTION_MESSAGES.failed);
    }
  }, [recorder, send, streaming, transcribing]);

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
            placeholder={
              recorder.isRecording
                ? 'Sedang merekam… ketuk untuk berhenti'
                : transcribing
                  ? 'Mengubah suara menjadi teks…'
                  : placeholder || 'Tulis pertanyaan…'
            }
            placeholderTextColor={colors.textSubtle}
            onSubmitEditing={() => send()}
            editable={!recorder.isRecording && !transcribing}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recorder.isRecording ? 'Hentikan pesan suara' : 'Kirim pesan suara'}
            accessibilityState={{
              selected: recorder.isRecording,
              disabled: streaming || transcribing,
            }}
            onPress={toggleVoiceMessage}
            disabled={streaming}
            style={({ pressed }) => [
              styles.voiceButton,
              recorder.isRecording && styles.voiceButtonRecording,
              streaming && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name={recorder.isRecording ? 'stop' : transcribing ? 'hourglass-top' : 'mic'}
              size={20}
              color={recorder.isRecording ? colors.white : colors.primary}
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
