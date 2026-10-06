import type {
  CodecWorkerRequest,
  CodecWorkerResponse,
  CodecWorkerSuccess,
  DecodeWorkerOptions,
  EncodeWorkerOptions,
} from "@/lib/payload/codec-worker-protocol";
import type { EncodedEnvelopeSurfaces } from "@/lib/payload/fragment";
import type { ParsedPayload, PayloadEnvelope } from "@/lib/payload/schema";

const JOB_TIMEOUT_MS = 60_000;
const IDLE_TIMEOUT_MS = 15_000;
const MAX_PENDING_JOBS = 8;

type PendingJob = {
  request: CodecWorkerRequest;
  resolve: (response: CodecWorkerSuccess) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  removeAbortListener: () => void;
};

let worker: Worker | null = null;
let active: PendingJob | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let nextId = 0;
const queue: PendingJob[] = [];

function terminateWorker() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = null;
}

function cleanUpJob(job: PendingJob) {
  clearTimeout(job.timer);
  job.removeAbortListener();
}

function failJob(job: PendingJob, error: Error) {
  if (active === job) {
    // An abort message cannot interrupt synchronous model work. Termination can, and also frees
    // its large typed arrays. Queued work starts in a fresh worker instead of waiting on it.
    active = null;
    terminateWorker();
  } else {
    const index = queue.indexOf(job);
    if (index === -1) return;
    queue.splice(index, 1);
  }
  cleanUpJob(job);
  job.reject(error);
  startNextJob();
}

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL("./codec.worker.ts", import.meta.url), {
    type: "module",
    name: "agent-render-codec",
  });
  worker = created;
  created.onmessage = (event: MessageEvent<CodecWorkerResponse>) => {
    if (worker !== created || !active || event.data.id !== active.request.id) return;
    const job = active;
    const response = event.data;
    if (response.ok && response.operation !== job.request.operation) {
      failJob(job, new Error("The payload worker returned an unexpected response."));
      return;
    }
    active = null;
    cleanUpJob(job);
    if (response.ok) job.resolve(response);
    else job.reject(new Error(response.message));
    startNextJob();
  };
  const fail = () => {
    if (worker !== created) return;
    if (active) failJob(active, new Error("The payload worker could not run. Reload the page and try again."));
    else terminateWorker();
  };
  created.onerror = fail;
  created.onmessageerror = fail;
  return created;
}

function startNextJob() {
  if (active) return;
  clearTimeout(idleTimer);
  const job = queue.shift();
  if (!job) {
    // Model caches are useful for immediate preview/edit operations, but should not occupy tens
    // of megabytes for the rest of a tab's lifetime, especially on lower-memory devices.
    if (worker) idleTimer = setTimeout(terminateWorker, IDLE_TIMEOUT_MS);
    return;
  }
  active = job;
  try {
    getWorker().postMessage(job.request);
  } catch {
    failJob(job, new Error("The payload worker could not start. Reload the page and try again."));
  }
}

function abortError(): Error {
  return new DOMException("Payload processing was cancelled.", "AbortError");
}

function runWorkerJob(request: CodecWorkerRequest, signal?: AbortSignal): Promise<CodecWorkerSuccess> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (queue.length + Number(active !== null) >= MAX_PENDING_JOBS) {
    return Promise.reject(new Error("Too many payload operations are pending. Try again when one finishes."));
  }
  return new Promise((resolve, reject) => {
    const cancel = () => failJob(job, abortError());
    const job: PendingJob = {
      request,
      resolve,
      reject,
      // Bound the entire request, including time spent queued or fetching codec assets.
      timer: setTimeout(() => failJob(job, new Error("Payload processing timed out. Try a smaller artifact.")), JOB_TIMEOUT_MS),
      removeAbortListener: () => signal?.removeEventListener("abort", cancel),
    };
    signal?.addEventListener("abort", cancel, { once: true });
    queue.push(job);
    startNextJob();
  });
}

function canUseWorker() {
  return typeof window !== "undefined" && typeof Worker !== "undefined";
}

/**
 * Encodes both share surfaces in one bounded, serialized browser worker operation. Node and
 * runtimes without Worker retain the direct codec API; a failed worker is never retried on the
 * main thread. Aborting an active operation terminates its worker, including synchronous work.
 */
export async function encodeEnvelopeInBrowser(
  envelope: PayloadEnvelope,
  options: EncodeWorkerOptions = {},
  signal?: AbortSignal,
): Promise<EncodedEnvelopeSurfaces> {
  if (signal?.aborted) throw abortError();
  if (!canUseWorker()) {
    const { encodeEnvelopeSurfacesAsync } = await import("@/lib/payload/fragment");
    if (signal?.aborted) throw abortError();
    return encodeEnvelopeSurfacesAsync(envelope, options);
  }
  const response = await runWorkerJob({ id: ++nextId, operation: "encode", envelope, options }, signal);
  if (response.operation !== "encode") throw new Error("Unexpected payload operation.");
  return response.value;
}

/**
 * Decodes untrusted fragments off the browser main thread, with the same codec and size checks
 * as the direct API. The job can be terminated when navigation makes its result obsolete.
 */
export async function decodeFragmentInBrowser(
  hash: string,
  options?: DecodeWorkerOptions,
  signal?: AbortSignal,
): Promise<ParsedPayload> {
  if (signal?.aborted) throw abortError();
  if (!canUseWorker()) {
    const { decodeFragmentAsync } = await import("@/lib/payload/fragment");
    if (signal?.aborted) throw abortError();
    return decodeFragmentAsync(hash, options);
  }
  const response = await runWorkerJob({ id: ++nextId, operation: "decode", hash, options }, signal);
  if (response.operation !== "decode") throw new Error("Unexpected payload operation.");
  return response.value;
}
