/* Admin panel — list, search, filter, change status */

(async function () {
  const container = document.getElementById('adminContainer');
  const search = document.getElementById('search');
  const statusFilter = document.getElementById('statusFilter');
  const countLabel = document.getElementById('countLabel');

  let ITEMS = [];
  let LABELS = {};
  let STATUSES = [];

  async function load() {
    try {
      const res = await fetch('/cabinet/api/admin/inquiries');
      if (res.status === 401) { window.location.href = '/cabinet/'; return; }
      if (res.status === 403) {
        container.innerHTML = '<div class="empty-state">You do not have admin access.</div>';
        return;
      }
      const data = await res.json();
      ITEMS = data.items || [];
      LABELS = data.statusLabels || {};
      STATUSES = data.statuses || [];

      // Populate filter
      statusFilter.innerHTML =
        '<option value="">All statuses</option>' +
        STATUSES.map(s => `<option value="${s}">${Cabinet.escapeHtml(LABELS[s] || s)}</option>`).join('');

      render();
    } catch (err) {
      container.innerHTML = '<div class="empty-state">Could not load inquiries.</div>';
    }
  }

  function filtered() {
    const q = search.value.trim().toLowerCase();
    const status = statusFilter.value;
    return ITEMS.filter(i => {
      if (status && i.status !== status) return false;
      if (!q) return true;
      const hay = [
        i.projectName, i.email, i.contactName, i.contactEmail,
        i.contactPhone, i.description,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  function render() {
    document.getElementById('loadingMsg')?.remove();
    const list = filtered();
    countLabel.textContent = list.length + ' of ' + ITEMS.length;

    if (list.length === 0) {
      container.innerHTML = '<div class="empty-state">No inquiries match your filters.</div>';
      return;
    }

    container.innerHTML = `
      <div class="inquiry-table-wrapper">
        <table class="inquiry-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Project</th>
              <th>Customer</th>
              <th>Contact</th>
              <th>Files</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${list.map(i => `
              <tr>
                <td class="nowrap muted small">${Cabinet.escapeHtml(Cabinet.formatDate(i.createdAt))}</td>
                <td>
                  <a href="/cabinet/inquiries/${Cabinet.escapeHtml(i.id)}"><strong>${Cabinet.escapeHtml(i.projectName)}</strong></a>
                </td>
                <td class="small">${Cabinet.escapeHtml(i.email)}</td>
                <td class="small">
                  ${Cabinet.escapeHtml(i.contactName)}<br/>
                  <span class="muted">${Cabinet.escapeHtml(i.contactPhone)}</span>
                </td>
                <td>${(i.attachments || []).length}</td>
                <td>
                  <select class="inline-select status-change" data-id="${Cabinet.escapeHtml(i.id)}">
                    ${STATUSES.map(s => `
                      <option value="${s}" ${s === i.status ? 'selected' : ''}>${Cabinet.escapeHtml(LABELS[s] || s)}</option>
                    `).join('')}
                  </select>
                </td>
                <td class="nowrap"><a href="/cabinet/inquiries/${Cabinet.escapeHtml(i.id)}">Open →</a></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.status-change').forEach(sel => {
      sel.addEventListener('change', async (e) => {
        const id = e.target.dataset.id;
        const newStatus = e.target.value;
        try {
          const r = await fetch(`/cabinet/api/admin/inquiries/${encodeURIComponent(id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!r.ok) throw new Error('Update failed');
          // Update local cache so filtering stays in sync
          const item = ITEMS.find(x => x.id === id);
          if (item) item.status = newStatus;
        } catch {
          alert('Could not update status.');
          load(); // refresh from server to reset UI
        }
      });
    });
  }

  search.addEventListener('input', render);
  statusFilter.addEventListener('change', render);

  load();
})();
