import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import IconButton from './IconButton';

type Props = {
  fileName: string;
  onOpen: () => void;
  onDelete: () => void;
  /** Optional "move to folder" action; the button only renders when provided. */
  onMove?: () => void;
  selected?: boolean;
  selectionMode?: boolean;
  onLongPress?: () => void;
};

export default function FileItem({ fileName, onOpen, onDelete, onMove, selected, selectionMode, onLongPress }: Props) {
  const { colors } = useTheme();

  const handlePress = () => {
    if (selectionMode) {
      onLongPress?.();
    } else {
      onOpen();
    }
  };

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? colors.info : colors.border,
        },
      ]}
    >
      <TouchableOpacity
        onPress={handlePress}
        onLongPress={!selectionMode ? onLongPress : undefined}
        delayLongPress={400}
        style={styles.pressArea}
      >
        {selectionMode ? (
          <View
            style={[
              styles.checkbox,
              {
                backgroundColor: selected ? colors.info : colors.surface,
                borderColor: selected ? colors.info : colors.inputBorder,
              },
            ]}
          >
            {selected && <MaterialIcons name="check" size={13} color={colors.textInverse} />}
          </View>
        ) : (
          <Text style={styles.emoji}>📄</Text>
        )}
        <Text style={[styles.fileName, { color: colors.textPrimary }]} numberOfLines={1}>
          {fileName}
        </Text>
        {!selectionMode && <MaterialIcons name="file-download" size={20} color={colors.info} />}
      </TouchableOpacity>

      {!selectionMode && (
        <>
          {onMove && (
            <>
              <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
              <IconButton
                icon="drive-file-move-outline"
                iconSize={18}
                size={46}
                onPress={onMove}
                iconColor={colors.border}
                style={{ backgroundColor: 'transparent', borderRadius: 0 }}
              />
            </>
          )}
          <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
          <IconButton
            icon="delete-outline"
            iconSize={18}
            size={46}
            onPress={onDelete}
            iconColor={colors.border}
            style={{ backgroundColor: 'transparent', borderRadius: 0 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    marginBottom: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  pressArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: spacing.sm + 2,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: fontSize.h3,
  },
  fileName: {
    fontSize: fontSize.md,
    flex: 1,
  },
  divider: {
    width: 1,
    height: 36,
  },
});
