const admin = require('firebase-admin');

const firebaseProjectIdRaw = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmailRaw = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

const firebaseProjectId = firebaseProjectIdRaw ? firebaseProjectIdRaw.trim() : '';
const firebaseClientEmail = firebaseClientEmailRaw ? firebaseClientEmailRaw.trim() : '';
const firebasePrivateKey = firebasePrivateKeyRaw
  ? firebasePrivateKeyRaw.replace(/\\n/g, '\n').trim()
  : '';

const hasFirebaseConfig =
  firebaseProjectId &&
  firebaseProjectId !== 'your_firebase_project_id' &&
  firebaseClientEmail &&
  firebaseClientEmail !== 'your_firebase_client_email' &&
  firebasePrivateKey &&
  firebasePrivateKey !== '-----BEGIN PRIVATE KEY-----\nyour_private_key_here\n-----END PRIVATE KEY-----';

console.log('[Firebase Admin] env values exist:', {
  FIREBASE_PROJECT_ID: Boolean(firebaseProjectId),
  FIREBASE_CLIENT_EMAIL: Boolean(firebaseClientEmail),
  FIREBASE_PRIVATE_KEY: Boolean(firebasePrivateKey),
  privateKeyStartsCorrectly: firebasePrivateKey.startsWith('-----BEGIN PRIVATE KEY-----'),
  privateKeyEndsCorrectly: firebasePrivateKey.endsWith('-----END PRIVATE KEY-----'),
});
console.log('[Firebase Admin] admin.apps.length before init:', admin.apps.length);

if (!admin.apps.length && hasFirebaseConfig) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseProjectId,
        clientEmail: firebaseClientEmail,
        privateKey: firebasePrivateKey,
      }),
    });

    console.log('[Firebase Admin] Initialized successfully.');
    console.log('[Firebase Admin] admin.apps.length after init:', admin.apps.length);
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed.');
    console.error(error);
  }
} else if (!hasFirebaseConfig) {
  console.error('[Firebase Admin] Initialization skipped because config is incomplete.');
  console.error('[Firebase Admin] hasFirebaseConfig:', hasFirebaseConfig);
} else {
  console.log('[Firebase Admin] Already initialized. admin.apps.length:', admin.apps.length);
}

module.exports = {
  admin,
  hasFirebaseConfig,
};
