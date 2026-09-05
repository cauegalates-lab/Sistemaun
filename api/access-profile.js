import { adminAuth, adminDb } from './_firebase-admin.js';
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
function emailFor(value=''){const raw=String(value||'').trim().toLowerCase();return raw.includes('@')?raw:`${raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9._-]/g,'')}@unifahe.com.br`;}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Método não permitido.'});}
  try{
    const raw=String(req.query?.login||'').trim(); if(raw.length<2)return json(res,400,{error:'Login inválido.'});
    const email=emailFor(raw); let user;
    try{user=await adminAuth().getUserByEmail(email);}catch(error){if(error?.code==='auth/user-not-found')return json(res,404,{found:false});throw error;}
    const snap=await adminDb().collection('users').doc(user.uid).get();
    if(!snap.exists || snap.data()?.active===false)return json(res,404,{found:false});
    const p=snap.data()||{};
    return json(res,200,{found:true,profile:{name:p.name||user.displayName||raw,role:p.role||'vendedor',team:p.team||p.time||'',sector:p.sector||p.setor||'Comercial',photo_url:p.photo_url||''}});
  }catch(error){console.error(error);return json(res,500,{error:'Não foi possível localizar o acesso.'});}
}
