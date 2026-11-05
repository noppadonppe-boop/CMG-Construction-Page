"use client";

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { projectRef } from "./paths";
import { normalizeMaterialDocSetup, type MaterialDocSetup } from "../material-doc-setup";
import { layoutPagesForStore } from "../dcr-layout";

const setupRef = (projectId: string) => doc(projectRef(projectId), "document_setup", "material");
export async function loadMaterialDocSetup(projectId: string) {
  return normalizeMaterialDocSetup((await getDoc(setupRef(projectId))).data());
}
export async function saveMaterialDocSetup(projectId: string, setup: MaterialDocSetup) {
  const value = normalizeMaterialDocSetup(setup);
  await setDoc(setupRef(projectId), {
    ...value,
    ...(value.pages ? { pages: layoutPagesForStore(value.pages) } : {}),
    profiles: value.profiles.map((profile) => ({
      ...profile,
      ...(profile.pages ? { pages: layoutPagesForStore(profile.pages) } : {}),
    })),
    updated_at: serverTimestamp(),
  });
}

