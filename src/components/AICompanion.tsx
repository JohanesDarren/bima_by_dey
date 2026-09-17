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

interface Props {
  context: string;
  placeholder?: string;
  compact?: boolean;
  onAssistantMessage?: (text: string) => void;
}

const SUGGESTIONS = ['Pengganti bahan?', 'Ubah jumlah porsi?', 'Jelaskan langkah ini'];

export function AICompanion({ context, placeholder, compact, onAssistantMessage }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [lastQuestion, setLastQuestion] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const streamRef = useRef<{ close: () => void } | null>(null);

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

      streamRef.current = streamKroomboxChat(
        { message: `${context}\n\nPertanyaan user: ${text}`, useRag: true, stream: true },
        {
          onToken: (delta) =>
            setMessages((current) => {
              const next = [...current];
              const last = next[next.length - 1];
              if (last?.role === 'assistant')
                next[next.length - 1] = { ...last, content: last.content + delta };
              return next;
            }),
          onDone: () => {
            setStreaming(false);
            streamRef.current = null;
            setMessages((current) => {
              const last = current[current.length - 1];
              if (last?.role === 'assistant' && last.content) {
                if (autoSpeak) speak(last.content);
                onAssistantMessage?.(last.content);
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
    [autoSpeak, context, input, onAssistantMessage, speak, streaming],
  );

  const stop = () => {
    streamRef.current?.close();
    streamRef.current = null;
    setStreaming(false);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.panel, compact && styles.panelCompact, elevation.sm]}>
        <View style={styles.header}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <MaterialIcons name="grain" size={18} color={colors.primaryDark} />
            </View>
            <View>
              <Text style={styles.eyebrow}>PENDAMPING RESEP</Text>
              <Text style={styles.title}>Chef sorgumcore</Text>
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
              <Text style={styles.tipLabel}>TIP</Text>
              <Text style={styles.tipText}>
                Tanyakan pengganti bahan, jumlah porsi, atau bagian resep yang belum jelas.
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
              Sedang menyiapkan jawaban…
            </Text>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
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
  header: {
    minHeight: 68,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  eyebrow: { ...typography.label, fontSize: 9, color: colors.accentDark },
  title: { ...typography.h3, fontSize: 17, color: colors.text },
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
  tipLabel: { ...typography.label, fontSize: 9, color: colors.accentDark },
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
