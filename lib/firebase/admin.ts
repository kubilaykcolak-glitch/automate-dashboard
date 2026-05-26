import "server-only";
import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let _adminApp: App | null = null;

export function getFirebaseAdminApp(): App {
  return getAdminApp();
}

function getAdminApp(): App {
  if (_adminApp) return _adminApp;
  const existing = getApps()[0];
  if (existing) {
    _adminApp = existing;
    return existing;
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY."
    );
  }

  const storageBucket =
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.firebasestorage.app`;

  _adminApp = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    storageBucket,
  });
  return _adminApp;
}

export const adminAuth: Auth = new Proxy({} as Auth, {
  get(_t, prop, receiver) {
    return Reflect.get(getAuth(getAdminApp()), prop, receiver);
  },
});

export const adminDb: Firestore = new Proxy({} as Firestore, {
  get(_t, prop, receiver) {
    return Reflect.get(getFirestore(getAdminApp()), prop, receiver);
  },
});
