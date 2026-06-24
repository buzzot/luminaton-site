/* Customer "My Inquiries" page */

(async function () {
  // success flash from ?ok=1 redirect
  const params = new URLSearchParams(window.location.search);
  if (params.get('ok') === '1') {
    document.getElementById('successFlash').hidden = false;
  }

  const container = document.getElementById('inquiriesContainer');
  const loading = document.getElementById('loadingMsg');

  try {
    const res = await fetch('/cabinet/api/inquiries');
    if (res.status === 401) { window.location.href = '/cabinet/'; return; }
    const data = await res.json();
    const items = data.items || [];
    const labels = data.statusLabels || {};

    if (loading) loading.remove();

    if (items.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p><strong>No inquiries yet.</strong></p>
          <p>When you submit one, you'll see its status here.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="inquiry-table-wrapper">
        <table class="inquiry-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Attachments</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${items.map(i => `
              <tr>
                <td class="nowrap muted">${Cabinet.escapeHtml(Cabinet.formatDate(i.createdAt))}</td>
                <td><a href="/cabinet/inquiries/${Cabinet.escapeHtml(i.id)}">${Cabinet.escapeHtml(i.projectName)}</a></td>
                <td>${(i.attachments || []).length}</td>
                <td>${Cabinet.statusBadge(i.status, labels)}</td>
                <td class="nowrap"><a href="/cabinet/inquiries/${Cabinet.escapeHtml(i.id)}">View →</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Could not load inquiries. Please refresh.</div>';
  }
})();
