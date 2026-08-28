import { money, integer, todayISO } from './utils.js';

let chartInstances = [];
export function destroyCharts() { chartInstances.forEach(c => c.destroy()); chartInstances = []; }

function sum(rows, getter) { return rows.reduce((acc, row) => acc + Number(getter(row) || 0), 0); }
function byDate(rows, from, to) { return rows.filter(r => (!from || r.sale_date >= from) && (!to || r.sale_date <= to)); }
function sumByPayment(rows,type){ return rows.filter(r=>r.payment_type===type).reduce((a,r)=>a+Number(r.total_value||0),0); }

export function calculateDashboard(rows, { from, to, seller = '', goals = {} }) {
  // Venda explicitamente marcada como "não OK" deixa de compor os resultados.
  let selected = byDate(rows.filter(r => r.audit_status !== 'not_ok'), from, to);
  if (seller) selected = selected.filter(r => r.seller_name === seller);
  const monthKey = (to || todayISO()).slice(0,7);
  const monthly = selected.filter(r => r.sale_date.startsWith(monthKey));
  const dailyDate = to || todayISO();
  const daily = selected.filter(r => r.sale_date === dailyDate);
  const boletosMonthly = monthly.filter(r => r.payment_type === 'boleto');
  const cardsDaily = daily.filter(r => r.payment_type === 'cartao');
  const boletosDaily = daily.filter(r => r.payment_type === 'boleto');

  const faturadoMensal = sum(monthly, r => r.total_value);
  const faturadoDia = sum(daily, r => r.total_value);
  const taxaBoletoMensal = sum(boletosMonthly, r => r.fee_value);
  const taxaDia = sum(boletosDaily, r => r.fee_value);
  const matriculasMensais = sum(monthly, r => r.course_quantity);
  const matriculasDia = sum(daily, r => r.course_quantity);
  const goalRevenue = Number(goals.revenue || 0);
  const goalEnroll = Number(goals.enroll || 0);

  return {
    selected, monthly, daily,
    metrics: {
      faturadoMensal,
      faturadoDia,
      matriculasMensais,
      matriculasDia,
      boletosMensais: boletosMonthly.length,
      boletosDia: boletosDaily.length,
      cartaoMensal: sumByPayment(monthly,'cartao'),
      cartaoDia: sum(cardsDaily, r => r.total_value),
      cartaoDiaCount: cardsDaily.length,
      taxaBoletoMensal,
      taxaDia,
      lancamentosMensais: monthly.length,
      lancamentosDia: daily.length,
      goalRevenue,
      goalEnroll,
      revenueMissing: Math.max(goalRevenue - faturadoMensal, 0),
      enrollMissing: Math.max(goalEnroll - matriculasMensais, 0),
      revenuePct: goalRevenue ? Math.min((faturadoMensal / goalRevenue) * 100, 100) : 0,
      enrollPct: goalEnroll ? Math.min((matriculasMensais / goalEnroll) * 100, 100) : 0
    }
  };
}

export function fillDashboardText(root, data) {
  const m = data.metrics;
  const set = (id, text) => { const el = root.querySelector(`#${id}`); if (el) el.textContent = text; };
  set('mFaturado', money.format(m.faturadoMensal));
  set('mMatriculas', integer.format(m.matriculasMensais));
  set('mBoletos', integer.format(m.boletosMensais));
  set('mCartao', money.format(m.cartaoMensal));
  set('mTaxa', money.format(m.taxaBoletoMensal));
  set('mVendas', integer.format(m.lancamentosMensais));
  set('dFaturado', money.format(m.faturadoDia));
  set('dMatriculas', integer.format(m.matriculasDia));
  set('dCartao', money.format(m.cartaoDia));
  set('dBoletos', integer.format(m.boletosDia));
  set('dTaxa', money.format(m.taxaDia));
  set('dVendas', integer.format(m.lancamentosDia));
  set('goalRevenueText', `${money.format(m.faturadoMensal)} / ${money.format(m.goalRevenue)}`);
  set('goalEnrollText', `${integer.format(m.matriculasMensais)} / ${integer.format(m.goalEnroll)}`);
  set('goalRevenueMissing', m.goalRevenue ? `Faltam ${money.format(m.revenueMissing)}` : 'Defina a meta');
  set('goalEnrollMissing', m.goalEnroll ? `Faltam ${integer.format(m.enrollMissing)}` : 'Defina a meta');
  set('revenuePctText', `${m.revenuePct.toFixed(1).replace('.',',')}%`);
  set('enrollPctText', `${m.enrollPct.toFixed(1).replace('.',',')}%`);
  const rp = root.querySelector('#revenueProgress'); if (rp) rp.style.width = `${m.revenuePct}%`;
  const ep = root.querySelector('#enrollProgress'); if (ep) ep.style.width = `${m.enrollPct}%`;
}

