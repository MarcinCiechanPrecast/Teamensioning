// Output tokens dominate cost (about 3.6x the input in live runs), so CI input is capped.
export const DIFF_MAX_CHARS = 120_000;
export const BODY_MAX_CHARS = 2_000;

export interface Truncated {
  text: string;
  truncated: boolean;
  originalLength: number;
}

export function truncate(text: string, max: number): Truncated {
  if (text.length <= max) return { text, truncated: false, originalLength: text.length };
  return { text: text.slice(0, max), truncated: true, originalLength: text.length };
}
