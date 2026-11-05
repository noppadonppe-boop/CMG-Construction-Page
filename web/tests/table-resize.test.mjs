import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSlot, newPage, layoutPagesForStore, normalizeLayoutPages, tableColumnWidths, tableRowHeights, resizeTableColumn } from '../src/lib/dcr-layout.ts';
import { materialCoverHtml } from '../src/lib/material-cover-html.ts';
import { DEFAULT_MATERIAL_DOC_SETUP } from '../src/lib/material-doc-setup.ts';
test('column dragging preserves overall width and clamps both neighboring columns', () => {
 const widths = tableColumnWidths([],3);
 for (const delta of [-1000, 12, 1000]) {
  const result=resizeTableColumn(widths,0,delta);
  assert.ok(Math.abs(result.reduce((a,b)=>a+b,0)-100)<0.0001);
  assert.ok(result[0]>=3 && result[1]>=3);
  assert.equal(result[2],widths[2]);
 }
 assert.deepEqual(tableRowHeights([NaN,-2,900],3,6),[6,3,400]);
});
test('table geometry and merged cells persist and render in the cover PDF HTML', () => {
 const slot=newSlot({kind:'table',cells:[['Merged',''],['A','B']],merges:[{r:0,c:0,rs:1,cs:2}],column_widths:[25,75],row_heights:[12,20]});
 const pages=[{...newPage(),slots:[slot]}];
 const restored=normalizeLayoutPages(layoutPagesForStore(pages));
 assert.deepEqual(restored,pages);
 const output=materialCoverHtml({name:'Project',location:null,client:null},{no:'MR-1',created_at:'2026-11-05',description:'Steel',spec:'',unit:'',quantity:1,require_schedule:'',remark:''},{...DEFAULT_MATERIAL_DOC_SETUP,pages:restored},'');
 assert.ok(output.html.includes('width:25%'));
 assert.ok(output.html.includes('height:20mm'));
 assert.ok(output.html.includes('colspan="2"'));
});
