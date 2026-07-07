import { describe, expect, it } from "vitest";
import { findDeal } from "@/lib/agent/tools/crm";
import type {
  CrmAdapter,
  CrmContact,
  CrmDeal,
} from "@/lib/integrations/crm/types";

// A scriptable CRM adapter: email → contacts, contactId → deals. Unused methods
// throw so the test fails loudly if find_deal touches them.
function fakeAdapter(opts: {
  contactsByEmail: Record<string, CrmContact[]>;
  dealsByContact: Record<string, CrmDeal[]>;
  failSearchFor?: Set<string>;
  failDealsFor?: Set<string>;
}): CrmAdapter {
  return {
    name: "fake",
    async searchContactsByEmail(_userId, email) {
      if (opts.failSearchFor?.has(email)) throw new Error("search boom");
      return opts.contactsByEmail[email] ?? [];
    },
    async listDealsForContact(_userId, contactId) {
      if (opts.failDealsFor?.has(contactId)) throw new Error("deals boom");
      return opts.dealsByContact[contactId] ?? [];
    },
    async getDealEmails() {
      throw new Error("not used");
    },
    async getDealNotes() {
      throw new Error("not used");
    },
    async getDealActivities() {
      throw new Error("not used");
    },
  };
}

const deal = (id: number): CrmDeal => ({
  id,
  title: `Deal ${id}`,
  stage: null,
  status: "open",
  updatedAt: null,
});
const contact = (id: string, email: string): CrmContact => ({ id, name: id, email });

describe("findDeal", () => {
  it("picks the highest deal id as the most-current deal", async () => {
    const adapter = fakeAdapter({
      contactsByEmail: { "buyer@acme.com": [contact("c1", "buyer@acme.com")] },
      dealsByContact: { c1: [deal(10), deal(42), deal(7)] },
    });
    const res = await findDeal(adapter, "u1", ["buyer@acme.com"], ["talkie.ai"]);
    expect(res.dealId).toBe(42);
    expect(res.candidates).toBe(3);
    expect(res.checkedEmails).toBe(1);
  });

  it("excludes own-domain attendees (incl. subdomains, case-insensitive)", async () => {
    const adapter = fakeAdapter({
      contactsByEmail: {
        "buyer@acme.com": [contact("c1", "buyer@acme.com")],
      },
      dealsByContact: { c1: [deal(5)] },
    });
    const res = await findDeal(
      adapter,
      "u1",
      ["Rep@Talkie.ai", "sdr@eu.talkie.ai", "buyer@acme.com"],
      ["talkie.ai"],
    );
    // Only the external buyer was looked up.
    expect(res.checkedEmails).toBe(1);
    expect(res.dealId).toBe(5);
  });

  it("aggregates and dedupes deals across multiple external contacts", async () => {
    const adapter = fakeAdapter({
      contactsByEmail: {
        "a@acme.com": [contact("c1", "a@acme.com")],
        "b@acme.com": [contact("c2", "b@acme.com")],
      },
      dealsByContact: { c1: [deal(8), deal(20)], c2: [deal(20), deal(3)] },
    });
    const res = await findDeal(adapter, "u1", ["a@acme.com", "b@acme.com"], []);
    expect(res.dealId).toBe(20);
    expect(res.candidates).toBe(3); // 8, 20, 3 — 20 not double-counted
  });

  it("returns null when no external attendee has a deal", async () => {
    const adapter = fakeAdapter({ contactsByEmail: {}, dealsByContact: {} });
    const res = await findDeal(adapter, "u1", ["nobody@acme.com"], []);
    expect(res.dealId).toBeNull();
    expect(res.candidates).toBe(0);
  });

  it("isolates a failing lookup and still checks the rest", async () => {
    const adapter = fakeAdapter({
      contactsByEmail: {
        "boom@acme.com": [contact("c1", "boom@acme.com")],
        "ok@acme.com": [contact("c2", "ok@acme.com")],
      },
      dealsByContact: { c1: [deal(99)], c2: [deal(11)] },
      failSearchFor: new Set(["boom@acme.com"]),
    });
    const res = await findDeal(
      adapter,
      "u1",
      ["boom@acme.com", "ok@acme.com"],
      [],
    );
    // boom@ search threw; ok@ still resolved.
    expect(res.dealId).toBe(11);
    expect(res.checkedEmails).toBe(2);
  });
});
