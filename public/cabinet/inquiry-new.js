/* New inquiry submission form */

(function () {
  const MAX_FILES = 10;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;

  const form = document.getElementById('inquiryForm');
  const fileInput = document.getElementById('attachments');
  const fileList = document.getElementById('fileList');
  const submitBtn = document.getElementById('submitBtn');
  const statusEl = document.getElementById('formStatus');

  let chosenFiles = []; // we manage a manual list so users can remove individually

  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) {
      if (chosenFiles.length >= MAX_FILES) break;
      if (chosenFiles.find(x => x.name === f.name && x.size === f.size)) continue;
      if (f.size > MAX_FILE_BYTES) {
        flash(`"${f.name}" is over 10 MB and was skipped.`, 'error');
        continue;
      }
      chosenFiles.push(f);
    }
    fileInput.value = ''; // reset so picking the same file again still triggers change
    renderFileList();
  });

  function renderFileList() {
    fileList.innerHTML = chosenFiles.map((f, i) => `
      <li>
        <span class="file-name">${Cabinet.escapeHtml(f.name)}</span>
        <span class="file-size muted small">${Cabinet.formatSize(f.size)}</span>
        <button type="button" class="file-remove" data-i="${i}" aria-label="Remove">×</button>
      </li>
    `).join('');
    fileList.querySelectorAll('.file-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = Number(e.currentTarget.dataset.i);
        chosenFiles.splice(i, 1);
        renderFileList();
      });
    });
  }

  function flash(msg, kind) {
    statusEl.textContent = msg;
    statusEl.className = 'form-status ' + (kind || '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    flash('');

    // Pre-validate
    const fields = ['projectName', 'description', 'contactName', 'contactPhone', 'contactEmail'];
    for (const name of fields) {
      const v = String(form[name].value || '').trim();
      if (!v) {
        flash('Please fill in all required fields.', 'error');
        form[name].focus();
        return;
      }
    }
    if (chosenFiles.length === 0) {
      flash('Please attach at least one file.', 'error');
      return;
    }
    if (chosenFiles.length > MAX_FILES) {
      flash(`Please attach no more than ${MAX_FILES} files.`, 'error');
      return;
    }

    const fd = new FormData();
    for (const name of fields) fd.append(name, form[name].value.trim());
    for (const f of chosenFiles) fd.append('attachments', f, f.name);

    submitBtn.disabled = true;
    const orig = submitBtn.textContent;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await fetch('/cabinet/api/inquiries', {
        method: 'POST',
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || 'Submission failed');
      window.location.href = '/cabinet/inquiries/?ok=1';
    } catch (err) {
      flash(err.message || 'Could not submit. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = orig;
    }
  });
})();
