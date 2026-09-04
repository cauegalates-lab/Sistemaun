import { TEAM_DEFINITIONS } from './catalogs.js';

const STORAGE_KEY='unifahe.teams.preview.v38';

function defaults(){
  return TEAM_DEFINITIONS.map(team=>normalize({
    ...team,
    captain:'',
    members: team.id==='evolution' ? ['Cauê Galates'] : [],
    indicator:'faturado',
    measure:'valor',
    logo_path:'',
    updated_at:''
  }));
}
function normalize(raw={}){
  const def=TEAM_DEFINITIONS.find(team=>team.id===raw.id)||{};
  const indicator=['faturado','boleto','ponto'].includes(raw.indicator)?raw.indicator:'faturado';
  let measure=['valor','quantidade'].includes(raw.measure)?raw.measure:'valor';
  if(indicator==='ponto') measure='quantidade';
  return {
    id:raw.id||def.id||'',
    name:raw.name||def.name||'',
    accent:raw.accent||def.accent||'blue',
    captain:raw.captain||'',
    members:[...new Set((Array.isArray(raw.members)?raw.members:[]).filter(Boolean))],
    indicator,measure,
    logo_path:raw.logo_path||'',
    updated_by:raw.updated_by||'',
    updated_at:raw.updated_at||''
  };
}
function read(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    const map=new Map((Array.isArray(saved)?saved:[]).map(row=>[row.id,normalize(row)]));
    return defaults().map(def=>map.has(def.id)?normalize({...def,...map.get(def.id)}):def);
  }catch{return defaults();}
}
function write(rows){localStorage.setItem(STORAGE_KEY,JSON.stringify(rows.map(normalize)));}

export const TeamsRepository={
  async list(){return read();},
  async listForSeller(sellerName){
    const rows=read();
    return rows.filter(row=>row.members.includes(sellerName));
  },
  async save(config){
    const rows=read();
    const row=normalize({...config,updated_at:new Date().toISOString()});
    const index=rows.findIndex(item=>item.id===row.id);
    if(index>=0) rows[index]=row; else rows.push(row);
    write(rows);
    return row;
  }
};
