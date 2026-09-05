import { PREVIEW_LOGIN_ENABLED } from './runtime.js';
import { auth, db, storage, doc, updateDoc, ref, uploadBytes, getDownloadURL, deleteObject } from './firebase.js';

const DB_NAME='unifahe-commercial-profile';
const STORE='photos';
const VERSION=1;
export const MAX_PROFILE_PHOTO_BYTES=4*1024*1024;

function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,VERSION);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function transact(mode,key,value){const db=await openDB();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode==='get'?'readonly':'readwrite'),store=tx.objectStore(STORE),request=mode==='put'?store.put({key,blob:value}):mode==='get'?store.get(key):store.delete(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();});}
function currentUid(){if(!auth.currentUser)throw new Error('Sua sessão expirou. Entre novamente.');return auth.currentUser.uid;}
function photoRef(uid){return ref(storage,`profile-photos/${uid}/avatar`);}

export const ProfilePhotoStore={
  async get(key){
    if(PREVIEW_LOGIN_ENABLED)return (await transact('get',key))?.blob||null;
    if(!auth.currentUser)return null;
    try{const response=await fetch(await getDownloadURL(photoRef(currentUid())));if(!response.ok)return null;return await response.blob();}catch{return null;}
  },
  async save(key,file){
    if(file.size>MAX_PROFILE_PHOTO_BYTES)throw new Error('A foto deve ter no máximo 4 MB.');
    if(PREVIEW_LOGIN_ENABLED){await transact('put',key,file);return;}
    const uid=currentUid(),objectRef=photoRef(uid);await uploadBytes(objectRef,file,{contentType:file.type||'image/jpeg'});const url=await getDownloadURL(objectRef),now=new Date().toISOString();await updateDoc(doc(db,'users',uid),{photo_path:`profile-photos/${uid}/avatar`,photo_url:url,updated_at:now});
  },
  async remove(key){
    if(PREVIEW_LOGIN_ENABLED){await transact('delete',key);return;}
    const uid=currentUid();await deleteObject(photoRef(uid)).catch(error=>{if(!String(error?.code||'').includes('object-not-found'))throw error;});await updateDoc(doc(db,'users',uid),{photo_path:'',photo_url:'',updated_at:new Date().toISOString()});
  }
};
