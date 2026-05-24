const user = getUser();
if (user) {
  document.getElementById('welcome-msg').textContent = 'Welcome back, ' + user.name + '!';
}
