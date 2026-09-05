import { adminDb, activeProfileFromRequest, cronAuthorized } from './_firebase-admin.js';
import { saleIndex, upsertSale } from './_sheets.js';

function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
async function authorize(req){if(cronAuthorized(req))return {role:'system',uid:'cron'};return activeProfileFromRequest(req);}
export default async function handler(req,res){
  if(!['POST','GET'].includes(req.method)){res.setHeader('Allow','POST, GET');return json(res,405,{error:'Método não permitido.'});}
  try{
    await authorize(req); const db=adminDb(); const lockRef=db.collection('system_locks').doc('google_sheets_queue');
    const now=Date.now(),lockUntil=now+55000; let acquired=false;
    await db.runTransaction(async tx=>{const snap=await tx.get(lockRef);const until=Number(snap.data()?.locked_until||0);if(until>now)return;tx.set(lockRef,{locked_until:lockUntil,updated_at:new Date().toISOString()},{merge:true});acquired=true;});
    if(!acquired)return json(res,202,{ok:true,busy:true,processed:0,remaining:null});
    let processed=0,failed=0;
    try{
      const snap=await db.collection('sales').get();
      let rows=snap.docs.map(doc=>({id:doc.id,...doc.data()})).filter(row=>row.sheet_sync_status!=='synced').sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));
      const priority=String(req.body?.sale_id||req.query?.sale_id||'').trim();
      if(priority) rows=rows.sort((a,b)=>(a.id===priority?-1:b.id===priority?1:0));
      const max=Math.min(Math.max(Number(req.query?.limit||req.body?.limit||30),1),30);
      const batch=rows.slice(0,max); let ctx=await saleIndex();
      for(const sale of batch){
        const ref=db.collection('sales').doc(sale.id); const attemptAt=new Date().toISOString();
        await ref.set({sheet_sync_status:'syncing',sheet_sync_error:'',sheet_sync_attempt_at:attemptAt},{merge:true});
        try{const result=await upsertSale(sale,ctx);ctx=result.context;const at=new Date().toISOString();await ref.set({sheet_sync_status:'synced',sheet_synced_at:at,sheet_sync_error:'',updated_at:sale.updated_at||at},{merge:true});processed++;}
        catch(error){failed++;await ref.set({sheet_sync_status:'error',sheet_sync_error:String(error?.message||error).slice(0,500),sheet_sync_attempt_at:attemptAt},{merge:true});}
      }
      const remaining=Math.max(rows.length-batch.length,0)+failed;
      const panelCount=snap.size,sheetCount=ctx.index.size,checkedAt=new Date().toISOString();
      await db.collection('system_health').doc('google_sheets').set({
        ok:panelCount===sheetCount && failed===0,
        panel_count:panelCount,
        sheet_count:sheetCount,
        queue_failed:failed,
        checked_at:checkedAt,
        last_queue_at:checkedAt,
        check_type:'queue',
        spreadsheet_id:'1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374'
      },{merge:true}).catch(()=>{});
      return json(res,200,{ok:failed===0,processed,failed,remaining,panel_count:panelCount,sheet_count:sheetCount});
    }finally{await lockRef.set({locked_until:0,updated_at:new Date().toISOString()},{merge:true}).catch(()=>{});}
  }catch(error){console.error(error);return json(res,error.status||500,{error:error?.message||'Falha na fila da planilha.'});}
}
