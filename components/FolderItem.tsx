/**
 * A folder row on the Documents screen.
 *
 * Deliberately taller and visually distinct from FileItem so folders read as
 * containers you go *into*, not as another document in the list.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import IconButton from './IconButton';

type Props = {
  name: string;
  count: number;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
};

export default function FolderItem({ name, count, onOpen, onRename, onDelete }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <TouchableOpacity onPress={onOpen} style={styles.pressArea}>
        <MaterialIcons name="folder" size={26} color={colors.warning} />
        <View style={styles.text}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.count, { color: colors.textMuted }]}>
            {count === 0 ? 'Empty' : count === 1 ? '1 document' : `${count} documents`}
          </Text>
        </View>
        <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />
      <IconButton
        icon="drive-file-rename-outline"
        iconSize={18}
        size={44}
        onPress={onRename}
        iconColor={colors.border}
        style={{ backgroundColor: 'transparent', borderRadius: 0 }}
      />
      <IconButton
        icon="delete-outline"
        iconSize={18}
        size={44}
        onPress={onDelete}
        iconColor={colors.border}
        style={{ backgroundColor: 'transparent', borderRadius: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
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
    gap: spacing.md,
  },
  text: { flex: 1, minWidth: 0 },
  name: { fontSize: fontSize.md, fontWeight: '600' },
  count: { fontSize: fontSize.sm, marginTop: 2 },
  divider: { width: 1, height: 36 },
});
