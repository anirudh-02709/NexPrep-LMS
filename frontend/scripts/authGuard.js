function requireAuth() {
  const token = getToken();

  if (!token) {
    handleUnauthorized();
    return false;
  }

  return true;
}

requireAuth();
