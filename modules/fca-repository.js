import { uid } from './utils.js';

const REPORTS_KEY = 'unifahe.fca.reports.v1';
const ACTIONS_KEY = 'unifahe.fca.actions.v1';

function readLocal(key) {
  try { return JSON.parse(localStorage.getItem(key) || '[]'); }
  catch { return []; }
}
function writeLocal(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

async function requestJSON(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `API ${response.status}`);
  return payload;
}

function normalizeReport(raw = {}) {
  return {
    id: raw.id || uid(),
    seller_name: raw.seller_name || '',
    period_type: raw.period_type === 'monthly' ? 'monthly' : 'weekly',
    period_start: raw.period_start || '',
    period_end: raw.period_end || '',
    indicator: raw.indicator || 'Faturamento',
    situation: raw.situation || 'Ponto de atenção',
    reason: raw.reason || '',
    positives: raw.positives || '',
    obstacles: raw.obstacles || '',
    self_action: raw.self_action || '',
    support_needed: raw.support_needed || '',
    snapshot: raw.snapshot || {},
    status: raw.status || 'submitted',
    feedback_request: raw.feedback_request || '',
    feedback_requested_by: raw.feedback_requested_by || '',
    feedback_requested_at: raw.feedback_requested_at || '',
    feedback_response: raw.feedback_response || '',
    feedback_responded_at: raw.feedback_responded_at || '',
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: raw.updated_at || new Date().toISOString()
  };
}
function normalizeAction(raw = {}) {
  return {
    id: raw.id || uid(),
    report_id: raw.report_id || '',
    seller_name: raw.seller_name || '',
    manager_name: raw.manager_name || '',
    title: raw.title || '',
    description: raw.description || '',
    due_date: raw.due_date || '',
    status: raw.status === 'done' ? 'done' : 'open',
    created_at: raw.created_at || new Date().toISOString(),
    completed_at: raw.completed_at || ''
  };
}

function localUpdateReport(id, patch) {
  const rows = readLocal(REPORTS_KEY).map(normalizeReport);
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return null;
  rows[index] = normalizeReport({ ...rows[index], ...patch, updated_at: new Date().toISOString() });
  writeLocal(REPORTS_KEY, rows);
  return rows[index];
}
function localUpdateAction(id, patch) {
  const rows = readLocal(ACTIONS_KEY).map(normalizeAction);
  const index = rows.findIndex(row => row.id === id);
  if (index < 0) return null;
  rows[index] = normalizeAction({ ...rows[index], ...patch });
  writeLocal(ACTIONS_KEY, rows);
  return rows[index];
}

export const FcaRepository = {
  async listReports() {
    try {
      const payload = await requestJSON('/api/fca?entity=reports');
      return (payload.reports || []).map(normalizeReport);
    } catch {
      return readLocal(REPORTS_KEY).map(normalizeReport);
    }
  },

  async listActions() {
    try {
      const payload = await requestJSON('/api/fca?entity=actions');
      return (payload.actions || []).map(normalizeAction);
    } catch {
      return readLocal(ACTIONS_KEY).map(normalizeAction);
    }
  },

  async createReport(report) {
    const normalized = normalizeReport(report);
    try {
      const payload = await requestJSON('/api/fca', { method:'POST', body:JSON.stringify({ action:'create_report', report:normalized }) });
      return normalizeReport(payload.report);
    } catch {
      const rows = readLocal(REPORTS_KEY).map(normalizeReport);
      rows.unshift(normalized); writeLocal(REPORTS_KEY, rows); return normalized;
    }
  },

  async requestFeedback(reportId, message, managerName) {
    const patch = { status:'feedback_requested', feedback_request:message, feedback_requested_by:managerName, feedback_requested_at:new Date().toISOString() };
    try {
      const payload = await requestJSON('/api/fca', { method:'POST', body:JSON.stringify({ action:'request_feedback', report_id:reportId, message, manager_name:managerName }) });
      return normalizeReport(payload.report);
    } catch (error) {
      const report = localUpdateReport(reportId, patch); if (!report) throw error; return report;
    }
  },

  async respondFeedback(reportId, response) {
    const patch = { status:'feedback_answered', feedback_response:response, feedback_responded_at:new Date().toISOString() };
    try {
      const payload = await requestJSON('/api/fca', { method:'POST', body:JSON.stringify({ action:'respond_feedback', report_id:reportId, response }) });
      return normalizeReport(payload.report);
    } catch (error) {
      const report = localUpdateReport(reportId, patch); if (!report) throw error; return report;
    }
  },

  async createAction(action) {
    const normalized = normalizeAction(action);
    try {
      const payload = await requestJSON('/api/fca', { method:'POST', body:JSON.stringify({ action:'create_action', item:normalized }) });
      return normalizeAction(payload.item);
    } catch {
      const rows = readLocal(ACTIONS_KEY).map(normalizeAction); rows.unshift(normalized); writeLocal(ACTIONS_KEY, rows);
      if (normalized.report_id) localUpdateReport(normalized.report_id, { status:'action_created' });
      return normalized;
    }
  },

  async completeAction(actionId) {
    const patch = { status:'done', completed_at:new Date().toISOString() };
    try {
      const payload = await requestJSON('/api/fca', { method:'POST', body:JSON.stringify({ action:'complete_action', action_id:actionId }) });
      return normalizeAction(payload.item);
    } catch (error) {
      const item = localUpdateAction(actionId, patch); if (!item) throw error; return item;
    }
  }
};
