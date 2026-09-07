/**
 * Reusable delete confirmation dialog.
 *
 * Usage:
 *   <ConfirmDeleteModal
 *     visible={pendingIds.length > 0}
 *     title="Delete Property"
 *     message="Are you sure? This cannot be undone."
 *     onConfirm={handleDelete}
 *     onCancel={() => setPendingIds([])}
 *     loading={deleteLoading}
 *     cascadeLabel="Also delete linked tasks and files"
 *   />
 */

import Button from '@/components/Button';
import { fontSize, radius, spacing } from '@/theme/tokens';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';

type Props = {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: (cascade?: boolean) => void;
  onCancel: () => void;
  confirmLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  /** When provided, shows a checkbox the user can toggle before confirming */
  cascadeLabel?: string;
  /** Default state of the cascade checkbox (default: true) */
  cascadeDefault?: boolean;
};

export default function ConfirmDeleteModal({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  loading = false,
  loadingLabel = 'Deleting...',
  cascadeLabel,
  cascadeDefault = true,
}: Props) {
  const { colors } = useTheme();
  const [cascade, setCascade] = useState(cascadeDefault);

  // Freeze displayed content while the modal is closing (prevents "Delete 0" flash during fade-out)
  const [displayTitle, setDisplayTitle] = useState(title);
  const [displayMessage, setDisplayMessage] = useState(message);

  useEffect(() => {
    if (visible) {
      setDisplayTitle(title);
      setDisplayMessage(message);
      setCascade(cascadeDefault);
    }
  }, [visible, title, message, cascadeDefault]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={loading ? undefined : onCancel}>
      <View style={[StyleSheet.absoluteFill, styles.overlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.box, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>{displayTitle}</Text>
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.danger} />
              <Text style={[styles.loadingText, { color: colors.textMuted }]}>{loadingLabel}</Text>
            </View>
          ) : (
            <>
              <Text style={[styles.message, { color: colors.textMuted }]}>{displayMessage}</Text>
              {cascadeLabel && (
                <TouchableOpacity
                  onPress={() => setCascade((v) => !v)}
                  style={styles.checkRow}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.checkbox,
                    {
                      backgroundColor: cascade ? colors.danger : 'transparent',
                      borderColor: cascade ? colors.danger : colors.inputBorder,
                    },
                  ]}>
                    {cascade && <MaterialIcons name="check" size={13} color={colors.textInverse} />}
                  </View>
                  <Text style={[styles.checkLabel, { color: colors.textSecondary }]}>{cascadeLabel}</Text>
                </TouchableOpacity>
              )}
              <View style={styles.row}>
                <Button title={confirmLabel} onPress={() => onConfirm(cascade)} variant="danger" style={{ flex: 1 }} />
                <Button title="Cancel" onPress={onCancel} variant="secondary" style={{ flex: 1 }} />
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: 320,
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  title: {
    fontSize: fontSize.xl,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.md,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    marginBottom: spacing.lg + 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkLabel: {
    fontSize: fontSize.md,
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    paddingTop: spacing.xs,
  },
  loadingText: {
    fontSize: fontSize.md,
  },
});
