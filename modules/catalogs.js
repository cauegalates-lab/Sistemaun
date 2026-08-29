export const STATES = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'
];

export const PAYMENT_TYPES = [
  { value: 'cartao', label: 'Cartão' },
  { value: 'boleto', label: 'Boleto' },
  { value: 'sem_taxa_migracao', label: 'Sem taxa migração' }
];

export const MODALITIES = [
  'Segunda Graduação',
  'Graduação',
  'Extensão',
  'Combo de Pós',
  'Combo de Licenciatura',
  'Tecnólogo',
  'Migração R2',
  'Refinfahe'
];

export const ORIGINS = [
  'RD LEAD',
  'WHATSAPP COMERCIAL',
  'INDIQUE E GANHE',
  'INDICAÇÃO',
  'RETRABALHO',
  'RETRABALHO MANUAL'
];

export const COURSES = [
  'Pedagogia', 'Matemática', 'Artes', 'Artes Visuais', 'Educação Especial',
  'Ciências Biológicas', 'Filosofia', 'Física', 'Geografia', 'História',
  'Letras - Português', 'Letras - Inglês', 'Letras - Espanhol', 'Letras - Libras',
  'Química', 'Sociologia', 'Administração', 'Análise e Desenvolvimento de Sistemas',
  'Gestão Comercial', 'Gestão Financeira', 'Gestão Pública', 'Logística',
  'Processos Gerenciais', 'Recursos Humanos', 'Gestão Hospitalar',
  'Segurança Pública', 'Serviços Jurídicos', 'Gestão do Agronegócio',
  'Estética e Cosmética', 'Outro'
];

export const DEMO_USERS = {
  'gestor@unifahe.com.br': { password: '123456', id: 'manager-demo', name: 'Gestor UNIFAHE', role: 'gestor' },
  'auditoria@unifahe.com.br': { password: '123456', id: 'audit-demo', name: 'Auditoria UNIFAHE', role: 'auditoria' },
  'caue@unifahe.com.br': { password: '123456', id: 'seller-caue', name: 'Cauê Galates', role: 'vendedor' },
  'daniela@unifahe.com.br': { password: '123456', id: 'seller-daniela', name: 'Daniela Moura', role: 'vendedor' },
  'lara@unifahe.com.br': { password: '123456', id: 'seller-lara', name: 'Lara Baptista', role: 'vendedor' },
  'leticia@unifahe.com.br': { password: '123456', id: 'seller-leticia', name: 'Letícia Vieira', role: 'vendedor' },
  'beatriz@unifahe.com.br': { password: '123456', id: 'seller-beatriz', name: 'Beatriz', role: 'vendedor' },
  'gabriel@unifahe.com.br': { password: '123456', id: 'seller-gabriel', name: 'Gabriel', role: 'vendedor' },
  'alana@unifahe.com.br': { password: '123456', id: 'seller-alana', name: 'Alana', role: 'vendedor' },
  'giseli@unifahe.com.br': { password: '123456', id: 'seller-giseli', name: 'Giseli', role: 'vendedor' },
  'nathalia@unifahe.com.br': { password: '123456', id: 'seller-nathalia', name: 'Nathália', role: 'vendedor' }
};

export const SELLERS = [
  'Cauê Galates', 'Daniela Moura', 'Lara Baptista', 'Letícia Vieira',
  'Beatriz', 'Gabriel', 'Alana', 'Giseli', 'Nathália'
];
