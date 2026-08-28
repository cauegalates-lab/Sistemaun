import { money, integer, monthRangeISO, todayISO } from './utils.js';

let chartInstances = [];
export function destroyCharts() { chartInstances.forEach(c => c.destroy()); chartInstances = []; }

function sum(rows, getter) { return rows.reduce((acc, row) => acc + Number(getter(row) || 0), 0); }
function byDate(rows, from, to) { return rows.filter(r => (!from || r.sale_date >= from) && (!to || r.sale_date <= to)); }

export function calculateDashboard(rows, { from, to, seller = '', goals = {} }) {
  let selected = byDate(rows, from, to);
  if (seller) selected = selected.filter(r => r.seller_name === seller);
  const monthKey = (to || todayISO()).slice(0,7);
  const monthly = selected.filter(r => r.sale_date.startsWith(monthKey));
  const dailyDate = to || todayISO();
  const daily = selected.filter(r => r.sale_date === dailyDate);
  const cardsMonthly = monthly.filter(r => r.payment_type === 'cartao');
  const boletosMonthly = monthly.filter(r => r.payment_type === 'boleto');
  const cardsDaily = daily.filter(r => r.payment_type === 'cartao');
  const boletosDaily = daily.filter(r => r.payment_type === 'boleto');
  const semTaxaMonthly = monthly.filter(r => r.payment_type === 'sem_taxa_migracao');

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
      faturadoMensal, taxaBoletoMensal, boletosMensais: boletosMonthly.length,
      matriculasMensais, lancamentosMensais: monthly.length,
      cartaoDia: sum(cardsDaily, r => r.total_value), cartaoDiaCount: cardsDaily.length,
      taxaDia, boletosDia: boletosDaily.length,
      matriculasDia, lancamentosDia: daily.length,
      faturadoDia,
      qtdCartaoMes: cardsMonthly.length,
      qtdSemTaxaMes: semTaxaMonthly.length,
      goalRevenue, goalEnroll,
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
  set('mVendas', integer.format(m.lancamentosMensais));
  set('mTaxa', money.format(m.taxaBoletoMensal));
  set('mBoletos', integer.format(m.boletosMensais));
  set('mMatriculas', integer.format(m.matriculasMensais));
  set('mLancamentos', integer.format(m.lancamentosMensais));
  set('dCartao', money.format(m.cartaoDia));
  set('dCartaoQtd', integer.format(m.cartaoDiaCount));
  set('dTaxa', money.format(m.taxaDia));
  set('dBoletos', integer.format(m.boletosDia));
  set('dMatriculas', integer.format(m.matriculasDia));
  set('dLancamentos', integer.format(m.lancamentosDia));
  set('goalRevenueText', `${money.format(m.faturadoMensal)} / ${money.format(m.goalRevenue)}`);
  set('goalEnrollText', `${integer.format(m.matriculasMensais)} / ${integer.format(m.goalEnroll)}`);
  set('goalRevenueMissing', `Faltam ${money.format(m.revenueMissing)}`);
  set('goalEnrollMissing', `Faltam ${integer.format(m.enrollMissing)}`);
  set('summaryRevenue', money.format(m.faturadoMensal));
  set('summaryEnroll', integer.format(m.matriculasMensais));
  set('summaryGoalRevenue', money.format(m.goalRevenue));
  set('summaryGoalEnroll', integer.format(m.goalEnroll));
  set('summarySales', integer.format(m.lancamentosMensais));
  set('summaryCards', integer.format(m.qtdCartaoMes));
  set('summaryBoletos', integer.format(m.boletosMensais));
  set('summaryDayRevenue', money.format(m.faturadoDia));
  set('summaryDayEnroll', integer.format(m.matriculasDia));
  const rp = root.querySelector('#revenueProgress'); if (rp) rp.style.width = `${m.revenuePct}%`;
  const ep = root.querySelector('#enrollProgress'); if (ep) ep.style.width = `${m.enrollPct}%`;
}

