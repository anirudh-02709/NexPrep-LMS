function getToken() {
  return localStorage.getItem('token');
}

function getUser() {
  return JSON.parse(localStorage.getItem('user'));
}

function logout() {
  localStorage.clear();
  window.location.href = '/index.html';
}

function handleUnauthorized() {
  localStorage.clear();
  window.location.href = '/index.html';
}
