window.HimsApi = {
  async request(path, options) {
    let response;
    try {
      response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    } catch {
      throw new Error('Could not reach the HIMS server. Start it with npm start and reload this page.');
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  },
  get(path) { return this.request(path); },
  post(path, data) { return this.request(path, { method: 'POST', body: JSON.stringify(data) }); },
  put(path, data) { return this.request(path, { method: 'PUT', body: JSON.stringify(data) }); },
  patch(path, data) { return this.request(path, { method: 'PATCH', body: JSON.stringify(data) }); },
  delete(path) { return this.request(path, { method: 'DELETE' }); },
  escape(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); },
  date(value) { if (!value) return ''; const d = new Date(`${value}T00:00:00`); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); },
  async run(action, errorElement) {
    if (errorElement) { errorElement.style.display = 'none'; errorElement.textContent = ''; }
    try { return await action(); }
    catch (error) { if (errorElement) { errorElement.textContent = error.message; errorElement.style.display = 'block'; } else alert(error.message); return null; }
  }
};
