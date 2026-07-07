import { describe, expect, it } from "vitest";
import { retryAttempt, nextRetryKey } from "@/lib/context/repositories/jobs";

describe("scheduled-job retry keys", () => {
  it("treats a plain dedupeKey as attempt 0", () => {
    expect(retryAttempt("post-meeting:evt_123")).toBe(0);
  });

  it("parses the attempt from a retry-suffixed key", () => {
    expect(retryAttempt("post-meeting:evt_123#r2")).toBe(2);
  });

  it("increments the attempt without stacking suffixes", () => {
    const k0 = "post-meeting:evt_123";
    const k1 = nextRetryKey(k0);
    const k2 = nextRetryKey(k1);
    expect(k1).toBe("post-meeting:evt_123#r1");
    expect(k2).toBe("post-meeting:evt_123#r2");
    expect(retryAttempt(k2)).toBe(2);
  });

  it("only treats a trailing #r<n> as a suffix, not '#r' inside the key", () => {
    expect(retryAttempt("deal#r5-thing")).toBe(0);
    expect(nextRetryKey("deal#r5-thing")).toBe("deal#r5-thing#r1");
  });
});
