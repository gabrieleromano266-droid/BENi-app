import AddTaskModal from '@/components/AddTaskModal';
import CompleteTaskModal, { CompleteResult } from '@/components/CompleteTaskModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import InfoPopup from '@/components/InfoPopup';
import FileItem from '@/components/FileItem';
import FilterChips from '@/components/FilterChips';
import IconButton from '@/components/IconButton';
import ManageFeaturesModal from '@/components/ManageFeaturesModal';
import PageHeader from '@/components/PageHeader';
import SegmentedControl from '@/components/SegmentedControl';
import SelectionActions from '@/components/SelectionActions';
import TaskItem from '@/components/TaskItem';
import UploadExtractPopup from '@/components/upload/UploadExtractPopup';
import { PAGE_MAX_WIDTH, SCREEN_PADDING } from '@/theme/layout';
import { useSelectionMode } from '@/hooks/useSelectionMode';
import { supabase } from '@/services/supabase';
import { deleteFiles, downloadFile, fetchFilesForProperty } from '@/services/fileService';
import { fetchStandardFeatures, fetchPropertyFeatureIds } from '@/services/featureService';
import { completeTask, createTask, deleteTasks, fetchTasksForProperty, TaskInput, updateTask } from '@/services/taskService';
import { useTheme } from '@/theme/ThemeContext';
import { DBTask, FileRecord, StandardFeature, TaskType } from '@/types';
import { dbTaskToTaskType, sortByDueDate, toDateString } from '@/utils/taskUtils';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { fontSize, radius, spacing } from '@/theme/tokens';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

type Section = 'tasks' | 'files';

