import {
  CRITICAL_WEIGHT,
  MINOR_WEIGHT,
  MODERATE_WEIGHT,
  SCORE_FLOOR,
} from '@/constants/severity';
import { SYSTEM_LABELS, SYSTEMS } from '@/constants/systems';
import { HomeSystem, TaskRow } from '@/types';

export type SystemScore = { system: HomeSystem; label: string; score: number };

/**
 * Points a set of open tasks costs one system.
 *
 * Criticals are linear: five safety hazards really are five times as bad as one.
 * Moderate and minor work uses a square root, so the tenth nail-pop costs about
 * 1.5 points instead of the first one's 4 - it piles up, but it saturates.
 */
function deductionFor(tasks: TaskRow[]): number {
  const count = (sev: string) => tasks.filter((t) => t.severity === sev).length;
  return (
    CRITICAL_WEIGHT * count('critical') +
    MODERATE_WEIGHT * Math.sqrt(count('moderate')) +
    MINOR_WEIGHT * Math.sqrt(count('minor'))
  );
}

/**
 * Home Health Score. Each of the six systems starts at 100 and loses points for
 * its open tasks (see deductionFor). Overall is the average across all six, so
 * one bad system cannot hide behind five good ones.
 *
 * Scores floor at SCORE_FLOOR rather than 0 - a zero reads as hopeless and gives
 * the homeowner nothing to move.
 */
export function computeHealthScores(tasks: TaskRow[]): {
  overall: number;
  bySystem: SystemScore[];
  unassignedCount: number;
} {
  const openTasks = tasks.filter((t) => !t.completed_at);

  const bySystem: SystemScore[] = SYSTEMS.map(({ value, label }) => {
    const inSystem = openTasks.filter((t) => t.system === value && t.severity);
    return {
      system: value,
      label,
      score: Math.max(SCORE_FLOOR, Math.round(100 - deductionFor(inSystem))),
    };
  });

  // Tasks the extractor could not categorise used to vanish from this maths
  // entirely - in production that hid FIVE critical garage-door safety findings.
  // They still cost points, spread across the home, so a categorisation miss can
  // never quietly inflate the score.
  const unassigned = openTasks.filter((t) => (!t.system || !SYSTEM_LABELS[t.system]) && t.severity);

  const systemAverage = bySystem.length
    ? bySystem.reduce((sum, s) => sum + s.score, 0) / bySystem.length
    : 100;

  const overall = Math.max(
    SCORE_FLOOR,
    Math.round(systemAverage - deductionFor(unassigned) / (bySystem.length || 1)),
  );

  const unassignedCount = unassigned.length;

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
