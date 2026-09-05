import admin from 'firebase-admin';

export function adminApp(){
  if(admin.apps.length) return admin.app();
  const projectId=process.env.FIREBASE_PROJECT_ID || 'sistema-comercial-647ed';
  const clientEmail=process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey=String(process.env.FIREBASE_PRIVATE_KEY||'').replace(/\\n/g,'\n');
  if(!clientEmail || !privateKey) throw new Error('Firebase Admin não configurado na Vercel.');
  return admin.initializeApp({credential:admin.credential.cert({projectId,clientEmail,privateKey})});
}

export function adminDb(){ adminApp(); return admin.firestore(); }
export function adminAuth(){ adminApp(); return admin.auth(); }

export async function activeProfileFromRequest(req,{roles=null}={}){
  const authorization=String(req.headers.authorization||'');
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!token) throw Object.assign(new Error('Sessão não informada.'),{status:401});
  const decoded=await adminAuth().verifyIdToken(token);
  const snap=await adminDb().collection('users').doc(decoded.uid).get();
  if(!snap.exists || snap.data()?.active===false) throw Object.assign(new Error('Acesso não autorizado.'),{status:403});
  const profile={uid:decoded.uid,...snap.data()};
  if(Array.isArray(roles) && !roles.includes(profile.role)) throw Object.assign(new Error('Seu perfil não possui permissão para esta ação.'),{status:403});
  return profile;
}

export function cronAuthorized(req){
  const secret=process.env.CRON_SECRET;
  return Boolean(secret && String(req.headers.authorization||'')===`Bearer ${secret}`);
}
