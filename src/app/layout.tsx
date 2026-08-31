import type { Metadata } from "next";
import { Manrope, Spline_Sans_Mono, SUSE } from "next/font/google";
import type { ReactNode } from "react";
import { getCanonicalSiteUrl, getMetadataBase } from "@/lib/site/canonical-base";
import "./globals.css";

const display = Manrope({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "variable",
});

const sans = SUSE({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: "variable",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: "variable",
});

const designContract = `<!--
THESIS: A procedural bench instrument puts link creation and artifact handling before promotion; it refuses the marketing-hero landing page.
OWN-WORLD: Charcoal keycaps and engraved hairlines sit on a darker chassis; orange commits, mint confirms, brick alerts, and carbon paper belongs only to generated output.
STORY: The user formats, identifies, loads, compresses, and generates a fragment link, then reads the artifact with its limits visible.
FIRST VIEWPORT: A compact shell header leads directly into the five-step link creator, with indexed samples docked at the right and the commit control in step 05.
FORM: Owner-pinned “Bench Instrument x Carbon Transfer”; seed owner-bench-carbon-20260807.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md
-->`;

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  alternates: {
    canonical: getCanonicalSiteUrl("/"),
  },
  title: "agent-render",
  description: "A static, zero-retention artifact viewer shell for fragment-based markdown, code, diff, CSV, and JSON payloads.",
};

const themeInitScript = `
(() => {
  try {
    const stored = window.localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolved = stored === "dark" || ((stored === null || stored === "system") && prefersDark) ? "dark" : "light";
    document.documentElement.classList.toggle("dark", resolved === "dark");
    document.documentElement.style.colorScheme = resolved;
  } catch {}
})();
`;

/**
 * Root layout for the static shell that installs fonts and the pre-hydration theme class.
 * Accepts `children` from Next.js app routing and keeps the exported shell provider-free.
 * Sets hydration-safe HTML/body structure used by lazy renderer mounts and fallback screens.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={`${display.variable} ${sans.variable} ${mono.variable} antialiased`}>
        <template
          data-design-contract="owner-bench-carbon-20260807"
          dangerouslySetInnerHTML={{ __html: designContract }}
        />
        {children}
      </body>
    </html>
  );
}
