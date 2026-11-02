import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function getFileCredentialFromEnv() {
  const candidatePaths = [
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim(),
    path.join(process.cwd(), "server", "secrets", "service-account.json"),
    path.join(process.cwd(), "functions", "secrets", "service-account.json"),
  ].filter((value): value is string => Boolean(value));

  const credentialPath = candidatePaths.find((candidate) => fs.existsSync(candidate));
  if (!credentialPath) {
    const configuredPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
    if (configuredPath) throw new Error(`Firebase admin credential file was not found at: ${configuredPath}`);
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(credentialPath, "utf8")) as {
    project_id?: string;
    client_email?: string;
    private_key?: string;
  };
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase admin credential file is missing required fields.");
  }

  return cert({
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key,
  });
}

function initAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  if (process.env.K_SERVICE || process.env.FUNCTION_TARGET) return initializeApp();

  const fileCredential = getFileCredentialFromEnv();
  if (fileCredential) return initializeApp({ credential: fileCredential });

  return initializeApp({
    credential: cert({
      projectId: getRequiredEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: getRequiredEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: getRequiredEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

export function getAdminAuth(): Auth {
  return getAuth(initAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(initAdminApp());
}
