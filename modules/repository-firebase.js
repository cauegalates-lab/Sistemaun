import { normalizeSale, uid } from './utils.js';
import {
  auth, db, storage, getActiveProfile, resolveUserUidByName,
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc,
  ref, uploadBytes, getDownloadURL, deleteObject
} from './firebase.js';

const MAX_RECEIPT_BYTES = 3 * 1024 * 1024;
const MAX_RECEIPTS = 3;
const ALLOWED_RECEIPT_TYPES = new Set([
  'application/pdf','image/jpeg','image/png','image/webp','application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text','application/octet-stream'
]);

function requireProfile() {
  const profile = getActiveProfile();
  if (!auth.currentUser || !profile) throw new Error('Sua sessão expirou. Entre novamente.');
  return profile;
}

function mapSale(snapshot) {
  return normalizeSale({ id: snapshot.id, ...(snapshot.data() || {}) });
}

async function getSaleSnapshot(id) {
  const snapshot = await getDoc(doc(db, 'sales', id));
  if (!snapshot.exists()) throw new Error('Venda não encontrada.');
  return snapshot;
}

async function requestSheetQueue(saleId='') {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/backend?action=sheet-sync-queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sale_id: saleId, limit: 20 })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Sincronização HTTP ${response.status}`);
  return payload;
}

async function requestSheetDelete(saleId) {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/backend?action=sheet-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ sale_id: saleId })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Google Sheets HTTP ${response.status}`);
  return payload;
}

function safeName(name) {
  return String(name || 'comprovante').trim().slice(0, 140).replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-') || 'comprovante';
}

