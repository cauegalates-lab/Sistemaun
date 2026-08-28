const DB_NAME = 'unifahe-commercial-profile';
const STORE = 'photos';
const VERSION = 1;
export const MAX_PROFILE_PHOTO_BYTES = 4 * 1024 * 1024;

function openDB(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE,{keyPath:'key'});
    };
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
  });
}
async function transact(mode,key,value){
  const db=await openDB();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,mode==='get'?'readonly':'readwrite');
    const store=tx.objectStore(STORE);
    const request=mode==='put'?store.put({key,blob:value}):mode==='get'?store.get(key):store.delete(key);
    request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error); tx.oncomplete=()=>db.close();
  });
}
export const ProfilePhotoStore={
  async get(key){ return (await transact('get',key))?.blob || null; },
  async save(key,file){ if(file.size>MAX_PROFILE_PHOTO_BYTES) throw new Error('A foto deve ter no máximo 4 MB.'); await transact('put',key,file); },
  async remove(key){ await transact('delete',key); }
};
