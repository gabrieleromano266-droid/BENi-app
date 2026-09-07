import AddTaskModal from '@/components/AddTaskModal';
import Button from '@/components/Button';
import CompleteTaskModal, { CompleteResult } from '@/components/CompleteTaskModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import EmptyText from '@/components/EmptyText';
import FilterChips from '@/components/FilterChips';
import InfoPopup from '@/components/InfoPopup';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import SelectionActions from '@/components/SelectionActions';
import TaskItem from '@/components/TaskItem';
import { useSelectionMode } from '@/hooks/useSelectionMode';
import { supabase } from '@/services/supabase';
import { fetchProperties } from '@/services/propertyService';
import { completeTask, createTask, deleteTasks, fetchAllTasksForUser, TaskInput, updateTask } from '@/services/taskService';
import { useTheme } from '@/theme/ThemeContext';
import { Property, TaskRow, TaskType } from '@/types';
import { dbTaskToTaskType, sortByDueDate, toDateString } from '@/utils/taskUtils';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

export default function MaintenanceScreen() {
  const { colors } = useTheme();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [propertyFilter, setPropertyFilter] = useState<string | null>(null);
  const [fileFilter, setFileFilter] = useState<string | null>(null);

  const [addTaskVisible, setAddTaskVisible] = useState(false);
  const [pendingDeleteTaskIds, setPendingDeleteTaskIds] = useState<string[]>([]);
  const [completingTask, setCompletingTask] = useState<TaskRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const taskSel = useSelectionMode();

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { router.replace('/(auth)/login'); return; }
      setUserId(data.user.id);
      setLoading(true);
      const [props, tasks] = await Promise.all([
        fetchProperties(data.user.id),
        fetchAllTasksForUser(data.user.id),
      ]);
      setProperties(props);
      setAllTasks(tasks);
      setLoading(false);
    });
  }, []);

  const handlePropertyFilterSelect = (v: string | null) => {
    setPropertyFilter(v);
    setFileFilter(null);
  };

  const handleAddTask = async (input: TaskInput) => {
    if (!userId) return;
    const newTask = await createTask(userId, input);
    const propertyName = input.propertyId ? (properties.find((p) => p.id === input.propertyId)?.name || '') : '';
    setAllTasks((prev) => sortByDueDate([...prev, { ...newTask, propertyName, fileName: '' }]));
    setAddTaskVisible(false);
  };

  const handleUpdateTask = async (taskId: string, updated: TaskType) => {
    await updateTask(taskId, updated);
    setAllTasks((prev) =>
      sortByDueDate(prev.map((t) => {
        if (t.id !== taskId) return t;
        const propertyName = updated.propertyId
          ? (properties.find((p) => p.id === updated.propertyId)?.name || '')
          : '';
        return {
          ...t,
          title: updated.title,
          description: updated.description ?? null,
          due_date: toDateString(updated.dueDate ?? null),
          property_id: updated.propertyId ?? null,
          file_id: updated.fileId ?? null,
          recur_frequency: updated.recurFrequency ?? null,
          recur_anchor: updated.recurAnchor ?? null,
          system: updated.system ?? null,
          severity: updated.severity ?? null,
          location: updated.location ?? null,
          issue: updated.issue ?? null,
          fix_recommendation: updated.fixRecommendation ?? null,
          cost_min: updated.costMin ?? null,
          cost_max: updated.costMax ?? null,
          timing_note: updated.timingNote ?? null,
          propertyName,
        };
      })),
    );
  };

  const handleCompleteTask = async (result: CompleteResult) => {
    if (!completingTask || !userId) return;
    const nextTask = await completeTask(completingTask, userId, result.nextDueDate, result.newFrequency, result.newAnchor);
    setAllTasks((prev) => {
      const without = prev.filter((t) => t.id !== completingTask.id);
      if (!nextTask) return without;
      const propertyName = nextTask.property_id ? (properties.find((p) => p.id === nextTask.property_id)?.name || '') : '';
      return sortByDueDate([...without, { ...nextTask, propertyName, fileName: '' }]);
    });
    setCompletingTask(null);
    setSuccessMessage('Task completed!');
  };

  const handleDeleteTasksConfirm = async () => {
    const count = pendingDeleteTaskIds.length;
    setDeleteLoading(true);
    await deleteTasks(pendingDeleteTaskIds);
    setAllTasks((prev) => prev.filter((t) => !pendingDeleteTaskIds.includes(t.id)));
    setPendingDeleteTaskIds([]);
    taskSel.cancel();
    setDeleteLoading(false);
    setSuccessMessage(count === 1 ? 'Task deleted' : `${count} tasks deleted`);
  };

  const tasksFilteredByProperty = propertyFilter
    ? allTasks.filter((t) => t.property_id === propertyFilter)
    : allTasks;

  const displayedTasks = fileFilter
    ? tasksFilteredByProperty.filter((t) => t.file_id === fileFilter)
    : tasksFilteredByProperty;

  const filesForProperty: { id: string; name: string }[] = propertyFilter
    ? Array.from(
        new Map(
          tasksFilteredByProperty
            .filter((t) => t.file_id != null && t.fileName)
            .map((t) => [t.file_id!, { id: t.file_id!, name: t.fileName }]),
        ).values(),
      )
    : [];

  const pendingDeleteTaskTitle = allTasks.find((t) => t.id === pendingDeleteTaskIds[0])?.title;

  return (
    <PageContainer>
      <PageHeader
        title="Maintenance"
        subtitle="Track, prioritize, and complete your home maintenance tasks."
        right={taskSel.selectionMode ? (
          <SelectionActions
            selectedCount={taskSel.selectedIds.length}
            onCancel={taskSel.cancel}
            onDelete={() => {
              if (taskSel.selectedIds.length > 0) setPendingDeleteTaskIds(taskSel.selectedIds);
            }}
          />
        ) : (
          <Button
            title="Add Task"
            variant="primary"
            size="sm"
            leftIcon={<MaterialIcons name="add" size={16} color={colors.textInverse} />}
            onPress={() => setAddTaskVisible(true)}
          />
        )}
      />

      {!loading && properties.length > 0 && (
        <FilterChips
          options={[
            { label: 'All', value: null },
            ...properties.map((p) => ({ label: p.name, value: p.id })),
          ]}
          selected={propertyFilter}
          onSelect={handlePropertyFilterSelect}
        />
      )}

      {!loading && propertyFilter !== null && filesForProperty.length > 0 && (
        <FilterChips
          options={[
            { label: 'All files', value: null },
            ...filesForProperty.map((f) => ({ label: f.name, value: f.id })),
          ]}
          selected={fileFilter}
          onSelect={setFileFilter}
        />
      )}

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
      ) : displayedTasks.length === 0 ? (
        <EmptyText>No maintenance tasks found.</EmptyText>
      ) : (
        displayedTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={dbTaskToTaskType(task)}
            propertyName={task.propertyName}
            onUpdate={(updated) => handleUpdateTask(task.id, updated)}
            onDelete={() => setPendingDeleteTaskIds([task.id])}
            onTap={() => setCompletingTask(task)}
            selected={taskSel.selectedIds.includes(task.id)}
            selectionMode={taskSel.selectionMode}
            onLongPress={() => taskSel.selectionMode ? taskSel.toggle(task.id) : taskSel.enter(task.id)}
            properties={properties}
          />
        ))
      )}

      <AddTaskModal
        visible={addTaskVisible}
        onClose={() => setAddTaskVisible(false)}
        onAdd={handleAddTask}
        properties={properties}
      />

      <ConfirmDeleteModal
        visible={pendingDeleteTaskIds.length > 0}
        title={pendingDeleteTaskIds.length === 1 ? 'Delete Task' : `Delete ${pendingDeleteTaskIds.length} Tasks`}
        message={
          pendingDeleteTaskIds.length === 1
            ? `Are you sure you want to delete "${pendingDeleteTaskTitle}"? This cannot be undone.`
            : `Are you sure you want to delete ${pendingDeleteTaskIds.length} tasks? This cannot be undone.`
        }
        onConfirm={handleDeleteTasksConfirm}
        onCancel={() => setPendingDeleteTaskIds([])}
        loading={deleteLoading}
        loadingLabel={pendingDeleteTaskIds.length === 1 ? 'Deleting task...' : `Deleting ${pendingDeleteTaskIds.length} tasks...`}
      />

      <CompleteTaskModal
        visible={!!completingTask}
        task={completingTask ? dbTaskToTaskType(completingTask) : null}
        onClose={() => setCompletingTask(null)}
        onComplete={handleCompleteTask}
      />

      <InfoPopup
        visible={!!successMessage}
        type="success"
        message={successMessage ?? ''}
        onClose={() => setSuccessMessage(null)}
        autoDismiss={2500}
        showConfirm={false}
      />
    </PageContainer>
  );
}
