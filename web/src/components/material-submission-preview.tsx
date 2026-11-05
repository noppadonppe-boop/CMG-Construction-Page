"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { materialSubmissionFilename, type SubmissionDocumentRequest } from "@/lib/material-submission-document";
import { materialRequestFieldPages } from "@/lib/material-request-pdf";
import type { SubmissionProject } from "@/lib/material-submission";
import { loadMaterialDocSetup } from "@/lib/db/material-doc-setup";
import { currentUserIdToken } from "@/lib/firebase/client";
import { DEFAULT_MATERIAL_DOC_SETUP, selectMaterialDocProfile, type MaterialDocSetup } from "@/lib/material-doc-setup";
import { LayoutPaper, SlotContent, slotBox } from "@/components/dcr-layout-page";
import { materialCoverVariables } from "@/lib/material-cover-layout";
import { paperMm, type LayoutPage } from "@/lib/dcr-layout";

type PreviewAttachment = { file_name: string; url: string };
// Stable fallback: a `= []` default creates a new array every render and re-triggers effects forever.
const NO_LOCAL_FILES: File[] = [];

export function MaterialSubmissionPreview({ project, request, setup, draft = false, localFiles = NO_LOCAL_FILES, onClose }: { project: SubmissionProject & { id?: string }; request: SubmissionDocumentRequest; setup?: MaterialDocSetup; draft?: boolean; localFiles?: File[]; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [localSetup, setLocalSetup] = useState<MaterialDocSetup | null>(null);
  const [attachments, setAttachments] = useState<PreviewAttachment[]>([]);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useEffect(() => {
    let active = true;
    async function load() {
      setError("");
      try {
        const loaded = setup ?? (project.id ? await loadMaterialDocSetup(project.id) : DEFAULT_MATERIAL_DOC_SETUP);
        const config = selectMaterialDocProfile(loaded, request.document_profile_id);
        if (active) setLocalSetup(config);
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : "โหลดการตั้งค่าเอกสารไม่สำเร็จ");
      }
    }
    void load();
    return () => { active = false; };
  }, [project.id, request.document_profile_id, setup]);
  // Key by content, not reference: callers rebuild `request` (and its files array) on every render.
  const savedFilesKey = JSON.stringify((request.files || []).map((file) => [file.file_name || "ไฟล์แนบ", file.url]));
  useEffect(() => {
    const local = localFiles.map((file) => ({ file_name: file.name, url: URL.createObjectURL(file) }));
    const saved = (JSON.parse(savedFilesKey) as [string, string][]).map(([file_name, url]) => ({ file_name, url }));
    // Object URLs must be created and revoked as a pair inside one effect, so state is set here deliberately.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAttachments([...saved, ...local]);
    return () => local.forEach((file) => URL.revokeObjectURL(file.url));
  }, [localFiles, savedFilesKey]);

  // Setup Doc cover pages → Request Form pages; every page of each attachment follows below.
  const formPages = materialRequestFieldPages(request);
  const coverPages = localSetup?.pages ?? [];
  const pages: { label: string; render: () => ReactNode }[] = [
    ...coverPages.map((page, i) => ({ label: `Cover ${i + 1}`, render: () => <CoverPagePreview project={project} request={request} page={page} /> })),
    ...formPages.map((values, i) => ({ label: `Form ${i + 1}`, render: () => <RequestFormPagePreview values={values} /> })),
  ];

  return (
    <dialog ref={dialog} onClose={onClose} aria-label="ตัวอย่าง Material Approval Request" className="m-auto h-[calc(100dvh-2rem)] w-[min(64rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-surface p-0 text-text backdrop:bg-black/60">
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="min-w-0 flex-1"><h2 className="font-bold">ตัวอย่างเอกสาร {draft ? "(ร่าง)" : ""}</h2><p className="truncate text-xs text-muted">{materialSubmissionFilename(request)}{request.document_profile_name ? ` · โปรไฟล์ ${request.document_profile_name}` : ""}</p></div>
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>ปิดตัวอย่าง</button>
          {error && <p className="w-full text-sm text-bad" role="alert">{error}</p>}
          {localSetup && <p className="w-full text-xs text-muted">Cover Page → Request Form{attachments.length ? ` → ไฟล์แนบ ${attachments.length} ไฟล์ (ทุกหน้า)` : ""} · เลื่อนลงเพื่อดูหน้าถัดไป</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-200 p-3 sm:p-6">
          {!localSetup ? !error && <p className="mx-auto max-w-5xl rounded-lg border border-border bg-white p-4 text-sm text-muted">กำลังโหลด Setup Doc…</p>
            : <div className="space-y-6">
              {pages.map((p) => <section key={p.label} aria-label={p.label}>
                <PageLabel>{p.label}</PageLabel>
                {p.render()}
              </section>)}
              {attachments.map((file, i) => <AttachmentPages key={`${i}-${file.url}`} file={file} index={i + 1} projectId={project.id} />)}
            </div>}
        </div>
      </div>
    </dialog>
  );
}

function PageLabel({ children }: { children: ReactNode }) {
  return <div className="mx-auto mb-1 max-w-[1100px] text-xs font-medium text-slate-600">{children}</div>;
}

/** Load attachment bytes: local picks are blob: URLs; saved Storage files go through the server (bucket CORS blocks the browser). */
async function attachmentBytes(file: PreviewAttachment, projectId?: string): Promise<ArrayBuffer> {
  if (file.url.startsWith("blob:")) return (await fetch(file.url)).arrayBuffer();
  if (!projectId) throw new Error("ไม่มีรหัสโครงการ จึงโหลดไฟล์แนบไม่ได้");
  let response: Response;
  try {
    // Same-origin: next.config.ts rewrites to the mail server in dev; Hosting routes /api/** to the smtpMail Cloud Function.
    response = await fetch("/api/material-attachment", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + await currentUserIdToken() },
      body: JSON.stringify({ projectId, url: file.url }),
    });
  } catch {
    throw new Error("ติดต่อเซิร์ฟเวอร์ไม่ได้");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    // No JSON body = the dev rewrite couldn't reach the backend (e.g. ECONNREFUSED on port 3001).
    throw new Error(body?.error || (process.env.NODE_ENV === "production" ? "โหลดไฟล์แนบไม่สำเร็จ" : "ติดต่อ backend ไม่ได้ — รัน npm run backend:dev ในโฟลเดอร์ web"));
  }
  return response.arrayBuffer();
}

