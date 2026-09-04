/**
 * Runtime do painel.
 *
 * PREVIEW_LOGIN_ENABLED = true mantém o acesso rápido de demonstração
 * enquanto o Firebase definitivo ainda está sendo configurado.
 * Para voltar ao login real do Firebase depois, altere somente para false.
 */
export const PREVIEW_LOGIN_ENABLED = true;

export const PREVIEW_USERS = {
  'vendedor@unifahe.com.br': {
    password: '123456',
    id: 'seller-preview',
    uid: 'seller-preview',
    email: 'vendedor@unifahe.com.br',
    name: 'Cauê Galates',
    role: 'vendedor',
    team: 'Evolution',
    sector: 'Comercial',
    active: true,
    preview: true
  },
  'gestor@unifahe.com.br': {
    password: '123456',
    id: 'manager-preview',
    uid: 'manager-preview',
    email: 'gestor@unifahe.com.br',
    name: 'Gestor UNIFAHE',
    role: 'gestor',
    team: 'Gestão Comercial',
    sector: 'Comercial',
    active: true,
    preview: true
  },
  'auditoria@unifahe.com.br': {
    password: '123456',
    id: 'audit-preview',
    uid: 'audit-preview',
    email: 'auditoria@unifahe.com.br',
    name: 'Auditoria UNIFAHE',
    role: 'auditoria',
    team: 'Auditoria',
    sector: 'Comercial',
    active: true,
    preview: true
  }
};

const PREVIEW_ALIASES = {
  'vendedor': 'vendedor@unifahe.com.br',
  'caue': 'vendedor@unifahe.com.br',
  'cauê': 'vendedor@unifahe.com.br',
  'gestor': 'gestor@unifahe.com.br',
  'auditoria': 'auditoria@unifahe.com.br'
};

export function resolvePreviewIdentity(identifier) {
  const raw=String(identifier||'').trim().toLowerCase();
  const email=PREVIEW_ALIASES[raw] || raw;
  const user=PREVIEW_USERS[email];
  if(!user) return null;
  const { password:_password, ...profile }=user;
  return { ...profile, loginEmail:email };
}

export function authenticatePreview(identifier, password) {
  const identity=resolvePreviewIdentity(identifier);
  if(!identity) throw new Error('Usuário ou senha inválidos.');
  const source=PREVIEW_USERS[identity.loginEmail];
  if(source.password!==password) throw new Error('Usuário ou senha inválidos.');
  const { loginEmail:_loginEmail, ...profile }=identity;
  return { ...profile };
}

export function previewCredentials(role) {
  const identifier=role === 'gestor' ? 'gestor' : role === 'auditoria' ? 'auditoria' : 'vendedor';
  const identity=resolvePreviewIdentity(identifier);
  return { identifier, email:identity.loginEmail, password:PREVIEW_USERS[identity.loginEmail].password };
}

