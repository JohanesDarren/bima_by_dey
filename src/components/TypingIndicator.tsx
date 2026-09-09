import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MotiView } from 'moti';
import { colors, radius } from '../theme';

const DOTS = [0, 1, 2];
const DELAY_STEP = 150;

/**
 * Typing indicator — 3 titik yang menari (bounce) bergantian.
 * Muncul saat AI sedang "meracik" jawaban sebelum token pertama tiba.
 */
export function TypingIndicator() {
  return (
    <View style={styles.bubble} testID="typing-indicator">
      {DOTS.map((i) => (
        <MotiView
          key={i}
          style={styles.dot}
          from={{ translateY: 0, opacity: 0.4 }}
          animate={{ translateY: [-4, 0, -4], opacity: 1 }}
          transition={{
            type: 'timing',
            duration: 500,
            loop: true,
            delay: i * DELAY_STEP,
            repeatReverse: true,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderTopLeftRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
});
