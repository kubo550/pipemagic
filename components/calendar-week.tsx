"use client";

import type { UpcomingEvent } from "@/lib/integrations/google";

/**
 * A 7-day "schedule" calendar (Google Calendar's agenda view): events grouped
 * by day, newest first. Clicking a card selects the event so it can be pulled
 * into the assistant's context.
 */

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function dayLabel(d: Date): string {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (dayKey(d) === dayKey(today)) return "Today";
  if (dayKey(d) === dayKey(tomorrow)) return "Tomorrow";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}

function time(start: string | null): string {
  if (!start) return "";
  const d = new Date(start);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

interface DayGroup {
  key: string;
  label: string;
  events: UpcomingEvent[];
}

function groupByDay(events: UpcomingEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const e of events) {
    if (!e.start) continue;
    const d = new Date(e.start);
    if (Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    if (!groups.has(key)) {
      groups.set(key, { key, label: dayLabel(d), events: [] });
    }
    groups.get(key)!.events.push(e);
  }
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function CalendarWeek({
  events,
  selectedId,
  onSelect,
}: {
  events: UpcomingEvent[];
  selectedId: string | null;
  onSelect: (e: UpcomingEvent) => void;
}) {
  const groups = groupByDay(events);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <h2 className="text-sm font-medium text-zinc-500">Next 7 days</h2>

      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">No events in the next 7 days.</p>
      ) : (
        <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-2">
              <div className="sticky top-0 bg-background/95 py-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 backdrop-blur">
                {g.label}
              </div>
              {g.events.map((e) => {
                const selected = e.id === selectedId;
                return (
                  <button
                    key={e.id}
                    onClick={() => onSelect(e)}
                    className={`flex flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? "border-zinc-900 ring-1 ring-zinc-900 dark:border-zinc-100 dark:ring-zinc-100"
                        : "border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/50"
                    }`}
                  >
                    <span className="font-medium">{e.summary}</span>
                    <span className="text-xs text-zinc-500">
                      {time(e.start)}
                      {time(e.end) && `–${time(e.end)}`}
                      {e.attendeeCount > 0 && ` · ${e.attendeeCount} attendees`}
                      {e.organizerDomain && ` · ${e.organizerDomain}`}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
