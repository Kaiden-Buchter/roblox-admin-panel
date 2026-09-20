document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('#change-password');
  const error = document.querySelector('#error');

  form.addEventListener('submit', async event => {
    event.preventDefault();
    error.textContent = '';

    const currentPassword = document.querySelector('#currentPassword').value;
    const newPassword = document.querySelector('#newPassword').value;
    const confirmPassword = document.querySelector('#confirmPassword').value;

    if (newPassword.length < 8) {
      error.textContent = 'Your new password must be at least 8 characters.';
      return;
    }

    if (newPassword !== confirmPassword) {
      error.textContent = 'The new passwords do not match.';
      return;
    }

    try {
      await api('/api/admin/profile', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      window.location.href = 'index.html';
    } catch (err) {
      error.textContent = err.message || 'Could not update password';
    }
  });
});
