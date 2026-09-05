import { adminDb, activeProfileFromRequest } from './_firebase-admin.js';
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Método não permitido.'});}
  try{await activeProfileFromRequest(req);const snap=await adminDb().collection('system_health').doc('google_sheets').get();return json(res,200,{ok:true,health:snap.exists?snap.data():null});}
  catch(error){return json(res,error.status||500,{error:error?.message||'Não foi possível consultar a integração.'});}
}
