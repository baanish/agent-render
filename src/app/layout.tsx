import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Newsreader, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

/**
 * Newsreader — the editorial serif voice. Used for display-level headlines in dark mode.
 * Italic is the default for display-tier text in "The Sentient Archive" dark theme.
 */
const editorial = Newsreader({
  subsets: ["latin"],
  variable: "--font-editorial",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

/**
 * Space Grotesk — the structural geometric sans. Used for headlines in light mode
 * and as the body workhorse in dark mode.
 */
const headline = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-headline",
  weight: ["400", "500", "600", "700"],
});

/**
 * Inter — the humanist body sans. Used for long-form body text in light mode.
 */
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600"],
});

/**
 * IBM Plex Mono — the machine voice. Used for all metadata, timestamps,
 * technical labels, code snippets, and status indicators across both themes.
 */
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "agent-render",
  description: "A static, zero-retention artifact viewer shell for fragment-based markdown, code, diff, CSV, and JSON payloads.",
};

/**
 * Root layout for the static shell that installs fonts and global theme context for all viewer states.
 * Accepts `children` from Next.js app routing and wraps them with the shared `ThemeProvider`.
 * Sets hydration-safe HTML/body structure used by lazy renderer mounts and fallback screens.
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${editorial.variable} ${headline.variable} ${body.variable} ${mono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