export function renderCharts(root, data, { from, to }) {
  destroyCharts();
  if (!window.Chart) return;
  Chart.defaults.font.family = '"Neue Montreal", "Inter", sans-serif';
  Chart.defaults.color = '#667085';
  const navy = '#122945', orange = '#ee5a00', blue = '#2d67e8', gray = '#9aa9bd', green = '#22b86b', purple = '#8657e5';
  const m = data.metrics;

  const barCanvas = root.querySelector('#categoryChart');
  if (barCanvas) chartInstances.push(new Chart(barCanvas, {
    type: 'bar',
    data: {
      labels: ['Faturado mensal','Taxa boleto mensal','Faturado diário','Taxa diária'],
      datasets: [{ data: [m.faturadoMensal,m.taxaBoletoMensal,m.faturadoDia,m.taxaDia], backgroundColor: [blue,purple,navy,orange], borderRadius: 7, maxBarThickness: 46 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display:false } }, scales: { y: { beginAtZero:true, grid:{color:'#e9eef5'}, ticks:{callback:v=>money.format(v)} }, x:{grid:{display:false}} } }
  }));

  const donutCanvas = root.querySelector('#distributionChart');
  if (donutCanvas) {
    const card = sumBy(data.monthly,'cartao');
    const boleto = sumBy(data.monthly,'boleto');
    const other = sumBy(data.monthly,'sem_taxa_migracao');
    chartInstances.push(new Chart(donutCanvas, {
      type:'doughnut',
      data:{ labels:['Cartão','Boleto','Sem taxa migração'], datasets:[{data:[card,boleto,other], backgroundColor:[blue,orange,gray], borderWidth:0}] },
      options:{ responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{legend:{position:'bottom',labels:{boxWidth:10,usePointStyle:true,pointStyle:'rectRounded'}}} }
    }));
  }

  const projection = buildProjection(data.monthly, to);
  const lineCanvas = root.querySelector('#projectionChart');
  if (lineCanvas) chartInstances.push(new Chart(lineCanvas, {
    type:'line',
    data:{ labels:projection.labels, datasets:[
      {label:'Realizado faturados', data:projection.revenue, borderColor:orange, backgroundColor:orange, tension:.25, pointRadius:2, yAxisID:'y'},
      {label:'Meta faturados', data:projection.revenueGoal, borderColor:navy, borderDash:[6,4], pointRadius:0, yAxisID:'y'},
      {label:'Realizado matrículas', data:projection.enroll, borderColor:purple, backgroundColor:purple, tension:.25, pointRadius:2, yAxisID:'y1'},
      {label:'Meta matrículas', data:projection.enrollGoal, borderColor:green, borderDash:[5,4], pointRadius:0, yAxisID:'y1'}
    ]},
    options:{ responsive:true, maintainAspectRatio:false, interaction:{mode:'index',intersect:false}, plugins:{legend:{position:'bottom',labels:{boxWidth:9,usePointStyle:true}}}, scales:{ y:{beginAtZero:true,grid:{color:'#e9eef5'},ticks:{callback:v=>money.format(v)}}, y1:{beginAtZero:true,position:'right',grid:{drawOnChartArea:false}} } }
  }));

  function sumBy(rows,type){ return rows.filter(r=>r.payment_type===type).reduce((a,r)=>a+Number(r.total_value||0),0); }
  function buildProjection(rows, endDate){
    const end = new Date(`${endDate || todayISO()}T12:00:00`);
    const days = new Date(end.getFullYear(), end.getMonth()+1,0).getDate();
    const map = new Map(); rows.forEach(r=>{ const d=Number(r.sale_date.slice(8,10)); const curr=map.get(d)||{rev:0,enroll:0}; curr.rev+=Number(r.total_value||0); curr.enroll+=Number(r.course_quantity||0); map.set(d,curr); });
    let rev=0,enroll=0; const labels=[], revenue=[], enrollArr=[];
    for(let d=1;d<=days;d++){ labels.push(d); const v=map.get(d)||{rev:0,enroll:0}; rev+=v.rev; enroll+=v.enroll; revenue.push(rev); enrollArr.push(enroll); }
    const revGoal = data.metrics.goalRevenue; const enGoal=data.metrics.goalEnroll;
    return { labels,revenue,enroll:enrollArr,revenueGoal:labels.map((_,i)=>revGoal?revGoal*(i+1)/days:0),enrollGoal:labels.map((_,i)=>enGoal?enGoal*(i+1)/days:0) };
  }
}
