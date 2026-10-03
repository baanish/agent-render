import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CodecWorkerRequest, CodecWorkerResponse } from "@/lib/payload/codec-worker-protocol";
import type { PayloadEnvelope } from "@/lib/payload/schema";

const envelope: PayloadEnvelope = {
  v: 1,
  codec: "plain",
  artifacts: [{ id: "note", kind: "markdown", content: "# Worker test" }],
};

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<CodecWorkerResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(request: CodecWorkerRequest) => void>();
  terminate = vi.fn();

  constructor(readonly url: URL, readonly options: WorkerOptions) {
    FakeWorker.instances.push(this);
  }

  complete() {
    const request = this.postMessage.mock.lastCall![0];
    const response: CodecWorkerResponse = request.operation === "encode"
      ? { id: request.id, ok: true, operation: "encode", value: { fragmentBody: "dtest", transportFragmentBody: "dtest" } }
      : { id: request.id, ok: true, operation: "decode", value: { ok: false, code: "empty", message: "Empty" } };
    this.onmessage?.({ data: response } as MessageEvent<CodecWorkerResponse>);
  }
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser payload worker", () => {
  it("serializes encode/decode jobs in one worker and releases idle model memory", async () => {
    const { encodeEnvelopeInBrowser, decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const encoded = encodeEnvelopeInBrowser(envelope);
    const decoded = decodeFragmentInBrowser("#dtest");
    const worker = FakeWorker.instances[0];
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker.url.pathname).toMatch(/codec\.worker\.ts$/);
    expect(worker.options.type).toBe("module");
    expect(worker.postMessage).toHaveBeenCalledTimes(1);

    worker.complete();
    await expect(encoded).resolves.toEqual({ fragmentBody: "dtest", transportFragmentBody: "dtest" });
    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    worker.complete();
    await expect(decoded).resolves.toMatchObject({ ok: false, code: "empty" });
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("terminates an active cancelled job, preserves queued jobs, and ignores its stale response", async () => {
    const { encodeEnvelopeInBrowser, decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const controller = new AbortController();
    const encoded = encodeEnvelopeInBrowser(envelope, {}, controller.signal);
    const rejected = expect(encoded).rejects.toMatchObject({ name: "AbortError" });
    const decoded = decodeFragmentInBrowser("#dtest");
    const first = FakeWorker.instances[0];
    controller.abort();
    await rejected;
    expect(first.terminate).toHaveBeenCalledOnce();
    const second = FakeWorker.instances[1];
    first.complete();
    expect(second.terminate).not.toHaveBeenCalled();
    second.complete();
    await expect(decoded).resolves.toMatchObject({ code: "empty" });
  });

  it("cancels queued jobs without disturbing the active operation", async () => {
    const { encodeEnvelopeInBrowser, decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const encoded = encodeEnvelopeInBrowser(envelope);
    const controller = new AbortController();
    const decoded = decodeFragmentInBrowser("#dtest", undefined, controller.signal);
    const rejected = expect(decoded).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
    const worker = FakeWorker.instances[0];
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.complete();
    await encoded;
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it("bounds both queue wait and execution time without retrying work on the main thread", async () => {
    const { encodeEnvelopeInBrowser, decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const encoded = encodeEnvelopeInBrowser(envelope);
    const first = FakeWorker.instances[0];
    const rejectedEncode = expect(encoded).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    const decoded = decodeFragmentInBrowser("#dtest");
    const rejectedDecode = expect(decoded).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(50_000);
    await rejectedEncode;
    expect(first.terminate).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(2);
    // The second job gets only its remaining 10 seconds, not a fresh 60-second run budget.
    await vi.advanceTimersByTimeAsync(10_000);
    await rejectedDecode;
    expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
  });

  it("limits outstanding jobs to prevent an unbounded payload queue", async () => {
    const { encodeEnvelopeInBrowser } = await import("@/lib/payload/browser-codec");
    const controllers = Array.from({ length: 8 }, () => new AbortController());
    const pending = controllers.map((controller) => {
      const promise = encodeEnvelopeInBrowser(envelope, {}, controller.signal);
      return expect(promise).rejects.toMatchObject({ name: "AbortError" });
    });
    await expect(encodeEnvelopeInBrowser(envelope)).rejects.toThrow("Too many payload operations");
    // Remove queued jobs first so cancelling the active one need not start them.
    controllers.reverse().forEach((controller) => controller.abort());
    await Promise.all(pending);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("does not launch an already-aborted operation", async () => {
    const { decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const controller = new AbortController();
    controller.abort();
    await expect(decodeFragmentInBrowser("#dtest", undefined, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(FakeWorker.instances).toHaveLength(0);
  });

  it("rejects worker runtime failures and permits a fresh later operation", async () => {
    const { decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const failed = decodeFragmentInBrowser("#dtest");
    const rejected = expect(failed).rejects.toThrow("could not run");
    FakeWorker.instances[0].onerror?.();
    await rejected;
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const later = decodeFragmentInBrowser("#dtest");
    FakeWorker.instances[1].complete();
    await expect(later).resolves.toMatchObject({ code: "empty" });
  });

  it("discards a worker that fails while idle instead of queuing work on a dead worker", async () => {
    const { decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    const decoded = decodeFragmentInBrowser("#dtest");
    FakeWorker.instances[0].complete();
    await decoded;
    FakeWorker.instances[0].onerror?.();
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const later = decodeFragmentInBrowser("#dtest");
    expect(FakeWorker.instances).toHaveLength(2);
    FakeWorker.instances[1].complete();
    await later;
  });

  it("reports blocked worker construction without trying a main-thread decode", async () => {
    vi.stubGlobal("Worker", class {
      constructor() { throw new DOMException("Blocked by CSP", "SecurityError"); }
    });
    const { decodeFragmentInBrowser } = await import("@/lib/payload/browser-codec");
    await expect(decodeFragmentInBrowser("#dtest")).rejects.toThrow("could not start");
    expect(FakeWorker.instances).toHaveLength(0);
  });
});
