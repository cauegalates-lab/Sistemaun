import { JWT } from 'google-auth-library';

export const SPREADSHEET_ID='1YeRPIxdWW0xNaajJnldl06Egv3DA1Utnwq44pcSH374';
export const SHEET_GID=0;
export const REQUIRED_HEADERS=[
  'ID VENDA','DATA','VENDEDOR','ALUNO','TIPO PAGAMENTO','TAXA / PARCELA','PARCELAS','VALOR TOTAL',
  'MODALIDADE','PENDÊNCIA','CURSO','ESTADO','ORIGEM','QTD. CURSOS','AUDITORIA','AUDITADO POR','DATA AUDITORIA',
  'QTD. COMPROVANTES','COMPROVANTE 1','COMPROVANTE 2','COMPROVANTE 3','CRIADO EM','ATUALIZADO EM','SINCRONIZADO EM'
];

let authClientPromise=null;
async function authClient(){
  if(authClientPromise) return authClientPromise;
  authClientPromise=(async()=>{
    const email=process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
    const key=String(process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g,'\n');
    if(!email || !key) throw new Error('Credenciais Google não configuradas. Compartilhe a planilha com o e-mail da service account do Firebase ou configure GOOGLE_SERVICE_ACCOUNT_EMAIL/GOOGLE_PRIVATE_KEY.');
    return new JWT({email,key,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  })();
  return authClientPromise;
}

async function api(path,{method='GET',body}={}){
  const client=await authClient();
  const headers=await client.getRequestHeaders();
  const response=await fetch(`https://sheets.googleapis.com/v4/${path}`,{
    method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload?.error?.message || `Google Sheets HTTP ${response.status}`);
  return payload;
}
function range(title,a1){ return encodeURIComponent(`${title}!${a1}`); }
function colLetter(index){ let n=index+1,out=''; while(n){const r=(n-1)%26;out=String.fromCharCode(65+r)+out;n=Math.floor((n-1)/26);} return out; }
function paymentLabel(type){return ({cartao:'Cartão',boleto:'Boleto',sem_taxa_migracao:'Sem taxa migração'})[type]||type||'';}
function auditLabel(status){return ({ok:'OK',not_ok:'NÃO OK',pending:'PENDENTE'})[status]||String(status||'').toUpperCase();}
function num(value){const n=Number(value||0);return Number.isFinite(n)?n:0;}

export async function sheetInfo(){
  const payload=await api(`spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties`);
  const sheets=payload.sheets||[];
  const selected=sheets.find(s=>Number(s.properties?.sheetId)===SHEET_GID)||sheets[0];
  if(!selected) throw new Error('A planilha não possui abas.');
  return {sheetId:selected.properties.sheetId,title:selected.properties.title};
}
export async function ensureSheet(){
  const info=await sheetInfo();
  const payload=await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(info.title,'1:1')}`);
  let headers=(payload.values?.[0]||[]).map(v=>String(v||'').trim());
  if(!headers.some(Boolean)) headers=[];
  const missing=REQUIRED_HEADERS.filter(h=>!headers.includes(h));
  if(!headers.length){
    headers=[...REQUIRED_HEADERS];
    await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(info.title,`A1:${colLetter(headers.length-1)}1`)}?valueInputOption=RAW`,{method:'PUT',body:{values:[headers]}});
  }else if(missing.length){
    const start=headers.length;
    headers.push(...missing);
    await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(info.title,`${colLetter(start)}1:${colLetter(headers.length-1)}1`)}?valueInputOption=RAW`,{method:'PUT',body:{values:[missing]}});
  }
  return {...info,headers};
}
export async function saleIndex(ctx=null){
  const context=ctx||await ensureSheet();
  const idIndex=context.headers.indexOf('ID VENDA');
  if(idIndex<0) throw new Error('Cabeçalho ID VENDA não encontrado.');
  const col=colLetter(idIndex);
  const payload=await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(context.title,`${col}2:${col}`)}`);
  const values=payload.values||[]; const index=new Map();
  values.forEach((row,i)=>{const id=String(row?.[0]||'').trim();if(id)index.set(id,i+2);});
  return {...context,idIndex,index,nextRow:values.length+2};
}
export function saleRecord(sale){
  const receipts=Array.isArray(sale.receipts)?sale.receipts.slice(0,3):[];
  return {
    'ID VENDA':sale.id||'', 'DATA':sale.sale_date||'', 'VENDEDOR':sale.seller_name||'', 'ALUNO':sale.student_name||'',
    'TIPO PAGAMENTO':paymentLabel(sale.payment_type),'TAXA / PARCELA':num(sale.fee_value),'PARCELAS':num(sale.installments),'VALOR TOTAL':num(sale.total_value),
    'MODALIDADE':sale.modality||'','PENDÊNCIA':sale.pending||'','CURSO':sale.course||'','ESTADO':sale.state||'','ORIGEM':sale.origin||'',
    'QTD. CURSOS':num(sale.course_quantity),'AUDITORIA':auditLabel(sale.audit_status),'AUDITADO POR':sale.audited_by||'','DATA AUDITORIA':sale.audited_at||'',
    'QTD. COMPROVANTES':receipts.length,'COMPROVANTE 1':receipts[0]?.name||'','COMPROVANTE 2':receipts[1]?.name||'','COMPROVANTE 3':receipts[2]?.name||'',
    'CRIADO EM':sale.created_at||'','ATUALIZADO EM':sale.updated_at||'','SINCRONIZADO EM':new Date().toISOString()
  };
}
export async function upsertSale(sale,ctx){
  const context=ctx||await saleIndex();
  const record=saleRecord(sale);
  const row=context.headers.map(header=>Object.prototype.hasOwnProperty.call(record,header)?record[header]:'');
  const existing=context.index.get(String(sale.id));
  if(existing){
    await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(context.title,`A${existing}:${colLetter(context.headers.length-1)}${existing}`)}?valueInputOption=RAW`,{method:'PUT',body:{values:[row]}});
    return {row:existing,context};
  }
  const payload=await api(`spreadsheets/${SPREADSHEET_ID}/values/${range(context.title,`A:${colLetter(context.headers.length-1)}`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',body:{values:[row]}});
  const match=String(payload.updates?.updatedRange||'').match(/!(?:[A-Z]+)(\d+):/);
  const rowNumber=match?Number(match[1]):context.nextRow;
  context.index.set(String(sale.id),rowNumber);context.nextRow=Math.max(context.nextRow,rowNumber+1);
  return {row:rowNumber,context};
}
export async function deleteSaleById(saleId,ctx=null){
  const context=ctx||await saleIndex(); const row=context.index.get(String(saleId));
  if(!row) return {deleted:false,context};
  await api(`spreadsheets/${SPREADSHEET_ID}:batchUpdate`,{method:'POST',body:{requests:[{deleteDimension:{range:{sheetId:context.sheetId,dimension:'ROWS',startIndex:row-1,endIndex:row}}}]}});
  context.index.delete(String(saleId));
  for(const [id,value] of context.index) if(value>row) context.index.set(id,value-1);
  context.nextRow=Math.max(2,context.nextRow-1);
  return {deleted:true,context};
}
export async function sheetCount(){const context=await saleIndex();return {count:context.index.size,context};}
