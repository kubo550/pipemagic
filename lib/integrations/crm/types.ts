/**
 * CRM abstraction. The engine talks to this interface, never to a specific CRM.
 * Pipedrive is the first (and, in Phase 1, only) implementation; a second CRM
 * (HubSpot, …) is purely additive — implement the interface and register it in
 * `index.ts`. Adapters load their own per-user credentials via `userId`, mirror
 * the Google integration (`lib/integrations/google.ts`): slim shapes out, raw
 * CRM payloads never leave the adapter and are never logged.
 */

export interface CrmContact {
  /** CRM-native contact id (string-normalized; Pipedrive person ids are ints). */
  id: string;
  name: string | null;
  email: string;
}

export interface CrmDeal {
  /** CRM-native deal id. Kept numeric: the deal-finder picks the highest id as
   * the newest/most-current deal (the documented Daisy heuristic). */
  id: number;
  title: string;
  stage: string | null;
  status: string | null;
  /** ISO string when the deal was last updated, if the CRM exposes it. */
  updatedAt: string | null;
}

export interface CrmEmailMessage {
  from: string;
  to: string[];
  subject: string | null;
  sentAt: string | null;
  body: string;
}

export interface CrmNote {
  id: string;
  content: string;
  addedAt: string | null;
}

export interface CrmActivity {
  id: string;
  subject: string;
  type: string | null;
  dueAt: string | null;
  done: boolean;
}

export interface CrmAdapter {
  /** Stable provider key, also the `OAuthToken.provider` value. */
  readonly name: string;

  /** Find contacts whose email matches. Empty array if none. */
  searchContactsByEmail(userId: string, email: string): Promise<CrmContact[]>;

  /** Deals linked to a contact. Empty array if none. */
  listDealsForContact(userId: string, contactId: string): Promise<CrmDeal[]>;

  /** Full email history on a deal (provider must include message bodies). */
  getDealEmails(userId: string, dealId: number): Promise<CrmEmailMessage[]>;

  getDealNotes(userId: string, dealId: number): Promise<CrmNote[]>;

  getDealActivities(userId: string, dealId: number): Promise<CrmActivity[]>;
}
