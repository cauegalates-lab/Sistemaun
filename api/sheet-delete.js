import { activeProfileFromRequest } from './_firebase-admin.js';
import { deleteSaleById } from './_sheets.js';
function json(res,status,payload){res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload);}
export default async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return json(res,405,{error:'Método não permitido.'});}
  try{await activeProfileFromRequest(req,{roles:['gestor']});const saleId=String(req.body?.sale_id||'').trim();if(!saleId)return json(res,400,{error:'Venda não informada.'});const result=await deleteSaleById(saleId);return json(res,200,{ok:true,deleted:result.deleted});}
  catch(error){console.error(error);return json(res,error.status||500,{error:error?.message||'Não foi possível remover a venda da planilha.'});}
}
