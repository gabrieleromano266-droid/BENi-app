/**
 * The one line on the dashboard that talks like a person.
 *
 * "Own your home, not just the keys. Here's your home health summary." was
 * the same sentence for everyone, every day. A real caretaker would glance at
 * the calendar and the list and tell you what matters this month. That is
 * all this does — but it is written from THIS home's data, so it is never the
 * same sentence twice, and it is the first sign that BENi is paying attention.
 *
 * Rules: one season opener, at most two clauses, nothing that needs a chart.
 */
import { TaskRow } from '@/types';

export function timeOfDayGreeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/** Calgary's seasons by month — the same split featureService uses to schedule. */
export function seasonOf(d: Date): Season {
  const m = d.getMonth();
  if (m === 11 || m <= 1) return 'winter';
  if (m <= 4) return 'spring';
  if (m <= 7) return 'summer';
  return 'fall';
}

// Short, because the clauses after it carry the information. These are the
// things a Calgarian actually says about the time of year.
const OPENER: Record<Season, string> = {
  spring: 'The melt is on.',
  summer: 'Long evenings.',
  fall:   'Freeze-up is coming.',
  winter: 'Deep winter.',
};

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function homeBriefing(tasks: TaskRow[], now: Date = new Date()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthName = today.toLocaleDateString(undefined, { month: 'long' });

  const open = tasks.filter((t) => !t.completed_at);
  const dated = open
    .filter((t) => !!t.due_date)
    .map((t) => ({ t, due: new Date(t.due_date + 'T00:00:00') }));

  const overdue = dated.filter((x) => x.due < today).length;
  const dueThisMonth = dated.filter((x) => x.due >= today && x.due <= monthEnd).length;
  const critical = open.filter((t) => t.severity === 'critical').length;

  const parts: string[] = [OPENER[seasonOf(today)]];

  // Overdue beats everything; a safety item beats the calendar. Never both —
  // one instruction at a time is what makes this read as advice, not a report.
  if (overdue > 0) {
    parts.push(`${count(overdue, 'item')} overdue — start there.`);
  } else if (critical > 0) {
    parts.push(`${count(critical, 'safety item')} to deal with first.`);
  }

  if (dueThisMonth > 0) {
    const lead = parts.length > 1 ? `${dueThisMonth} more` : count(dueThisMonth, 'thing');
    parts.push(`${lead} due before the end of ${monthName}.`);
  }

  if (parts.length === 1) {
    parts.push(open.length === 0
      ? 'Nothing on the list. Enjoy it.'
      : 'Nothing due this month — a good time for the slow jobs.');
  }

  return parts.join(' ');
}
