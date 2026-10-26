import React, { useRef } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { CHAT_LOADING_STAGES } from '../utils/assistantText';
import { useChatController } from '../hooks/useChatController';
import { useRotatingStage } from '../hooks/useRotatingStage';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChefLoader } from './ChefLoader';
import { ChefMark } from './ChefMark';

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

/**
 * Panel chat — MURNI tampilan. Percakapan, TTS, dan riwayat hidup di controller
 * (`services/chatController`, dipasang lewat `useChatController`); rekaman suara di
 * `useVoiceInput`; daftar balon di `ChatMessageList`. Komponen ini hanya merangkai
 * semuanya dan mengurus tata letak saat keyboard terbuka.
 */
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
  const [{ messages, input, streaming, autoSpeak, lastQuestion }, chat] = useChatController({
    context,
    simple,
    onAssistantMessage,
  });
  /**
   * Keyboard terbuka → panel chat yang mengisi seluruh ruang sisa layar.
   *
   * Kenapa begini, bukan sekadar "gulir ke bawah saat keyboard muncul": panel ini
   * berada di dalam guliran layar, dan jendela Android berubah ukuran SETELAH
   * perintah gulir berjalan — jadi posisinya meleset dan kolom tulis tetap
   * tertutup. Di sini tidak ada tebakan waktu: saat keyboard muncul, panel dipaksa
   * mengisi ruang sisa (flex), sehingga kolom tulis selalu tepat di atas keyboard.
   */
  /** Tahapan menunggu jawaban (teks bergantian) — lihat CHAT_LOADING_STAGES. */
  const loadingLabel = useRotatingStage(streaming, CHAT_LOADING_STAGES);
  /** Gulir otomatis ke pesan terbaru saat isi bertambah. */
  const listRef = useRef<ScrollView>(null);
  /**
   * Satu tombol: ketuk untuk mulai merekam, ketuk lagi untuk berhenti lalu kirim.
   * Transkrip masuk ke kotak pesan dan langsung dikirim lewat jalur chat yang sama,
   * sehingga aturan jawaban (RAG, panjang, anti-halusinasi) tetap satu.
   */
  const voice = useVoiceInput((text) => {
    chat.setInput(text);
    chat.send(text);
  });

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
              {streaming ? loadingLabel : recipeMeta || 'Siap menemani memasak'}
            </Text>
          </View>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: autoSpeak }}
            accessibilityLabel={
              autoSpeak ? 'Matikan pembacaan jawaban' : 'Aktifkan pembacaan jawaban'
            }
            onPress={chat.toggleAutoSpeak}
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
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          ref={listRef}
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
              <Text style={styles.streamLabel}>{loadingLabel}</Text>
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
                onPress={() => chat.send(suggestion)}
                disabled={streaming}
                style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
            {lastQuestion && !streaming ? (
              <Pressable
                onPress={() => chat.send(lastQuestion)}
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
            onChangeText={chat.setInput}
            placeholder={
              voice.recording
                ? 'Sedang merekam… ketuk untuk berhenti'
                : voice.transcribing
                  ? 'Mengubah suara menjadi teks…'
                  : placeholder || 'Tulis pertanyaan…'
            }
            placeholderTextColor={colors.textSubtle}
            onSubmitEditing={() => chat.send()}
            editable={!voice.recording && !voice.transcribing}
            multiline
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={voice.recording ? 'Hentikan pesan suara' : 'Kirim pesan suara'}
            accessibilityState={{
              selected: voice.recording,
              disabled: streaming || voice.transcribing,
            }}
            onPress={voice.toggle}
            disabled={streaming}
            style={({ pressed }) => [
              styles.voiceButton,
              voice.recording && styles.voiceButtonRecording,
              streaming && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name={voice.recording ? 'stop' : voice.transcribing ? 'hourglass-top' : 'mic'}
              size={20}
              color={voice.recording ? colors.white : colors.primary}
            />
          </Pressable>
          <Pressable
            accessibilityLabel={streaming ? 'Hentikan jawaban' : 'Kirim pesan'}
            onPress={streaming ? chat.stop : () => chat.send()}
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
        {voice.error ? (
          <Text style={styles.voiceError} accessibilityLiveRegion="polite">
            {voice.error}
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
    // Baris tulis tidak boleh menyusut — kalau menyusut, teks yang diketik
    // terpotong dan pengguna tidak melihat apa yang sedang ia tulis.
    flexShrink: 0,
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
    includeFontPadding: false,
    textAlignVertical: 'center',
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