export const SalesRepository = {
  MAX_RECEIPT_BYTES,
  MAX_RECEIPTS,

  async list(filters = {}) {
    const profile = requireProfile();
    const salesRef = collection(db, 'sales');
    const source = profile.role === 'vendedor'
      ? query(salesRef, where('seller_uid', '==', profile.uid))
      : salesRef;
    const snapshot = await getDocs(source);
    let rows = snapshot.docs.map(mapSale);
    if (filters.from) rows = rows.filter(row => row.sale_date >= filters.from);
    if (filters.to) rows = rows.filter(row => row.sale_date <= filters.to);
    if (filters.seller) rows = rows.filter(row => row.seller_name === filters.seller);
    rows.sort((a,b) => b.sale_date.localeCompare(a.sale_date) || String(b.created_at).localeCompare(String(a.created_at)));
    return { rows, source: 'firebase' };
  },

  async create(sale) {
    const profile = requireProfile();
    if (profile.role === 'auditoria') throw new Error('Auditoria não pode lançar vendas.');
    const normalized = normalizeSale(sale);
    let sellerUid = profile.uid;
    if (profile.role === 'gestor') {
      sellerUid = await resolveUserUidByName(normalized.seller_name);
    }
    const now = new Date().toISOString();
    const row = {
      ...normalized,
      seller_uid: sellerUid,
      created_by_uid: profile.uid,
      created_at: now,
      updated_at: now,
      audit_status: 'pending',
      audited_by: '', audited_at: '', receipts: [],
      sheet_sync_status: 'pending', sheet_synced_at: '', sheet_sync_error: ''
    };
    await setDoc(doc(db, 'sales', normalized.id), row);
    requestSheetQueue(normalized.id).catch(() => {});
    return { sale: normalizeSale(row), source: 'firebase', sheetSync:{status:'queued'} };
  },

  async updateAudit(id, status, auditedBy) {
    const profile = requireProfile();
    if (!['gestor','auditoria'].includes(profile.role)) throw new Error('Seu perfil não pode auditar vendas.');
    if (!['pending','ok','not_ok'].includes(status)) throw new Error('Status de auditoria inválido.');
    const saleRef = doc(db, 'sales', id);
    const auditedAt = new Date().toISOString();
    await updateDoc(saleRef, { audit_status: status, audited_by: auditedBy, audited_at: auditedAt, updated_at: auditedAt, sheet_sync_status:'pending', sheet_sync_error:'' });
    const snapshot = await getSaleSnapshot(id);
    const sale = mapSale(snapshot);
    let sheetSync={status:'queued',message:'Atualização adicionada à fila da planilha.'};
    try{
      const result=await requestSheetQueue(id);
      if(result?.failed) sheetSync={status:'error',message:'A venda ficou na fila para nova tentativa automática.'};
      else if(result?.processed) sheetSync={status:'synced',message:'Venda sincronizada com a planilha.'};
    }catch(error){sheetSync={status:'queued',message:'A venda ficou na fila e será reenviada automaticamente.'};}
    const fresh=await getSaleSnapshot(id);
    return { sale:mapSale(fresh), source:'firebase', sheetSync };
  },

  async saveReceipt(id, file) {
    const profile = requireProfile();
    if (profile.role === 'auditoria') throw new Error('Auditoria pode apenas visualizar comprovantes.');
    if (!file) throw new Error('Selecione um arquivo.');
    if (file.size > MAX_RECEIPT_BYTES) throw new Error('O comprovante deve ter no máximo 3 MB.');
    const type = file.type || 'application/octet-stream';
    if (!ALLOWED_RECEIPT_TYPES.has(type)) throw new Error('Formato de arquivo não permitido.');

    const snapshot = await getSaleSnapshot(id);
    const sale = mapSale(snapshot);
    if (sale.receipts.length >= MAX_RECEIPTS) throw new Error('Esta venda já possui 3 comprovantes.');

    const receiptId = uid();
    const path = `sales/${id}/${Date.now()}-${receiptId}-${safeName(file.name)}`;
    const objectRef = ref(storage, path);
    await uploadBytes(objectRef, file, { contentType: type });
    const receipt = { id: receiptId, sale_id: id, path, name: file.name, type, size: file.size, uploaded_at: new Date().toISOString() };
    const receipts = [...sale.receipts, receipt];
    try {
      await updateDoc(doc(db, 'sales', id), { receipts, updated_at: new Date().toISOString(), sheet_sync_status:'pending', sheet_sync_error:'' });
    } catch (error) {
      await deleteObject(objectRef).catch(() => {});
      throw error;
    }
    requestSheetQueue(id).catch(() => {});
    return { sale: normalizeSale({ ...snapshot.data(), id, receipts, sheet_sync_status:'pending' }), source: 'firebase' };
  },

  async receiptUrl(sale, receipt) {
    if (!sale || !receipt?.path) return '';
    return getDownloadURL(ref(storage, receipt.path));
  },

  async removeReceipt(saleId, receiptId) {
    const profile = requireProfile();
    if (profile.role === 'auditoria') throw new Error('Auditoria não pode remover comprovantes.');
    const snapshot = await getSaleSnapshot(saleId);
    const sale = mapSale(snapshot);
    const receipt = sale.receipts.find(item => item.id === receiptId);
    if (!receipt) throw new Error('Comprovante não encontrado.');
    await deleteObject(ref(storage, receipt.path)).catch(error => {
      if (!String(error?.code || '').includes('object-not-found')) throw error;
    });
    const receipts = sale.receipts.filter(item => item.id !== receiptId);
    await updateDoc(doc(db, 'sales', saleId), { receipts, updated_at: new Date().toISOString(), sheet_sync_status:'pending', sheet_sync_error:'' });
    requestSheetQueue(saleId).catch(() => {});
    return { sale: normalizeSale({ ...snapshot.data(), id: saleId, receipts, sheet_sync_status:'pending' }), source: 'firebase' };
  },

  async remove(id) {
    const profile = requireProfile();
    if (profile.role !== 'gestor') throw new Error('Somente o gestor pode excluir vendas.');
    const snapshot = await getSaleSnapshot(id);
    const sale = mapSale(snapshot);
    await requestSheetDelete(id);
    await Promise.all(sale.receipts.map(receipt => deleteObject(ref(storage, receipt.path)).catch(() => {})));
    await deleteDoc(doc(db, 'sales', id));
    return { source: 'firebase' };
  }
};
