"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";
import { useThemeController } from "@/components/theme/use-theme-controller";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

/**
 * Header keycap for switching between dark and light chassis modes.
 * Uses the local theme controller to flip the `html.dark` class and delays
 * interaction until mount so the label/icon state stays hydration-safe.
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
      className={cn(
        "artifact-action shell-pill min-w-[8.5rem] justify-center !min-h-[2.25rem] !py-1.5",
        className,
      )}
      aria-pressed={mounted ? isDark : false}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Theme toggle loading"}
    >
      <span className={cn("bench-lamp", isDark && "is-amber")} aria-hidden="true" />
      {mounted && isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      <span>{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</span>
    </button>
  );
}
