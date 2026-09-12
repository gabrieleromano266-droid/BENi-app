/**
 * Plain document upload — filing, not extraction.
 *
 * Deliberately separate from UploadExtractPopup. That one is for inspection
 * reports: it costs money, takes half a minute, and ends in a list of tasks to
 * confirm. This one is for the receipt for the furnace clean, a warranty PDF, a
 * photo of the water heater's label. Running those through the AI would be slow,
 * pointless and billable, and a receipt has no "maintenance tasks" to find.
 *
 * So the only question it asks is the one that actually matters for a receipt:
 * which folder does this go in?
 */
import Button from '@/components/Button';
import Dropdown from '@/components/Dropdown';
import InfoPopup from '@/components/InfoPopup';
import { LoadingModal } from '@/components/LoadingModal';
import { FileUploadZone, DroppedFile } from './FileUploadZone';
import { uploadPropertyFile } from '@/services/fileService';
import { createFolder } from '@/services/folderService';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { DocumentFolder } from '@/types';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import RenameModal from '@/components/RenameModal';

/** Everything a homeowner might reasonably keep: paperwork and photos. */
const ACCEPTED = [
  'application/pdf',
  'image/*',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

type Props = {
  visible: boolean;
  userId: string;
  propertyId: string | null;
  folders: DocumentFolder[];
  /** Pre-select the folder the user is currently looking inside. */
  initialFolderId?: string | null;
  onClose: () => void;
  onUploaded: () => void;
  onFolderCreated: (folder: DocumentFolder) => void;
};

export default function UploadDocumentPopup({
  visible, userId, propertyId, folders, initialFolderId, onClose, onUploaded, onFolderCreated,
}: Props) {
  const { colors } = useTheme();
  const [file, setFile] = useState<DroppedFile | null>(null);
  const [folderId, setFolderId] = useState<string | null>(initialFolderId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);

  useEffect(() => {
    if (visible) {
      setFile(null);
      setFolderId(initialFolderId ?? null);
      setError(null);
    }
  }, [visible, initialFolderId]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ACCEPTED,
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const picked = result.assets[0];
    setFile({ name: picked.name, uri: picked.uri, mimeType: picked.mimeType, size: picked.size });
  };

  const handleCreateFolder = async (name: string) => {
    setCreatingFolder(false);
    try {
      const folder = await createFolder(userId, name);
      onFolderCreated(folder);
      setFolderId(folder.id);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleUpload = async () => {
    if (!file || !propertyId) return;
    setBusy(true);
    try {
      await uploadPropertyFile(userId, propertyId, file.uri, file.name, folderId);
      setBusy(false);
      onUploaded();
      onClose();
    } catch (err) {
      setBusy(false);
      setError((err as Error).message ?? 'Upload failed');
    }
  };

  const folderOptions = [
    { label: 'No folder', value: '' },
    ...folders.map((f) => ({ label: f.name, value: f.id })),
  ];

  return (
    <>
      <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
        <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.panel, { backgroundColor: colors.surface }]}>
            <ScrollView>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Add a document</Text>
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                Receipts, warranties, manuals, photos — anything worth keeping.
                Inspection reports go through Upload Report instead, so their tasks get extracted.
              </Text>

              <FileUploadZone
                fileName={file?.name}
                onPickFile={pickFile}
                onClearFile={() => setFile(null)}
                onDropFile={setFile}
                hint="PDF, image, or document"
                label="Document"
              />

              <Text style={[styles.label, { color: colors.textPrimary }]}>Folder</Text>
              <Dropdown
                options={folderOptions}
                selected={folderId ?? ''}
                onSelect={(v) => setFolderId(v ? String(v) : null)}
                placeholder="No folder"
                size="md"
              />
              <Button
                title="New folder"
                variant="outline"
                size="sm"
                onPress={() => setCreatingFolder(true)}
                style={{ alignSelf: 'flex-start', marginTop: spacing.sm }}
              />

              <View style={styles.actions}>
                <Button
                  title="Add Document"
                  variant="primary"
                  onPress={handleUpload}
                  disabled={!file || !propertyId || busy}
                  fullWidth
                />
                <Button title="Cancel" variant="secondary" onPress={onClose} fullWidth />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <RenameModal
        visible={creatingFolder}
        title="New Folder"
        initialValue=""
        onSave={handleCreateFolder}
        onClose={() => setCreatingFolder(false)}
      />

      <LoadingModal visible={busy} message="Uploading document..." />

      <InfoPopup
        visible={!!error}
        type="error"
        message={error ?? ''}
        onClose={() => setError(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  panel: {
    width: 460,
    maxWidth: '100%',
    maxHeight: '88%',
    borderRadius: radius.xl,
    padding: spacing.xl,
  },
  title: { fontFamily: fonts.heading, fontSize: fontSize.xxl, fontWeight: 'bold' },
  subtitle: { fontSize: fontSize.sm, marginTop: 4, marginBottom: spacing.lg, lineHeight: 19 },
  label: { fontWeight: '600', marginBottom: 4 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
