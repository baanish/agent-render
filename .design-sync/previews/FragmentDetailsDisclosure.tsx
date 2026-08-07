import { useEffect, useRef } from "react";
import { FragmentDetailsDisclosure } from "agent-render";

/** Opens the component's own <details> after mount, exactly as a click would. */
const Open = ({ children }: { children?: unknown }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("details")?.setAttribute("open", "");
  }, []);
  return <div ref={ref}>{children as never}</div>;
};

/** Success state, expanded: codec, budget, and hash preview rows visible. */
export const Decoded = () => (
  <Open>
    <FragmentDetailsDisclosure
      statusLabel="Decoded"
      fragmentLength="1,982"
      maxLength="8,192"
      codec="arx4"
      hashPreview="#e𐊀㮕ヅ𐤈⽂₣ᚔ𝍖ᛞ㹨...𐊕ヸ"
    />
  </Open>
);

/** Decode-failure state, expanded: the viewer promotes this to the top of the page. */
export const DecodeError = () => (
  <Open>
    <FragmentDetailsDisclosure
      statusLabel="Error"
      fragmentLength="204"
      maxLength="8,192"
      codec="plain"
      hashPreview="#p%7B%22v%22%3A1%2C%22codec%22..."
    />
  </Open>
);

/** Default collapsed state, as first seen under an artifact. */
export const Collapsed = () => (
  <FragmentDetailsDisclosure
    statusLabel="Decoded"
    fragmentLength="1,982"
    maxLength="8,192"
    codec="arx4"
    hashPreview="#e𐊀㮕ヅ𐤈⽂₣ᚔ𝍖ᛞ㹨...𐊕ヸ"
  />
);
