import { FirebaseError } from "firebase/app";

export function firebaseErrorMessage(error: unknown, fallback: string) {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case "auth/email-already-in-use": return "An account with this email already exists. Log in instead.";
      case "auth/invalid-credential":
      case "auth/user-not-found":
      case "auth/wrong-password": return "The email or password is incorrect.";
      case "auth/invalid-email": return "Enter a valid email address.";
      case "auth/weak-password": return "Choose a stronger password with at least 8 characters.";
      case "auth/operation-not-allowed": return "This sign-in method is not enabled in Firebase Authentication.";
      case "auth/too-many-requests": return "Too many attempts. Wait a little and try again.";
      case "auth/network-request-failed":
      case "unavailable": return "Firebase is temporarily unreachable. Check your connection and try again.";
      case "auth/popup-closed-by-user": return "The Google sign-in window was closed before sign-in finished.";
      case "auth/popup-blocked": return "Your browser blocked the Google sign-in window. Allow pop-ups and try again.";
      case "auth/account-exists-with-different-credential": return "An account already uses this email. Sign in with its original method.";
      case "auth/unauthorized-domain": return "This website domain is not authorized in Firebase Authentication settings.";
      case "permission-denied":
      case "firestore/permission-denied":
        return "Firestore denied access. Ask the Firebase project owner to publish the rules from firestore.rules to the project used by this site.";
      default: return error.message || fallback;
    }
  }
  return error instanceof Error ? error.message : fallback;
}
