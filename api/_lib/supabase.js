const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RECEIPT_BUCKET = 'sales-receipts';

export function isConfigured(){ return Boolean(SUPABASE_URL && SERVICE_KEY); }
function authHeaders(extra={}) { return { apikey:SERVICE_KEY, Authorization:`Bearer ${SERVICE_KEY}`, ...extra }; }
async function supabase(path, options={}){
  if(!isConfigured()) throw new Error('Supabase não configurado');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:authHeaders({'Content-Type':'application/json',...(options.headers||{})})});
  if(!response.ok){ const text=await response.text(); throw new Error(`Supabase ${response.status}: ${text}`); }
  if(response.status===204) return null;
  return response.json();
}

export async function listSales({from,to,seller}){
  const query=new URLSearchParams({select:'*',order:'sale_date.desc,created_at.desc'});
  if(from) query.append('sale_date',`gte.${from}`); if(to) query.append('sale_date',`lte.${to}`); if(seller) query.append('seller_name',`eq.${seller}`);
  return supabase(`sales?${query.toString()}`);
}
export async function getSale(id){ const rows=await supabase(`sales?id=eq.${encodeURIComponent(id)}&select=*`); return rows[0]||null; }
export async function insertSale(sale){ const rows=await supabase('sales',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(sale)}); return rows[0]; }
export async function patchSale(id,patch){ const rows=await supabase(`sales?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)}); return rows[0]||null; }
export async function deleteSale(id){ return supabase(`sales?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); }

export async function listReceiptsForSales(saleIds){
  if(!saleIds?.length) return [];
  const ids=saleIds.map(id=>String(id).replace(/[^a-fA-F0-9-]/g,'')).join(',');
  return supabase(`sales_receipts?select=*&sale_id=in.(${encodeURIComponent(ids)})&order=created_at.asc`);
}
export async function listReceiptsForSale(saleId){ return supabase(`sales_receipts?select=*&sale_id=eq.${encodeURIComponent(saleId)}&order=created_at.asc`); }
export async function getReceipt(id){ const rows=await supabase(`sales_receipts?id=eq.${encodeURIComponent(id)}&select=*`); return rows[0]||null; }
export async function insertReceipt(receipt){ const rows=await supabase('sales_receipts',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(receipt)}); return rows[0]; }
export async function deleteReceipt(id){ return supabase(`sales_receipts?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); }

function normalizeReceipt(row){ return row?{id:row.id,sale_id:row.sale_id,path:row.file_path,name:row.file_name,type:row.file_type,size:Number(row.file_size||0),uploaded_at:row.created_at}:null; }
export function attachReceipts(sales,receipts){
  const grouped=new Map();
  for(const row of receipts||[]){ const item=normalizeReceipt(row); if(!grouped.has(item.sale_id)) grouped.set(item.sale_id,[]); grouped.get(item.sale_id).push(item); }
  return (sales||[]).map(sale=>({...sale,receipts:grouped.get(sale.id)||[]}));
}
export async function getSaleWithReceipts(id){ const sale=await getSale(id); if(!sale)return null; const receipts=await listReceiptsForSale(id); return attachReceipts([sale],receipts)[0]; }

export async function uploadReceiptObject(path,buffer,contentType){
  if(!isConfigured()) throw new Error('Supabase não configurado');
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${RECEIPT_BUCKET}/${path}`,{method:'POST',headers:authHeaders({'Content-Type':contentType||'application/octet-stream','x-upsert':'false'}),body:buffer});
  if(!response.ok) throw new Error(`Storage ${response.status}: ${await response.text()}`);
}
export async function downloadReceiptObject(path){
  if(!isConfigured()) throw new Error('Supabase não configurado');
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${RECEIPT_BUCKET}/${path}`,{headers:authHeaders()});
  if(!response.ok) throw new Error(`Storage ${response.status}: ${await response.text()}`); return response;
}
export async function deleteReceiptObject(path){
  if(!path)return; if(!isConfigured()) throw new Error('Supabase não configurado');
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${RECEIPT_BUCKET}/${path}`,{method:'DELETE',headers:authHeaders()});
  if(!response.ok&&response.status!==404) throw new Error(`Storage ${response.status}: ${await response.text()}`);
}

export async function listFcaReports(){
  return supabase('fca_reports?select=*&order=created_at.desc');
}
export async function getFcaReport(id){ const rows=await supabase(`fca_reports?id=eq.${encodeURIComponent(id)}&select=*`); return rows[0]||null; }
export async function insertFcaReport(report){ const rows=await supabase('fca_reports',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(report)}); return rows[0]; }
export async function patchFcaReport(id,patch){ const rows=await supabase(`fca_reports?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)}); return rows[0]||null; }

export async function listFcaActions(){
  return supabase('fca_actions?select=*&order=created_at.desc');
}
export async function getFcaAction(id){ const rows=await supabase(`fca_actions?id=eq.${encodeURIComponent(id)}&select=*`); return rows[0]||null; }
export async function insertFcaAction(item){ const rows=await supabase('fca_actions',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(item)}); return rows[0]; }
export async function patchFcaAction(id,patch){ const rows=await supabase(`fca_actions?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(patch)}); return rows[0]||null; }
