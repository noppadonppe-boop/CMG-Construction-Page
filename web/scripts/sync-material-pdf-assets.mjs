import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const template = "Request Rebar Materials 01.pdf";
mkdirSync(path.join(root, "public/material-request"), { recursive: true });
copyFileSync(path.join(root, "Form", template), path.join(root, "public/material-request", template));
if (process.argv.includes("--mail")) {
  for (const relative of [`Form/${template}`, "public/material-request/Sarabun-Regular.ttf", "public/material-request/OFL.txt"]) {
    const target = path.join(root, "mail-functions/lib", relative);
    mkdirSync(path.dirname(target), { recursive: true });
    copyFileSync(path.join(root, relative), target);
  }
}
