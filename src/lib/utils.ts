type ClassNameValue = string | false | null | undefined;

/**
 * Joins conditional class names into a single class string.
 *
 * Accepts the simple string/falsey pattern used by the viewer components without pulling a
 * Tailwind conflict-resolution runtime into the client bundle.
 *
 * @param inputs - Class name strings or falsey values to omit.
 * @returns A space-separated className string.
 *
 * Failure/fallback: falsey values are ignored, potentially yielding an empty string.
 */
export function cn(...inputs: ClassNameValue[]) {
  let className = "";

  for (const input of inputs) {
    if (!input) {
      continue;
    }

    className = className ? `${className} ${input}` : input;
  }

  return className;
}
