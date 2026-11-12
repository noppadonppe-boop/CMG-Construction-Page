"use client";

import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/context";
import { projectRef } from "@/lib/db/paths";

type Embed = { html: string; width: number; height: number };
const blank: Embed = { html: "", width: 100, height: 500 };
const refFor = (projectId: string) => doc(projectRef(projectId), "overview_embed", "scurve");

function Frame({ value }: { value: Embed }) {
  let iframeSrc: string | null = null;
  if (typeof DOMParser !== "undefined") {
    const parsed = new DOMParser().parseFromString(value.html, "text/html");
    const children = Array.from(parsed.body.children);
    const frame = children.length === 1 && children[0].tagName === "IFRAME" ? children[0] : null;
    const src = frame?.getAttribute("src");
    try {
      const url = src ? new URL(src) : null;
      if (url && (url.protocol === "https:" || url.protocol === "http:")) iframeSrc = url.href;
    } catch { /* Invalid URLs fall back to the isolated HTML frame. */ }
  }
  return <div className="overflow-auto"><div style={{ width: `${value.width}%`, height: value.height, maxWidth: "100%", position: "relative" }}>
    <iframe title="S-Curve ฝัง HTML" sandbox="allow-scripts" {...(iframeSrc ? { src: iframeSrc } : { srcDoc: value.html })} style={{ width: "100%", height: "100%", border: 0, pointerEvents: "none" }} tabIndex={-1} />
    <div aria-hidden="true" style={{ position: "absolute", inset: 0 }} />
  </div></div>;
}

export function OverviewEmbed({ projectId }: { projectId: string }) {
  const { userProfile } = useAuth();
  const isMaster = userProfile?.status === "approved" && userProfile.role.includes("MasterAdmin");
  const [saved, setSaved] = useState<Embed>(blank);
  const [draft, setDraft] = useState<Embed>(blank);
  const [widthInput, setWidthInput] = useState("100");
  const [heightInput, setHeightInput] = useState("500");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => onSnapshot(refFor(projectId), (snap) => {
    const data = snap.data();
    setSaved(data ? { html: typeof data.html === "string" ? data.html : "", width: Number(data.width) || 100, height: Number(data.height) || 500 } : blank);
    setLoading(false);
  }, () => { setError("ไม่สามารถโหลดข้อมูลที่ฝังได้"); setLoading(false); }), [projectId]);

  async function save() {
    if (!draft.html.trim()) { setError("กรุณาใส่โค้ด HTML"); return; }
    const width = Number(widthInput), height = Number(heightInput);
    if (!Number.isFinite(width) || width < 10 || width > 100 || !Number.isFinite(height) || height < 100 || height > 3000) {
      setError("กรุณาระบุความกว้าง 10–100% และความสูง 100–3000 px"); return;
    }
    setSaving(true); setError("");
    try { await setDoc(refFor(projectId), { ...draft, width, height }); setOpen(false); }
    catch { setError("บันทึกไม่สำเร็จ กรุณาตรวจสอบสิทธิ์และลองอีกครั้ง"); }
    finally { setSaving(false); }
  }

  return <div className="card min-w-0">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="font-semibold">Project Manpower</h3>
      {isMaster && !loading && <button type="button" className="btn" aria-label={saved.html ? "แก้ไขโค้ดฝัง" : "แนบ Code"} onClick={() => { setDraft(saved); setWidthInput(String(saved.width)); setHeightInput(String(saved.height)); setError(""); setOpen(true); }}>{saved.html ? "✎ แก้ไข" : "+ แนบ Code"}</button>}
    </div>
    {loading ? <p className="text-muted">กำลังโหลด...</p> : saved.html ? <Frame value={saved} /> : <p className="py-12 text-center text-muted">ยังไม่มีโค้ดที่ฝัง</p>}
    {!open && error && <p role="alert" className="text-red-600">{error}</p>}
    {open && isMaster && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="embed-title">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-white p-6 shadow-xl">
        <h2 id="embed-title" className="mb-4 text-lg font-semibold">{saved.html ? "แก้ไขการฝัง" : "แนบ Code HTML"}</h2>
        <label className="block text-sm">โค้ด HTML<textarea className="mt-1 min-h-36 w-full rounded border border-gray-300 p-3 font-mono text-sm" value={draft.html} onChange={(e) => setDraft({ ...draft, html: e.target.value })} placeholder="วางโค้ด HTML หรือ iframe ที่นี่" /></label>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <label>ความกว้าง (%) <input type="number" min="10" max="100" className="w-20 rounded border p-1" value={widthInput} onChange={(e) => setWidthInput(e.target.value)} /></label>
          <label>ความสูง (px) <input type="number" min="100" max="3000" className="w-24 rounded border p-1" value={heightInput} onChange={(e) => setHeightInput(e.target.value)} /></label>
        </div>
        {draft.html && <div className="mt-4 overflow-auto rounded border"><Frame value={{ ...draft, width: Math.max(10, Math.min(100, Number(widthInput) || 10)), height: Math.max(100, Math.min(3000, Number(heightInput) || 100)) }} /></div>}
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" className="btn" onClick={() => setOpen(false)} disabled={saving}>ยกเลิก</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "กำลังบันทึก..." : "Save"}</button></div>
      </div>
    </div>}
  </div>;
}
