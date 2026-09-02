import { uid } from './utils.js';
import {
  auth, db, getActiveProfile, resolveUserUidByName,
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc
} from './firebase.js';

function requireProfile() {
  const profile = getActiveProfile();
  if (!auth.currentUser || !profile) throw new Error('Sua sessão expirou. Entre novamente.');
  return profile;
}

function normalizeReport(raw = {}) {
  return {
    id: raw.id || uid(),
    seller_name: raw.seller_name || '',
    period_type: raw.period_type === 'monthly' ? 'monthly' : 'weekly',
    period_start: raw.period_start || '', period_end: raw.period_end || '',
    indicator: raw.indicator || 'Faturamento', situation: raw.situation || 'Ponto de atenção',
    reason: raw.reason || '', positives: raw.positives || '', obstacles: raw.obstacles || '',
    self_action: raw.self_action || '', support_needed: raw.support_needed || '', snapshot: raw.snapshot || {},
    status: raw.status || 'submitted', feedback_request: raw.feedback_request || '',
    feedback_requested_by: raw.feedback_requested_by || '', feedback_requested_at: raw.feedback_requested_at || '',
    feedback_response: raw.feedback_response || '', feedback_responded_at: raw.feedback_responded_at || '',
    created_at: raw.created_at || new Date().toISOString(), updated_at: raw.updated_at || new Date().toISOString()
  };
}

function normalizeAction(raw = {}) {
  return {
    id: raw.id || uid(), report_id: raw.report_id || '', seller_name: raw.seller_name || '',
    manager_name: raw.manager_name || '', title: raw.title || '', description: raw.description || '',
    due_date: raw.due_date || '', status: raw.status === 'done' ? 'done' : 'open',
    created_at: raw.created_at || new Date().toISOString(), completed_at: raw.completed_at || ''
  };
}

function mapDoc(snapshot, normalizer) { return normalizer({ id: snapshot.id, ...(snapshot.data() || {}) }); }
function sortNewest(rows) { return rows.sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))); }

export const FcaRepository = {
  async listReports() {
    const profile = requireProfile();
    if (profile.role === 'auditoria') return [];
    const ref = collection(db, 'fca_reports');
    const source = profile.role === 'gestor' ? ref : query(ref, where('seller_uid', '==', profile.uid));
    const snapshot = await getDocs(source);
    return sortNewest(snapshot.docs.map(item => mapDoc(item, normalizeReport)));
  },

  async listActions() {
    const profile = requireProfile();
    if (profile.role === 'auditoria') return [];
    const ref = collection(db, 'fca_actions');
    const source = profile.role === 'gestor' ? ref : query(ref, where('seller_uid', '==', profile.uid));
    const snapshot = await getDocs(source);
    return sortNewest(snapshot.docs.map(item => mapDoc(item, normalizeAction)));
  },

  async createReport(report) {
    const profile = requireProfile();
    if (profile.role !== 'vendedor') throw new Error('Somente o vendedor envia FCA.');
    const normalized = normalizeReport(report);
    const now = new Date().toISOString();
    const row = { ...normalized, seller_uid: profile.uid, seller_name: profile.name, created_at: now, updated_at: now, status: 'submitted' };
    await setDoc(doc(db, 'fca_reports', row.id), row);
    return normalizeReport(row);
  },

  async requestFeedback(reportId, message, managerName) {
    const profile = requireProfile();
    if (profile.role !== 'gestor') throw new Error('Somente o gestor pode solicitar feedback.');
    const ref = doc(db, 'fca_reports', reportId);
    const snapshot = await getDoc(ref); if (!snapshot.exists()) throw new Error('Relatório não encontrado.');
    const patch = { status:'feedback_requested', feedback_request:message, feedback_requested_by:managerName, feedback_requested_at:new Date().toISOString(), updated_at:new Date().toISOString() };
    await updateDoc(ref, patch);
    return normalizeReport({ id:reportId, ...snapshot.data(), ...patch });
  },

  async respondFeedback(reportId, response) {
    const profile = requireProfile();
    if (profile.role !== 'vendedor') throw new Error('Somente o vendedor pode responder este feedback.');
    const ref = doc(db, 'fca_reports', reportId);
    const snapshot = await getDoc(ref); if (!snapshot.exists()) throw new Error('Relatório não encontrado.');
    const patch = { status:'feedback_answered', feedback_response:response, feedback_responded_at:new Date().toISOString(), updated_at:new Date().toISOString() };
    await updateDoc(ref, patch);
    return normalizeReport({ id:reportId, ...snapshot.data(), ...patch });
  },

  async createAction(action) {
    const profile = requireProfile();
    if (profile.role !== 'gestor') throw new Error('Somente o gestor pode criar ações.');
    const normalized = normalizeAction(action);
    const sellerUid = await resolveUserUidByName(normalized.seller_name);
    if (!sellerUid) throw new Error('Vendedor não cadastrado no Firebase.');
    const row = { ...normalized, seller_uid: sellerUid, manager_uid: profile.uid, manager_name: profile.name, status:'open', created_at:new Date().toISOString() };
    await setDoc(doc(db, 'fca_actions', row.id), row);
    if (row.report_id) await updateDoc(doc(db, 'fca_reports', row.report_id), { status:'action_created', updated_at:new Date().toISOString() }).catch(() => {});
    return normalizeAction(row);
  },

  async completeAction(actionId) {
    const profile = requireProfile();
    if (profile.role !== 'vendedor') throw new Error('Somente o vendedor pode concluir a própria ação.');
    const ref = doc(db, 'fca_actions', actionId);
    const snapshot = await getDoc(ref); if (!snapshot.exists()) throw new Error('Ação não encontrada.');
    const patch = { status:'done', completed_at:new Date().toISOString() };
    await updateDoc(ref, patch);
    return normalizeAction({ id:actionId, ...snapshot.data(), ...patch });
  }
};
