import { adminDb, cronAuthorized, activeProfileFromRequest } from './_firebase-admin.js';
import { saleIndex, upsertSale, deleteSaleById } from './_sheets.js';
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
async function authorize(req){if(cronAuthorized(req))return {role:'system'};return activeProfileFromRequest(req,{roles:['gestor']});}
export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method)){res.setHeader('Allow','GET, POST');return json(res,405,{error:'Método não permitido.'});}
  try{
    await authorize(req);const db=adminDb();const snap=await db.collection('sales').get();const sales=snap.docs.map(d=>({id:d.id,...d.data()}));const panelIds=new Set(sales.map(s=>String(s.id)));
    let ctx=await saleIndex();const sheetIds=new Set(ctx.index.keys());const missing=sales.filter(s=>!sheetIds.has(String(s.id)));const stale=[...sheetIds].filter(id=>!panelIds.has(id));
    let repaired=0,removed=0;
    for(const sale of missing){const result=await upsertSale(sale,ctx);ctx=result.context;await db.collection('sales').doc(sale.id).set({sheet_sync_status:'synced',sheet_synced_at:new Date().toISOString(),sheet_sync_error:''},{merge:true});repaired++;}
    // remover de baixo para cima evita deslocamento inesperado das linhas
    const staleSorted=stale.sort((a,b)=>(ctx.index.get(b)||0)-(ctx.index.get(a)||0));
    for(const id of staleSorted){const result=await deleteSaleById(id,ctx);ctx=result.context;if(result.deleted)removed++;}
    const panelCount=sales.length,sheetCount=ctx.index.size,ok=panelCount===sheetCount;
    const health={ok,panel_count:panelCount,sheet_count:sheetCount,missing_repaired:repaired,stale_removed:removed,checked_at:new Date().toISOString(),spreadsheet_id:'1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374'};
    await db.collection('system_health').doc('google_sheets').set(health,{merge:true});
    return json(res,200,{ok:true,health});
  }catch(error){console.error(error);return json(res,error.status||500,{error:error?.message||'Falha na conferência da planilha.'});}
}
