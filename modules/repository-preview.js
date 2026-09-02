import { normalizeSale, uid } from './utils.js';

const LOCAL_KEY = 'unifahe.sales.preview.v23';
const DB_NAME = 'unifahe-commercial-preview-files';
const RECEIPT_STORE = 'receipts';
const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
const MAX_RECEIPTS = 3;
const ALLOWED_RECEIPT_TYPES = new Set([
  'application/pdf','image/jpeg','image/png','image/webp','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text','application/octet-stream'
]);

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
function openReceiptDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECEIPT_STORE)) db.createObjectStore(RECEIPT_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function fileStore(mode, value) {
  const db = await openReceiptDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(RECEIPT_STORE, mode === 'get' ? 'readonly' : 'readwrite');
    const store = tx.objectStore(RECEIPT_STORE);
    const request = mode === 'put' ? store.put(value) : mode === 'get' ? store.get(value) : store.delete(value);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}
function receiptMeta(receipt) {
  return {
    id: receipt.id, sale_id: receipt.sale_id, path: receipt.path, name: receipt.name,
    type: receipt.type, size: Number(receipt.size || 0), uploaded_at: receipt.uploaded_at || ''
  };
}

export const SalesRepository = {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,

  async list(filters = {}) {
    let rows = readLocal();
    if (filters.from) rows = rows.filter(row => row.sale_date >= filters.from);
    if (filters.to) rows = rows.filter(row => row.sale_date <= filters.to);
    if (filters.seller) rows = rows.filter(row => row.seller_name === filters.seller);
    rows.sort((a,b) => String(b.sale_date).localeCompare(String(a.sale_date)) || String(b.created_at).localeCompare(String(a.created_at)));
    return { rows, source: 'preview' };
  },

  async create(sale) {
    const normalized = normalizeSale(sale);
    const now = new Date().toISOString();
    const row = normalizeSale({
      ...normalized,
      created_at: normalized.created_at || now,
      updated_at: now,
      audit_status: 'pending', audited_by: '', audited_at: '', receipts: [],
      sheet_sync_status: 'preview', sheet_synced_at: '', sheet_sync_error: ''
    });
    const rows = readLocal(); rows.unshift(row); writeLocal(rows);
    return { sale: row, source: 'preview' };
  },

  async updateAudit(id, status, auditedBy) {
    if (!['pending','ok','not_ok'].includes(status)) throw new Error('Status de auditoria inválido.');
    const sale = updateLocalSale(id, {
      audit_status: status,
      audited_by: auditedBy,
      audited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sheet_sync_status: status === 'ok' ? 'preview' : 'pending'
    });
    if (!sale) throw new Error('Venda não encontrada.');
    return { sale, source: 'preview', sheetSync: { status: 'preview' } };
  },

  async saveReceipt(id, file) {
    if (!file) throw new Error('Selecione um arquivo.');
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('O comprovante deve ter no máximo 3 MB.');
    const type = file.type || 'application/octet-stream';
    if (!ALLOWED_RECEIPT_TYPES.has(type)) throw new Error('Formato de arquivo não permitido.');
    const existing = readLocal().find(row => row.id === id);
    if (!existing) throw new Error('Venda não encontrada.');
    if ((existing.receipts || []).length >= MAX_RECEIPTS) throw new Error('Esta venda já possui 3 comprovantes.');
    const receipt = {
      id: `preview-${uid()}`, sale_id: id, path: '', name: file.name,
      type, size: file.size, uploaded_at: new Date().toISOString()
    };
    receipt.path = `preview://${receipt.id}`;
    await fileStore('put', { ...receipt, blob: file });
    const sale = updateLocalSale(id, { receipts: [...(existing.receipts || []), receiptMeta(receipt)], updated_at: new Date().toISOString() });
    return { sale, source: 'preview' };
  },

  async receiptUrl(_sale, receipt) {
    if (!receipt?.id) return '';
    const item = await fileStore('get', receipt.id);
    return item?.blob ? URL.createObjectURL(item.blob) : '';
  },

  async removeReceipt(saleId, receiptId) {
    const existing = readLocal().find(row => row.id === saleId);
    if (!existing) throw new Error('Venda não encontrada.');
    const receipt = (existing.receipts || []).find(item => item.id === receiptId);
    if (!receipt) throw new Error('Comprovante não encontrado.');
    await fileStore('delete', receiptId).catch(() => {});
    const sale = updateLocalSale(saleId, { receipts: existing.receipts.filter(item => item.id !== receiptId), updated_at: new Date().toISOString() });
    return { sale, source: 'preview' };
  },

  async remove(id) {
    const sale = readLocal().find(row => row.id === id);
    for (const receipt of sale?.receipts || []) await fileStore('delete', receipt.id).catch(() => {});
    writeLocal(readLocal().filter(row => row.id !== id));
    return { source: 'preview' };
  }
};
