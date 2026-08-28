import { isConfigured, getSale, patchSale, uploadReceiptObject, downloadReceiptObject, deleteReceiptObject } from './_lib/supabase.js';

const MAX_BYTES=3*1024*1024;
const ALLOWED_TYPES=new Set([
  'application/pdf','image/jpeg','image/png','image/webp',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text','application/octet-stream'
]);

function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=180){ return String(value||'').trim().slice(0,max); }
function safeName(name){ return clean(name,140).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-') || 'comprovante'; }

export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado.'});
  try{
    if(req.method==='POST'){
      const saleId=clean(req.body?.sale_id,80);
      const fileName=safeName(req.body?.file_name);
      const fileType=clean(req.body?.file_type,120) || 'application/octet-stream';
      const declaredSize=Number(req.body?.file_size||0);
      const base64=String(req.body?.data_base64||'');
      if(!saleId || !base64) return json(res,400,{error:'Comprovante não informado.'});
      if(declaredSize>MAX_BYTES) return json(res,413,{error:'O comprovante deve ter no máximo 3 MB.'});
      if(!ALLOWED_TYPES.has(fileType)) return json(res,415,{error:'Formato de arquivo não permitido.'});
      const buffer=Buffer.from(base64,'base64');
      if(buffer.byteLength>MAX_BYTES) return json(res,413,{error:'O comprovante deve ter no máximo 3 MB.'});
      const existing=await getSale(saleId);
      if(!existing) return json(res,404,{error:'Venda não encontrada.'});
      const path=`${saleId}/${Date.now()}-${fileName}`;
      await uploadReceiptObject(path,buffer,fileType);
      if(existing.receipt_path && existing.receipt_path!==path) await deleteReceiptObject(existing.receipt_path).catch(()=>{});
      const sale=await patchSale(saleId,{
        receipt_path:path,receipt_name:fileName,receipt_type:fileType,receipt_size:buffer.byteLength,receipt_uploaded_at:new Date().toISOString()
      });
      return json(res,200,{sale});
    }

    if(req.method==='GET'){
      const saleId=clean(req.query.id,80);
      const sale=await getSale(saleId);
      if(!sale?.receipt_path) return json(res,404,{error:'Comprovante não encontrado.'});
      const object=await downloadReceiptObject(sale.receipt_path);
      const bytes=Buffer.from(await object.arrayBuffer());
      res.status(200);
      res.setHeader('Content-Type',sale.receipt_type||object.headers.get('content-type')||'application/octet-stream');
      res.setHeader('Content-Length',String(bytes.length));
      res.setHeader('Content-Disposition',`inline; filename="${safeName(sale.receipt_name)}"`);
      res.setHeader('Cache-Control','private, max-age=60');
      return res.end(bytes);
    }

    if(req.method==='DELETE'){
      const saleId=clean(req.query.id,80);
      const existing=await getSale(saleId);
      if(!existing) return json(res,404,{error:'Venda não encontrada.'});
      if(existing.receipt_path) await deleteReceiptObject(existing.receipt_path).catch(()=>{});
      const sale=await patchSale(saleId,{receipt_path:'',receipt_name:'',receipt_type:'',receipt_size:0,receipt_uploaded_at:null});
      return json(res,200,{sale});
    }

    res.setHeader('Allow','GET, POST, DELETE');
    return json(res,405,{error:'Método não permitido'});
  }catch(error){ console.error(error); return json(res,500,{error:'Não foi possível processar o comprovante.'}); }
}
