import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { getCanonicalSiteUrl, getMetadataBase } from "@/lib/site/canonical-base";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
});

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
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
        {children}
      </body>
    </html>
  );
}
