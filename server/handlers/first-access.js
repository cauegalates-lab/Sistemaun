import { SELLERS } from '../../modules/catalogs.js';
import { adminAuth, adminDb } from './_firebase-admin.js';

function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
function normalizeLogin(value=''){
  const raw=String(value||'').trim().toLowerCase();
  if(!raw) return {login:'',email:''};
  if(raw.includes('@')) return {login:raw.split('@')[0],email:raw};
  const login=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]/g,'').slice(0,48);
  return {login,email:`${login}@unifahe.com.br`};
}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Método não permitido.'});}
  try{
    const sellerName=String(req.body?.seller_name||'').trim();
    const {login,email}=normalizeLogin(req.body?.login);
    const password=String(req.body?.password||'');
    const accessCode=String(req.body?.access_code||'');
    const expected=String(process.env.FIRST_ACCESS_CODE||'').trim();
    if(!expected) return json(res,503,{error:'Primeiro acesso ainda não foi configurado pelo gestor.'});
    if(accessCode!==expected) return json(res,403,{error:'Código de primeiro acesso inválido.'});
    if(!SELLERS.includes(sellerName)) return json(res,400,{error:'Selecione um vendedor válido.'});
    if(login.length<3 || !email) return json(res,400,{error:'O login deve ter pelo menos 3 caracteres.'});
    if(password.length<8) return json(res,400,{error:'A senha deve ter pelo menos 8 caracteres.'});
    const db=adminDb(); const auth=adminAuth();
    const byName=await db.collection('users').where('name','==',sellerName).limit(1).get();
    if(!byName.empty) return json(res,409,{error:'Este vendedor já possui um primeiro acesso cadastrado. Procure o gestor se precisar redefinir a senha.'});
    try{await auth.getUserByEmail(email);return json(res,409,{error:'Este login já está em uso.'});}catch(error){if(error?.code!=='auth/user-not-found')throw error;}
    const user=await auth.createUser({email,password,displayName:sellerName,disabled:false});
    const now=new Date().toISOString();
    try{
      const teamSnap=await db.collection('commercial_teams').where('members','array-contains',sellerName).limit(1).get();
      const teamName=teamSnap.empty?'':String(teamSnap.docs[0].data()?.name||'');
      await db.collection('users').doc(user.uid).set({uid:user.uid,email,login,name:sellerName,role:'vendedor',team:teamName,sector:'Comercial',active:true,photo_url:'',photo_path:'',first_access_at:now,created_at:now,updated_at:now});
      // Vendas lançadas pelo gestor antes do primeiro acesso ficam vinculadas agora.
      const historicalSales=await db.collection('sales').where('seller_name','==',sellerName).get();
      if(!historicalSales.empty){
        const batch=db.batch();
        historicalSales.docs.forEach(doc=>batch.set(doc.ref,{seller_uid:user.uid,updated_at:now},{merge:true}));
        await batch.commit();
      }
    }catch(error){await auth.deleteUser(user.uid).catch(()=>{});throw error;}
    return json(res,201,{ok:true,login,email,name:sellerName,message:'Primeiro acesso criado. Você já pode entrar.'});
  }catch(error){console.error(error);return json(res,500,{error:error?.message||'Não foi possível criar o primeiro acesso.'});}
}
