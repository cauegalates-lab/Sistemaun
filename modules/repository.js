import { normalizeSale } from './utils.js';

const LOCAL_KEY = 'unifahe.sales.demo.v2';
const DB_NAME = 'unifahe-commercial-files';
const DB_STORE = 'receipts';
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;

function readLocal() {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).map(normalizeSale); }
  catch { return []; }
}

function writeLocal(rows) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(rows));
}

function updateLocalSale(id, patch) {
  const rows = readLocal();
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return null;
  rows[index] = normalizeSale({ ...rows[index], ...patch });
  writeLocal(rows);
  return rows[index];
}

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `API ${response.status}`);
  return payload;
}

function openReceiptDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'sale_id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function receiptStore(mode, value) {
  const db = await openReceiptDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, mode === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const request = mode === 'put' ? store.put(value) : mode === 'get' ? store.get(value) : store.delete(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export const SalesRepository = {
  MAX_RECEIPT_BYTES,

  async list(filters = {}) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k,v]) => { if (v) params.set(k, v); });
    try {
      const payload = await requestJSON(`/api/sales?${params.toString()}`);
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
      const payload = await requestJSON('/api/sales', { method: 'POST', body: JSON.stringify(normalized) });
      return { sale: normalizeSale(payload.sale), source: 'database' };
    } catch {
      const rows = readLocal();
      rows.unshift(normalized);
      writeLocal(rows);
      return { sale: normalized, source: 'local-demo' };
    }
  },

  async updateAudit(id, status, auditedBy) {
    try {
      const payload = await requestJSON('/api/sales-audit', {
        method: 'POST',
        body: JSON.stringify({ sale_id: id, status, audited_by: auditedBy })
      });
      return { sale: normalizeSale(payload.sale), source: 'database' };
    } catch (error) {
      const sale = updateLocalSale(id, {
        audit_status: status,
        audited_by: auditedBy,
        audited_at: new Date().toISOString()
      });
      if (!sale) throw error;
      return { sale, source: 'local-demo' };
    }
  },

  async saveReceipt(id, file) {
    if (!file) throw new Error('Selecione um arquivo.');
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('O comprovante deve ter no máximo 3 MB.');
    const payload = {
      sale_id: id,
      file_name: file.name,
      file_type: file.type || 'application/octet-stream',
      file_size: file.size,
      data_base64: await fileToBase64(file)
    };
    try {
      const response = await requestJSON('/api/sales-receipt', { method: 'POST', body: JSON.stringify(payload) });
      return { sale: normalizeSale(response.sale), source: 'database' };
    } catch (error) {
      const existing = readLocal().find(row => row.id === id);
      if (!existing) throw error;
      await receiptStore('put', {
        sale_id: id,
        blob: file,
        name: file.name,
        type: file.type,
        size: file.size,
        uploaded_at: new Date().toISOString()
      });
      const sale = updateLocalSale(id, {
        receipt_path: `local://${id}`,
        receipt_name: file.name,
        receipt_type: file.type,
        receipt_size: file.size,
        receipt_uploaded_at: new Date().toISOString()
      });
      return { sale, source: 'local-demo' };
    }
  },

  async receiptUrl(sale) {
    if (!sale?.receipt_path) return '';
    if (!String(sale.receipt_path).startsWith('local://')) {
      return `/api/sales-receipt?id=${encodeURIComponent(sale.id)}&v=${encodeURIComponent(sale.receipt_uploaded_at || '')}`;
    }
    const item = await receiptStore('get', sale.id);
    return item?.blob ? URL.createObjectURL(item.blob) : '';
  },

  async removeReceipt(id) {
    try {
      const response = await requestJSON(`/api/sales-receipt?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { sale: normalizeSale(response.sale), source: 'database' };
    } catch (error) {
      const existing = readLocal().find(row => row.id === id);
      if (!existing) throw error;
      await receiptStore('delete', id).catch(() => {});
      const sale = updateLocalSale(id, {
        receipt_path: '', receipt_name: '', receipt_type: '', receipt_size: 0, receipt_uploaded_at: ''
      });
      return { sale, source: 'local-demo' };
    }
  },

  async remove(id) {
    try {
      await requestJSON(`/api/sales?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { source: 'database' };
    } catch {
      writeLocal(readLocal().filter(r => r.id !== id));
      await receiptStore('delete', id).catch(() => {});
      return { source: 'local-demo' };
    }
  }
};
