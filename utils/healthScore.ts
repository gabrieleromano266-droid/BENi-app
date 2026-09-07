import { SEVERITY_WEIGHTS } from '@/constants/severity';
import { SYSTEM_LABELS, SYSTEMS } from '@/constants/systems';
import { HomeSystem, TaskRow } from '@/types';

export type SystemScore = { system: HomeSystem; label: string; score: number };

/**
 * Home Health Score: each system starts at 100; every open (not completed) task
 * subtracts points based on its severity, floored at 0. A system with no open
 * tasks stays at 100. Overall score is the average across the 6 fixed systems,
 * so an unlisted/unassigned task's system can't be silently ignored from the
 * math (see `unassignedCount`).
 */
export function computeHealthScores(tasks: TaskRow[]): {
  overall: number;
  bySystem: SystemScore[];
  unassignedCount: number;
} {
  const openTasks = tasks.filter((t) => !t.completed_at);

  const bySystem: SystemScore[] = SYSTEMS.map(({ value, label }) => {
    const deduction = openTasks
      .filter((t) => t.system === value && t.severity)
      .reduce((sum, t) => sum + SEVERITY_WEIGHTS[t.severity!], 0);
    return { system: value, label, score: Math.max(0, 100 - deduction) };
  });

  const overall = bySystem.length
    ? Math.round(bySystem.reduce((sum, s) => sum + s.score, 0) / bySystem.length)
    : 100;

  const unassignedCount = openTasks.filter((t) => !t.system || !SYSTEM_LABELS[t.system]).length;

  return { overall, bySystem, unassignedCount };
}

const SEVERITY_ORDER: Record<string, number> = { critical: 0, moderate: 1, minor: 2 };

/**
 * Suggests where to focus first: the lowest-scoring system's highest-severity
 * open task. Returns null once every system is already at a perfect 100.
 */
export function getStartHereSuggestion(
  tasks: TaskRow[],
  bySystem: SystemScore[],
): { title: string; systemLabel: string } | null {
  const lowest = [...bySystem].sort((a, b) => a.score - b.score)[0];
  if (!lowest || lowest.score >= 100) return null;

  const openInSystem = tasks.filter((t) => !t.completed_at && t.system === lowest.system);
  const top = [...openInSystem].sort(
    (a, b) => (SEVERITY_ORDER[a.severity ?? ''] ?? 3) - (SEVERITY_ORDER[b.severity ?? ''] ?? 3),
  )[0];
  if (!top) return null;

  return { title: top.title, systemLabel: lowest.label };
}
