import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme';
import { formatTimer } from '../services/stepTimer';

interface Props {
  secondsLeft: number;
  running: boolean;
  durationMinutes: number | null;
  onToggle: () => void;
  onRestart: () => void;
}

/** Kotak hitung mundur satu langkah masak: sisa waktu + tombol jeda/lanjut/reset. */
export function StepTimerCard({
  secondsLeft,
  running,
  durationMinutes,
  onToggle,
  onRestart,
}: Props) {
  const done = secondsLeft === 0;

  return (
    <View style={styles.timerBox}>
      <View style={styles.statusRow}>
        <MaterialIcons
          name={running ? 'hourglass-bottom' : done ? 'check-circle' : 'pause-circle-outline'}
          size={16}
          color={done ? colors.success : colors.textMuted}
        />
        <Text style={styles.timerLabel}>
          {running ? 'Waktu berjalan…' : done ? 'Waktu selesai!' : 'Waktu dijeda'}
        </Text>
      </View>
      <Text style={[styles.timerValue, done && styles.timerDone]}>{formatTimer(secondsLeft)}</Text>
      <View style={styles.timerActions}>
        {done ? (
          <TouchableOpacity style={styles.resetBtn} onPress={onRestart}>
            <MaterialIcons name="refresh" size={14} color={colors.text} />
            <Text style={styles.resetBtnText}>Ulangi</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.resetBtn} onPress={onToggle}>
            <MaterialIcons name={running ? 'pause' : 'play-arrow'} size={14} color={colors.text} />
            <Text style={styles.resetBtnText}>{running ? 'Jeda' : 'Lanjut'}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.resetBtn} onPress={onRestart}>
          <MaterialIcons name="restore" size={14} color={colors.text} />
          <Text style={styles.resetBtnText}>Reset {durationMinutes}m</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  timerBox: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timerLabel: { color: colors.textMuted, fontSize: 13 },
  timerValue: { ...typography.h1, fontSize: 44, color: colors.primary, marginVertical: spacing.sm },
  timerDone: { color: colors.success },
  timerActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  resetBtn: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  resetBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
});
