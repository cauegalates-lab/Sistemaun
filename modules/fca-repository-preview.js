import { uid } from './utils.js';

const REPORTS_KEY = 'unifahe.fca.preview.reports.v23';
const ACTIONS_KEY = 'unifahe.fca.preview.actions.v23';
function readLocal(key){ try{return JSON.parse(localStorage.getItem(key)||'[]')}catch{return[]} }
function writeLocal(key,value){ localStorage.setItem(key,JSON.stringify(value)); }
function normalizeReport(raw={}){
  return {id:raw.id||uid(),seller_name:raw.seller_name||'',period_type:raw.period_type==='monthly'?'monthly':'weekly',period_start:raw.period_start||'',period_end:raw.period_end||'',indicator:raw.indicator||'Faturamento',situation:raw.situation||'Ponto de atenção',reason:raw.reason||'',positives:raw.positives||'',obstacles:raw.obstacles||'',self_action:raw.self_action||'',support_needed:raw.support_needed||'',snapshot:raw.snapshot||{},status:raw.status||'submitted',feedback_request:raw.feedback_request||'',feedback_requested_by:raw.feedback_requested_by||'',feedback_requested_at:raw.feedback_requested_at||'',feedback_response:raw.feedback_response||'',feedback_responded_at:raw.feedback_responded_at||'',created_at:raw.created_at||new Date().toISOString(),updated_at:raw.updated_at||new Date().toISOString()};
}
function normalizeAction(raw={}){
  return {id:raw.id||uid(),report_id:raw.report_id||'',seller_name:raw.seller_name||'',manager_name:raw.manager_name||'',title:raw.title||'',description:raw.description||'',due_date:raw.due_date||'',status:raw.status==='done'?'done':'open',created_at:raw.created_at||new Date().toISOString(),completed_at:raw.completed_at||''};
}
function updateReport(id,patch){const rows=readLocal(REPORTS_KEY).map(normalizeReport),i=rows.findIndex(x=>x.id===id);if(i<0)return null;rows[i]=normalizeReport({...rows[i],...patch,updated_at:new Date().toISOString()});writeLocal(REPORTS_KEY,rows);return rows[i]}
function updateAction(id,patch){const rows=readLocal(ACTIONS_KEY).map(normalizeAction),i=rows.findIndex(x=>x.id===id);if(i<0)return null;rows[i]=normalizeAction({...rows[i],...patch});writeLocal(ACTIONS_KEY,rows);return rows[i]}
function newest(rows){return rows.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))}

export const FcaRepository={
  async listReports(){return newest(readLocal(REPORTS_KEY).map(normalizeReport))},
  async listActions(){return newest(readLocal(ACTIONS_KEY).map(normalizeAction))},
  async createReport(report){const row=normalizeReport(report),rows=readLocal(REPORTS_KEY).map(normalizeReport);rows.unshift(row);writeLocal(REPORTS_KEY,rows);return row},
  async requestFeedback(reportId,message,managerName){const item=updateReport(reportId,{status:'feedback_requested',feedback_request:message,feedback_requested_by:managerName,feedback_requested_at:new Date().toISOString()});if(!item)throw new Error('Relatório não encontrado.');return item},
  async respondFeedback(reportId,response){const item=updateReport(reportId,{status:'feedback_answered',feedback_response:response,feedback_responded_at:new Date().toISOString()});if(!item)throw new Error('Relatório não encontrado.');return item},
  async createAction(action){const row=normalizeAction(action),rows=readLocal(ACTIONS_KEY).map(normalizeAction);rows.unshift(row);writeLocal(ACTIONS_KEY,rows);if(row.report_id)updateReport(row.report_id,{status:'action_created'});return row},
  async completeAction(actionId){const item=updateAction(actionId,{status:'done',completed_at:new Date().toISOString()});if(!item)throw new Error('Ação não encontrada.');return item}
};