export function renderCharts(root, data, { to }) {
  destroyCharts();
  if (!window.Chart) return;
  Chart.defaults.font.family = '"Neue Montreal", "Inter", sans-serif';
  Chart.defaults.color = '#667085';
  const navy = '#122945', orange = '#ee5a00', blue = '#3e99dd', gray = '#a5b2c1', green = '#2b9d67';

  const projection = buildProjection(data.monthly, to, data.metrics.goalRevenue, data.metrics.goalEnroll);
  const lineCanvas = root.querySelector('#projectionChart');
  if (lineCanvas) chartInstances.push(new Chart(lineCanvas, {
    type:'line',
    data:{ labels:projection.labels, datasets:[
      {label:'Faturamento realizado', data:projection.revenue, borderColor:orange, backgroundColor:orange, tension:.28, pointRadius:2, pointHoverRadius:4, yAxisID:'y'},
      {label:'Meta faturamento', data:projection.revenueGoal, borderColor:navy, borderDash:[6,5], pointRadius:0, yAxisID:'y'},
      {label:'Matrículas realizadas', data:projection.enroll, borderColor:blue, backgroundColor:blue, tension:.28, pointRadius:2, pointHoverRadius:4, yAxisID:'y1'},
      {label:'Meta matrículas', data:projection.enrollGoal, borderColor:green, borderDash:[5,4], pointRadius:0, yAxisID:'y1'}
    ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom',labels:{boxWidth:9,usePointStyle:true,padding:16}}}, scales:{ y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{callback:v=>money.format(v)}}, y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false}} } }
  }));

  const donutCanvas = root.querySelector('#distributionChart');
  if (donutCanvas) {
    const card = sumByPayment(data.monthly,'cartao');
    const boleto = sumByPayment(data.monthly,'boleto');
    const other = sumByPayment(data.monthly,'sem_taxa_migracao');
    chartInstances.push(new Chart(donutCanvas, {
      type:'doughnut',
      data:{ labels:['Cartão','Boleto','Sem taxa migração'], datasets:[{data:[card,boleto,other], backgroundColor:[blue,orange,gray], borderWidth:0}] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'68%', plugins:{legend:{position:'bottom',labels:{boxWidth:9,usePointStyle:true,padding:14}}} }
    }));
  }

  const modality = modalityRevenue(data.monthly).slice(0,6);
  const barCanvas = root.querySelector('#categoryChart');
  if (barCanvas) chartInstances.push(new Chart(barCanvas, {
    type:'bar',
    data:{ labels:modality.map(x=>x.label), datasets:[{label:'Faturamento',data:modality.map(x=>x.value),backgroundColor:navy,borderRadius:7,maxBarThickness:42}] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{display:false}}, scales:{ y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{callback:v=>money.format(v)}},x:{grid:{display:false},ticks:{maxRotation:0,minRotation:0}} } }
  }));
}

function modalityRevenue(rows){
  const map=new Map();
  rows.forEach(r=>map.set(r.modality,(map.get(r.modality)||0)+Number(r.total_value||0)));
  return [...map.entries()].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
}

function buildProjection(rows, endDate, revenueGoal, enrollGoal){
  const end = new Date(`${endDate || todayISO()}T12:00:00`);
  const days = new Date(end.getFullYear(), end.getMonth()+1,0).getDate();
  const map = new Map();
  rows.forEach(r=>{ const d=Number(r.sale_date.slice(8,10)); const curr=map.get(d)||{rev:0,enroll:0}; curr.rev+=Number(r.total_value||0); curr.enroll+=Number(r.course_quantity||0); map.set(d,curr); });
  let rev=0,enroll=0; const labels=[], revenue=[], enrollArr=[];
  for(let d=1;d<=days;d++){ labels.push(d); const v=map.get(d)||{rev:0,enroll:0}; rev+=v.rev; enroll+=v.enroll; revenue.push(rev); enrollArr.push(enroll); }
  return {
    labels,revenue,enroll:enrollArr,
    revenueGoal:labels.map((_,i)=>revenueGoal?revenueGoal*(i+1)/days:0),
    enrollGoal:labels.map((_,i)=>enrollGoal?enrollGoal*(i+1)/days:0)
  };
}
