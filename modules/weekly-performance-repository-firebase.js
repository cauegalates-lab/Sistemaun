import {
  auth, db, getActiveProfile, resolveUserUidByName,
  collection, query, where, getDocs, doc, getDoc, setDoc, updateDoc
} from './firebase.js';

export const WEEKLY_PERFORMANCE_TASKS = [
  { id:'crm_update', label:'Organizar e atualizar o CRM' },
  { id:'no_idle_leads', label:'Não deixar nenhum lead parado' },
  { id:'personalized_videos', label:'Enviar 5 vídeos personalizados' },
  { id:'min_calls', label:'Realizar no mínimo 10 ligações' }
];
function requireProfile(){const profile=getActiveProfile();if(!auth.currentUser||!profile)throw new Error('Sua sessão expirou. Entre novamente.');return profile;}
function defaultTasks(){return Object.fromEntries(WEEKLY_PERFORMANCE_TASKS.map(task=>[task.id,false]));}
function safeId(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_');}
function goalDocId(uid,weekStart){return `${safeId(uid)}__${weekStart}`;}
function recordDocId(uid,date){return `${safeId(uid)}__${date}`;}
function normalizeGoal(raw={}){return{id:raw.id||'',seller_uid:raw.seller_uid||'',seller_name:raw.seller_name||'',week_start:raw.week_start||'',indicator:raw.indicator||'Faturamento semanal',weekly_target:Number(raw.weekly_target||0),updated_by:raw.updated_by||'',updated_at:raw.updated_at||''};}
function normalizeRecord(raw={}){return{id:raw.id||'',seller_uid:raw.seller_uid||'',seller_name:raw.seller_name||'',date:raw.date||'',week_start:raw.week_start||'',tasks:{...defaultTasks(),...(raw.tasks||{})},indicator:raw.indicator||'Faturamento semanal',weekly_target:Number(raw.weekly_target||0),sold_today:Number(raw.sold_today||0),cumulative_sold:Number(raw.cumulative_sold||0),remaining:Number(raw.remaining||0),closed:Boolean(raw.closed),closed_at:raw.closed_at||'',updated_at:raw.updated_at||''};}
async function sellerUidFor(sellerName){const profile=requireProfile();if(profile.role==='vendedor'){if(profile.name!==sellerName)throw new Error('Você só pode acessar seu próprio painel semanal.');return profile.uid;}const uid=await resolveUserUidByName(sellerName);if(!uid)throw new Error('Vendedor não cadastrado no Firebase.');return uid;}

export const WeeklyPerformanceRepository={
  tasks:WEEKLY_PERFORMANCE_TASKS,
  async getGoal(sellerName,weekStart){const uid=await sellerUidFor(sellerName);const snap=await getDoc(doc(db,'fca_weekly_goals',goalDocId(uid,weekStart)));return snap.exists()?normalizeGoal({id:snap.id,...snap.data()}):normalizeGoal({id:goalDocId(uid,weekStart),seller_uid:uid,seller_name:sellerName,week_start:weekStart});},
  async listGoals(weekStart){const profile=requireProfile();if(profile.role!=='gestor')return[];const snap=await getDocs(query(collection(db,'fca_weekly_goals'),where('week_start','==',weekStart)));return snap.docs.map(item=>normalizeGoal({id:item.id,...item.data()}));},
  async saveGoal({seller_name,week_start,indicator,weekly_target,updated_by}){const profile=requireProfile();if(profile.role!=='gestor')throw new Error('Somente o gestor define a meta semanal.');const uid=await sellerUidFor(seller_name),id=goalDocId(uid,week_start),item=normalizeGoal({id,seller_uid:uid,seller_name,week_start,indicator:String(indicator||'Faturamento semanal').trim()||'Faturamento semanal',weekly_target:Number(weekly_target||0),updated_by:updated_by||profile.name,updated_at:new Date().toISOString()});await setDoc(doc(db,'fca_weekly_goals',id),item,{merge:true});return item;},
  async getWeekRecords(sellerName,weekStart){const uid=await sellerUidFor(sellerName),rows=[];const start=new Date(`${weekStart}T12:00:00`);for(let i=0;i<5;i++){const d=new Date(start);d.setDate(d.getDate()+i);const date=d.toISOString().slice(0,10);const snap=await getDoc(doc(db,'fca_weekly_performance',recordDocId(uid,date)));if(snap.exists())rows.push(normalizeRecord({id:snap.id,...snap.data()}));}return rows.sort((a,b)=>a.date.localeCompare(b.date));},
  async listWeekRecords(weekStart){const profile=requireProfile();if(profile.role!=='gestor')return[];const snap=await getDocs(query(collection(db,'fca_weekly_performance'),where('week_start','==',weekStart)));return snap.docs.map(item=>normalizeRecord({id:item.id,...item.data()})).sort((a,b)=>a.date.localeCompare(b.date));},
  async listClosedReports(){const profile=requireProfile();if(profile.role!=='gestor')return[];const snap=await getDocs(query(collection(db,'fca_weekly_performance'),where('closed','==',true)));return snap.docs.map(item=>normalizeRecord({id:item.id,...item.data()})).sort((a,b)=>String(b.closed_at||b.date).localeCompare(String(a.closed_at||a.date))).slice(0,80);},
  async saveTasks({seller_name,date,week_start,tasks}){const profile=requireProfile();if(profile.role!=='vendedor'||profile.name!==seller_name)throw new Error('Somente o vendedor pode atualizar o próprio painel.');const id=recordDocId(profile.uid,date),ref=doc(db,'fca_weekly_performance',id),snap=await getDoc(ref);if(snap.exists()&&snap.data()?.closed)throw new Error('Este dia já foi encerrado e não pode mais ser alterado.');const goal=await this.getGoal(seller_name,week_start),now=new Date().toISOString();if(snap.exists()){await updateDoc(ref,{tasks:{...defaultTasks(),...(snap.data()?.tasks||{}),...tasks},updated_at:now});}else{await setDoc(ref,{id,seller_uid:profile.uid,seller_name,date,week_start,tasks:{...defaultTasks(),...tasks},indicator:goal.indicator,weekly_target:goal.weekly_target,sold_today:0,cumulative_sold:0,remaining:goal.weekly_target,closed:false,closed_at:'',updated_at:now});}const fresh=await getDoc(ref);return normalizeRecord({id:fresh.id,...fresh.data()});},
  async finalizeOverdue(){return false;}
};
