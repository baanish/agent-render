/** A dependency-free assertion case shared with the repository's Vitest runner. */
export interface Arx6Check { name: string; run(): void | Promise<void>; }
/** Install the pinned corpus and return the frozen-core conformance cases. */
export function buildChecks(): Promise<Arx6Check[]>;
