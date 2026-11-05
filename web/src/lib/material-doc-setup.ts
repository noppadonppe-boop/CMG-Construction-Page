import { normalizeLayoutPages, type LayoutPage } from "./dcr-layout";

export interface MaterialDocProfile {
  id: string;
  name: string;
  pages?: LayoutPage[];
  paper: "A4" | "A3" | "Letter";
  orientation: "portrait" | "landscape";
  margin_top: number;
  margin_right: number;
  margin_bottom: number;
  margin_left: number;
  font_size: number;
  title: string;
  company: string;
}

type MaterialDocCore = Omit<MaterialDocProfile, "id" | "name">;

export interface MaterialDocSetup extends MaterialDocCore {
  profiles: MaterialDocProfile[];
}

export const DEFAULT_MATERIAL_DOC_SETUP: MaterialDocSetup = {
  paper: "A4", orientation: "portrait", margin_top: 18, margin_right: 16,
  margin_bottom: 16, margin_left: 16, font_size: 11,
  title: "Cover Page Request Material", company: "CMG Engineering & Construction Co., Ltd.",
  profiles: [],
};

export function normalizeMaterialDocSetup(value: unknown): MaterialDocSetup {
  const v = (value && typeof value === "object" ? value : {}) as Partial<MaterialDocSetup>;
  const normalizeCore = (input: Partial<MaterialDocProfile>, fallback: MaterialDocCore | MaterialDocProfile) => {
    const number = (key: keyof Pick<MaterialDocProfile, "margin_top" | "margin_right" | "margin_bottom" | "margin_left" | "font_size">, min: number, max: number) => {
      const raw = input[key];
      const fallbackValue = fallback[key];
      return typeof raw === "number" && Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : fallbackValue;
    };
    return {
      ...(Array.isArray(input.pages) ? { pages: normalizeLayoutPages(input.pages) } : {}),
      paper: input.paper === "A3" || input.paper === "Letter" ? input.paper : fallback.paper,
      orientation: input.orientation === "landscape" ? "landscape" : fallback.orientation,
      margin_top: number("margin_top", 5, 40), margin_right: number("margin_right", 5, 40),
      margin_bottom: number("margin_bottom", 5, 40), margin_left: number("margin_left", 5, 40),
      font_size: number("font_size", 9, 16),
      title: typeof input.title === "string" && input.title.trim() ? input.title.trim().slice(0, 120) : fallback.title,
      company: typeof input.company === "string" ? input.company.trim().slice(0, 200) : fallback.company,
    };
  };
  const core = normalizeCore(v, DEFAULT_MATERIAL_DOC_SETUP);
  const profiles = Array.isArray(v.profiles)
    ? v.profiles.flatMap((candidate) => {
        if (!candidate || typeof candidate !== "object") return [];
        const profile = candidate as Partial<MaterialDocProfile>;
        const id = typeof profile.id === "string" && profile.id.trim() ? profile.id.trim().slice(0, 120) : "";
        const name = typeof profile.name === "string" && profile.name.trim() ? profile.name.trim().slice(0, 120) : "";
        if (!id || !name) return [];
        return [{ id, name, ...normalizeCore(profile, core) }];
      })
    : [];
  return { ...core, profiles };
}

export function selectMaterialDocProfile(setup: MaterialDocSetup, profileId?: string | null): MaterialDocSetup {
  const profile = profileId ? setup.profiles.find((candidate) => candidate.id === profileId) : undefined;
  return profile ? { ...setup, ...profile, profiles: setup.profiles } : setup;
}
