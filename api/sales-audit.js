import { isConfigured, patchSale, getSaleWithReceipts } from './_lib/supabase.js';
function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=120){ return String(value||'').trim().slice(0,max); }
export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado.'});
  if(req.method!=='POST'){ res.setHeader('Allow','POST'); return json(res,405,{error:'Método não permitido'}); }
  try{
    const saleId=clean(req.body?.sale_id,80),status=clean(req.body?.status,20),auditedBy=clean(req.body?.audited_by,100);
    if(!saleId) return json(res,400,{error:'Venda não informada.'}); if(!['pending','ok','not_ok'].includes(status)) return json(res,400,{error:'Status de auditoria inválido.'});
    const patched=await patchSale(saleId,{audit_status:status,audited_by:auditedBy,audited_at:new Date().toISOString()});
    if(!patched) return json(res,404,{error:'Venda não encontrada.'}); return json(res,200,{sale:await getSaleWithReceipts(saleId)});
  }catch(error){ console.error(error); return json(res,500,{error:'Não foi possível atualizar a auditoria.'}); }
}
