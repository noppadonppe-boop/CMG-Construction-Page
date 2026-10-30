// build แอปเป็นไฟล์ static ใน out/ สำหรับ Firebase Hosting (web.app): npm run build:static แล้ว firebase deploy --only hosting
import { spawnSync } from "node:child_process";

const { status } = spawnSync("npx", ["next", "build"], { stdio: "inherit", shell: true, env: { ...process.env, STATIC_EXPORT: "1" } });
process.exit(status ?? 1);
