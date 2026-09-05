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
    const {login,email}=normalizeLogin(req.body?.login);
    const password=String(req.body?.password||'');
    const resetCode=String(req.body?.reset_code||'');
    const expected=String(process.env.PASSWORD_RESET_CODE||'').trim();
    if(!expected) return json(res,503,{error:'A recuperação de senha ainda não foi configurada pelo gestor.'});
    if(resetCode!==expected) return json(res,403,{error:'Código de recuperação inválido.'});
    if(login.length<3 || !email) return json(res,400,{error:'Informe um usuário válido.'});
    if(password.length<8) return json(res,400,{error:'A nova senha deve ter pelo menos 8 caracteres.'});
    const auth=adminAuth(),db=adminDb();
    let user;
    try{user=await auth.getUserByEmail(email);}catch(error){if(error?.code==='auth/user-not-found')return json(res,404,{error:'Acesso não localizado.'});throw error;}
    await auth.updateUser(user.uid,{password});
    await auth.revokeRefreshTokens(user.uid);
    const now=new Date().toISOString();
    await db.collection('users').doc(user.uid).set({password_reset_at:now,updated_at:now},{merge:true});
    return json(res,200,{ok:true,login,email,message:'Senha redefinida com sucesso.'});
  }catch(error){console.error(error);return json(res,500,{error:error?.message||'Não foi possível redefinir a senha.'});}
}
