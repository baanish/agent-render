"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { useThemeController } from "@/components/theme/use-theme-controller";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

/**
 * Provides the chassis theme rocker for switching between hangar-day and night-ops presentation.
 * Uses an optional `className` and the local theme controller, delaying interaction until mount so the control stays hydration-safe.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useThemeController();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => mounted && setTheme(isDark ? "light" : "dark")}
      className={cn("theme-rocker", className)}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Theme toggle loading"}
    >
      {mounted && isDark ? <SunMedium className="h-3.5 w-3.5" /> : <MoonStar className="h-3.5 w-3.5" />}
      <span>{mounted ? (isDark ? "Lt" : "Dk") : "Theme"}</span>
    </button>
  );
}
