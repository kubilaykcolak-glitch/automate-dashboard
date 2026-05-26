import { getApps, getApp, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

if (!isConfigured) {
  // Throwing at module load is preferable to a silent runtime failure later.
  // If you see this, your NEXT_PUBLIC_FIREBASE_* env vars are missing.
  console.error(
    "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars."
  );
}

// IMPORTANT: we initialise eagerly so the exported `auth`, `db`, and `storage`
// are real instances — not Proxies. The Firestore client SDK does
// `instanceof Firestore` checks on the first argument of collection() / doc(),
// which Proxies fail. (That was the cause of the
// "Expected first argument to collection() to be a CollectionReference..." bug.)
const app: FirebaseApp = isConfigured
  ? getApps().length
    ? getApp()
    : initializeApp(firebaseConfig)
  : // Fall back to a clearly-broken app so module-load doesn't crash — any
    // attempt to use auth/db/storage will throw with a Firebase-native error.
    (null as unknown as FirebaseApp);

export const auth: Auth = app ? getAuth(app) : (null as unknown as Auth);
export const db: Firestore = app
  ? getFirestore(app)
  : (null as unknown as Firestore);
export const storage: FirebaseStorage = app
  ? getStorage(app)
  : (null as unknown as FirebaseStorage);

export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    throw new Error(
      "Firebase client is not configured. Set NEXT_PUBLIC_FIREBASE_* env vars."
    );
  }
  return app;
}
