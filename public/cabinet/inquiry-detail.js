/* Inquiry detail page — used by both customers and admins.
   Customers see read-only view; admins also get an inline status selector. */

(async function () {
  const container = document.getElementById('detailContainer');
  const id = window.location.pathname.split('/').filter(Boolean).pop();

  try {
    const res = await fetch(`/cabinet/api/inquiries/${encodeURIComponent(id)}`);
    if (res.status === 401) { window.location.href = '/cabinet/'; return; }
    if (res.status === 404) { container.innerHTML = '<div class="empty-state">Inquiry not found.</div>'; return; }
    if (res.status === 403) { container.innerHTML = '<div class="empty-state">You do not have access to this inquiry.</div>'; return; }
    const data = await res.json();
    const inq = data.inquiry;
    const labels = data.statusLabels || {};

    // Is the current user admin?
    let isAdmin = false;
    try {
      const s = await fetch('/cabinet/api/session');
      const sj = await s.json();
      isAdmin = !!sj.isAdmin;
    } catch {}

    const statusControl = isAdmin
      ? `
        <select id="statusSelect" class="inline-select" data-id="${Cabinet.escapeHtml(inq.id)}">
          ${Object.entries(labels).map(([v, l]) => `
            <option value="${Cabinet.escapeHtml(v)}" ${v === inq.status ? 'selected' : ''}>${Cabinet.escapeHtml(l)}</option>
          `).join('')}
        </select>
      `
      : Cabinet.statusBadge(inq.status, labels);

    container.innerHTML = `
      <article class="inquiry-detail">
        <header class="detail-head">
          <div>
            <p class="muted small">${Cabinet.escapeHtml(inq.id)}</p>
            <h1>${Cabinet.escapeHtml(inq.projectName)}</h1>
            <p class="muted">Submitted ${Cabinet.escapeHtml(Cabinet.formatDate(inq.createdAt))} by ${Cabinet.escapeHtml(inq.email)}</p>
          </div>
          <div class="detail-status">${statusControl}</div>
        </header>

        <section class="detail-section">
          <h3>Project description</h3>
          <p style="white-space:pre-wrap;">${Cabinet.escapeHtml(inq.description)}</p>
        </section>

        <section class="detail-section">
          <h3>Contact</h3>
          <dl class="detail-dl">
            <dt>Name</dt><dd>${Cabinet.escapeHtml(inq.contactName)}</dd>
            <dt>Phone</dt><dd><a href="tel:${Cabinet.escapeHtml(inq.contactPhone)}">${Cabinet.escapeHtml(inq.contactPhone)}</a></dd>
            <dt>Email</dt><dd><a href="mailto:${Cabinet.escapeHtml(inq.contactEmail)}">${Cabinet.escapeHtml(inq.contactEmail)}</a></dd>
          </dl>
        </section>

        <section class="detail-section">
          <h3>Attachments (${inq.attachments.length})</h3>
          <ul class="attachment-list">
            ${inq.attachments.map(a => `
              <li>
                <a href="/cabinet/attachments/${Cabinet.escapeHtml(inq.id)}/${Cabinet.escapeHtml(a.storedName)}" download>
                  ${Cabinet.escapeHtml(a.originalName)}
                </a>
                <span class="muted small">${Cabinet.formatSize(a.size)}</span>
              </li>
            `).join('')}
          </ul>
        </section>
      </article>
    `;

    // Admin: wire status select
    const select = document.getElementById('statusSelect');
    if (select) {
      select.addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        try {
          const r = await fetch(`/cabinet/api/admin/inquiries/${encodeURIComponent(inq.id)}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
          });
          if (!r.ok) throw new Error('Update failed');
        } catch {
          alert('Could not update status.');
        }
      });
    }
  } catch (err) {
    container.innerHTML = '<div class="empty-state">Could not load inquiry.</div>';
  }
})();
