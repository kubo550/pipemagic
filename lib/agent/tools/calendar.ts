import { z } from "zod";
import {
  listUpcomingEvents,
  getEventDetails,
  createCalendarEvent,
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

export const createEventTool: Tool<{
  summary: string;
  startsAt: string;
  endsAt: string;
  description?: string;
  attendees?: string[];
}> = {
  name: "create_event",
  description:
    "Create an event on the user's primary Google Calendar. Requires the user's approval before it runs — propose the event; it is only written after they confirm.",
  requiresApproval: true,
  schema: z.object({
    summary: z.string().describe("Event title."),
    startsAt: z
      .string()
      .describe("Start, ISO 8601 with timezone offset, e.g. 2026-07-08T15:00:00+02:00."),
    endsAt: z.string().describe("End, ISO 8601 with timezone offset."),
    description: z.string().optional().describe("Optional event description."),
    attendees: z
      .array(z.string())
      .optional()
      .describe("Optional attendee email addresses."),
  }),
  async execute(input, ctx) {
    const event = await createCalendarEvent(ctx.userId, input);
    return event
      ? { created: true, id: event.id, link: event.htmlLink }
      : { error: "No calendar connected." };
  },
};

export const calendarTools = [
  listCalendarEventsTool,
  getEventDetailsTool,
  createEventTool,
];
