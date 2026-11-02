import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeTextMarks, textRuns, updateTextMarks } from "../src/lib/dcr-text-format.ts";
import { fromTemplate, layoutPagesForStore, newPage, newSlot, normalizeLayoutPages, toTemplatePages } from "../src/lib/dcr-layout.ts";

test("selected styles combine independently and survive storage and template reuse", () => {
  const marks = [{ start: 0, end: 5, kind: "size", value: 20 }, { start: 2, end: 5, kind: "color", value: "#ff0000" }];
  const page = { ...newPage(), slots: [newSlot({ kind: "text", text: "hello world", text_marks: marks })] };
  const saved = fromTemplate(normalizeLayoutPages(layoutPagesForStore(toTemplatePages([page], true))))[0].slots[0];
  assert.deepEqual(textRuns(saved.text, saved.text_marks).map(({ text, size, color }) => [text, size, color]), [["he", 20, null], ["llo", 20, "#ff0000"], [" world", null, null]]);
  assert.deepEqual(toTemplatePages([page], false)[0].slots[0].text_marks, []);
  assert.deepEqual(normalizeTextMarks([{ start: 0, end: 100, kind: "color", value: "red" }], 4), []);
});

test("edits preserve formatting of unchanged text and clear new text", () => {
  const marks = [{ start: 0, end: 5, kind: "size", value: 20 }];
  const next = updateTextMarks("hello", "heXXllo", marks);
  assert.deepEqual(textRuns("heXXllo", next).map(({ text, size }) => [text, size]), [["he", 20], ["XX", null], ["llo", 20]]);
});
