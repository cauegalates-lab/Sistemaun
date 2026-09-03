import admin from 'firebase-admin';

function initAdmin(){
  if(admin.apps.length)return admin.app();
  const projectId=process.env.FIREBASE_PROJECT_ID;
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey=String(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if(!projectId||!clientEmail||!privateKey)throw new Error('Firebase Admin não configurado na Vercel.');
  return admin.initializeApp({credential:admin.credential.cert({projectId,clientEmail,privateKey})});
}
function saoPauloDate(now=new Date()){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const map=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${map.year}-${map.month}-${map.day}`;
}
function weekStart(date){const d=new Date(`${date}T12:00:00Z`);const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()-(day-1));return d.toISOString().slice(0,10);}
function isWeekday(date){const d=new Date(`${date}T12:00:00Z`).getUTCDay();return d>=1&&d<=5;}
function safeId(value){return String(value||'').replace(/[^a-zA-Z0-9_-]/g,'_');}
const TASKS=['crm_update','no_idle_leads','personalized_videos','min_calls'];
function defaultTasks(){return Object.fromEntries(TASKS.map(id=>[id,false]));}

export default async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed'});
  const secret=process.env.CRON_SECRET;
  if(!secret)return res.status(503).json({ok:false,error:'CRON_SECRET não configurado.'});
  if(req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({ok:false,error:'Unauthorized'});
  try{
    initAdmin();const db=admin.firestore();const date=saoPauloDate();
    if(!isWeekday(date))return res.status(200).json({ok:true,skipped:true,date,reason:'fim de semana'});
    const week=weekStart(date);
    const [usersSnap,salesSnap,goalsSnap]=await Promise.all([
      db.collection('users').where('role','==','vendedor').get(),
      db.collection('sales').where('sale_date','>=',week).where('sale_date','<=',date).get(),
      db.collection('fca_weekly_goals').where('week_start','==',week).get()
    ]);
    const sellers=usersSnap.docs.map(doc=>({uid:doc.id,...doc.data()})).filter(user=>user.active!==false);
    const sales=salesSnap.docs.map(doc=>doc.data()).filter(row=>row.audit_status==='ok');
    const goals=new Map(goalsSnap.docs.map(doc=>[doc.data().seller_uid,doc.data()]));
    const batch=db.batch();let closed=0;
    for(const seller of sellers){
      const goal=goals.get(seller.uid)||{indicator:'Faturamento semanal',weekly_target:0};
      const sellerSales=sales.filter(row=>row.seller_uid===seller.uid||row.seller_name===seller.name);
      const daily=sellerSales.filter(row=>row.sale_date===date).reduce((sum,row)=>sum+Number(row.total_value||0),0);
      const cumulative=sellerSales.reduce((sum,row)=>sum+Number(row.total_value||0),0);
      const id=`${safeId(seller.uid)}__${date}`,ref=db.collection('fca_weekly_performance').doc(id),existing=await ref.get();
      if(existing.exists&&existing.data()?.closed)continue;
      const previous=existing.exists?existing.data():{};
      batch.set(ref,{id,seller_uid:seller.uid,seller_name:seller.name||'',date,week_start:week,tasks:{...defaultTasks(),...(previous.tasks||{})},indicator:goal.indicator||'Faturamento semanal',weekly_target:Number(goal.weekly_target||0),sold_today:daily,cumulative_sold:cumulative,remaining:Math.max(Number(goal.weekly_target||0)-cumulative,0),closed:true,closed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{merge:true});closed++;
    }
    if(closed)await batch.commit();
    return res.status(200).json({ok:true,date,week_start:week,closed});
  }catch(error){console.error(error);return res.status(500).json({ok:false,error:error.message||'Falha no fechamento diário.'});}
}
