import { isConfigured, patchSale, getSaleWithReceipts } from './_lib/supabase.js';

function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=120){ return String(value||'').trim().slice(0,max); }

async function syncApprovedSaleToSheets(sale){
  const url=process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const token=process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
  if(!url) return {status:'not_configured',message:'Webhook da planilha não configurado.'};

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        token:token||'',
        event:'sale.audit_ok',
        target:{
          spreadsheet_id:'1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ',
          sheet_name:'Vendas'
        },
        sale
      }),
      signal:controller.signal
    });
    const text=await response.text();
    let payload={};
    try{ payload=text?JSON.parse(text):{}; }catch{ payload={raw:text}; }
    if(!response.ok || payload.ok===false){
      throw new Error(payload.error || payload.message || `Google Sheets HTTP ${response.status}`);
    }
    return {status:'synced',message:'Venda enviada para a planilha.'};
  }finally{
    clearTimeout(timer);
  }
}

export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado.'});
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return json(res,405,{error:'Método não permitido'});
  }

  try{
    const saleId=clean(req.body?.sale_id,80);
    const status=clean(req.body?.status,20);
    const auditedBy=clean(req.body?.audited_by,100);
    if(!saleId) return json(res,400,{error:'Venda não informada.'});
    if(!['pending','ok','not_ok'].includes(status)) return json(res,400,{error:'Status de auditoria inválido.'});

    const patched=await patchSale(saleId,{
      audit_status:status,
      audited_by:auditedBy,
      audited_at:new Date().toISOString()
    });
    if(!patched) return json(res,404,{error:'Venda não encontrada.'});

    let sheetSync={status:'not_required'};
    let sale=await getSaleWithReceipts(saleId);

    // Regra central: somente Venda OK pode ser gravada na planilha.
    if(status==='ok'){
      if(sale.sheet_sync_status==='synced'){
        sheetSync={status:'already_synced',message:'Esta venda já está registrada na planilha.'};
      }else{
        try{
          sheetSync=await syncApprovedSaleToSheets(sale);
          if(sheetSync.status==='synced'){
            await patchSale(saleId,{
              sheet_sync_status:'synced',
              sheet_synced_at:new Date().toISOString(),
              sheet_sync_error:''
            });
          }
        }catch(error){
          const message=String(error?.message||'Falha ao enviar para a planilha.').slice(0,500);
          sheetSync={status:'error',message};
          await patchSale(saleId,{sheet_sync_status:'error',sheet_sync_error:message}).catch(()=>{});
        }
        sale=await getSaleWithReceipts(saleId);
      }
    }

    return json(res,200,{sale,sheet_sync:sheetSync});
  }catch(error){
    console.error(error);
    return json(res,500,{error:'Não foi possível atualizar a auditoria.'});
  }
}
