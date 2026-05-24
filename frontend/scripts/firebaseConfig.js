window.firebaseConfig = {
  // Firebase Web API key from project settings.
  apiKey: "AIzaSyBhrmXIkpzvHJZxrXCQDmoBbTYiXx6fdWk",
  // Firebase Auth domain, usually: your-project-id.firebaseapp.com
  authDomain: "nexprep-b1140.firebaseapp.com",
  // Firebase project id.
  projectId: "nexprep-b1140",
  // Firebase web app id.
  appId: "1:371484765166:web:1aee4776067fe5a032bcff",
};

if (!firebase.apps.length) {
  firebase.initializeApp(window.firebaseConfig);
}
