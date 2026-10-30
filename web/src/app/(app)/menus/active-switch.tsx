/** สวิตช์ Active / ปิด — วางใน <label> ได้ หรือใช้เดี่ยว ๆ (ให้ส่ง label สำหรับ screen reader) */
export function ActiveSwitch({
  checked,
  onChange,
  disabled,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  const box = (
    <>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} aria-label={label} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-11 flex-none rounded-full bg-border transition peer-checked:bg-ok peer-disabled:opacity-50 after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
      <span className={`w-12 text-sm ${checked ? "text-ok" : "text-muted"}`}>{checked ? "Active" : "ปิด"}</span>
    </>
  );
  return label ? <label className="flex cursor-pointer items-center gap-2">{box}</label> : box;
}
