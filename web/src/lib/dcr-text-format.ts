export type TextMark = { start: number; end: number; kind: "size" | "color"; value: number | string | null };

export function normalizeTextMarks(value: unknown, length: number): TextMark[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): TextMark[] => {
    if (!entry || typeof entry !== "object") return [];
    const { start, end, kind, value: markValue } = entry as Record<string, unknown>;
    if (!Number.isInteger(start) || !Number.isInteger(end) || (start as number) < 0 || (end as number) > length || (start as number) >= (end as number)) return [];
    if (kind === "size" && (markValue === null || (typeof markValue === "number" && Number.isFinite(markValue) && markValue >= 6 && markValue <= 72))) return [{ start: start as number, end: end as number, kind, value: markValue as number | null }];
    if (kind === "color" && (markValue === null || (typeof markValue === "string" && /^#[0-9a-f]{6}$/i.test(markValue)))) return [{ start: start as number, end: end as number, kind, value: markValue as string | null }];
    return [];
  });
}

/** Preserve formatting on unchanged text around an edit; inserted text inherits the box style. */
export function updateTextMarks(before: string, after: string, marks: TextMark[]): TextMark[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  return marks.flatMap(mark => {
    const parts: TextMark[] = [];
    if (mark.start < prefix) parts.push({ ...mark, end: Math.min(mark.end, prefix) });
    if (mark.end > oldEnd) parts.push({ ...mark, start: Math.max(mark.start, oldEnd) + delta, end: mark.end + delta });
    return parts.filter(part => part.start < part.end);
  });
}

export function textRuns(text: string, marks: TextMark[]) {
  const valid = normalizeTextMarks(marks, text.length);
  const boundaries = [...new Set([0, text.length, ...valid.flatMap(mark => [mark.start, mark.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, i) => {
    const end = boundaries[i + 1];
    let size: number | null = null, color: string | null = null;
    for (const mark of valid) if (mark.start <= start && mark.end >= end) {
      if (mark.kind === "size") size = mark.value as number | null;
      else color = mark.value as string | null;
    }
    return { start, text: text.slice(start, end), size, color };
  });
}
