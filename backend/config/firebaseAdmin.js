const admin = require('firebase-admin');

console.log('[Firebase Admin] FIREBASE_PROJECT_ID:', process.env.FIREBASE_PROJECT_ID);

const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
const firebaseClientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const firebasePrivateKey = process.env.FIREBASE_PRIVATE_KEY;

const hasFirebaseConfig =
  firebaseProjectId &&
  firebaseProjectId !== 'your_firebase_project_id' &&
  firebaseClientEmail &&
  firebaseClientEmail !== 'your_firebase_client_email' &&
  firebasePrivateKey;

console.log('[Firebase Admin] Config check:', {
  hasProjectId: Boolean(firebaseProjectId),
  projectIdLength: firebaseProjectId ? firebaseProjectId.length : 0,
  hasClientEmail: Boolean(firebaseClientEmail),
  clientEmailLength: firebaseClientEmail ? firebaseClientEmail.length : 0,
  hasPrivateKey: Boolean(firebasePrivateKey),
  privateKeyLength: firebasePrivateKey ? firebasePrivateKey.length : 0,
  privateKeyFirstChars: firebasePrivateKey ? firebasePrivateKey.trim().slice(0, 30) : '',
  privateKeyLastChars: firebasePrivateKey ? firebasePrivateKey.trim().slice(-30) : '',
  privateKeyStartsCorrectly: firebasePrivateKey
    ? firebasePrivateKey.trim().startsWith('-----BEGIN PRIVATE KEY-----')
    : false,
  privateKeyEndsCorrectly: firebasePrivateKey
    ? firebasePrivateKey.trim().endsWith('-----END PRIVATE KEY-----')
    : false,
  hasFirebaseConfig: Boolean(hasFirebaseConfig),
});

if (!admin.apps.length && hasFirebaseConfig) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: firebaseProjectId.trim(),
        clientEmail: firebaseClientEmail.trim(),
        privateKey: firebasePrivateKey.trim().replace(/\\n/g, '\n'),
      }),
    });

    console.log('[Firebase Admin] Initialized successfully.');
  } catch (error) {
    console.error('[Firebase Admin] Initialization failed.');
    console.error(error);
  }
} else {
  console.error('[Firebase Admin] Initialization skipped because config is incomplete.');
}

module.exports = {
  admin,
  hasFirebaseConfig,
};
