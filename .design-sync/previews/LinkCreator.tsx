import { useEffect, useRef } from "react";
import { LinkCreator } from "agent-render";

const noop = () => {};

/** Default markdown draft ("Product brief") with the result panel in its empty state. */
export const DraftForm = () => <LinkCreator onPreviewHash={noop} />;

/**
 * Picks the deflate codec, then submits the default draft, exactly as clicks would.
 * Deflate is chosen because "auto" tries the arx codecs, whose brotli-wasm asset
 * cannot be fetched from the static preview server.
 */
export const GeneratedLink = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const deflatePill = Array.from(
      root.querySelectorAll<HTMLButtonElement>(".creator-codec-row button"),
    ).find((button) => button.textContent?.trim() === "deflate");
    deflatePill?.click();
    const timer = setTimeout(() => {
      root.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    }, 50);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div ref={ref}>
      <LinkCreator onPreviewHash={noop} />
    </div>
  );
};
