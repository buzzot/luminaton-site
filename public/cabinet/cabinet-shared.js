/* Shared cabinet utilities — runs on every cabinet page. */
(async function () {
  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/cabinet/api/logout', { method: 'POST' });
      window.location.href = '/cabinet/';
    });
  }

  // Populate session info and reveal admin link if the user is an admin
  try {
    const res = await fetch('/cabinet/api/session');
    if (res.status === 401) {
      window.location.href = '/cabinet/';
      return;
    }
    const data = await res.json();
    if (data && data.email) {
      const el = document.getElementById('userEmail');
      if (el) el.textContent = data.email;
      if (data.isAdmin) {
        document.querySelectorAll('.admin-only').forEach(n => n.hidden = false);
      }
    }
  } catch (e) {
    // Non-fatal — page may still work for unauth APIs
  }
})();

// Globals other scripts may use
window.Cabinet = {
  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },
  formatDate(iso) {
    try { return new Date(iso).toLocaleString(undefined, { hour12: false }); }
    catch { return iso; }
  },
  formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
  },
  statusBadge(status, labels) {
    const label = (labels && labels[status]) || status;
    return `<span class="status-badge status-${this.escapeHtml(status)}">${this.escapeHtml(label)}</span>`;
  },
};
