import { isConfigured, getSale, getSaleWithReceipts, listReceiptsForSale, getReceipt, insertReceipt, deleteReceipt, uploadReceiptObject, downloadReceiptObject, deleteReceiptObject } from './_lib/supabase.js';

const MAX_BYTES=3*1024*1024;
const MAX_RECEIPTS=3;
const ALLOWED_TYPES=new Set(['application/pdf','image/jpeg','image/png','image/webp','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.oasis.opendocument.text','application/octet-stream']);
function json(res,status,payload){ res.status(status).setHeader('Content-Type','application/json; charset=utf-8').json(payload); }
function clean(value,max=180){ return String(value||'').trim().slice(0,max); }
function safeName(name){ return clean(name,140).replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-')||'comprovante'; }

export default async function handler(req,res){
  if(!isConfigured()) return json(res,503,{error:'Banco de dados ainda não configurado.'});
  try{
    if(req.method==='POST'){
      const saleId=clean(req.body?.sale_id,80), fileName=safeName(req.body?.file_name), fileType=clean(req.body?.file_type,120)||'application/octet-stream';
      const declaredSize=Number(req.body?.file_size||0), base64=String(req.body?.data_base64||'');
      if(!saleId||!base64) return json(res,400,{error:'Comprovante não informado.'});
      if(declaredSize>MAX_BYTES) return json(res,413,{error:'O comprovante deve ter no máximo 3 MB.'});
      if(!ALLOWED_TYPES.has(fileType)) return json(res,415,{error:'Formato de arquivo não permitido.'});
      const buffer=Buffer.from(base64,'base64'); if(buffer.byteLength>MAX_BYTES) return json(res,413,{error:'O comprovante deve ter no máximo 3 MB.'});
      const sale=await getSale(saleId); if(!sale) return json(res,404,{error:'Venda não encontrada.'});
      const receipts=await listReceiptsForSale(saleId); if(receipts.length>=MAX_RECEIPTS) return json(res,409,{error:'Esta venda já possui 3 comprovantes.'});
      const path=`${saleId}/${Date.now()}-${fileName}`;
      await uploadReceiptObject(path,buffer,fileType);
      try{ await insertReceipt({sale_id:saleId,file_path:path,file_name:fileName,file_type:fileType,file_size:buffer.byteLength}); }
      catch(error){ await deleteReceiptObject(path).catch(()=>{}); throw error; }
      return json(res,201,{sale:await getSaleWithReceipts(saleId)});
    }
    if(req.method==='GET'){
      const receiptId=clean(req.query.receipt_id,80); const receipt=await getReceipt(receiptId);
      if(!receipt) return json(res,404,{error:'Comprovante não encontrado.'});
      const object=await downloadReceiptObject(receipt.file_path); const bytes=Buffer.from(await object.arrayBuffer());
      res.status(200); res.setHeader('Content-Type',receipt.file_type||object.headers.get('content-type')||'application/octet-stream');
      res.setHeader('Content-Length',String(bytes.length)); res.setHeader('Content-Disposition',`inline; filename="${safeName(receipt.file_name)}"`); res.setHeader('Cache-Control','private, max-age=60');
      return res.end(bytes);
    }
    if(req.method==='DELETE'){
      const receiptId=clean(req.query.receipt_id,80); const receipt=await getReceipt(receiptId);
      if(!receipt) return json(res,404,{error:'Comprovante não encontrado.'});
      await deleteReceiptObject(receipt.file_path).catch(()=>{}); await deleteReceipt(receiptId);
      return json(res,200,{sale:await getSaleWithReceipts(receipt.sale_id)});
    }
    res.setHeader('Allow','GET, POST, DELETE'); return json(res,405,{error:'Método não permitido'});
  }catch(error){ console.error(error); return json(res,500,{error:'Não foi possível processar o comprovante.'}); }
}
