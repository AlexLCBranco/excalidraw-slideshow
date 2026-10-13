/** "worldcupboard2026.excalidraw" -> "worldcupboard2026", "scores.xlsx" -> "scores" */
export const displayName = (fileName: string) => fileName.replace(/\.(excalidraw|xlsx)$/i, "");

export function formatSize(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 days ago", "yesterday", "just now". */
export function formatAgo(time: number, now = Date.now()) {
  const seconds = (time - now) / 1000;
  for (const [unit, size] of STEPS) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return "just now";
}
