import { z } from "zod";
import {
  listUpcomingEvents,
  getEventDetails,
} from "@/lib/integrations/google";
import type { Tool } from "@/lib/agent/tools/types";

/**
 * The two Phase-2 calendar tools (PRD §5.1). Pure server functions over the
 * RunContext — they load the authed Google client themselves via ctx.userId.
 * Read-only, so neither requires approval.
 */

export const listCalendarEventsTool: Tool<{ maxResults?: number }> = {
  name: "list_calendar_events",
  description:
    "List the user's upcoming calendar events (id, title, time, attendee count, organizer domain). Use this to find which meetings are coming up.",
  schema: z.object({
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("How many upcoming events to return (default 10)."),
  }),
  async execute(input, ctx) {
    return listUpcomingEvents(ctx.userId, { maxResults: input.maxResults });
  },
};

export const getEventDetailsTool: Tool<{ eventId: string }> = {
  name: "get_event_details",
  description:
    "Get full details for one calendar event by id: title, time, location, description, and attendee domains. Use after list_calendar_events to dig into a specific meeting.",
  schema: z.object({
    eventId: z.string().describe("The event id from list_calendar_events."),
  }),
  async execute(input, ctx) {
    const details = await getEventDetails(ctx.userId, input.eventId);
    return details ?? { error: "Event not found." };
  },
};

export const calendarTools = [listCalendarEventsTool, getEventDetailsTool];
