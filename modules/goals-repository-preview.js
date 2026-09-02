const STORAGE_KEY = 'unifahe.salesGoals.preview.v25';

function readRows(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}
function writeRows(rows){ localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }
function normalize(raw={}){
  return {
    id: raw.id || '',
    seller_name: raw.seller_name || '',
    seller_uid: raw.seller_uid || '',
    month: raw.month || '',
    revenue_goal: Math.max(Number(raw.revenue_goal || 0), 0),
    enrollment_goal: Math.max(Number(raw.enrollment_goal || 0), 0),
    boleto_goal: Math.max(Number(raw.boleto_goal || 0), 0),
    updated_by: raw.updated_by || '',
    updated_at: raw.updated_at || ''
  };
}
function idFor(seller, month){
  const slug=String(seller||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  return `${month}__${slug}`;
}

export const GoalsRepository={
  async getForSeller(sellerName, month){
    const row=readRows().map(normalize).find(item=>item.seller_name===sellerName && item.month===month);
    return row || normalize({id:idFor(sellerName,month),seller_name:sellerName,month});
  },
  async listMonth(month){
    return readRows().map(normalize).filter(item=>item.month===month).sort((a,b)=>a.seller_name.localeCompare(b.seller_name,'pt-BR'));
  },
  async save(goal){
    const row=normalize({...goal,id:idFor(goal.seller_name,goal.month),updated_at:new Date().toISOString()});
    const rows=readRows().map(normalize);
    const index=rows.findIndex(item=>item.id===row.id);
    if(index>=0) rows[index]=row; else rows.push(row);
    writeRows(rows);
    return row;
  }
};
