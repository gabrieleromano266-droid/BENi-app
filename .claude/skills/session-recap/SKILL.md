---
name: session-recap
description: Write the end-of-session BENi coding recap. Use when Gabriele says we're wrapping up, calling it a day, finishing the session, or asks for the session document/recap/summary. Produces a dated one-pager in "Coding Sessions Complete" covering what changed, why, and exactly where in the code to look.
---

# BENi session recap

Gabriele is a non-developer learning to build BENi. These recaps are his study
notes and his QA trail - he reads them to understand what changed and to go
check the code himself. Write for someone smart who is still learning to read
code, not for another engineer.

## Where it goes

Folder: `BENi/Repository Coding/Coding Sessions Complete/`
Filename: `YYYY-MM-DD Session Recap.md` using today's real date (check it, don't guess).

## How to gather the facts - do NOT write from memory

Reconstruct the session from evidence so the recap is accurate:

1. `git log --oneline --since="1 day ago"` - the commits actually made.
2. `git show --stat <sha>` for each - the real files and line counts.
3. For DB changes: `list_migrations` / `list_tables` on the Supabase project
   (`kahvzvbrgwgscdwbszcw`), plus row counts for anything seeded.
4. For Edge Function behaviour: query `function_logs` for before/after numbers
   (task counts, prompt tokens, catalog match rates).

Every number in the recap must come from one of those. If something was not
verified, say so plainly rather than implying it works.

## Structure

```markdown
# BENi Coding Session - <Weekday>, <Month D, YYYY>

## In one line
<What today actually achieved.>

## The numbers
| Metric | Before | After |
(Only real, measured values.)

## What we changed and why

### 1. <Plain-English title>
**The problem:** <what was broken, in plain language>
**Why it happened:** <root cause - this is the teaching part>
**What I changed:** <the fix>
**Where to look:**
- `path/to/file.ts:123` - <what to look at there>

(Repeat per meaningful change. Order by importance, not chronology.)

## Things I got wrong
<Bugs introduced and fixed, or claims corrected. Be honest - this is how he
learns to catch mistakes, and it keeps the record trustworthy.>

## Still open
<Queued items, with enough context to pick them up cold.>

## Try it yourself
<Concrete steps to see today's work in the running app.>
```

## Rules

- **Cite `file:line`** for every change so he can open it and read the real code.
- **Explain the "why" before the "what".** The root cause is the lesson.
- Plain language. If a term is unavoidable (RLS, recall, token), define it once.
- **Include mistakes.** A recap that only lists wins teaches nothing.
- Roughly one page. Link to code rather than pasting large blocks; short
  snippets (a few lines) are fine when they make the point.
- Never claim something is verified unless it was - name the check used.
