import {
  auth, db, getActiveProfile, resolveUserUidByName,
  collection, query, where, getDocs, doc, getDoc, setDoc
} from './firebase.js';

function requireProfile(){
  const profile=getActiveProfile();
  if(!auth.currentUser || !profile) throw new Error('Sua sessão expirou. Entre novamente.');
  return profile;
}
function normalize(raw={}){
  return {
    id: raw.id || '', seller_name: raw.seller_name || '', seller_uid: raw.seller_uid || '', month: raw.month || '',
    revenue_goal: Math.max(Number(raw.revenue_goal || 0),0),
    enrollment_goal: Math.max(Number(raw.enrollment_goal || 0),0),
    boleto_goal: Math.max(Number(raw.boleto_goal || 0),0),
    updated_by: raw.updated_by || '', updated_by_uid: raw.updated_by_uid || '', updated_at: raw.updated_at || ''
  };
}
function docId(month, uid){ return `${month}__${uid}`; }

export const GoalsRepository={
  async getForSeller(sellerName, month){
    const profile=requireProfile();
    if(profile.role==='auditoria') throw new Error('Auditoria não acessa metas comerciais.');
    const sellerUid=profile.role==='vendedor' ? profile.uid : await resolveUserUidByName(sellerName);
    if(!sellerUid) return normalize({seller_name:sellerName,month});
    const snapshot=await getDoc(doc(db,'sales_goals',docId(month,sellerUid)));
    if(!snapshot.exists()) return normalize({id:docId(month,sellerUid),seller_name:sellerName,seller_uid:sellerUid,month});
    return normalize({id:snapshot.id,...snapshot.data()});
  },
  async listMonth(month){
    const profile=requireProfile();
    if(profile.role!=='gestor') throw new Error('Somente o gestor pode listar metas da equipe.');
    const snapshot=await getDocs(query(collection(db,'sales_goals'),where('month','==',month)));
    return snapshot.docs.map(item=>normalize({id:item.id,...item.data()})).sort((a,b)=>a.seller_name.localeCompare(b.seller_name,'pt-BR'));
  },
  async save(goal){
    const profile=requireProfile();
    if(profile.role!=='gestor') throw new Error('Somente o gestor pode definir metas.');
    const sellerUid=await resolveUserUidByName(goal.seller_name);
    if(!sellerUid) throw new Error('O vendedor selecionado ainda não possui perfil cadastrado no Firebase.');
    const now=new Date().toISOString();
    const row=normalize({...goal,id:docId(goal.month,sellerUid),seller_uid:sellerUid,updated_by:profile.name,updated_by_uid:profile.uid,updated_at:now});
    await setDoc(doc(db,'sales_goals',row.id),row,{merge:true});
    return row;
  }
};
