/**
 * Documents screen.
 *
 * Two levels only: the top level shows folders first, then any unfiled
 * documents; opening a folder shows just that folder's documents. Folders
 * don't nest — a homeowner has tens of documents, not thousands, and one level
 * keeps "where did I put it?" a question with a short answer.
 *
 * The property filter still applies inside a folder, so a folder like
 * "Receipts" can span several properties and still be narrowed to one.
 */
import Button from '@/components/Button';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import EmptyText from '@/components/EmptyText';
import FileItem from '@/components/FileItem';
import FilterChips from '@/components/FilterChips';
import FolderItem from '@/components/FolderItem';
import InfoPopup from '@/components/InfoPopup';
import MoveToFolderModal from '@/components/MoveToFolderModal';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import RenameModal from '@/components/RenameModal';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { supabase } from '@/services/supabase';
import { deleteFiles, downloadFile, fetchFilesForProperty } from '@/services/fileService';
import {
  createFolder, deleteFolder, fetchFolders, moveFileToFolder, renameFolder,
} from '@/services/folderService';
import { fetchProperties } from '@/services/propertyService';
import { useTheme } from '@/theme/ThemeContext';
import { fontSize, spacing } from '@/theme/tokens';
import { DocumentFolder, FileRecord, Property } from '@/types';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export default function DocumentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<DocumentFolder[]>([]);
  const [loading, setLoading] = useState(true);

  const [propertyFilter, setPropertyFilter] = useState<string | null>(null);
  /** null = top level; otherwise the folder we're looking inside */
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);

  const [uploadVisible, setUploadVisible] = useState(false);
  const [pendingDeleteFile, setPendingDeleteFile] = useState<FileRecord | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<DocumentFolder | null>(null);
  const [pendingDeleteFolder, setPendingDeleteFolder] = useState<DocumentFolder | null>(null);
  const [movingFile, setMovingFile] = useState<FileRecord | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/(auth)/login'); return; }
      setUserId(data.user.id);
      loadDocuments(data.user.id);
    });
  }, []);

  const loadDocuments = async (uid: string) => {
    setLoading(true);
    const props = await fetchProperties(uid);
    setProperties(props);
    const perProperty = await Promise.all(props.map((p) => fetchFilesForProperty(p.id)));
    setFiles(perProperty.flat());
    try {
      setFolders(await fetchFolders(uid));
    } catch (err) {
      console.error('Could not load folders:', err);
    }
    setLoading(false);
  };

  const handleDownload = (file: FileRecord) => {
    downloadFile(file.file_path, file.file_name).catch((err) => console.error('Download failed:', err));
  };

  const handleDeleteConfirm = async (cascade?: boolean) => {
    if (!pendingDeleteFile) return;
    setDeleteLoading(true);
    await deleteFiles([pendingDeleteFile], cascade ?? true);
    setFiles((prev) => prev.filter((f) => f.id !== pendingDeleteFile.id));
    setPendingDeleteFile(null);
    setDeleteLoading(false);
    setSuccessMessage('Document deleted');
  };

  // ── Folder actions ─────────────────────────────────────────────────────────

  const handleCreateFolder = async (name: string) => {
    if (!userId) return;
    try {
      const folder = await createFolder(userId, name);
      setFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
      setCreatingFolder(false);
      // Created from the move dialog? Put the document straight into it.
      if (movingFile) await applyMove(movingFile, folder.id);
      else setSuccessMessage(`Folder "${folder.name}" created`);
    } catch (err) {
      setCreatingFolder(false);
      setErrorMessage((err as Error).message);
    }
  };

  const handleRenameFolder = async (name: string) => {
    if (!renamingFolder) return;
    const folder = renamingFolder;
    setRenamingFolder(null);
    try {
      await renameFolder(folder.id, name);
      setFolders((prev) =>
        prev.map((f) => (f.id === folder.id ? { ...f, name: name.trim() } : f))
            .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setSuccessMessage('Folder renamed');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  const handleDeleteFolderConfirm = async () => {
    if (!pendingDeleteFolder) return;
    const folder = pendingDeleteFolder;
    setDeleteLoading(true);
    try {
      await deleteFolder(folder.id);
      setFolders((prev) => prev.filter((f) => f.id !== folder.id));
      // Its documents are not deleted — they return to the top level.
      setFiles((prev) => prev.map((f) => (f.folder_id === folder.id ? { ...f, folder_id: null } : f)));
      if (openFolderId === folder.id) setOpenFolderId(null);
      setSuccessMessage('Folder deleted — its documents were kept');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
    setPendingDeleteFolder(null);
    setDeleteLoading(false);
  };

  const applyMove = async (file: FileRecord, folderId: string | null) => {
    setMovingFile(null);
    try {
      await moveFileToFolder(file.id, folderId);
      setFiles((prev) => prev.map((f) => (f.id === file.id ? { ...f, folder_id: folderId } : f)));
      const name = folders.find((f) => f.id === folderId)?.name;
      setSuccessMessage(folderId ? `Moved to "${name ?? 'folder'}"` : 'Removed from folder');
    } catch (err) {
      setErrorMessage((err as Error).message);
    }
  };

  // ── What to show ───────────────────────────────────────────────────────────

  const byProperty = propertyFilter ? files.filter((f) => f.property_id === propertyFilter) : files;
  const openFolder = openFolderId ? folders.find((f) => f.id === openFolderId) ?? null : null;

  // Inside a folder: that folder's documents. At the top level: only unfiled
  // ones, because the filed ones are reachable through their folder.
  const visibleFiles = openFolderId
    ? byProperty.filter((f) => f.folder_id === openFolderId)
    : byProperty.filter((f) => !f.folder_id);

  const countFor = (folderId: string) => byProperty.filter((f) => f.folder_id === folderId).length;

  return (
    <PageContainer>
      <PageHeader
        title={openFolder ? openFolder.name : 'Documents'}
        subtitle={
          openFolder
            ? 'Documents filed in this folder.'
            : 'Store reports, receipts, warranties, and more.'
        }
        right={
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {!openFolder && (
              <Button
                title="New Folder"
                variant="outline"
                size="sm"
                leftIcon={<MaterialIcons name="create-new-folder" size={16} color={colors.primary} />}
                onPress={() => setCreatingFolder(true)}
              />
            )}
            <Button
              title="Upload"
              variant="primary"
              size="sm"
              leftIcon={<MaterialIcons name="upload" size={16} color={colors.textInverse} />}
              onPress={() => setUploadVisible(true)}
            />
          </View>
        }
      />

      {openFolder && (
        <Pressable
          onPress={() => setOpenFolderId(null)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.xs,
            paddingVertical: spacing.sm,
          }}
        >
          <MaterialIcons name="arrow-back" size={18} color={colors.info} />
          <Text style={{ color: colors.info, fontSize: fontSize.md, fontWeight: '600' }}>
            All documents
          </Text>
        </Pressable>
      )}

      {!loading && properties.length > 0 && (
        <FilterChips
          options={[
            { label: 'All', value: null },
            ...properties.map((p) => ({ label: p.name, value: p.id })),
          ]}
          selected={propertyFilter}
          onSelect={setPropertyFilter}
        />
      )}

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : (
        <>
          {!openFolder && folders.map((folder) => (
            <FolderItem
              key={folder.id}
              name={folder.name}
              count={countFor(folder.id)}
              onOpen={() => setOpenFolderId(folder.id)}
              onRename={() => setRenamingFolder(folder)}
              onDelete={() => setPendingDeleteFolder(folder)}
            />
          ))}

          {visibleFiles.length === 0 && (!openFolder ? folders.length === 0 : true) ? (
            <EmptyText>
              {openFolder
                ? 'This folder is empty. Use the move button on any document to file it here.'
                : 'No documents yet. Upload reports and files to keep everything organized.'}
            </EmptyText>
          ) : (
            visibleFiles.map((file) => (
              <FileItem
                key={file.id}
                fileName={file.file_name}
                onOpen={() => handleDownload(file)}
                onMove={() => setMovingFile(file)}
                onDelete={() => setPendingDeleteFile(file)}
              />
            ))
          )}
        </>
      )}

      <UploadExtractPopup
        visible={uploadVisible}
        userId={userId ?? ''}
        onClose={() => setUploadVisible(false)}
        onSuccess={() => { if (userId) loadDocuments(userId); }}
      />

      <RenameModal
        visible={creatingFolder}
        title="New Folder"
        initialValue=""
        onSave={handleCreateFolder}
        onClose={() => setCreatingFolder(false)}
      />

      <RenameModal
        visible={!!renamingFolder}
        title="Rename Folder"
        initialValue={renamingFolder?.name ?? ''}
        onSave={handleRenameFolder}
        onClose={() => setRenamingFolder(null)}
      />

      <MoveToFolderModal
        visible={!!movingFile}
        fileName={movingFile?.file_name ?? ''}
        folders={folders}
        currentFolderId={movingFile?.folder_id ?? null}
        onSelect={(folderId) => { if (movingFile) applyMove(movingFile, folderId); }}
        onClose={() => setMovingFile(null)}
        onCreateNew={() => setCreatingFolder(true)}
      />

      <ConfirmDeleteModal
        visible={!!pendingDeleteFile}
        title="Delete Document"
        message={`Are you sure you want to delete "${pendingDeleteFile?.file_name}"? This cannot be undone.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setPendingDeleteFile(null)}
        loading={deleteLoading}
        loadingLabel="Deleting document..."
        cascadeLabel="Also delete linked tasks"
      />

      <ConfirmDeleteModal
        visible={!!pendingDeleteFolder}
        title="Delete Folder"
        message={`Delete the folder "${pendingDeleteFolder?.name}"? The documents inside it are kept and moved back to All documents.`}
        onConfirm={handleDeleteFolderConfirm}
        onCancel={() => setPendingDeleteFolder(null)}
        loading={deleteLoading}
        loadingLabel="Deleting folder..."
      />

      <InfoPopup
        visible={!!successMessage}
        type="success"
        message={successMessage ?? ''}
        onClose={() => setSuccessMessage(null)}
        autoDismiss={2500}
        showConfirm={false}
      />

      <InfoPopup
        visible={!!errorMessage}
        type="error"
        message={errorMessage ?? ''}
        onClose={() => setErrorMessage(null)}
      />
    </PageContainer>
  );
}
