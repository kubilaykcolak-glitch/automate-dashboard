import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as fbSignOut,
  updateProfile,
  onAuthStateChanged,
  sendPasswordResetEmail,
  type User,
  type UserCredential,
} from "firebase/auth";
import { auth } from "./client";

const googleProvider = new GoogleAuthProvider();

async function exchangeIdTokenForSession(user: User): Promise<void> {
  const idToken = await user.getIdToken(true);
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? "Failed to create session.");
  }
}

export async function signUpWithEmail(
  email: string,
  password: string,
  fullName: string
): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (fullName) {
    await updateProfile(cred.user, { displayName: fullName });
  }
  await exchangeIdTokenForSession(cred.user);
  return cred;
}

export async function signInWithEmail(
  email: string,
  password: string
): Promise<UserCredential> {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  await exchangeIdTokenForSession(cred.user);
  return cred;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  const cred = await signInWithPopup(auth, googleProvider);
  await exchangeIdTokenForSession(cred.user);
  return cred;
}

export async function signOut(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", redirect: "manual" });
  } catch {
    // Ignore network errors — we still want client signOut to run.
  }
  await fbSignOut(auth);
}

export function sendResetEmail(email: string): Promise<void> {
  return sendPasswordResetEmail(auth, email);
}

export function onAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
