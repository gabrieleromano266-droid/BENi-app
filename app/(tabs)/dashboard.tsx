import AddTaskModal from '@/components/AddTaskModal';
import Card from '@/components/Card';
import CompleteTaskModal, { CompleteResult } from '@/components/CompleteTaskModal';
import ConfirmDeleteModal from '@/components/ConfirmDeleteModal';
import AddPropertyPopup from '@/components/dashboard/AddPropertyPopup';
import HealthScorePanel from '@/components/dashboard/HealthScorePanel';
import MaintenanceTaskCard from '@/components/dashboard/MaintenanceTaskCard';
import Dropdown from '@/components/Dropdown';
import EmptyText from '@/components/EmptyText';
import FilterChips, { ChipOption } from '@/components/FilterChips';
import IconButton from '@/components/IconButton';
import InfoPopup from '@/components/InfoPopup';
import PageContainer from '@/components/PageContainer';
import PageHeader from '@/components/PageHeader';
import { SYSTEMS } from '@/constants/systems';
import { fetchFirstName } from '@/services/profileService';
import { fetchProperties } from '@/services/propertyService';
import { supabase } from '@/services/supabase';
import {
  completeTask, createTask, deleteTasks, fetchAllTasksForUser, fetchCompletedTaskCount, TaskInput,
} from '@/services/taskService';
import { BREAKPOINT, SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { Property, TaskRow } from '@/types';
import { computeHealthScores, getStartHereSuggestion } from '@/utils/healthScore';
import { dbTaskToTaskType, sortByDueDate } from '@/utils/taskUtils';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { ComponentProps, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';

const UNASSIGNED = '__unassigned__';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const contentWidth = width - (width >= SIDEBAR_BREAKPOINT ? SIDEBAR_WIDTH : 0);
  const isWide = contentWidth >= BREAKPOINT;

  const [userId, setUserId] = useState<string | null>(null);
  const [firstName, setFirstName] = useState('');
  const [properties, setProperties] = useState<Property[]>([]);
  const [allTasks, setAllTasks] = useState<TaskRow[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);

  /** null = "All Properties" */
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  /** null = "All" systems; UNASSIGNED = tasks with no system tagged */
  const [systemFilter, setSystemFilter] = useState<string | null>(null);
  /** null = no tile selected; one of 'critical'|'moderate'|'recurring'|'completed' — set by tapping a stat tile */
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);

  const [addPropertyVisible, setAddPropertyVisible] = useState(false);
  const [addTaskVisible, setAddTaskVisible] = useState(false);
  const [pendingDeleteTaskIds, setPendingDeleteTaskIds] = useState<string[]>([]);
  const [completingTask, setCompletingTask] = useState<TaskRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace('/(auth)/login'); return; }
      setUserId(data.user.id);
      fetchFirstName(data.user.id).then(setFirstName);
      loadProperties(data.user.id);
      loadTasks(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    fetchCompletedTaskCount(userId, selectedPropertyId).then(setCompletedCount);
  }, [userId, selectedPropertyId]);

  const loadProperties = async (uid: string) => {
    setLoadingProperties(true);
    setProperties(await fetchProperties(uid));
    setLoadingProperties(false);
  };

  const loadTasks = async (uid: string) => {
    setLoadingTasks(true);
    setAllTasks(await fetchAllTasksForUser(uid));
    setLoadingTasks(false);
  };

  // ── Task actions ──────────────────────────────────────────────────────────

  const handleAddTask = async (input: TaskInput) => {
    if (!userId) return;
    const newTask = await createTask(userId, input);
    const propertyName = input.propertyId ? (properties.find((p) => p.id === input.propertyId)?.name || '') : '';
    setAllTasks((prev) => sortByDueDate([...prev, { ...newTask, propertyName, fileName: '' }]));
    setAddTaskVisible(false);
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
    setCompletedCount((c) => c + 1);
    setSuccessMessage('Task completed!');
  };

  const handleDeleteTasksConfirm = async () => {
    const count = pendingDeleteTaskIds.length;
    setDeleteLoading(true);
    await deleteTasks(pendingDeleteTaskIds);
    setAllTasks((prev) => prev.filter((t) => !pendingDeleteTaskIds.includes(t.id)));
    setPendingDeleteTaskIds([]);
    setDeleteLoading(false);
    setSuccessMessage(count === 1 ? 'Task deleted' : `${count} tasks deleted`);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const scopedTasks = selectedPropertyId
    ? allTasks.filter((t) => t.property_id === selectedPropertyId)
    : allTasks;

  const criticalCount = scopedTasks.filter((t) => t.severity === 'critical').length;
  const moderateCount = scopedTasks.filter((t) => t.severity === 'moderate').length;
  const recurringCount = scopedTasks.filter((t) => !!t.recur_frequency).length;
  const unassignedCount = scopedTasks.filter((t) => !t.system).length;

  // Tapping a stat tile toggles that filter (re-tapping the active one clears it)
  const toggleSeverity = (key: string) => setSeverityFilter((prev) => (prev === key ? null : key));

  const { overall, bySystem } = computeHealthScores(scopedTasks);
  const startHere = getStartHereSuggestion(scopedTasks, bySystem);

  const filterOptions: ChipOption[] = [
    { label: `All (${scopedTasks.length})`, value: null },
    ...SYSTEMS
      .map((s) => ({ label: s.label, value: s.value as string, count: scopedTasks.filter((t) => t.system === s.value).length }))
      .filter((s) => s.count > 0)
      .map((s) => ({ label: `${s.label} (${s.count})`, value: s.value })),
    ...(unassignedCount > 0 ? [{ label: `Other (${unassignedCount})`, value: UNASSIGNED }] : []),
  ];

  // System/category filter (from the chips) AND severity/status filter (from the
  // tiles) are combinable — e.g. Critical + Exterior shows only critical exterior tasks.
  const matchesSystem = (t: TaskRow) =>
    !systemFilter ? true : systemFilter === UNASSIGNED ? !t.system : t.system === systemFilter;
  const matchesSeverity = (t: TaskRow) => {
    switch (severityFilter) {
      case 'critical': return t.severity === 'critical';
      case 'moderate': return t.severity === 'moderate';
      case 'recurring': return !!t.recur_frequency;
      // The plan lists only OPEN tasks, so nothing here is "completed" — loading
      // completed tasks would need a services/ change, which is out of scope.
      case 'completed': return false;
      default: return true;
    }
  };
  const displayedTasks = scopedTasks.filter((t) => matchesSystem(t) && matchesSeverity(t));

  const pendingDeleteTaskTitle = allTasks.find((t) => t.id === pendingDeleteTaskIds[0])?.title;
  const selectedProperty = selectedPropertyId ? properties.find((p) => p.id === selectedPropertyId) : null;

  // "Welcome home, Gabriele" — falls back to a nameless greeting until the
  // profile loads or if the user never set a first name.
  const displayName = firstName ? firstName.charAt(0).toUpperCase() + firstName.slice(1) : '';
  const greeting = displayName ? `Welcome home, ${displayName}` : 'Welcome home';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageContainer>
      <PageHeader
        title={greeting}
        subtitle="Own your home, not just the keys. Here's your home health summary."
        subtitleColor={colors.gold}
        right={
          <View style={styles.propertyIndicator}>
            {properties.length > 1 && (
              <Dropdown
                options={properties.map((p) => ({ label: p.name, value: p.id }))}
                selected={selectedPropertyId}
                onSelect={setSelectedPropertyId}
                placeholder="All Properties"
                size="sm"
                style={styles.propertyDropdown}
              />
            )}
            {properties.length === 1 && (
              <View style={[styles.propertyPill, { backgroundColor: colors.primaryLight }]}>
                <MaterialIcons name="apartment" size={14} color={colors.primary} />
                <Text style={[styles.propertyPillText, { color: colors.primary }]} numberOfLines={1}>
                  {properties[0].name}
                </Text>
              </View>
            )}
            <IconButton icon="add" onPress={() => setAddPropertyVisible(true)} size={30} />
          </View>
        }
      />

      {/* Stats — each tile also acts as a quick filter for the plan below */}
      <View style={styles.statsRow}>
        <StatTile
          icon="warning" label="Critical" sublabel="Act now"
          value={loadingTasks ? '–' : criticalCount}
          iconColor={colors.severityCriticalText} badgeColor={colors.severityCriticalBg}
          active={severityFilter === 'critical'} onPress={() => toggleSeverity('critical')}
        />
        <StatTile
          icon="error-outline" label="Moderate" sublabel="Keep an eye"
          value={loadingTasks ? '–' : moderateCount}
          iconColor={colors.severityModerateText} badgeColor={colors.severityModerateBg}
          active={severityFilter === 'moderate'} onPress={() => toggleSeverity('moderate')}
        />
        <StatTile
          icon="repeat" label="Recurring" sublabel="On schedule"
          value={loadingTasks ? '–' : recurringCount}
          iconColor={colors.info} badgeColor={colors.infoLight}
          active={severityFilter === 'recurring'} onPress={() => toggleSeverity('recurring')}
        />
        <StatTile
          icon="check-circle-outline" label="Completed" sublabel="Well done"
          value={loadingTasks ? '–' : completedCount}
          iconColor={colors.success} badgeColor={colors.successLight}
          active={severityFilter === 'completed'} onPress={() => toggleSeverity('completed')}
        />
      </View>

      <View style={isWide && styles.columns}>
        {/* Home Health Score */}
        <View style={isWide && styles.healthCol}>
          <HealthScorePanel overall={overall} bySystem={bySystem} startHere={startHere} />
        </View>

        {/* Maintenance plan */}
        <Card style={[styles.sectionCard, isWide && styles.tasksCol]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Your Maintenance Plan</Text>
            <IconButton icon="add" onPress={() => setAddTaskVisible(true)} size={30} />
          </View>

          {!loadingTasks && scopedTasks.length > 0 && (
            <FilterChips options={filterOptions} selected={systemFilter} onSelect={setSystemFilter} />
          )}

          {loadingTasks ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : displayedTasks.length === 0 ? (
            <EmptyText>
              {scopedTasks.length === 0 ? 'No open maintenance items — nicely maintained.' : 'No items match the selected filters.'}
            </EmptyText>
          ) : (
            displayedTasks.map((task) => (
              <MaintenanceTaskCard
                key={task.id}
                task={task}
                showProperty={!selectedProperty}
                onComplete={() => setCompletingTask(task)}
                onDelete={() => setPendingDeleteTaskIds([task.id])}
              />
            ))
          )}
        </Card>
      </View>

      <AddTaskModal
        visible={addTaskVisible}
        onClose={() => setAddTaskVisible(false)}
        onAdd={handleAddTask}
        properties={properties}
      />

      <AddPropertyPopup
        visible={addPropertyVisible}
        onClose={() => setAddPropertyVisible(false)}
        onPropertyAdded={() => { if (userId) loadProperties(userId); }}
      />

      <ConfirmDeleteModal
        visible={pendingDeleteTaskIds.length > 0}
        title="Delete Task"
        message={`Are you sure you want to delete "${pendingDeleteTaskTitle}"? This cannot be undone.`}
        onConfirm={handleDeleteTasksConfirm}
        onCancel={() => setPendingDeleteTaskIds([])}
        loading={deleteLoading}
        loadingLabel="Deleting task..."
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({
  icon, label, value, sublabel, iconColor, badgeColor, active = false, onPress,
}: {
  icon: ComponentProps<typeof MaterialIcons>['name'];
  label: string;
  value: number | string;
  sublabel: string;
  iconColor: string;
  badgeColor: string;
  active?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Card style={[styles.statTile, active && { borderColor: iconColor, borderWidth: 2 }]}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
        <View style={styles.statTop}>
          <Text style={[styles.statLabel, { color: colors.textMuted }]}>{label.toUpperCase()}</Text>
          <View style={[styles.statIconTile, { backgroundColor: badgeColor }]}>
            <MaterialIcons name={icon} size={16} color={iconColor} />
          </View>
        </View>
        <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value}</Text>
        <Text style={[styles.statSub, { color: colors.textMuted }]}>{sublabel}</Text>
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  propertyIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  propertyDropdown: {
    minWidth: 170,
  },
  propertyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 7,
    borderRadius: radius.pill,
    maxWidth: 220,
  },
  propertyPillText: {
    fontSize: fontSize.sm,
    fontWeight: '600',
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  statTile: {
    flexGrow: 1,
    flexBasis: 150,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  statLabel: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  statIconTile: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statValue: {
    fontFamily: fonts.display,
    fontSize: fontSize.h2,
    fontWeight: 'bold',
  },
  statSub: {
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  columns: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xl,
  },
  sectionCard: {
    marginBottom: spacing.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  cardTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSize.xxl,
    fontWeight: '600',
    flex: 1,
  },
  healthCol: {
    width: 320,
  },
  tasksCol: {
    flex: 1,
    minWidth: 0,
  },
});
