import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { auth, storage, getActiveProfile, ref, uploadBytes, getDownloadURL, deleteObject } from './firebase.js';

const DB_NAME='unifahe-commercial-teams';
const STORE='logos';
const VERSION=1;
export const MAX_TEAM_LOGO_BYTES=4*1024*1024;
const ALLOWED=new Set(['image/jpeg','image/png','image/webp']);

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,VERSION);
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
}
async function transact(mode,key,value){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode==='get'?'readonly':'readwrite');
    const store=tx.objectStore(STORE);
    const request=mode==='put'?store.put({key,blob:value}):mode==='get'?store.get(key):store.delete(key);
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();
  });
}
function validate(file){
  if(!file) throw new Error('Selecione uma imagem.');
  if(file.size>MAX_TEAM_LOGO_BYTES) throw new Error('A logo deve ter no máximo 4 MB.');
  if(!ALLOWED.has(file.type)) throw new Error('Use uma logo em PNG, JPG ou WEBP.');
}

export const TeamLogoStore={
  async url(team){
    if(PREVIEW_LOGIN_ENABLED){
      const blob=(await transact('get',team.id))?.blob||null;
      return blob?URL.createObjectURL(blob):'';
    }
    if(!team.logo_path) return '';
    return getDownloadURL(ref(storage,team.logo_path)).catch(()=> '');
  },
  async save(teamId,file){
    validate(file);
    if(PREVIEW_LOGIN_ENABLED){await transact('put',teamId,file);return {logo_path:`preview://${teamId}`};}
    const profile=getActiveProfile();
    if(!auth.currentUser||profile?.role!=='gestor') throw new Error('Somente o gestor pode alterar a logo do time.');
    const path=`team-logos/${teamId}/logo`;
    await uploadBytes(ref(storage,path),file,{contentType:file.type});
    return {logo_path:path};
  },
  async remove(team){
    if(PREVIEW_LOGIN_ENABLED){await transact('delete',team.id).catch(()=>{});return;}
    const profile=getActiveProfile();
    if(!auth.currentUser||profile?.role!=='gestor') throw new Error('Somente o gestor pode remover a logo do time.');
    if(team.logo_path) await deleteObject(ref(storage,team.logo_path)).catch(()=>{});
  }
};
