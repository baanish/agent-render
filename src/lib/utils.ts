import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges conditional class values into a single Tailwind-aware class string.
 *
 * Combines `clsx` for variadic/conditional normalization with `tailwind-merge` conflict
 * resolution so later utilities override earlier conflicting Tailwind classes.
 *
 * @param inputs - Class values accepted by `clsx` (strings, arrays, objects, booleans, etc.).
 * @returns A merged className string with Tailwind conflicts deduplicated.
 *
 * Failure/fallback: invalid values are ignored by `clsx`, potentially yielding an empty string.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
