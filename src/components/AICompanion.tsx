import React from 'react';
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
import { colors, radius, spacing, typography, elevation } from '../theme';
import { CHAT_LOADING_STAGES } from '../utils/assistantText';
import { useChatController } from '../hooks/useChatController';
import { useKeyboardVisible } from '../hooks/useKeyboardVisible';
import { useRotatingStage } from '../hooks/useRotatingStage';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { ChatMessageList } from './ChatMessageList';
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

/** "Bubur Sorgum Manis" → "BS". */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

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
  const keyboardUp = useKeyboardVisible();
  /** Tahapan menunggu jawaban (teks bergantian) — lihat CHAT_LOADING_STAGES. */
  const loadingLabel = useRotatingStage(streaming, CHAT_LOADING_STAGES);
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
            <Text style={styles.recipeInitialsText}>{initials(recipeName)}</Text>
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
              <ChefMark size={34} halo={false} accessibilityLabel="Chef Sorghum AI" />
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

        <ChatMessageList
          messages={messages}
          loadingLabel={streaming ? loadingLabel : null}
          style={[styles.messages, keyboardUp && styles.messagesKeyboard]}
        />

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
            onChangeText={chat.setInput}
            placeholder={placeholder || 'Tulis pertanyaan…'}
            placeholderTextColor={colors.textSubtle}
            onSubmitEditing={() => chat.send()}
            multiline
          />
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
          <Pressable
            accessibilityLabel={voice.recording ? 'Berhenti merekam dan kirim' : 'Rekam pertanyaan'}
            accessibilityState={{ busy: voice.transcribing, selected: voice.recording }}
            onPress={voice.toggle}
            disabled={streaming || voice.transcribing}
            style={({ pressed }) => [
              styles.micButton,
              voice.recording && styles.micButtonActive,
              (streaming || voice.transcribing) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <MaterialIcons
              name={voice.recording ? 'stop' : voice.transcribing ? 'hourglass-top' : 'mic'}
              size={19}
              color={voice.recording ? colors.surface : colors.primaryDark}
            />
          </Pressable>
        </View>
        {voice.error ? (
          <Text style={styles.micError} accessibilityLiveRegion="polite">
            {voice.error}
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
    // Dulu `overflow: 'hidden'`: panel memotong isinya sendiri. Karena panel ini
    // diletakkan di dalam ScrollView layar masak (tingginya tidak dibatasi), daftar
    // pesan yang panjang mendorong baris tulis keluar panel — teks yang diketik
    // jadi tidak terlihat. Isi panel sekarang bebas, dan sudutnya tetap rapi
    // karena tiap bagian sudah punya latar sendiri.
    overflow: 'visible',
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
  /**
   * Daftar pesan boleh menyusut (`flexShrink`) supaya baris tulis di bawahnya
   * TIDAK pernah terpotong. Sebelumnya hanya `maxHeight: 280` tanpa shrink:
   * ketika isi pesan panjang dan panel dibatasi `overflow: 'hidden'`, baris tulis
   * terdorong keluar panel sehingga teks yang diketik tidak terlihat.
   */
  messages: { maxHeight: 280, minHeight: 130, flexShrink: 1 },
  /** Keyboard terbuka: panel & daftar pesan mengisi ruang sisa, bukan tinggi tetap. */
  fill: { flex: 1 },
  messagesKeyboard: { flex: 1, minHeight: 96, maxHeight: 9999 },
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
    // Baris tulis tidak boleh ikut menyusut — kalau menyusut, teks yang sedang
    // diketik terpotong oleh `overflow: 'hidden'` pada panel.
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
    // Warna teks eksplisit dan kontras: pengguna harus melihat apa yang diketik.
    includeFontPadding: false,
    textAlignVertical: 'center',
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
  micButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  micButtonActive: { backgroundColor: colors.danger, borderColor: colors.danger },
  micError: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  pressed: { opacity: 0.7 },
});
