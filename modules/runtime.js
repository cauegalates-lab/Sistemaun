/**
 * Runtime do painel.
 *
 * Produção usa Firebase real por padrão.
 * Para testes locais sem mexer no banco, acrescente ?preview=1 à URL.
 */
export const PREVIEW_LOGIN_ENABLED = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('preview') === '1';

export const PREVIEW_USERS = {
  'vendedor@unifahe.com.br': {
    password: '123456', id: 'seller-preview', uid: 'seller-preview', email: 'vendedor@unifahe.com.br',
    name: 'Cauê Galates', role: 'vendedor', team: 'Evolution', sector: 'Comercial', active: true, preview: true
  },
  'gestor@unifahe.com.br': {
    password: '123456', id: 'manager-preview', uid: 'manager-preview', email: 'gestor@unifahe.com.br',
    name: 'Gestor UNIFAHE', role: 'gestor', team: 'Gestão Comercial', sector: 'Comercial', active: true, preview: true
  },
  'auditoria@unifahe.com.br': {
    password: '123456', id: 'audit-preview', uid: 'audit-preview', email: 'auditoria@unifahe.com.br',
    name: 'Auditoria UNIFAHE', role: 'auditoria', team: 'Auditoria', sector: 'Comercial', active: true, preview: true
  }
};

const PREVIEW_ALIASES = {
  vendedor:'vendedor@unifahe.com.br', caue:'vendedor@unifahe.com.br', 'cauê':'vendedor@unifahe.com.br',
  gestor:'gestor@unifahe.com.br', auditoria:'auditoria@unifahe.com.br'
};
export function resolvePreviewIdentity(identifier) {
  const raw=String(identifier||'').trim().toLowerCase(),email=PREVIEW_ALIASES[raw]||raw,user=PREVIEW_USERS[email];
  if(!user)return null;const{password:_password,...profile}=user;return{...profile,loginEmail:email};
}
export function authenticatePreview(identifier,password){
  const identity=resolvePreviewIdentity(identifier);if(!identity)throw new Error('Usuário ou senha inválidos.');
  const source=PREVIEW_USERS[identity.loginEmail];if(source.password!==password)throw new Error('Usuário ou senha inválidos.');
  const{loginEmail:_loginEmail,...profile}=identity;return{...profile};
}
export function previewCredentials(role){
  const identifier=role==='gestor'?'gestor':role==='auditoria'?'auditoria':'vendedor',identity=resolvePreviewIdentity(identifier);
  return{identifier,email:identity.loginEmail,password:PREVIEW_USERS[identity.loginEmail].password};
}
