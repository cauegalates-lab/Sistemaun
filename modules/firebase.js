import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut as firebaseSignOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, collection, query, where, limit, getDocs, doc, getDoc, setDoc,
  updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyA7U14RV-18vay99BToRp0Ff4yvUPvGaLI',
  authDomain: 'sistema-comercial-647ed.firebaseapp.com',
  projectId: 'sistema-comercial-647ed',
  storageBucket: 'sistema-comercial-647ed.firebasestorage.app',
  messagingSenderId: '857195819847',
  appId: '1:857195819847:web:1a9ceade5f5250161e1262'
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);

let activeProfile = null;

function authErrorMessage(error) {
  const code = String(error?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Usuário ou senha inválidos.';
  if (code.includes('too-many-requests')) return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
  if (code.includes('network-request-failed')) return 'Não foi possível conectar ao Firebase.';
  if (code.includes('operation-not-allowed')) return 'O login por e-mail e senha ainda não foi ativado no Firebase.';
  return error?.message || 'Não foi possível entrar.';
}

export async function loadProfile(firebaseUser = auth.currentUser) {
  if (!firebaseUser) return null;
  const snapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!snapshot.exists()) throw new Error('Este usuário existe no Authentication, mas ainda não possui perfil na coleção users do Firestore.');
  const data = snapshot.data() || {};
  if (data.active === false) throw new Error('Este acesso está desativado.');
  const role = ['gestor', 'auditoria', 'vendedor'].includes(data.role) ? data.role : 'vendedor';
  activeProfile = {
    id: firebaseUser.uid,
    uid: firebaseUser.uid,
    email: firebaseUser.email || data.email || '',
    name: data.name || firebaseUser.email || 'Usuário',
    role,
    team: data.team || data.time || '',
    sector: data.sector || data.setor || 'Comercial',
    login: data.login || '',
    photo_url: data.photo_url || '',
    photo_path: data.photo_path || '',
    active: data.active !== false
  };
  return activeProfile;
}

export function getActiveProfile() { return activeProfile; }

export async function loginAccount(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    return await loadProfile(credential.user);
  } catch (error) {
    if (auth.currentUser && !activeProfile) await firebaseSignOut(auth).catch(() => {});
    throw new Error(authErrorMessage(error));
  }
}

export async function logoutAccount() {
  activeProfile = null;
  await firebaseSignOut(auth);
}

export function watchSession(callback) {
  return onAuthStateChanged(auth, async firebaseUser => {
    if (!firebaseUser) {
      activeProfile = null;
      callback(null);
      return;
    }
    try { callback(await loadProfile(firebaseUser)); }
    catch {
      activeProfile = null;
      await firebaseSignOut(auth).catch(() => {});
      callback(null);
    }
  });
}

export async function resolveUserUidByName(name) {
  const profile = getActiveProfile();
  if (profile?.role === 'vendedor' && profile.name === name) return profile.uid;
  const snapshot = await getDocs(query(collection(db, 'users'), where('name', '==', name), limit(1)));
  return snapshot.empty ? '' : snapshot.docs[0].id;
}

export {
  collection, query, where, limit, getDocs, doc, getDoc, setDoc, updateDoc, deleteDoc,
  ref, uploadBytes, getDownloadURL, deleteObject
};
