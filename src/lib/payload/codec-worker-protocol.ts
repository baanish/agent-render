import type {
  decodeFragmentAsync,
  encodeEnvelopeSurfacesAsync,
  EncodedEnvelopeSurfaces,
} from "@/lib/payload/fragment";
import type { ParsedPayload, PayloadEnvelope } from "@/lib/payload/schema";

export type EncodeWorkerOptions = NonNullable<Parameters<typeof encodeEnvelopeSurfacesAsync>[1]>;
export type DecodeWorkerOptions = NonNullable<Parameters<typeof decodeFragmentAsync>[1]>;

export type CodecWorkerRequest = { id: number } & (
  | { operation: "encode"; envelope: PayloadEnvelope; options: EncodeWorkerOptions }
  | { operation: "decode"; hash: string; options?: DecodeWorkerOptions }
);

export type CodecWorkerSuccess =
  | { id: number; ok: true; operation: "encode"; value: EncodedEnvelopeSurfaces }
  | { id: number; ok: true; operation: "decode"; value: ParsedPayload };

export type CodecWorkerResponse = CodecWorkerSuccess | {
  id: number;
  ok: false;
  message: string;
};
