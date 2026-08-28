import { SELLERS } from './catalogs.js';

// Fotos reais podem ser associadas aqui quando os arquivos dos vendedores forem fornecidos.
// Ex.: { name:'Nome', photo:'assets/sellers/nome.jpg' }
export const SELLER_PROFILES = SELLERS.map(name => ({ name, photo: '' }));

// As regras ficam isoladas do layout. A tabela de bonificação pode ser cadastrada aqui
// sem reescrever a tela de Comissões.
export const COMMISSION_RULES = [];

function metricValue(snapshot, metric) {
  const map = {
    revenue: snapshot.revenue,
    sales: snapshot.salesCount,
    enrollments: snapshot.enrollments,
    card_revenue: snapshot.cardRevenue,
    boletos: snapshot.boletos
  };
  return Number(map[metric] || 0);
}

function rewardValue(rule, snapshot) {
  if (rule.reward_type === 'percent_revenue') return snapshot.revenue * (Number(rule.reward || 0) / 100);
  return Number(rule.reward || 0);
}

export function calculateCommissionSnapshot(rows, { seller, month, rules = COMMISSION_RULES }) {
  const validRows = rows.filter(row =>
    row.audit_status !== 'not_ok' &&
    row.seller_name === seller &&
    (!month || String(row.sale_date || '').startsWith(month))
  );

  const snapshot = {
    seller,
    month,
    salesCount: validRows.length,
    revenue: validRows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    enrollments: validRows.reduce((sum,row)=>sum+Number(row.course_quantity||0),0),
    cardRevenue: validRows.filter(row=>row.payment_type==='cartao').reduce((sum,row)=>sum+Number(row.total_value||0),0),
    boletos: validRows.filter(row=>row.payment_type==='boleto').length
  };

  const applicable = rules.filter(rule => !rule.sellers?.length || rule.sellers.includes(seller));
  const ruleResults = applicable.map(rule => {
    const value = metricValue(snapshot, rule.metric);
    const min = Number(rule.min || 0);
    const max = rule.max == null ? Infinity : Number(rule.max);
    const earned = value >= min && value <= max;
    return { ...rule, value, earned, reward: earned ? rewardValue(rule, snapshot) : 0 };
  });

  const bonusTotal = ruleResults.filter(rule=>rule.earned).reduce((sum,rule)=>sum+rule.reward,0);
  const earnedLabels = ruleResults.filter(rule=>rule.earned).map(rule=>rule.label);
  return {
    ...snapshot,
    rulesConfigured: applicable.length > 0,
    ruleResults,
    bonusTotal,
    currentRuleLabel: earnedLabels.length ? earnedLabels.join(' · ') : 'Nenhuma faixa atingida'
  };
}
