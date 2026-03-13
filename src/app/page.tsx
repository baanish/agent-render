import { ViewerShell } from "@/components/viewer-shell";

/**
 * Entry page for the exported shell, routing users into the fragment-aware viewer workflow.
 * It renders `ViewerShell` with no props because artifact state is derived from URL fragment parsing.
 * Keeps page composition minimal so renderer loading and fallback logic stay inside the shell.
 */
export default function HomePage() {
  return <ViewerShell />;
}
