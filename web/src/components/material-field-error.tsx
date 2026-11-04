import type { MaterialFieldErrors } from "@/lib/material-submission";

const errorId = (name: string) => `material-error-${name.replaceAll(".", "-")}`;

export function materialFieldProps(name: string, errors: MaterialFieldErrors) {
  return {
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? errorId(name) : undefined,
    "data-material-field": name,
  } as const;
}

export function MaterialFieldError({ name, errors }: { name: string; errors: MaterialFieldErrors }) {
  return errors[name] ? <span id={errorId(name)} className="mt-1 block text-xs text-bad">{errors[name]}</span> : null;
}

/** Run after React applies errors so focus and scrolling land on the first invalid input. */
export function focusMaterialError(dialog: HTMLDialogElement | null) {
  requestAnimationFrame(() => {
    const target = dialog?.querySelector<HTMLElement>('[aria-invalid="true"], [data-form-alert]');
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}