export default function PropertyDetailScreen() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [propertyName, setPropertyName] = useState('');
  const [tasks, setTasks] = useState<DBTask[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [allPropertyFiles, setAllPropertyFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<Section>('tasks');
  const [uploadVisible, setUploadVisible] = useState(false);
  const [addTaskVisible, setAddTaskVisible] = useState(false);

  const [taskFileFilter, setTaskFileFilter] = useState<string | null>(null);
  const [pendingDeleteTaskIds, setPendingDeleteTaskIds] = useState<string[]>([]);
  const [pendingDeleteFileIds, setPendingDeleteFileIds] = useState<string[]>([]);
  const [completingTask, setCompletingTask] = useState<DBTask | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [allFeatures, setAllFeatures] = useState<StandardFeature[]>([]);
  const [enabledFeatureIds, setEnabledFeatureIds] = useState<Set<number>>(new Set());
  const [featuresModalVisible, setFeaturesModalVisible] = useState(false);

  const taskSel = useSelectionMode();
  const fileSel = useSelectionMode();

  useEffect(() => {
    taskSel.cancel();
    fileSel.cancel();
    setTaskFileFilter(null);
  }, [section]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setUserId(data.user.id);
    });
    if (id) loadData();
  }, [id]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: property } = await supabase
        .from('properties')
        .select('name')
        .eq('id', id)
        .single();
      if (property) setPropertyName(property.name);

      const allFiles = await fetchFilesForProperty(id);
      setAllPropertyFiles(allFiles);
      setFiles(allFiles);

      setTasks(await fetchTasksForProperty(id));

      const [features, featureIds] = await Promise.all([
        fetchStandardFeatures(),
        fetchPropertyFeatureIds(id),
      ]);
      setAllFeatures(features);
      setEnabledFeatureIds(new Set(featureIds));
    } catch (err) {
      console.error('Failed to load property data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Task actions ──────────────────────────────────────────────────────────

  const handleAddTask = async (input: TaskInput) => {
    if (!userId) return;
    const newTask = await createTask(userId, { ...input, propertyId: id });
    setTasks((prev) => sortByDueDate([...prev, newTask]));
    setAddTaskVisible(false);
  };

  const handleUpdateTask = async (taskId: string, updated: TaskType) => {
    await updateTask(taskId, { ...updated, propertyId: id });
    setTasks((prev) =>
      sortByDueDate(prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              title: updated.title,
              description: updated.description ?? null,
              due_date: toDateString(updated.dueDate ?? null),
              file_id: updated.fileId ?? null,
              recur_frequency: updated.recurFrequency ?? null,
              recur_anchor: updated.recurAnchor ?? null,
            }
          : t,
      )),
    );
  };

  const handleCompleteTask = async (result: CompleteResult) => {
    if (!completingTask || !userId) return;
    const nextTask = await completeTask(completingTask, userId, result.nextDueDate, result.newFrequency, result.newAnchor);
    setTasks((prev) => {
      const without = prev.filter((t) => t.id !== completingTask.id);
      return nextTask ? sortByDueDate([...without, nextTask]) : without;
    });
    setCompletingTask(null);
    setSuccessMessage('Task completed!');
  };

  const handleDeleteTasksConfirm = async () => {
    const count = pendingDeleteTaskIds.length;
    setDeleteLoading(true);
    await deleteTasks(pendingDeleteTaskIds);
    setTasks((prev) => prev.filter((t) => !pendingDeleteTaskIds.includes(t.id)));
    setPendingDeleteTaskIds([]);
    taskSel.cancel();
    setDeleteLoading(false);
    setSuccessMessage(count === 1 ? 'Task deleted' : `${count} tasks deleted`);
  };

  // ── File actions ──────────────────────────────────────────────────────────

  const handleDeleteFilesConfirm = async (cascade?: boolean) => {
    const count = pendingDeleteFileIds.length;
    setDeleteLoading(true);
    const filesToDelete = files.filter((f) => pendingDeleteFileIds.includes(f.id));
    await deleteFiles(filesToDelete, cascade ?? true);
    setFiles((prev) => prev.filter((f) => !pendingDeleteFileIds.includes(f.id)));
    if (cascade) {
      setTasks((prev) => prev.filter((t) => !t.file_id || !pendingDeleteFileIds.includes(t.file_id)));
    } else {
      setTasks((prev) => prev.map((t) =>
        t.file_id && pendingDeleteFileIds.includes(t.file_id) ? { ...t, file_id: null } : t,
      ));
    }
    setPendingDeleteFileIds([]);
    fileSel.cancel();
    setDeleteLoading(false);
    setSuccessMessage(count === 1 ? 'File deleted' : `${count} files deleted`);
  };

  const handleDownload = (filePath: string, fileName: string) => {
    downloadFile(filePath, fileName).catch((err) => console.error('Download failed:', err));
  };

  // ── Feature actions ───────────────────────────────────────────────────────

  const handleFeatureAdded = (featureId: number, newTasks: DBTask[]) => {
    setEnabledFeatureIds((prev) => new Set([...prev, featureId]));
    if (newTasks.length > 0) {
      setTasks((prev) => sortByDueDate([...prev, ...newTasks]));
      setSuccessMessage(`Added ${newTasks.length} task${newTasks.length === 1 ? '' : 's'}`);
    }
  };

  const handleFeatureRemoved = (featureId: number) => {
    setEnabledFeatureIds((prev) => {
      const next = new Set(prev);
      next.delete(featureId);
      return next;
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const activeSelectionMode = section === 'tasks' ? taskSel.selectionMode : fileSel.selectionMode;
  const activeSelectedIds = section === 'tasks' ? taskSel.selectedIds : fileSel.selectedIds;

  const handleCancelSelection = () => section === 'tasks' ? taskSel.cancel() : fileSel.cancel();
  const handleDeleteSelected = () => {
    if (section === 'tasks' && taskSel.selectedIds.length > 0) setPendingDeleteTaskIds(taskSel.selectedIds);
    if (section === 'files' && fileSel.selectedIds.length > 0) setPendingDeleteFileIds(fileSel.selectedIds);
  };

  const taskFileOptions: FileRecord[] = allPropertyFiles.filter((f) =>
    tasks.some((t) => t.file_id != null && t.file_id === f.id),
  );

  const displayedTasks = taskFileFilter
    ? tasks.filter((t) => t.file_id === taskFileFilter)
    : tasks;

  const tasksTabLabel = taskFileFilter
    ? `Tasks (${displayedTasks.length}/${tasks.length})`
    : `Tasks (${tasks.length})`;

  const pendingTaskTitle = tasks.find((t) => t.id === pendingDeleteTaskIds[0])?.title;
  const pendingFileName = files.find((f) => f.id === pendingDeleteFileIds[0])?.file_name;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scroll}>
        <View style={styles.paddingWrap}>
          <View style={styles.maxWidth}>

            <PageHeader
              title={propertyName || 'Property'}
              left={
                <IconButton
                  icon="arrow-back"
                  iconSize={22}
                  size={34}
                  onPress={() => router.push('/(tabs)/dashboard')}
                  iconColor={colors.textSecondary}
                  style={{ backgroundColor: 'transparent' }}
                />
              }
            />

            <View style={styles.featuresRow}>
              <View style={styles.featureChips}>
                {enabledFeatureIds.size === 0 ? (
                  <Text style={[styles.noFeatures, { color: colors.textMuted }]}>No features added</Text>
                ) : (
                  allFeatures
                    .filter((f) => enabledFeatureIds.has(f.id))
                    .map((f) => (
                      <View key={f.id} style={[styles.featureChip, { backgroundColor: colors.successLight, borderColor: colors.success }]}>
                        <Text style={[styles.featureChipText, { color: colors.success }]}>{f.name}</Text>
                      </View>
                    ))
                )}
              </View>
              <IconButton
                icon="tune"
                size={32}
                iconSize={18}
                onPress={() => setFeaturesModalVisible(true)}
                iconColor={colors.textSecondary}
                style={{ backgroundColor: 'transparent' }}
              />
            </View>

            <View style={styles.tabsRow}>
              <SegmentedControl
                style={styles.tabs}
                tabs={[
                  { label: tasksTabLabel, value: 'tasks' },
                  { label: `Files (${files.length})`, value: 'files' },
                ]}
                selected={section}
                onSelect={(v) => setSection(v as Section)}
              />
              {activeSelectionMode ? (
                <SelectionActions
                  selectedCount={activeSelectedIds.length}
                  onCancel={handleCancelSelection}
                  onDelete={handleDeleteSelected}
                />
              ) : (
                <IconButton
                  icon="add"
                  size={36}
                  onPress={() => section === 'tasks' ? setAddTaskVisible(true) : setUploadVisible(true)}
                />
              )}
            </View>

            {loading ? (
              <ActivityIndicator size="large" color={colors.info} style={{ marginTop: 40 }} />
            ) : section === 'tasks' ? (
              <>
                <FilterChips
                  options={[
                    { label: 'All', value: null },
                    ...taskFileOptions.map((f) => ({ label: f.file_name, value: f.id })),
                  ]}
                  selected={taskFileFilter}
                  onSelect={setTaskFileFilter}
                />
                {displayedTasks.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No tasks yet.</Text>
                )}
                {displayedTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={dbTaskToTaskType(task)}
                    onUpdate={(updated) => handleUpdateTask(task.id, updated)}
                    onDelete={() => setPendingDeleteTaskIds([task.id])}
                    onTap={() => setCompletingTask(task)}
                    selected={taskSel.selectedIds.includes(task.id)}
                    selectionMode={taskSel.selectionMode}
                    onLongPress={() => taskSel.selectionMode ? taskSel.toggle(task.id) : taskSel.enter(task.id)}
                    files={allPropertyFiles}
                  />
                ))}
              </>
            ) : (
              <>
                {files.length === 0 && (
                  <Text style={[styles.emptyText, { color: colors.textMuted }]}>No files yet.</Text>
                )}
                {files.map((file) => (
                  <FileItem
                    key={file.id}
                    fileName={file.file_name}
                    onOpen={() => handleDownload(file.file_path, file.file_name)}
                    onDelete={() => setPendingDeleteFileIds([file.id])}
                    selected={fileSel.selectedIds.includes(file.id)}
                    selectionMode={fileSel.selectionMode}
                    onLongPress={() => fileSel.selectionMode ? fileSel.toggle(file.id) : fileSel.enter(file.id)}
                  />
                ))}
              </>
            )}
          </View>
        </View>
      </ScrollView>

      <AddTaskModal
        visible={addTaskVisible}
        onClose={() => setAddTaskVisible(false)}
        onAdd={handleAddTask}
        files={allPropertyFiles}
      />

      <CompleteTaskModal
        visible={!!completingTask}
        task={completingTask ? dbTaskToTaskType(completingTask) : null}
        onClose={() => setCompletingTask(null)}
        onComplete={handleCompleteTask}
      />

      <UploadExtractPopup
        visible={uploadVisible}
        userId={userId ?? ''}
        initialPropertyId={id}
        onClose={() => setUploadVisible(false)}
        onSuccess={() => loadData()}
      />

      <ConfirmDeleteModal
        visible={pendingDeleteTaskIds.length > 0}
        title={pendingDeleteTaskIds.length === 1 ? 'Delete Task' : `Delete ${pendingDeleteTaskIds.length} Tasks`}
        message={
          pendingDeleteTaskIds.length === 1
            ? `Are you sure you want to delete "${pendingTaskTitle}"? This cannot be undone.`
            : `Are you sure you want to delete ${pendingDeleteTaskIds.length} tasks? This cannot be undone.`
        }
        onConfirm={handleDeleteTasksConfirm}
        onCancel={() => setPendingDeleteTaskIds([])}
        loading={deleteLoading}
        loadingLabel={pendingDeleteTaskIds.length === 1 ? 'Deleting task...' : `Deleting ${pendingDeleteTaskIds.length} tasks...`}
      />

      <ConfirmDeleteModal
        visible={pendingDeleteFileIds.length > 0}
        title={pendingDeleteFileIds.length === 1 ? 'Delete File' : `Delete ${pendingDeleteFileIds.length} Files`}
        message={
          pendingDeleteFileIds.length === 1
            ? `Are you sure you want to delete "${pendingFileName}"? This cannot be undone.`
            : `Are you sure you want to delete ${pendingDeleteFileIds.length} files? This cannot be undone.`
        }
        onConfirm={handleDeleteFilesConfirm}
        onCancel={() => setPendingDeleteFileIds([])}
        loading={deleteLoading}
        loadingLabel={pendingDeleteFileIds.length === 1 ? 'Deleting file...' : `Deleting ${pendingDeleteFileIds.length} files...`}
        cascadeLabel="Also delete linked tasks"
      />

      <ManageFeaturesModal
        visible={featuresModalVisible}
        onClose={() => setFeaturesModalVisible(false)}
        propertyId={id}
        userId={userId ?? ''}
        features={allFeatures}
        enabledFeatureIds={enabledFeatureIds}
        onFeatureAdded={handleFeatureAdded}
        onFeatureRemoved={handleFeatureRemoved}
      />

      <InfoPopup
        visible={!!successMessage}
        type="success"
        message={successMessage ?? ''}
        onClose={() => setSuccessMessage(null)}
        autoDismiss={2500}
        showConfirm={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  paddingWrap: {
    padding: SCREEN_PADDING,
    alignItems: 'center',
  },
  maxWidth: {
    width: '100%',
    maxWidth: PAGE_MAX_WIDTH,
  },
  featuresRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  featureChips: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs + 2,
  },
  featureChip: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  featureChipText: {
    fontSize: fontSize.sm,
    fontWeight: '500',
  },
  noFeatures: {
    fontSize: fontSize.sm,
    fontStyle: 'italic',
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  tabs: { flex: 1 },
  emptyText: {
    textAlign: 'center',
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
  },
});
