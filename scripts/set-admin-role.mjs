import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { readFile } from "node:fs/promises";

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
const email = process.env.ADMIN_EMAIL;
if (!serviceAccountPath || !email) {
  throw new Error("Set FIREBASE_SERVICE_ACCOUNT and ADMIN_EMAIL in your local environment.");
}

const serviceAccount = JSON.parse(await readFile(serviceAccountPath, "utf8"));
const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccount) });
const user = await getAuth(app).getUserByEmail(email);
await getAuth(app).setCustomUserClaims(user.uid, { admin: true });
console.log(`Admin role assigned to ${email}. Sign out and back in to refresh the ID token.`);
