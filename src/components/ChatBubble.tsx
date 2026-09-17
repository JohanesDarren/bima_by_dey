import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, elevation } from '../theme';
import type { ChatMessage } from '../types';

// Safe lazy wrapper: if moti/Reanimated fails to load (e.g. device incompatibility),
// fall back to a plain View so the app never crashes on import.
type MotionProps = {
  children: React.ReactNode;
  from?: object;
  animate?: object;
  transition?: object;
};
let MotiViewSafe: React.ComponentType<MotionProps>;
try {
  MotiViewSafe = require('moti').MotiView;
} catch {
  MotiViewSafe = ({ children }: { children: React.ReactNode }) => <View>{children}</View>;
}

interface Props {
  message: ChatMessage;
  /** Aktifkan animasi masuk (slide + fade) — matikan untuk pesan yang sedang
   *  di-streaming token-by-token agar tidak memicu animasi berulang. */
  animated?: boolean;
}

/**
 * A single chat bubble. Renders markdown for both user + assistant content,
 * and conditionally shows the collapsible reasoning box ("Proses Meracik Resep").
 */
export function ChatBubble({ message, animated = true }: Props) {
  const isUser = message.role === 'user';
  const hasReasoning = !!message.reasoning_content;
  const [expanded, setExpanded] = React.useState(false);

  const bubble = (
    <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
      {isUser ? (
        <Text style={styles.userText}>{message.content}</Text>
      ) : (
        <Markdown style={markdownStyles}>{message.content}</Markdown>
      )}
    </View>
  );

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {hasReasoning ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpanded((v) => !v)}
          style={[styles.reasonBox, elevation.sm]}
        >
          <View style={styles.reasonHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialIcons name="lightbulb-outline" size={16} color={colors.reasoningText} />
              <Text style={styles.reasonHeaderText}>Proses Meracik Resep</Text>
            </View>
            <MaterialIcons
              name={expanded ? 'keyboard-arrow-up' : 'keyboard-arrow-down'}
              size={18}
              color={colors.reasoningText}
            />
          </View>
          {expanded ? (
            <View style={styles.reasonBody}>
              <Text style={styles.reasonText}>{message.reasoning_content}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      {animated ? (
        <MotiViewSafe
          from={{ opacity: 0, translateY: 12, scale: 0.97 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={{ type: 'timing', duration: 220 }}
        >
          {bubble}
        </MotiViewSafe>
      ) : (
        bubble
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  rowUser: { alignItems: 'flex-end' },
  rowAssistant: { alignItems: 'flex-start' },
  bubble: {
    maxWidth: '82%',
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderTopRightRadius: radius.sm,
    ...elevation.sm,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sm,
    borderWidth: 0,
    ...elevation.md,
  },
  userText: { color: colors.textOnPrimary, fontSize: 16, lineHeight: 22 },
  reasonBox: {
    backgroundColor: colors.reasoningBg,
    borderWidth: 0,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    width: '82%',
  },
  reasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reasonHeaderText: {
    color: colors.reasoningText,
    fontWeight: '700',
    fontSize: 13,
  },
  reasonBody: { marginTop: spacing.sm },
  reasonText: { color: colors.reasoningText, fontSize: 13, lineHeight: 19 },
});

const markdownStyles = {
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  strong: { fontWeight: '700' as const },
  heading1: { fontSize: 20, fontWeight: '700' as const, color: colors.text, marginBottom: 6 },
  heading2: { fontSize: 18, fontWeight: '700' as const, color: colors.text, marginBottom: 6 },
  heading3: { fontSize: 16, fontWeight: '700' as const, color: colors.text, marginBottom: 4 },
  bullet_list_icon: { color: colors.primary },
  ordered_list_icon: { color: colors.primary },
  code_inline: { backgroundColor: colors.surfaceAlt, color: colors.primaryDark },
  fence: { backgroundColor: colors.surfaceDark, color: colors.textInverse },
};
