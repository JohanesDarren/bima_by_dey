import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChatBubble } from '../components/ChatBubble';
import { ReasoningToggle } from '../components/ReasoningToggle';
import { useChat } from '../hooks/useChat';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';
import { colors, radius, spacing } from '../theme';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Main'>;

/** Dapur Tanya — the core chat interface with SSE streaming (PRD F-03 / S-04). */
export function ChatScreen({ navigation }: Props) {
  const { messages, isStreaming, streamError, send, clearStreamError, createNewSession } =
    useChat();
  const [input, setInput] = useState('');
  const listRef = useRef<FlatList<unknown>>(null);

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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Dapur Tanya</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={createNewSession} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Settings')} style={styles.iconBtn}>
            <Text style={styles.iconBtnText}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

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
        <FlatList
          ref={listRef as never}
          data={messages}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <ChatBubble message={item} />}
          contentContainerStyle={styles.listContent}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
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
            editable={!isStreaming}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (isStreaming || !input.trim()) && styles.sendBtnDisabled]}
            onPress={onSend}
            disabled={isStreaming || !input.trim()}
          >
            {isStreaming ? (
              <ActivityIndicator color={colors.textOnPrimary} size="small" />
            ) : (
              <Text style={styles.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  addBtn: {
    backgroundColor: colors.primary,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: { color: colors.textOnPrimary, fontSize: 22, lineHeight: 26 },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
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
  iconBtnText: { fontSize: 16 },
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
  guestStrip: {
    paddingVertical: spacing.xs,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
  },
  guestStripText: { color: colors.surfaceDark, fontSize: 12 },
});
