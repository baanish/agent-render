import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import { getCanonicalSiteUrl, getMetadataBase } from "@/lib/site/canonical-base";
import "./globals.css";

const display = localFont({
  src: [
    { path: "../fonts/manrope-v20-latin-500.woff2", weight: "500" },
    { path: "../fonts/manrope-v20-latin-600.woff2", weight: "600" },
    { path: "../fonts/manrope-v20-latin-700.woff2", weight: "700" },
    { path: "../fonts/manrope-v20-latin-800.woff2", weight: "800" },
  ],
  variable: "--font-display",
});

const sans = localFont({
  src: [
    { path: "../fonts/suse-v4-latin-500.woff2", weight: "500" },
    { path: "../fonts/suse-v4-latin-600.woff2", weight: "600" },
    { path: "../fonts/suse-v4-latin-700.woff2", weight: "700" },
  ],
  variable: "--font-sans",
});

const mono = localFont({
  src: [
    { path: "../fonts/spline-sans-mono-v13-latin-500.woff2", weight: "500" },
    { path: "../fonts/spline-sans-mono-v13-latin-600.woff2", weight: "600" },
  ],
  variable: "--font-mono",
});

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
 * Root layout for the static shell. Fonts are now self-hosted woff2 bundles in src/fonts/
 * so dev doesn't block on font.googleapis.com, and typography tokens render immediately.
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
        {children}
      </body>
    </html>
  );
}
