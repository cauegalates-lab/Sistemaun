export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const integer = new Intl.NumberFormat('pt-BR');

export function parseMoney(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatDateBR(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.slice(0,10).split('-');
  return `${d}/${m}/${y}`;
}

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

export function monthRangeISO(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const pad = n => String(n).padStart(2,'0');
  const last = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m+1)}-01`, to: `${y}-${pad(m+1)}-${pad(last)}` };
}

export function escapeHTML(value='') {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

export function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeSale(raw) {
  return {
    id: raw.id || uid(),
    sale_date: raw.sale_date || raw.data || todayISO(),
    seller_name: raw.seller_name || raw.vendedor || '',
    student_name: raw.student_name || raw.aluno || '',
    payment_type: raw.payment_type || '',
    fee_value: Number(raw.fee_value || 0),
    installments: Number(raw.installments || 0),
    total_value: Number(raw.total_value || 0),
    modality: raw.modality || '',
    pending: raw.pending || '',
    course: raw.course || '',
    state: raw.state || '',
    origin: raw.origin || '',
    course_quantity: Number(raw.course_quantity || 1),
    created_at: raw.created_at || new Date().toISOString(),
    sheet_sync_status: raw.sheet_sync_status || 'pending'
  };
}

export function paymentLabel(type) {
  return ({ cartao: 'Cartão', boleto: 'Boleto', sem_taxa_migracao: 'Sem taxa migração' })[type] || type || '—';
}
