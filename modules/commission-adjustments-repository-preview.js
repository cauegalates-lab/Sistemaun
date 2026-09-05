import { uid } from './utils.js';
const KEY='unifahe.commission.adjustments.preview.v41';
function read(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
function write(rows){localStorage.setItem(KEY,JSON.stringify(rows));}
function normalize(raw={}){return {id:raw.id||uid(),seller_name:raw.seller_name||'',seller_uid:raw.seller_uid||'',month:raw.month||'',title:raw.title||'',amount:Math.max(Number(raw.amount||0),0),created_by:raw.created_by||'',created_at:raw.created_at||new Date().toISOString()};}
export const CommissionAdjustmentsRepository={
  async listForSeller(sellerName,month){return read().map(normalize).filter(r=>r.seller_name===sellerName&&r.month===month).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));},
  async add({seller_name,month,title,amount,created_by}){const row=normalize({seller_name,month,title,amount,created_by});const rows=read();rows.unshift(row);write(rows);return row;},
  async remove(id){write(read().filter(r=>r.id!==id));return true;}
};
