import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { ChatBubble } from '../components/ChatBubble';
import { ReasoningToggle } from '../components/ReasoningToggle';
import { TypingIndicator } from '../components/TypingIndicator';
import { useChat } from '../hooks/useChat';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { colors, radius, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import type { ChatMessage } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

/** Dapur Tanya — the core chat interface with SSE streaming (PRD F-03 / S-04). */
export function ChatScreen({ navigation }: Props) {
  const {
    messages,
    isStreaming,
    streamError,
    send,
    clearStreamError,
    createNewSession,
    abortStream,
  } = useChat();
  const [input, setInput] = useState('');
  const listRef = useRef<FlashListRef<ChatMessage>>(null);

  const patchProfile = useProfileStore((s) => s.updateProfile);
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const profile = useProfileStore((s) => s.profile);

  const [localReasoning, setLocalReasoning] = useState(profile?.ai_reasoning_enabled ?? true);

  const toggleReasoning = useCallback(
    (value: boolean) => {
      setLocalReasoning(value);
      patchProfile(user?.id ?? 'guest', {
        fullName: profile?.full_name ?? '',
        targetAgeGroup: profile?.target_age_group ?? null,
        specialCondition: profile?.special_condition ?? null,
        aiReasoningEnabled: value,
      });
    },
    [patchProfile, profile, user],
  );

  const onSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput('');
    send(text);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, [input, isStreaming, send]);

  // Typing indicator tampil saat streaming & pesan AI terakhir masih kosong
  // (belum ada token pertama yang tiba).
  const lastMsg = messages[messages.length - 1];
  const showTyping =
    isStreaming && (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.content === '');

  const scrollToEnd = useCallback(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header dengan efek blur (frosted glass) */}
      <BlurView intensity={40} tint="light" style={styles.header}>
        <View style={styles.headerInner}>
          <View style={styles.titleGroup}>
            <Text style={styles.headerTitle}>sorgumcore</Text>
            <Text style={styles.headerSubtitle}>Dapur Tanya · AI Racik Resep</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={createNewSession} style={styles.iconBtn}>
              <Text style={styles.iconBtnText}>＋</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Settings')}
              style={styles.iconBtn}
            >
              <Text style={styles.iconBtnText}>⚙️</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>

      <View style={styles.controls}>
        <ReasoningToggle enabled={localReasoning} onChange={toggleReasoning} />
      </View>

      {streamError ? (
        <TouchableOpacity style={styles.errorBanner} onPress={clearStreamError}>
          <Text style={styles.errorBannerText}>
            ⚠️ Koneksi terputus. Pesan sebagian tetap tersimpan. Ketuk untuk menutup.
          </Text>
        </TouchableOpacity>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(item, i) => `${item.role}-${item.created_at ?? 'x'}-${i}`}
          renderItem={({ item, index }) => (
            <ChatBubble
              message={item}
              animated={
                !(isStreaming && index === messages.length - 1 && item.role === 'assistant')
              }
            />
          )}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={scrollToEnd}
          ListFooterComponent={showTyping ? <TypingIndicator /> : null}
        />

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Tulis bahanmu di sini… (mis. ayam, selada, sorgum)"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={2000}
          />
          {isStreaming ? (
            <TouchableOpacity onPress={abortStream} style={styles.stopBtn}>
              <View style={styles.stopSquare} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
              onPress={onSend}
              disabled={!input.trim()}
            >
              <Text style={styles.sendBtnText}>➤</Text>
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
      {isGuest ? (
        <View style={styles.guestStrip}>
          <Text style={styles.guestStripText}>
            Mode tamu — data tersimpan di perangkat. Masuk untuk menyimpan riwayat.
          </Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    overflow: 'hidden',
  },
  headerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  titleGroup: { flexShrink: 1 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconBtn: {
    backgroundColor: colors.surfaceAlt,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  iconBtnText: { fontSize: 16, color: colors.text },
  controls: { paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  flex: { flex: 1 },
  listContent: { padding: spacing.lg, paddingBottom: spacing.xl },
  errorBanner: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  errorBannerText: { color: colors.surfaceDark, fontSize: 13, fontWeight: '600' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? 10 : spacing.sm,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: colors.textOnPrimary, fontSize: 20 },
  stopBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.textOnPrimary,
  },
  guestStrip: {
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
  },
  guestStripText: { color: colors.surfaceDark, fontSize: 12 },
});
