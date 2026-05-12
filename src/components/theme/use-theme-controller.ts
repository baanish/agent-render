"use client";

import { useCallback, useEffect, useState } from "react";

export type ResolvedTheme = "light" | "dark";
export type ThemePreference = ResolvedTheme | "system";

type ThemeSnapshot = {
  preference: ThemePreference;
  resolvedTheme: ResolvedTheme;
};

const THEME_STORAGE_KEY = "theme";
const THEME_CHANGE_EVENT = "agent-render-theme-change";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function getStoredPreference(): ThemePreference {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return "light";
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolvePreference(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

function readThemeSnapshot(): ThemeSnapshot {
  const preference = getStoredPreference();
  return {
    preference,
    resolvedTheme: resolvePreference(preference),
  };
}

function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  document.documentElement.style.colorScheme = resolvedTheme;
}

function applyPreference(preference: ThemePreference): ThemeSnapshot {
  const snapshot = {
    preference,
    resolvedTheme: resolvePreference(preference),
  };

  applyResolvedTheme(snapshot.resolvedTheme);
  return snapshot;
}

function snapshotEquals(left: ThemeSnapshot, right: ThemeSnapshot): boolean {
  return left.preference === right.preference && left.resolvedTheme === right.resolvedTheme;
}

/**
 * Reads and writes the shell theme using the static app's `theme` localStorage contract.
 * Keeps the `html.dark` class synchronized with system preference, cross-tab storage changes,
 * and local toggle clicks without installing an app-wide client provider.
 */
export function useThemeController() {
  const [snapshot, setSnapshot] = useState<ThemeSnapshot>(() => readThemeSnapshot());

  useEffect(() => {
    const syncTheme = () => {
      setSnapshot((current) => {
        const next = applyPreference(getStoredPreference());
        return snapshotEquals(current, next) ? current : next;
      });
    };

    syncTheme();

    const mediaQuery = window.matchMedia?.(THEME_MEDIA_QUERY);
    const handleStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) {
        syncTheme();
      }
    };

    window.addEventListener(THEME_CHANGE_EVENT, syncTheme);
    window.addEventListener("storage", handleStorage);
    mediaQuery?.addEventListener("change", syncTheme);

    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, syncTheme);
      window.removeEventListener("storage", handleStorage);
      mediaQuery?.removeEventListener("change", syncTheme);
    };
  }, []);

  const setTheme = useCallback((preference: ThemePreference) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Theme changes should remain best-effort in private or locked-down browsing modes.
    }

    setSnapshot(applyPreference(preference));
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }, []);

  return {
    preference: snapshot.preference,
    resolvedTheme: snapshot.resolvedTheme,
    setTheme,
  };
}

/**
 * Subscribes renderers to the resolved light/dark theme without exposing write controls.
 * Renderer chunks use this to rebuild theme-sensitive third-party surfaces after a toggle.
 */
export function useResolvedTheme() {
  return useThemeController().resolvedTheme;
}
