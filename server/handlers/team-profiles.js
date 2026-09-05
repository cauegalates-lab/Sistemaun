import { activeProfileFromRequest, adminDb } from './_firebase-admin.js';
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
export default async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return json(res,405,{error:'Método não permitido.'});}
  try{
    await activeProfileFromRequest(req);
    const snap=await adminDb().collection('users').get();
    const profiles=snap.docs.map(doc=>({uid:doc.id,...doc.data()}))
      .filter(row=>row.active!==false&&row.role==='vendedor'&&row.name)
      .map(row=>({name:row.name,photo_url:row.photo_url||''}));
    return json(res,200,{profiles});
  }catch(error){return json(res,error.status||500,{error:error?.message||'Não foi possível carregar os perfis.'});}
}
