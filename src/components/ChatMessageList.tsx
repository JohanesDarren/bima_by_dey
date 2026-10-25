import React, { memo, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import type { ChatMessage } from '../types';

interface Props {
  messages: ChatMessage[];
  /** Teks tahapan menunggu; `null` saat tidak sedang menunggu jawaban. */
  loadingLabel: string | null;
  style?: StyleProp<ViewStyle>;
}

/**
 * Daftar balon chat yang selalu bergulir ke pesan terbaru.
 *
 * Tiap balon di-memo: selama jawaban mengalir, controller hanya mengganti objek
 * pesan TERAKHIR (pesan lain tetap objek yang sama), jadi hanya balon itu yang
 * dirender ulang per token — bukan seluruh percakapan.
 */
export function ChatMessageList({ messages, loadingLabel, style }: Props) {
  const scrollRef = useRef<ScrollView>(null);
  useKeyboardVisible(() => scrollRef.current?.scrollToEnd({ animated: true }));

  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={styles.content}
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
          // Daftar hanya bertambah di ujung, jadi indeks adalah kunci yang stabil.
          <MessageBubble key={`${message.role}-${index}`} message={message} />
        ))
      )}
      {loadingLabel !== null ? (
        <Text style={styles.streamLabel} accessibilityLiveRegion="polite">
          {loadingLabel}
        </Text>
      ) : null}
    </ScrollView>
  );
}

const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.messageRow, isUser && styles.messageRowUser]}>
      {message.role === 'assistant' ? (
        <View style={styles.avatarSmall}>
          <MaterialIcons name="grain" size={13} color={colors.primary} />
        </View>
      ) : null}
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        <Text style={[styles.bubbleText, isUser && styles.bubbleTextUser]}>
          {message.content || '…'}
        </Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  content: { padding: spacing.md },
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
});
