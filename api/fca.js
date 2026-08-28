import {
  isConfigured, listFcaReports, listFcaActions, insertFcaReport, patchFcaReport,
  getFcaReport, insertFcaAction, patchFcaAction, getFcaAction
} from './_lib/supabase.js';

function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=5000){ return String(value||'').trim().slice(0,max); }
function reportRow(raw={}){
  return {
    seller_name:clean(raw.seller_name,100), period_type:raw.period_type==='monthly'?'monthly':'weekly',
    period_start:clean(raw.period_start,10), period_end:clean(raw.period_end,10), indicator:clean(raw.indicator,80),
    situation:clean(raw.situation,80), reason:clean(raw.reason,4000), positives:clean(raw.positives,4000),
    obstacles:clean(raw.obstacles,4000), self_action:clean(raw.self_action,4000), support_needed:clean(raw.support_needed,4000),
    snapshot:raw.snapshot&&typeof raw.snapshot==='object'?raw.snapshot:{}, status:'submitted'
  };
}

export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado.'});
  try{
    if(req.method==='GET'){
      if(req.query.entity==='actions') return json(res,200,{actions:await listFcaActions()});
      return json(res,200,{reports:await listFcaReports()});
    }
    if(req.method!=='POST'){ res.setHeader('Allow','GET, POST'); return json(res,405,{error:'Método não permitido'}); }
    const body=req.body||{};
    if(body.action==='create_report'){
      const row=reportRow(body.report);
      if(!row.seller_name||!row.period_start||!row.period_end||!row.reason) return json(res,400,{error:'Preencha vendedor, período e motivo.'});
      return json(res,201,{report:await insertFcaReport(row)});
    }
    if(body.action==='request_feedback'){
      const id=clean(body.report_id,80),message=clean(body.message,3000),manager=clean(body.manager_name,100);
      if(!id||!message) return json(res,400,{error:'Relatório e solicitação são obrigatórios.'});
      const report=await getFcaReport(id); if(!report) return json(res,404,{error:'Relatório não encontrado.'});
      return json(res,200,{report:await patchFcaReport(id,{status:'feedback_requested',feedback_request:message,feedback_requested_by:manager,feedback_requested_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    }
    if(body.action==='respond_feedback'){
      const id=clean(body.report_id,80),response=clean(body.response,4000);
      if(!id||!response) return json(res,400,{error:'Resposta obrigatória.'});
      const report=await getFcaReport(id); if(!report) return json(res,404,{error:'Relatório não encontrado.'});
      return json(res,200,{report:await patchFcaReport(id,{status:'feedback_answered',feedback_response:response,feedback_responded_at:new Date().toISOString(),updated_at:new Date().toISOString()})});
    }
    if(body.action==='create_action'){
      const raw=body.item||{};
      const item={report_id:clean(raw.report_id,80)||null,seller_name:clean(raw.seller_name,100),manager_name:clean(raw.manager_name,100),title:clean(raw.title,180),description:clean(raw.description,4000),due_date:clean(raw.due_date,10)||null,status:'open'};
      if(!item.seller_name||!item.title||!item.description) return json(res,400,{error:'Vendedor, título e ação são obrigatórios.'});
      const inserted=await insertFcaAction(item);
      if(item.report_id) await patchFcaReport(item.report_id,{status:'action_created',updated_at:new Date().toISOString()}).catch(()=>{});
      return json(res,201,{item:inserted});
    }
    if(body.action==='complete_action'){
      const id=clean(body.action_id,80); const existing=await getFcaAction(id); if(!existing) return json(res,404,{error:'Ação não encontrada.'});
      return json(res,200,{item:await patchFcaAction(id,{status:'done',completed_at:new Date().toISOString()})});
    }
    return json(res,400,{error:'Ação inválida.'});
  }catch(error){ console.error(error); return json(res,500,{error:'Não foi possível processar o FCA.'}); }
}
