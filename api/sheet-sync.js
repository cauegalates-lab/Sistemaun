const FIREBASE_API_KEY = 'AIzaSyA7U14RV-18vay99BToRp0Ff4yvUPvGaLI';
const FIREBASE_PROJECT_ID = 'sistema-comercial-647ed';
const SPREADSHEET_ID = '1BzqFOj4TaLjpgRmnocQxxlQq8O7wWeOQsxbTzZI0gUQ';
const SHEET_NAME = 'Vendas';

function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=120){ return String(value||'').trim().slice(0,max); }

function decodeValue(value={}) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return '';
}
function decodeFields(fields={}) { return Object.fromEntries(Object.entries(fields).map(([key,value]) => [key,decodeValue(value)])); }

async function lookupFirebaseUser(idToken) {
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`, {
    method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({idToken})
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.users?.[0]) throw new Error('Sessão Firebase inválida.');
  return payload.users[0];
}

async function firestoreDocument(path,idToken) {
  const response = await fetch(`https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`, {
    headers:{Authorization:`Bearer ${idToken}`}
  });
  if (response.status === 404) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Firestore HTTP ${response.status}`);
  return { id: String(payload.name || '').split('/').pop(), ...decodeFields(payload.fields || {}) };
}

async function syncApprovedSaleToSheets(sale){
  const url=process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const token=process.env.GOOGLE_SHEETS_WEBHOOK_TOKEN;
  if(!url) return {status:'not_configured',message:'Webhook da planilha não configurado.'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const response=await fetch(url,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({token:token||'',event:'sale.audit_ok',target:{spreadsheet_id:SPREADSHEET_ID,sheet_name:SHEET_NAME},sale}),
      signal:controller.signal
    });
    const text=await response.text(); let payload={};
    try{payload=text?JSON.parse(text):{};}catch{payload={raw:text};}
    if(!response.ok || payload.ok===false) throw new Error(payload.error||payload.message||`Google Sheets HTTP ${response.status}`);
    return {status:'synced',message:'Venda enviada para a planilha.'};
  }finally{clearTimeout(timer);}
}

export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Método não permitido'});}
  try{
    const authorization=String(req.headers.authorization||'');
    const idToken=authorization.startsWith('Bearer ')?authorization.slice(7):'';
    if(!idToken) return json(res,401,{error:'Sessão não informada.'});
    const authUser=await lookupFirebaseUser(idToken);
    const uid=authUser.localId;
    const profile=await firestoreDocument(`users/${encodeURIComponent(uid)}`,idToken);
    if(!profile || profile.active===false || !['gestor','auditoria'].includes(profile.role)) return json(res,403,{error:'Somente Gestor ou Auditoria podem sincronizar vendas aprovadas.'});

    const saleId=clean(req.body?.sale_id,100);
    if(!saleId) return json(res,400,{error:'Venda não informada.'});
    const sale=await firestoreDocument(`sales/${encodeURIComponent(saleId)}`,idToken);
    if(!sale) return json(res,404,{error:'Venda não encontrada.'});
    if(sale.audit_status!=='ok') return json(res,409,{error:'Somente vendas com auditoria OK podem ser enviadas para a planilha.'});
    if(sale.sheet_sync_status==='synced') return json(res,200,{sheet_sync:{status:'already_synced',message:'Esta venda já está registrada na planilha.'}});

    const sheetSync=await syncApprovedSaleToSheets(sale);
    return json(res,200,{sheet_sync:sheetSync});
  }catch(error){
    console.error(error);
    return json(res,500,{error:String(error?.message||'Não foi possível sincronizar a venda.')});
  }
}
