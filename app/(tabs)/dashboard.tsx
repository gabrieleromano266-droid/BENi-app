import AddTaskModal from '@/components/AddTaskModal';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { SINGLE_PROPERTY_MODE } from '@/constants/app';
import { setupRecurringPlan } from '@/services/featureService';
import { recordTaskEvent, recordTaskEvents } from '@/services/learningService';
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
import { uploadTaskDocument } from '@/services/fileService';
import { fetchFirstName } from '@/services/profileService';
import { fetchProperties } from '@/services/propertyService';
import { supabase } from '@/services/supabase';
import {
  completeTask, createTask, deleteTasks, fetchAllTasksForUser, fetchCompletedTaskCount,
  fetchCompletedTasksForUser, TaskInput,
} from '@/services/taskService';
import { BREAKPOINT, SIDEBAR_BREAKPOINT, SIDEBAR_WIDTH } from '@/theme/layout';
import { useTheme } from '@/theme/ThemeContext';
import { fonts, fontSize, radius, spacing } from '@/theme/tokens';
import { Property, TaskKind, TaskRow } from '@/types';
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
  // Completed tasks are kept separate so they never skew the open-task
  // counts or the Home Health Score.
  const [completedTasks, setCompletedTasks] = useState<TaskRow[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [completedCount, setCompletedCount] = useState(0);
  const [settingUpPlan, setSettingUpPlan] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  /**
   * A report mixes real jobs with general upkeep advice and administrative
   * notes. Showing all three as one list is what made the plan 150+ items
   * long. Default to the jobs; the rest stay one tap away rather than hidden.
   */
  const [kindFilter, setKindFilter] = useState<TaskKind>('action');

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
    try {
      const done = await fetchCompletedTasksForUser(uid);
      setCompletedTasks(done.map((t) => ({ ...t, propertyName: '', fileName: '' })));
    } catch (err) {
      // Don't let the completed list take the whole dashboard down with it.
      console.error(err);
      setCompletedTasks([]);
      setSuccessMessage(null);
      setLoadError((err as Error).message);
    }
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
    const completedId = completingTask.id;
    const completedPropertyId = completingTask.property_id;
    const nextTask = await completeTask(completingTask, userId, result.nextDueDate, result.newFrequency, result.newAnchor);

    // Store the receipt/photo against the task we just closed. Never let a
    // failed upload lose the completion itself.
    if (result.proof) {
      try {
        await uploadTaskDocument(userId, completedId, completedPropertyId, result.proof.uri, result.proof.name);
      } catch (err) {
        console.error('Could not attach the completion document:', err);
      }
    }
    setAllTasks((prev) => {
      const without = prev.filter((t) => t.id !== completingTask.id);
      if (!nextTask) return without;
      const propertyName = nextTask.property_id ? (properties.find((p) => p.id === nextTask.property_id)?.name || '') : '';
      return sortByDueDate([...without, { ...nextTask, propertyName, fileName: '' }]);
    });
    if (userId) await recordTaskEvent(userId, completingTask, 'completed');
    setCompletedTasks((prev) => [
      { ...completingTask, completed_at: new Date().toISOString(), propertyName: '', fileName: '' },
      ...prev,
    ]);
    setCompletingTask(null);
    setCompletedCount((c) => c + 1);
    setSuccessMessage('Task completed!');
  };

  const handleDeleteTasksConfirm = async () => {
    const count = pendingDeleteTaskIds.length;
    setDeleteLoading(true);

    // Record BEFORE deleting — afterwards the rows are gone and with them any
    // chance of learning why the extraction was wrong.
    if (userId) {
      const doomed = allTasks.filter((t) => pendingDeleteTaskIds.includes(t.id));
      await recordTaskEvents(userId, doomed, 'deleted');
    }

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

  // The recurring bank is seeded but does nothing until a property opts into
  // features. Until then "Recurring" reads 0 and BENi looks like a one-off
  // report parser rather than something that keeps a home on schedule.
  const hasNoProperty = !loadingProperties && properties.length === 0;
  const planProperty = selectedPropertyId ?? properties[0]?.id ?? null;
  const needsPlan = !loadingTasks && recurringCount === 0 && !!planProperty;

  const handleSetupPlan = async () => {
    if (!planProperty || !userId) return;
    setSettingUpPlan(true);
    try {
      const created = await setupRecurringPlan(planProperty, userId);
      await loadTasks(userId);
      setSuccessMessage(
        created > 0
          ? `Added ${created} recurring job${created === 1 ? '' : 's'} to your plan`
          : 'Your recurring plan was already set up',
      );
    } catch (err) {
      console.error('Could not set up the recurring plan:', err);
    }
    setSettingUpPlan(false);
  };

  // Tapping a stat tile toggles that filter (re-tapping the active one clears it)
  const toggleSeverity = (key: string) =>
    setSeverityFilter((prev) => {
      const next = prev === key ? null : key;
      // Entering/leaving the Completed view resets the system chip. Without this
      // a stale chip like "Plumbing (0)" makes the list look empty even though
      // completed tasks exist.
      if (next === 'completed' || prev === 'completed') setSystemFilter(null);
      return next;
    });

  const { overall, bySystem } = computeHealthScores(scopedTasks);
  const startHere = getStartHereSuggestion(scopedTasks, bySystem);

  const completedScoped = selectedPropertyId
    ? completedTasks.filter((t) => t.property_id === selectedPropertyId)
    : completedTasks;

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
      case 'completed': return true; // handled via completedScoped below
      default: return true;
    }
  };

  // The chips must count what the TILE has already narrowed to, not everything.
  // Selecting "Recurring (20)" and still reading "All (154)" above a list of 20
  // is the filter contradicting itself — you cannot tell what you are looking
  // at. In the Completed view the chips count completed tasks instead, since
  // the open plan contains none of them by definition.
  // Older tasks predate classification; treat an untagged task as a job so
  // nothing silently disappears from the plan.
  const matchesKind = (t: TaskRow) => (t.task_kind ?? 'action') === kindFilter;

  const kindCounts = {
    action: scopedTasks.filter((t) => (t.task_kind ?? 'action') === 'action').length,
    routine: scopedTasks.filter((t) => t.task_kind === 'routine').length,
    note: scopedTasks.filter((t) => t.task_kind === 'note').length,
  };

  const chipSource =
    severityFilter === 'completed'
      ? completedScoped
      : scopedTasks.filter((t) => matchesSeverity(t) && matchesKind(t));

  const unassignedInView = chipSource.filter((t) => !t.system).length;

  const filterOptions: ChipOption[] = [
    { label: `All (${chipSource.length})`, value: null },
    // Show all six systems even at zero, so the filter row is predictable and a
    // homeowner can see which parts of the home currently have nothing open.
    ...SYSTEMS
      .map((s) => ({ label: s.label, value: s.value as string, count: chipSource.filter((t) => t.system === s.value).length }))
      .map((s) => ({ label: `${s.label} (${s.count})`, value: s.value })),
    ...(unassignedInView > 0 ? [{ label: `Other (${unassignedInView})`, value: UNASSIGNED }] : []),
  ];

  // The Completed tile swaps the list over to finished work rather than filtering
  // the open plan (which by definition contains none of it).
  const displayedTasks =
    severityFilter === 'completed'
      ? completedScoped.filter(matchesSystem)
      : scopedTasks.filter((t) => matchesSystem(t) && matchesSeverity(t) && matchesKind(t));

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
            {!SINGLE_PROPERTY_MODE && properties.length > 1 && (
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
            {/* Adding a SECOND home is out of scope for the MVP — but adding
                your FIRST is the whole on-ramp. Hiding this unconditionally
                left a new account with no way to create a property at all. */}
            {(!SINGLE_PROPERTY_MODE || properties.length === 0) && (
              <IconButton icon="add" onPress={() => setAddPropertyVisible(true)} size={30} />
            )}
          </View>
        }
      />

      {hasNoProperty && (
        <View style={[styles.planPrompt, { backgroundColor: colors.primaryLight, borderColor: colors.primary }]}>
          <MaterialIcons name="add-home" size={22} color={colors.primary} />
          <View style={styles.planText}>
            <Text style={[styles.planTitle, { color: colors.textPrimary }]}>
              Add your home to get started
            </Text>
            <Text style={[styles.planBody, { color: colors.textSecondary }]}>
              Everything in BENi hangs off your home — your inspection report, your
              maintenance plan, your documents. It takes about ten seconds.
            </Text>
          </View>
          <Button
            title="Add home"
            variant="primary"
            size="sm"
            onPress={() => setAddPropertyVisible(true)}
          />
        </View>
      )}

      {needsPlan && (
        <View style={[styles.planPrompt, { backgroundColor: colors.infoLight, borderColor: colors.info }]}>
          <MaterialIcons name="event-repeat" size={22} color={colors.info} />
          <View style={styles.planText}>
            <Text style={[styles.planTitle, { color: colors.textPrimary }]}>
              Set up your recurring maintenance
            </Text>
            <Text style={[styles.planBody, { color: colors.textSecondary }]}>
              An inspection report tells you what is wrong today. Recurring jobs — furnace
              filters, gutters, smoke alarms — are what stop the next report being bad.
            </Text>
          </View>
          <Button
            title={settingUpPlan ? 'Setting up…' : 'Set up'}
            variant="primary"
            size="sm"
            disabled={settingUpPlan}
            onPress={handleSetupPlan}
          />
        </View>
      )}

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

          {!loadingTasks && scopedTasks.length > 0 && severityFilter !== 'completed' && (
            <FilterChips
              options={[
                { label: `To do (${kindCounts.action})`, value: 'action' },
                { label: `Routine upkeep (${kindCounts.routine})`, value: 'routine' },
                ...(kindCounts.note > 0 ? [{ label: `Good to know (${kindCounts.note})`, value: 'note' }] : []),
              ]}
              selected={kindFilter}
              onSelect={(v) => setKindFilter((v as TaskKind) ?? 'action')}
            />
          )}

          {!loadingTasks && scopedTasks.length > 0 && (
            <FilterChips options={filterOptions} selected={systemFilter} onSelect={setSystemFilter} />
          )}

          {loadingTasks ? (
            <ActivityIndicator size="small" color={colors.primary} style={{ marginVertical: 12 }} />
          ) : displayedTasks.length === 0 ? (
            <EmptyText>
              {hasNoProperty
                ? 'Add your home above, then upload an inspection report to build your plan.'
                : scopedTasks.length === 0
                  ? 'No open maintenance items — nicely maintained.'
                  : 'No items match the selected filters.'}
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

      {/* One honest disclaimer for the whole page. This used to be a per-task
          "How sure" line, which put a hedge on every single card and made the
          app sound unsure of itself. Said once, plainly, at the bottom. */}
      <Text style={[styles.disclaimer, { color: colors.textMuted, borderTopColor: colors.borderLight }]}>
        Costs shown are planning estimates, not quotes. BENi can get them wrong —
        always get a real estimate from a licensed professional before committing
        to any work.
      </Text>

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
        visible={!!loadError}
        type="error"
        message={loadError ?? ''}
        onClose={() => setLoadError(null)}
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
  planPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  planText: {
    flex: 1,
    minWidth: 0,
  },
  planTitle: {
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: 2,
  },
  planBody: {
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  disclaimer: {
    fontSize: fontSize.xs,
    lineHeight: 17,
    borderTopWidth: 1,
    paddingTop: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  tasksCol: {
    flex: 1,
    minWidth: 0,
  },
});
