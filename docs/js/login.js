document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#login');
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');
  const error = document.querySelector('#error');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';

    try {
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          username: username.value.trim(),
          password: password.value
        })
      });
      window.location.href = result.user?.mustChangePassword ? 'change-password.html' : 'index.html';
    } catch (err) {
      error.textContent = err.message || 'Login failed';
    }
  });
});
