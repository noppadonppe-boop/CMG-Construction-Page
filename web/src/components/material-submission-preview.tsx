"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildMaterialSubmissionDocument, materialSubmissionFilename, type SubmissionDocumentRequest } from "@/lib/material-submission-document";
import type { SubmissionProject } from "@/lib/material-submission";

export function MaterialSubmissionPreview({ project, request, draft = false, onClose }: { project: SubmissionProject; request: SubmissionDocumentRequest; draft?: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const html = useMemo(() => buildMaterialSubmissionDocument(project, request, draft), [project, request, draft]);
  useEffect(() => { dialog.current?.showModal(); }, []);

  async function print() {
    const target = frame.current?.contentWindow;
    if (!target || !ready) return;
    setError("");
    try {
      await target.document.fonts.ready;
      target.focus();
      target.print();
    } catch {
      setError("เปิดหน้าต่างพิมพ์ไม่สำเร็จ กรุณาลองอีกครั้งใน Chrome หรือ Edge");
    }
  }

  return (
    <dialog ref={dialog} onClose={onClose} aria-label="ตัวอย่าง Material Approval Request" className="m-auto h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1"><h2 className="font-bold">ตัวอย่างเอกสาร {draft ? "(ร่าง)" : ""}</h2><p className="truncate text-xs text-muted">{materialSubmissionFilename(request)}.pdf</p></div>
          <button type="button" className="btn btn-primary" disabled={!ready} onClick={print}>พิมพ์ / บันทึก PDF</button>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>ปิดตัวอย่าง</button>
          <p className="w-full text-xs text-muted">เลือก Save as PDF / บันทึกเป็น PDF ขนาด A4 และปิด Headers and footers ในหน้าต่างพิมพ์ · ไม่รวมเนื้อหาไฟล์แนบ</p>
          {error && <p className="w-full text-sm text-bad" role="alert">{error}</p>}
        </div>
        <iframe ref={frame} title="Material Approval Request PDF preview" sandbox="allow-same-origin allow-modals" srcDoc={html} onLoad={() => setReady(true)} className="min-h-0 w-full flex-1 border-0 bg-slate-200" />
      </div>
    </dialog>
  );
}
