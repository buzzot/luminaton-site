/* Customer cabinet dashboard — list & search datasheets.
   Session header and logout are handled by /cabinet/cabinet-shared.js. */

let ALL_CATEGORIES = [];

async function init() {
  // Load datasheets
  try {
    const res = await fetch('/cabinet/api/datasheets');
    if (res.status === 401) {
      window.location.href = '/cabinet/';
      return;
    }
    const data = await res.json();
    ALL_CATEGORIES = data.categories || [];
    render(ALL_CATEGORIES);
  } catch (err) {
    document.getElementById('catalog').innerHTML =
      '<div class="empty-state">Could not load datasheets. Please refresh the page.</div>';
  }

  // Search
  document.getElementById('search').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) return render(ALL_CATEGORIES);
    const filtered = ALL_CATEGORIES
      .map(cat => ({
        ...cat,
        files: cat.files.filter(f =>
          f.title.toLowerCase().includes(q) ||
          (f.description && f.description.toLowerCase().includes(q)) ||
          cat.title.toLowerCase().includes(q)
        ),
      }))
      .filter(cat => cat.files.length > 0);
    render(filtered);
  });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function render(categories) {
  const root = document.getElementById('catalog');
  document.getElementById('loadingMsg')?.remove();

  if (!categories.length) {
    root.innerHTML = `
      <div class="empty-state">
        <p><strong>No datasheets available yet.</strong></p>
        <p>Drop PDF files into <code>/datasheets/&lt;category&gt;/</code> on the server, then refresh this page.</p>
      </div>`;
    return;
  }

  root.innerHTML = categories.map(cat => `
    <section class="category-block">
      <h2>${escapeHtml(cat.title)}</h2>
      ${cat.description ? `<p class="category-desc">${escapeHtml(cat.description)}</p>` : ''}
      <div class="datasheet-grid">
        ${cat.files.map(f => `
          <article class="datasheet-card">
            <div class="pdf-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <path d="M14 2v6h6"/>
              </svg>
            </div>
            <h3>${escapeHtml(f.title)}</h3>
            ${f.description ? `<p class="desc">${escapeHtml(f.description)}</p>` : ''}
            <div class="actions">
              <a href="${f.url}" target="_blank" rel="noopener">View ↗</a>
              <a href="${f.url}" download>Download ↓</a>
            </div>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
}

init();
