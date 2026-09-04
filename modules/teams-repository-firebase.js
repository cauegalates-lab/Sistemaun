import { TEAM_DEFINITIONS } from './catalogs.js';
import { auth, db, getActiveProfile, collection, query, where, getDocs, doc, getDoc, setDoc } from './firebase.js';

function requireProfile(){
  const profile=getActiveProfile();
  if(!auth.currentUser||!profile) throw new Error('Sua sessão expirou. Entre novamente.');
  return profile;
}
function normalize(raw={}){
  const def=TEAM_DEFINITIONS.find(team=>team.id===raw.id)||{};
  const indicator=['faturado','boleto','ponto'].includes(raw.indicator)?raw.indicator:'faturado';
  let measure=['valor','quantidade'].includes(raw.measure)?raw.measure:'valor';
  if(indicator==='ponto') measure='quantidade';
  return {
    id:raw.id||def.id||'',name:raw.name||def.name||'',accent:raw.accent||def.accent||'blue',
    captain:raw.captain||'',members:[...new Set((Array.isArray(raw.members)?raw.members:[]).filter(Boolean))],
    indicator,measure,logo_path:raw.logo_path||'',updated_by:raw.updated_by||'',updated_by_uid:raw.updated_by_uid||'',updated_at:raw.updated_at||''
  };
}
function emptyDefaults(){return TEAM_DEFINITIONS.map(team=>normalize({...team,indicator:'faturado',measure:'valor'}));}
function mergeDefaults(rows){
  const map=new Map(rows.map(row=>[row.id,normalize(row)]));
  return emptyDefaults().map(def=>map.has(def.id)?normalize({...def,...map.get(def.id)}):def);
}

export const TeamsRepository={
  async list(){
    const profile=requireProfile();
    if(profile.role!=='gestor') throw new Error('Somente o gestor pode listar todos os times.');
    const snapshot=await getDocs(collection(db,'commercial_teams'));
    return mergeDefaults(snapshot.docs.map(item=>normalize({id:item.id,...item.data()})));
  },
  async listForSeller(sellerName){
    const profile=requireProfile();
    if(profile.role==='auditoria') return [];
    if(profile.role==='gestor') return this.list();
    const snapshot=await getDocs(query(collection(db,'commercial_teams'),where('members','array-contains',sellerName||profile.name)));
    return snapshot.docs.map(item=>normalize({id:item.id,...item.data()}));
  },
  async save(config){
    const profile=requireProfile();
    if(profile.role!=='gestor') throw new Error('Somente o gestor pode configurar os times.');
    const row=normalize({...config,updated_by:profile.name,updated_by_uid:profile.uid,updated_at:new Date().toISOString()});
    await setDoc(doc(db,'commercial_teams',row.id),row,{merge:true});
    return row;
  }
};
