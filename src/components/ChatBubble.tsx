import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import { colors, radius, spacing } from '../theme';
import type { ChatMessage } from '../types';

interface Props {
  message: ChatMessage;
}

/** Streams the reasoning text token-by-token into a stable React element. */
export function ReasoningText({ text }: { text: string }) {
  return <Text>{text}</Text>;
}

/**
 * A single chat bubble. Renders markdown for both user + assistant content,
 * and conditionally shows the collapsible reasoning box ("Proses Meracik Resep").
 */
export function ChatBubble({ message }: Props) {
  const isUser = message.role === 'user';
  const hasReasoning = !!message.reasoning_content;
  const [expanded, setExpanded] = React.useState(false);

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      {hasReasoning ? (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpanded((v) => !v)}
          style={styles.reasonBox}
        >
          <View style={styles.reasonHeader}>
            <Text style={styles.reasonHeaderText}>💡 Proses Meracik Resep</Text>
            <Text style={styles.reasonChevron}>{expanded ? '▲' : '▼'}</Text>
          </View>
          {expanded ? (
            <View style={styles.reasonBody}>
              <Text style={styles.reasonText}>{message.reasoning_content}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      ) : null}

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {isUser ? (
          <Text style={styles.userText}>{message.content}</Text>
        ) : (
          <Markdown style={markdownStyles}>{message.content}</Markdown>
        )}
      </View>
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
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  userText: { color: colors.textOnPrimary, fontSize: 16, lineHeight: 22 },
  reasonBox: {
    backgroundColor: colors.reasoningBg,
    borderWidth: 1,
    borderColor: colors.reasoningBorder,
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
  reasonChevron: { color: colors.reasoningText },
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
