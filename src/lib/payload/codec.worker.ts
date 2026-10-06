import { decodeFragmentAsync, encodeEnvelopeSurfacesAsync } from "@/lib/payload/fragment";
import type { CodecWorkerRequest, CodecWorkerResponse } from "@/lib/payload/codec-worker-protocol";

// The client posts only one request at a time. Keep serialization here too, because the codecs
// share lazy dictionary/model state and an async asset fetch must not admit a second model.
let pending = Promise.resolve();
self.onmessage = (event: MessageEvent<CodecWorkerRequest>) => {
  pending = pending.then(async () => {
    const request = event.data;
    let response: CodecWorkerResponse;
    try {
      response = request.operation === "encode"
        ? {
            id: request.id,
            ok: true,
            operation: "encode",
            value: await encodeEnvelopeSurfacesAsync(request.envelope, request.options),
          }
        : {
            id: request.id,
            ok: true,
            operation: "decode",
            value: await decodeFragmentAsync(request.hash, request.options),
          };
    } catch (error) {
      response = {
        id: request.id,
        ok: false,
        message: error instanceof Error ? error.message : "The payload could not be processed.",
      };
    }
    self.postMessage(response);
  });
};
