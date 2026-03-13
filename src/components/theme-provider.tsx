"use client";

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes";

/**
 * Wraps the app shell with next-themes so viewer and renderer surfaces share a consistent theme context.
 * Forwards standard `ThemeProviderProps`, including children and theme configuration from the root layout.
 * Runs client-side to avoid hydration mismatches while preserving system-theme defaults.
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
