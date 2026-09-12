import { extractTasks } from '@/services/extractionService';
import { uploadPropertyFile } from '@/services/fileService';
import * as DocumentPicker from 'expo-document-picker';
import { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import Button from '@/components/Button';
import InfoPopup from '@/components/InfoPopup';
import { SINGLE_PROPERTY_MODE } from '@/constants/app';
import { fetchProperties } from '@/services/propertyService';
import { FileUploadZone } from './FileUploadZone';
import { MultiLineInput } from '@/components/Inputs';
import { LoadingModal } from '@/components/LoadingModal';
import PropertyDropdown from './PropertiesDropdown';
import TaskConfirmationPopup from './TaskConfirmationPopup';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { TaskType } from '@/types';

type PickedFile = DocumentPicker.DocumentPickerAsset;

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  /** Called after tasks are successfully confirmed and saved */
  onSuccess?: () => void;
  initialPropertyId?: string;
};

export default function UploadExtractPopup({ visible, userId, onClose, onSuccess, initialPropertyId }: Props) {
  const { colors } = useTheme();
  const [fileName, setFileName] = useState<string | undefined>();
  const [fileId, setFileId] = useState<string | undefined>();
  const [selectedFile, setSelectedFile] = useState<PickedFile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [desc, setDesc] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<string | null>(initialPropertyId ?? null);
  const [extractedTasks, setExtractedTasks] = useState<TaskType[]>([]);
  const [showTaskPopup, setShowTaskPopup] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDisabled = uploading || extracting || !selectedFile || !selectedProperty;

  // Single-property MVP: there is exactly one home, so select it rather than
  // asking. Without this the upload button would stay disabled forever — it
  // requires a property, and the chooser is now hidden.
  useEffect(() => {
    if (!visible || !SINGLE_PROPERTY_MODE || !userId || selectedProperty) return;
    fetchProperties(userId)
      .then((props) => { if (props.length > 0) setSelectedProperty(props[0].id); })
      .catch((err) => console.error('Could not load the property:', err));
  }, [visible, userId, selectedProperty]);

  useEffect(() => {
    setExtracting(false);
    if (extractedTasks && extractedTasks.length > 0) {
      setShowTaskPopup(true);
    }
  }, [extractedTasks]);

  const pickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain'],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const file = result.assets[0];
    setFileName(file.name);
    setSelectedFile(file);
  };

  const handleClose = () => {
    onClose();
    setTimeout(() => {
      setFileName(undefined);
      setSelectedFile(null);
      setDesc('');
      setSelectedProperty(initialPropertyId ?? null);
    }, 250);
  };

  const handleExtract = async () => {
    if (!selectedFile || !selectedProperty) return;
    try {
      setUploading(true);
      const { id, filePath } = await uploadPropertyFile(
        userId,
        selectedProperty,
        selectedFile.uri,
        selectedFile.name,
      );
      setFileId(id);
      setUploading(false);

      setExtracting(true);
      const rawTasks = await extractTasks(
        desc !== '' ? desc : 'No additional description, just the file',
        filePath,
      );
      const tasks: TaskType[] = rawTasks.map((task) => {
        let dueDate: Date | null = null;
        if (task.dueDate) {
          const [year, month, day] = task.dueDate.split('-').map(Number);
          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            dueDate = new Date(year, month - 1, day);
          }
        }
        return { ...task, dueDate };
      });
      setExtractedTasks(tasks);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process file. Please try again.');
      setUploading(false);
      setExtracting(false);
    }
  };

  return (
    <>
    <InfoPopup
      visible={!!error}
      type="error"
      title="Error"
      message={error ?? ''}
      onClose={() => setError(null)}
    />
    <Modal transparent visible={visible} animationType="fade">
      <View style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={[styles.box, { backgroundColor: colors.surface }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Upload a new file
            </Text>

            <FileUploadZone
              onPickFile={pickFile}
              onClearFile={() => { setFileName(undefined); setSelectedFile(null); }}
              onDropFile={(f) => {
                setFileName(f.name);
                setSelectedFile(f as unknown as PickedFile);
              }}
              uploading={uploading}
              fileName={fileName}
            />

            {/* With one home per account there is nothing to choose — the
                property is selected automatically in the effect above. */}
            {!SINGLE_PROPERTY_MODE && (
              <PropertyDropdown
                userId={userId}
                selectedProperty={selectedProperty}
                onSelect={setSelectedProperty}
              />
            )}

            <Text style={[styles.descLabel, { color: colors.textPrimary }]}>
              Document description:
            </Text>
            <Text style={[styles.descHint, { color: colors.textMuted }]}>
              Include a basic description and/or specific tasks you want extracted. Leave blank to auto-extract from the document.
            </Text>

            <MultiLineInput
              placeholderText="e.g. House inspection report — focus on action items…"
              value={desc}
              onChangeText={setDesc}
            />

            <Button
              title="Upload & Extract Tasks"
              onPress={handleExtract}
              variant={isDisabled ? 'secondary' : 'success'}
              disabled={isDisabled}
              fullWidth
              style={{ marginBottom: spacing.sm + 2 }}
            />
            <Button title="Cancel" onPress={handleClose} variant="secondary" fullWidth />

            <LoadingModal
              visible={uploading || extracting}
              message={uploading ? 'Uploading file…' : 'Extracting tasks from file…'}
              onCancel={() => { setUploading(false); setExtracting(false); }}
            />
          </View>
        </ScrollView>

        <TaskConfirmationPopup
          visible={showTaskPopup}
          tasks={extractedTasks}
          userId={userId}
          propertyId={selectedProperty ?? undefined}
          fileId={fileId}
          onClose={(saved) => {
            setShowTaskPopup(false);
            setExtractedTasks([]);
            if (saved) {
              onSuccess?.();
              handleClose();
            }
          }}
        />
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scroll: {
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  box: {
    width: '90%',
    maxWidth: 500,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignSelf: 'center',
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: '600',
    marginBottom: spacing.md,
  },
  descLabel: {
    fontWeight: '600',
    marginTop: spacing.xs + 2,
    marginBottom: 2,
  },
  descHint: {
    fontSize: 12,
    marginBottom: spacing.xs + 2,
    lineHeight: 18,
  },
});
