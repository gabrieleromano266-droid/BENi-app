/**
 * "Put this document in a folder" picker.
 *
 * Always offers "No folder" as the first option so a document can be taken back
 * out again — a one-way move would be a trap.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { DocumentFolder } from '@/types';
import Button from './Button';

type Props = {
  visible: boolean;
  fileName: string;
  folders: DocumentFolder[];
  currentFolderId: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
  onCreateNew: () => void;
};

export default function MoveToFolderModal({
  visible, fileName, folders, currentFolderId, onSelect, onClose, onCreateNew,
}: Props) {
  const { colors } = useTheme();

  const row = (id: string | null, label: string, icon: 'folder' | 'insert-drive-file') => {
    const selected = currentFolderId === id;
    return (
      <Pressable
        key={id ?? 'none'}
        onPress={() => onSelect(id)}
        style={({ pressed }) => [
          styles.row,
          {
            borderBottomColor: colors.borderLight,
            backgroundColor: pressed ? colors.borderLight : 'transparent',
          },
        ]}
      >
        <MaterialIcons name={icon} size={20} color={selected ? colors.primary : colors.textMuted} />
        <Text style={[styles.rowText, { color: selected ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
          {label}
        </Text>
        {selected && <MaterialIcons name="check" size={18} color={colors.primary} />}
      </Pressable>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.panel, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Move to folder</Text>
          <Text style={[styles.subtitle, { color: colors.textMuted }]} numberOfLines={1}>{fileName}</Text>

          <ScrollView style={styles.list}>
            {row(null, 'No folder', 'insert-drive-file')}
            {folders.map((f) => row(f.id, f.name, 'folder'))}
          </ScrollView>

          <View style={styles.actions}>
            <Button title="New folder" variant="outline" size="sm" onPress={onCreateNew} />
            <Button title="Cancel" variant="secondary" size="sm" onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  panel: { width: 360, maxWidth: '100%', maxHeight: 460, borderRadius: radius.xl, padding: spacing.lg },
  title: { fontFamily: fonts.heading, fontSize: fontSize.xl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSize.sm, marginTop: 2, marginBottom: spacing.sm },
  list: { marginVertical: spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderBottomWidth: 1,
  },
  rowText: { flex: 1, fontSize: fontSize.md },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
});
