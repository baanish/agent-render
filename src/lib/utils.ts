import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Public API for `cn`. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