/** Every page of one attachment, stacked like the Cover/Form pages. PDFs are rasterised page-by-page with pdf.js. */
function AttachmentPages({ file, index, projectId }: { file: PreviewAttachment; index: number; projectId?: string }) {
  const isPdf = /\.pdf(?:$|[?#])/i.test(file.file_name) || /\.pdf(?:$|[?#])/i.test(decodeURIComponent(file.url));
  const isImage = /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(file.file_name) || /\.(?:png|jpe?g|webp|gif)(?:$|[?#])/i.test(decodeURIComponent(file.url));
  const [images, setImages] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  useEffect(() => {
    if (!isPdf) return;
    let cancelled = false;
    const urls: string[] = [];
    let destroy: (() => void) | undefined;
    (async () => {
      try {
        const data = new Uint8Array(await attachmentBytes(file, projectId));
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
        const pdf = await pdfjs.getDocument({ data }).promise;
        destroy = () => void pdf.destroy();
        if (cancelled) return destroy();
        setTotal(pdf.numPages);
        for (let n = 1; n <= pdf.numPages && !cancelled; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, 1600 / base.width) }); // ~1600px wide: sharp, bounded memory
          const canvas = document.createElement("canvas");
          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
          page.cleanup();
          if (!blob || cancelled) break;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setImages((current) => [...current, url]);
        }
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "แสดงไฟล์แนบไม่สำเร็จ");
      }
    })();
    return () => { cancelled = true; destroy?.(); urls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [file, isPdf, projectId]);

  const name = `ไฟล์แนบ ${index}: ${file.file_name}`;
  const openLink = <a className="text-primary hover:underline" href={file.url} target="_blank" rel="noreferrer">เปิดไฟล์</a>;
  if (isImage) return <section aria-label={name}>
    <PageLabel>{name} · {openLink}</PageLabel>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <div className="mx-auto w-full max-w-[1100px] bg-white p-4 shadow-lg"><img src={file.url} alt={file.file_name} className="mx-auto max-w-full" /></div>
  </section>;
  if (!isPdf) return <section aria-label={name}><PageLabel>{name} · {openLink}</PageLabel>
    <div className="mx-auto max-w-[1100px] bg-white p-6 text-sm text-slate-600 shadow-lg">แสดงตัวอย่างไฟล์ชนิดนี้ไม่ได้ — กด “เปิดไฟล์” เพื่อดาวน์โหลด</div></section>;
  return <>
    {images.map((src, i) => <section key={src} aria-label={`${name} หน้า ${i + 1}`}>
      <PageLabel>{name} · หน้า {i + 1}/{total} · {openLink}</PageLabel>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={`${file.file_name} หน้า ${i + 1}`} className="mx-auto block w-full max-w-[1100px] bg-white shadow-lg" />
    </section>)}
    {loadError ? <section aria-label={name}><PageLabel>{name} · {openLink}</PageLabel>
      <p className="mx-auto max-w-[1100px] rounded-t-lg border border-red-200 bg-white px-4 py-2 text-xs text-bad">แยกหน้าไม่ได้: {loadError} · แสดงไฟล์ในกรอบแทน</p>
      {/* Fallback: the browser's own PDF viewer needs no CORS, so the file is still viewable. */}
      <iframe title={name} src={`${file.url}#view=FitH`} className="mx-auto block h-[calc(100dvh-16rem)] min-h-[36rem] w-full max-w-[1100px] border-0 bg-white shadow-lg" />
    </section>
      : (!total || images.length < total) && <p className="mx-auto max-w-[1100px] rounded-lg border border-border bg-white p-4 text-sm text-muted">กำลังโหลด {name}{total ? ` (${images.length}/${total} หน้า)` : ""}…</p>}
  </>;
}

/** Request Form page drawn over the template image, using the same field values as the generated PDF. */
function RequestFormPagePreview({ values }: { values: Record<string, string> }) {
  const fieldRects = {
    73: { x: 156.847, y: 465.896, width: 85.8, height: 10.08 },
    74: { x: 590.548, y: 474.932, width: 85.8, height: 10.081 },
    75: { x: 107.753, y: 279.592, width: 620.819, height: 33.163 },
  } as const;
  const columns = [
    { x: 55.2, width: 85.8 }, { x: 142.32, width: 81 }, { x: 224.64, width: 81 },
    { x: 306.96, width: 39.84 }, { x: 348.12, width: 49.92 }, { x: 399.36, width: 81 },
    { x: 481.68, width: 163.32 }, { x: 646.32, width: 81 },
  ];
  const pageHeight = 612;
  const rowTop = 426.72;
  const rowStep = 11.52;
  const rowHeight = 10.08;
  const rectStyle = (rect: { x: number; y: number; width: number; height: number }) => ({
    left: `${rect.x / 792 * 100}%`, top: `${(pageHeight - rect.y - rect.height) / pageHeight * 100}%`,
    width: `${rect.width / 792 * 100}%`, height: `${rect.height / pageHeight * 100}%`,
  });
  const overlay = (key: string, value: string, rect: { x: number; y: number; width: number; height: number }, className = "") => value ? <span key={key} className={`absolute overflow-hidden whitespace-pre-wrap px-[0.25cqw] text-black ${className}`} style={{ ...rectStyle(rect), fontSize: "1.05cqw", lineHeight: 1.05 }}>{value}</span> : null;
  return <div className="mx-auto w-full max-w-[1100px] overflow-hidden bg-white shadow-lg" style={{ aspectRatio: "792 / 612", containerType: "inline-size", backgroundImage: "url('/material-request/request-form-template.png')", backgroundSize: "100% 100%", backgroundRepeat: "no-repeat", position: "relative" }}>
    {Array.from({ length: 9 }, (_, row) => columns.map((column, col) => overlay(`${row}-${col}`, values[`fill_${row * 8 + col + 1}`], { x: column.x, y: rowTop - row * rowStep, width: column.width, height: rowHeight }, col === 0 || col === 3 || col === 4 || col === 5 ? "text-center" : "text-left")))}
    {overlay("73", values.fill_73, fieldRects[73])}
    {overlay("74", values.fill_74, fieldRects[74])}
    {overlay("75", values.fill_75, fieldRects[75])}
  </div>;
}

/** One Setup Doc cover page, rendered with the same layout components as the Setup Doc editor. */
function CoverPagePreview({ project, request, page }: { project: SubmissionProject; request: SubmissionDocumentRequest; page: LayoutPage }) {
  const values = new Map(materialCoverVariables(project, request).map((variable) => [variable.key, variable]));
  return <div className="mx-auto w-full" style={{ maxWidth: paperMm(page.size, page.orientation).w / 420 * 1100 }}>
    <LayoutPaper showHeader={false} page={page} letter="" title="" right="" className="dcr-layout-preview shadow-lg">
      {page.slots.map((slot) => {
        const variable = slot.variable ? values.get(slot.variable) : undefined;
        return <div key={slot.id} style={slotBox({ ...slot, kind: slot.kind })}>
          <SlotContent slot={slot} variableValue={variable?.value} placeholder={variable?.label} />
        </div>;
      })}
    </LayoutPaper>
  </div>;
}
