import { describe, expect, it, vi } from "vitest";

// loadArxDictionary() resolves -1 on a transient fetch/parse failure (it does not reject). The
// ensure-helper must treat that as a failure and clear its cached promise, so a later decode retries
// the load instead of reusing a poisoned no-op promise for the page's lifetime.
const { loadArxDictionaryMock } = vi.hoisted(() => ({ loadArxDictionaryMock: vi.fn() }));

vi.mock("@/lib/payload/arx-codec", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payload/arx-codec")>();
  return {
    ...actual,
    isExternalDictionaryLoaded: () => false, // force the fetch path so the cached promise is exercised
    loadArxDictionary: loadArxDictionaryMock,
  };
});

const { decodeFragmentAsync } = await import("@/lib/payload/fragment");

describe("arx dictionary load retry", () => {
  it("retries after a transient (-1) load failure instead of caching it for the page lifetime", async () => {
    loadArxDictionaryMock.mockResolvedValueOnce(-1); // transient failure
    const first = await decodeFragmentAsync("#bAAAA", { skipFragmentBudget: true });
    expect(first.ok).toBe(false);
    expect(loadArxDictionaryMock).toHaveBeenCalledTimes(1);

    // Endpoint recovers: the next decode must attempt the load again, not reuse a poisoned promise.
    loadArxDictionaryMock.mockResolvedValueOnce(1);
    await decodeFragmentAsync("#bAAAA", { skipFragmentBudget: true });
    expect(loadArxDictionaryMock).toHaveBeenCalledTimes(2);
  });
});
