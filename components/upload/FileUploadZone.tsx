import { useTheme } from '@/theme/ThemeContext';
import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import IconButton from '@/components/IconButton';
import { SingleLineInput } from '@/components/Inputs';

/** Shape we hand back on drop — the same fields expo-document-picker returns,
 *  so callers can treat a dropped file and a picked file identically. */
export type DroppedFile = {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
};

interface FileUploadZoneProps {
  onPickFile: () => void;
  onClearFile: () => void;
  uploading?: boolean;
  fileName?: string;
  /** Called when a file is dragged onto the zone (web only). */
  onDropFile?: (file: DroppedFile) => void;
  /** Text under the icon, e.g. "(.pdf or .txt)". */
  hint?: string;
  label?: string;
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({
  onPickFile,
  onClearFile,
  uploading = false,
  fileName,
  onDropFile,
  hint = '(.pdf or .txt)',
  label = 'File Name',
}) => {
  const { colors } = useTheme();
  const [hovered, setHovered] = useState(false);
  const [draggingOver, setDraggingOver] = useState(false);
  const zoneRef = useRef<View>(null);

  const hasFile = Boolean(fileName);

  /**
   * Drag-and-drop, web only.
   *
   * React Native has no drag-and-drop concept, so this reaches for the real DOM
   * node behind the View and uses the browser's own events. The default browser
   * behaviour for a dropped file is to NAVIGATE to it, which would throw the
   * user out of the app — hence preventDefault on every one of these.
   *
   * The dropped File becomes a blob: URL, which is exactly what the upload path
   * already does with a picked file (it fetches the uri and reads the blob), so
   * nothing downstream needs to know the difference.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || !onDropFile || hasFile) return;
    const node = zoneRef.current as unknown as HTMLElement | null;
    if (!node || typeof node.addEventListener !== 'function') return;

    const over = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDraggingOver(true); };
    const leave = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); setDraggingOver(false); };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDraggingOver(false);
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      onDropFile({
        name: file.name,
        uri: URL.createObjectURL(file),
        mimeType: file.type,
        size: file.size,
      });
    };

    node.addEventListener('dragenter', over);
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragenter', over);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [onDropFile, hasFile]);

  const active = hovered || draggingOver;

  return (
    <View>
      {/* Dropzone */}
      {!hasFile && (
        <TouchableOpacity
          ref={zoneRef}
          style={[
            styles.dropZone,
            { borderColor: colors.inputBorder, backgroundColor: colors.inputBackground },
            active && { borderColor: colors.info, backgroundColor: colors.surface },
            draggingOver && styles.dropZoneActive,
          ]}
          onPress={onPickFile}
          activeOpacity={0.75}
          {...(Platform.OS === 'web'
            ? {
                onMouseEnter: () => setHovered(true),
                onMouseLeave: () => setHovered(false),
              }
            : {})}
        >
          <MaterialIcons
            name={draggingOver ? 'file-download' : 'file-upload'}
            size={28}
            color={draggingOver ? colors.info : colors.textMuted}
            style={styles.dropZoneIcon}
          />
          <Text style={[styles.dropZoneText, { color: draggingOver ? colors.info : colors.textSecondary }]}>
            {draggingOver
              ? 'Drop it here'
              : Platform.OS === 'web' && onDropFile
                ? 'Drag a file here, or click to browse'
                : 'Tap to choose a file'}
          </Text>
          <Text style={[styles.dropZoneText, { color: colors.textSecondary }]}>{hint}</Text>
        </TouchableOpacity>
      )}

      {/* File name + Clear button */}
      <View style={styles.metaRow}>
        <Text style={[styles.label, { color: colors.textPrimary }]}>
          {label} <Text style={{ color: colors.danger }}>*</Text>
        </Text>
        <View style={styles.inputRow}>
          <View style={styles.inputWrap}>
            <SingleLineInput
              placeholderText="Select a file..."
              value={fileName ?? ''}
              editable={false}
              style={{ marginBottom: 0 }}
            />
          </View>
          {hasFile && (
            <IconButton
              icon="close"
              iconSize={16}
              size={34}
              onPress={onClearFile}
              iconColor={colors.textMuted}
              style={{ backgroundColor: 'transparent' }}
            />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dropZone: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 10,
    paddingVertical: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  dropZoneActive: {
    borderStyle: 'solid',
  },
  dropZoneIcon: {
    marginBottom: 6,
  },
  dropZoneText: {
    fontSize: 14,
  },
  metaRow: {
    marginBottom: 12,
  },
  label: {
    marginBottom: 4,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputWrap: {
    flex: 3,
  },
});
