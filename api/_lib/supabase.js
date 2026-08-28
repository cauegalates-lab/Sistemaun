const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function isConfigured(){ return Boolean(SUPABASE_URL && SERVICE_KEY); }

async function supabase(path, options={}){
  if(!isConfigured()) throw new Error('Supabase não configurado');
  const response=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{...options,headers:{apikey:SERVICE_KEY,Authorization:`Bearer ${SERVICE_KEY}`,'Content-Type':'application/json',...(options.headers||{})}});
  if(!response.ok){ const text=await response.text(); throw new Error(`Supabase ${response.status}: ${text}`); }
  if(response.status===204) return null;
  return response.json();
}

export async function listSales({from,to,seller}){
  const query=new URLSearchParams({select:'*',order:'sale_date.desc,created_at.desc'});
  if(from) query.append('sale_date',`gte.${from}`);
  if(to) query.append('sale_date',`lte.${to}`);
  if(seller) query.append('seller_name',`eq.${seller}`);
  return supabase(`sales?${query.toString()}`);
}
export async function insertSale(sale){ const rows=await supabase('sales',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify(sale)}); return rows[0]; }
export async function deleteSale(id){ return supabase(`sales?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',headers:{Prefer:'return=minimal'}}); }
