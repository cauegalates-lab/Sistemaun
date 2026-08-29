import { normalizeSale, uid } from './utils.js';

const LOCAL_KEY = 'unifahe.sales.demo.v2';
const DB_NAME = 'unifahe-commercial-files';
const LEGACY_RECEIPT_STORE = 'receipts';
const RECEIPT_STORE = 'receipts_v2';
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
const MAX_RECEIPTS = 3;

function readLocal() {
  try { return (JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')).map(normalizeSale); }
  catch { return []; }
}

function writeLocal(rows) { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows)); }

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
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(LEGACY_RECEIPT_STORE)) db.createObjectStore(LEGACY_RECEIPT_STORE, { keyPath: 'sale_id' });
      if (!db.objectStoreNames.contains(RECEIPT_STORE)) db.createObjectStore(RECEIPT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function fileStore(storeName, mode, value) {
  const db = await openReceiptDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(storeName);
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

function receiptMeta(receipt) {
  return {
    id: receipt.id,
    sale_id: receipt.sale_id,
    path: receipt.path,
    name: receipt.name,
    type: receipt.type,
    size: Number(receipt.size || 0),
    uploaded_at: receipt.uploaded_at || ''
  };
}

export const SalesRepository = {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,

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
      const rows = readLocal(); rows.unshift(normalized); writeLocal(rows);
      return { sale: normalized, source: 'local-demo' };
    }
  },

  async updateAudit(id, status, auditedBy) {
    try {
      const payload = await requestJSON('/api/sales-audit', {
        method: 'POST', body: JSON.stringify({ sale_id: id, status, audited_by: auditedBy })
      });
      return { sale: normalizeSale(payload.sale), source: 'database', sheetSync: payload.sheet_sync || { status: 'not_required' } };
    } catch (error) {
      const sale = updateLocalSale(id, { audit_status: status, audited_by: auditedBy, audited_at: new Date().toISOString() });
      if (!sale) throw error;
      return { sale, source: 'local-demo', sheetSync: { status: 'local_demo' } };
    }
  },

  async saveReceipt(id, file) {
    if (!file) throw new Error('Selecione um arquivo.');
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('O comprovante deve ter no máximo 3 MB.');
    const existing = readLocal().find(row => row.id === id);
    if (existing?.receipts?.length >= MAX_RECEIPTS) throw new Error('Esta venda já possui 3 comprovantes.');
    const payload = {
      sale_id: id, file_name: file.name, file_type: file.type || 'application/octet-stream',
      file_size: file.size, data_base64: await fileToBase64(file)
    };
    try {
      const response = await requestJSON('/api/sales-receipt', { method: 'POST', body: JSON.stringify(payload) });
      return { sale: normalizeSale(response.sale), source: 'database' };
    } catch (error) {
      if (!existing) throw error;
      if (existing.receipts.length >= MAX_RECEIPTS) throw new Error('Esta venda já possui 3 comprovantes.');
      const receipt = {
        id: `local-${uid()}`, sale_id: id, path: '', name: file.name, type: file.type || 'application/octet-stream',
        size: file.size, uploaded_at: new Date().toISOString()
      };
      receipt.path = `local-v2://${receipt.id}`;
      await fileStore(RECEIPT_STORE, 'put', { ...receipt, blob: file });
      const sale = updateLocalSale(id, { receipts: [...existing.receipts, receiptMeta(receipt)] });
      return { sale, source: 'local-demo' };
    }
  },

  async receiptUrl(sale, receipt) {
    if (!sale || !receipt) return '';
    if (String(receipt.path || '').startsWith('local-v2://')) {
      const item = await fileStore(RECEIPT_STORE, 'get', receipt.id);
      return item?.blob ? URL.createObjectURL(item.blob) : '';
    }
    if (String(receipt.path || '').startsWith('local://') || String(receipt.id || '').startsWith('legacy-')) {
      const item = await fileStore(LEGACY_RECEIPT_STORE, 'get', sale.id);
      return item?.blob ? URL.createObjectURL(item.blob) : '';
    }
    return `/api/sales-receipt?receipt_id=${encodeURIComponent(receipt.id)}&v=${encodeURIComponent(receipt.uploaded_at || '')}`;
  },

  async removeReceipt(saleId, receiptId) {
    try {
      const response = await requestJSON(`/api/sales-receipt?receipt_id=${encodeURIComponent(receiptId)}`, { method: 'DELETE' });
      return { sale: normalizeSale(response.sale), source: 'database' };
    } catch (error) {
      const existing = readLocal().find(row => row.id === saleId);
      if (!existing) throw error;
      const receipt = existing.receipts.find(item => item.id === receiptId);
      if (!receipt) throw new Error('Comprovante não encontrado.');
      if (String(receipt.path || '').startsWith('local-v2://')) await fileStore(RECEIPT_STORE, 'delete', receipt.id).catch(() => {});
      else await fileStore(LEGACY_RECEIPT_STORE, 'delete', saleId).catch(() => {});
      const sale = updateLocalSale(saleId, { receipts: existing.receipts.filter(item => item.id !== receiptId) });
      return { sale, source: 'local-demo' };
    }
  },

  async remove(id) {
    try {
      await requestJSON(`/api/sales?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      return { source: 'database' };
    } catch {
      const sale = readLocal().find(r => r.id === id);
      for (const receipt of sale?.receipts || []) {
        if (String(receipt.path || '').startsWith('local-v2://')) await fileStore(RECEIPT_STORE, 'delete', receipt.id).catch(() => {});
        else await fileStore(LEGACY_RECEIPT_STORE, 'delete', id).catch(() => {});
      }
      writeLocal(readLocal().filter(r => r.id !== id));
      return { source: 'local-demo' };
    }
  }
};
