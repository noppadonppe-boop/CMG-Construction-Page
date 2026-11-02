import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fromTemplate, layoutPagesForStore, newPage, newSlot, normalizeLayoutPages, placeSlot, toTemplatePages } from "../src/lib/dcr-layout.ts";

test("project template preserves variable placement, binding and style through storage", () => {
  const slot = newSlot({ kind: "text", variable: "A.project_no", x: 12.5, y: 25, w: 35, h: 10, text_font: "tahoma", text_font_size: 18, text_color: "#123456", title: "เลขที่", text: "ข้อความ" });
  const page = { ...newPage("A4", "portrait", 1), slots: [slot] };
  for (const keepText of [true, false]) {
    const saved = layoutPagesForStore(toTemplatePages([page], keepText));
    const restored = fromTemplate(normalizeLayoutPages(saved));
    const result = restored[0].slots[0];
    assert.notEqual(result.id, slot.id);
    assert.deepEqual([result.x, result.y, result.w, result.h], [12.5, 25, 35, 10]);
    assert.equal(result.variable, "A.project_no");
    assert.deepEqual([result.text_font, result.text_font_size, result.text_color], ["tahoma", 18, "#123456"]);
    assert.equal(result.title, keepText ? "เลขที่" : "");
  }
});


test("image and its overflow geometry survive template storage and reuse", () => {
  const image = { path: "project/layout/example.jpg", url: "https://example.test/example.jpg" };
  const slot = placeSlot(newSlot({ kind: "image", image }), { x: -25, y: 20, w: 150, h: 125 });
  const page = { ...newPage(), slots: [slot] };
  const result = fromTemplate(normalizeLayoutPages(layoutPagesForStore(toTemplatePages([page], false))))[0].slots[0];
  assert.deepEqual(result.image, image);
  assert.deepEqual([result.x, result.y, result.w, result.h], [-25, 20, 150, 125]);
});


test("moving and resizing a box retains free positions without grid snapping", () => {
  const result = placeSlot(newSlot({ kind: "text" }), { x: 12.34, y: 24.68, w: 35.78, h: 11.23 });
  assert.deepEqual([result.x, result.y, result.w, result.h], [12.34, 24.68, 35.78, 11.23]);
  const saved = normalizeLayoutPages(layoutPagesForStore([{ ...newPage(), slots: [result] }]));
  assert.deepEqual([saved[0].slots[0].x, saved[0].slots[0].y], [12.34, 24.68]);
});
