import { normalizeSale } from './utils.js';

const LOCAL_KEY = 'unifahe.sales.demo.v2';

function readLocal() {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).map(normalizeSale); }
  catch { return []; }
}

function writeLocal(rows) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`API ${response.status}`);
  return response.json();
}

export const SalesRepository = {
  async list(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k,v]) => { if (v) params.set(k, v); });
    try {
      const payload = await request(`/api/sales?${params.toString()}`);
      return { rows: (payload.sales || []).map(normalizeSale), source: 'database' };
    } catch {
      let rows = readLocal();
      if (filters.from) rows = rows.filter(r => r.sale_date >= filters.from);
      if (filters.to) rows = rows.filter(r => r.sale_date <= filters.to);
      if (filters.seller) rows = rows.filter(r => r.seller_name === filters.seller);
      return { rows, source: 'local-demo' };
    }
  },

  async create(sale) {
    const normalized = normalizeSale(sale);
    try {
      const payload = await request('/api/sales', { method: 'POST', body: JSON.stringify(normalized) });
      return { sale: normalizeSale(payload.sale), source: 'database' };
    } catch {
      const rows = readLocal();
      rows.unshift(normalized);
      writeLocal(rows);
      return { sale: normalized, source: 'local-demo' };
    }
  },

  async remove(id) {
    try {
      await request(`/api/sales?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { source: 'database' };
    } catch {
      writeLocal(readLocal().filter(r => r.id !== id));
      return { source: 'local-demo' };
    }
  }
};
