import { waitUntil } from '@vercel/functions';
import { isConfigured, listSales, insertSale, deleteSale } from './_lib/supabase.js';

function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function cleanString(value,max=180){ return String(value||'').trim().slice(0,max); }
function validate(body){ const required=['sale_date','seller_name','student_name','payment_type','modality','course','state','origin']; for(const key of required) if(!cleanString(body[key])) return `Campo obrigatório: ${key}`; if(!['cartao','boleto','sem_taxa_migracao'].includes(body.payment_type)) return 'Tipo de pagamento inválido'; if(Number(body.total_value)<0) return 'Valor total inválido'; if(Number(body.course_quantity)<1) return 'Quantidade de cursos inválida'; return ''; }
async function mirrorToSheets(sale){ const url=process.env.GOOGLE_SHEETS_WEBHOOK_URL; if(!url) return; try{ await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','X-Webhook-Token':process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN||''},body:JSON.stringify({event:'sale.created',sale})}); }catch(error){ console.error('Falha no espelhamento Google Sheets:',error); } }

export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.'});
  try{
    if(req.method==='GET'){ const sales=await listSales({from:req.query.from,to:req.query.to,seller:req.query.seller}); return json(res,200,{sales}); }
    if(req.method==='POST'){ const body=req.body||{}; const error=validate(body); if(error) return json(res,400,{error}); const row={sale_date:cleanString(body.sale_date,10),seller_name:cleanString(body.seller_name,100),student_name:cleanString(body.student_name,150),payment_type:cleanString(body.payment_type,30),fee_value:Number(body.fee_value||0),installments:Number(body.installments||0),total_value:Number(body.total_value||0),modality:cleanString(body.modality,80),pending:cleanString(body.pending,200),course:cleanString(body.course,120),state:cleanString(body.state,2),origin:cleanString(body.origin,80),course_quantity:Number(body.course_quantity||1),sheet_sync_status:'pending'}; const sale=await insertSale(row); waitUntil(mirrorToSheets(sale)); return json(res,201,{sale}); }
    if(req.method==='DELETE'){ if(!req.query.id) return json(res,400,{error:'ID obrigatório'}); await deleteSale(req.query.id); return json(res,200,{ok:true}); }
    res.setHeader('Allow','GET, POST, DELETE'); return json(res,405,{error:'Método não permitido'});
  }catch(error){ console.error(error); return json(res,500,{error:'Erro interno ao processar vendas.'}); }
}
