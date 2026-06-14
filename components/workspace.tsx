"use client";

import { useState } from "react";
import type { UpcomingEvent } from "@/lib/integrations/google";
import { CalendarWeek } from "@/components/calendar-week";
import { ChatPanel } from "@/components/chat-panel";

/**
 * The authed home: calendar (left) + assistant (right) sharing selection state.
 * Selecting an event lifts it here and feeds it to the chat as context.
 */
export function Workspace({ events }: { events: UpcomingEvent[] }) {
  const [selected, setSelected] = useState<UpcomingEvent | null>(null);

  function onSelect(e: UpcomingEvent) {
    // Toggle: clicking the selected event again clears it.
    setSelected((cur) => (cur?.id === e.id ? null : e));
  }

  return (
    <div className="grid h-[80vh] min-h-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <CalendarWeek
        events={events}
        selectedId={selected?.id ?? null}
        onSelect={onSelect}
      />
      <div className="min-h-0">
        <ChatPanel
          selectedEvent={selected ? { id: selected.id, title: selected.summary } : null}
          onClearEvent={() => setSelected(null)}
        />
      </div>
    </div>
  );
}
