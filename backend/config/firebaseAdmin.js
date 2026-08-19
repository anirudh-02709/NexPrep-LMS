const admin = require('firebase-admin');

const firebaseProjectIdRaw = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmailRaw = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

const firebaseProjectId = firebaseProjectIdRaw ? firebaseProjectIdRaw.trim() : '';
const firebaseClientEmail = firebaseClientEmailRaw ? firebaseClientEmailRaw.trim() : '';
const firebasePrivateKey = firebasePrivateKeyRaw
  ? firebasePrivateKeyRaw.replace(/\\n/g, '\n').trim()
  : '';

const hasFirebaseConfig = Boolean(
  firebaseProjectId &&
  firebaseProjectId !== 'your_firebase_project_id' &&
  firebaseClientEmail &&
  firebaseClientEmail !== 'your_firebase_client_email' &&
  firebasePrivateKey &&
  firebasePrivateKey !== '-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----'
);

if (!admin.apps.length && hasFirebaseConfig) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      }),
    });
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed:', error.message);
  }
}

module.exports = {
  admin,
  hasFirebaseConfig,
};
