"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ThemeToggleProps = {
  className?: string;
};

/**
 * Provides the viewer header control for switching between dark and light presentation modes.
 * Uses an optional `className` and next-themes setters to update active theme selection.
 * Delays interaction until mount so icon/label state remains hydration-safe.
 */
export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
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
        "mono-pill shell-pill min-w-[8.5rem] justify-center transition-transform duration-300 hover:-translate-y-0.5",
        className,
      )}
      aria-label={mounted ? `Switch to ${isDark ? "light" : "dark"} theme` : "Theme toggle loading"}
    >
      {mounted && isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      <span>{mounted ? (isDark ? "Light mode" : "Dark mode") : "Theme"}</span>
    </button>
  );
}
