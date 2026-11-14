const { applicationDefault, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const projectId = "thetrioshop-81199";
const email = process.env.ADMIN_EMAIL;

if (!email) {
  throw new Error("Set ADMIN_EMAIL to the existing Firebase Authentication account.");
}

const app = initializeApp({
  credential: applicationDefault(),
  projectId
});

async function makeAdmin() {
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(email);
  const existingClaims = user.customClaims || {};

  await auth.setCustomUserClaims(user.uid, {
    ...existingClaims,
    admin: true
  });

  console.log(`Admin role assigned to ${email} in project ${projectId}. Sign out and back in to refresh the ID token.`);
}

makeAdmin().catch((error) => {
  console.error("Admin role assignment failed:", error.message);
  process.exitCode = 1;
});
