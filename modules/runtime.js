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
    active: true,
    preview: true
  }
};

export function authenticatePreview(email, password) {
  const key = String(email || '').trim().toLowerCase();
  const user = PREVIEW_USERS[key];
  if (!user || user.password !== password) throw new Error('E-mail ou senha inválidos.');
  const { password: _password, ...profile } = user;
  return { ...profile };
}

export function previewCredentials(role) {
  const email = role === 'gestor'
    ? 'gestor@unifahe.com.br'
    : role === 'auditoria'
      ? 'auditoria@unifahe.com.br'
      : 'vendedor@unifahe.com.br';
  return { email, password: PREVIEW_USERS[email].password };
}
