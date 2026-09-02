import { SELLERS } from './catalogs.js';

export const SELLER_PROFILES = SELLERS.map(name => ({ name, photo: '' }));

export const FCA_BASE_SALARY = 1763;

export const FCA_RULES = {
  commissionEnrollment: [
    { min: 75, reward: 2000, label: 'A partir de 75 matrículas' },
    { min: 100, reward: 2500, label: 'A partir de 100 matrículas' },
    { min: 125, reward: 3000, label: 'A partir de 125 matrículas' }
  ],
  commissionQuitado: [
    { min: 5000, reward: 150 },
    { min: 10000, reward: 250 },
    { min: 20000, reward: 500 },
    { min: 25000, reward: 750 },
    { min: 30000, reward: 1000 },
    { min: 35000, reward: 1500 },
    { min: 40000, reward: 2000 },
    { min: 45000, reward: 2500 },
    { min: 50000, reward: 3000 },
    { min: 55000, reward: 3500 },
    { min: 60000, reward: 4000 }
  ],
  boletoBonification: [
    { min: 5, reward: 100 },
    { min: 10, reward: 250 },
    { min: 15, reward: 350 },
    { min: 20, reward: 500 },
    { min: 25, reward: 750 },
    { min: 30, reward: 1000 },
    { min: 35, reward: 1250 },
    { min: 40, reward: 1500 },
    { min: 45, reward: 1750 },
    { min: 50, reward: 2000 },
    { min: 55, reward: 2250 },
    { min: 60, reward: 2500 },
    { min: 65, reward: 2750 },
    { min: 70, reward: 3000 },
    { min: 75, reward: 3250 },
    { min: 80, reward: 3500 },
    { min: 101, reward: 4000, label: 'Acima de 100 matrículas em boleto' }
  ],
  boletoTargetBonus: [
    { pct: 100, reward: 200, label: 'Meta Mensal' },
    { pct: 130, reward: 350, label: 'Meta Bronze' },
    { pct: 150, reward: 500, label: 'Meta Prata' },
    { pct: 200, reward: 750, label: 'Meta Ouro' },
    { pct: 250, reward: 1000, label: 'Meta Platinum' }
  ],
  quitadoTargetBonus: [
    { pct: 100, reward: 300, label: 'Meta Mensal' },
    { pct: 130, reward: 500, label: 'Meta Bronze' },
    { pct: 150, reward: 1000, label: 'Meta Prata' },
    { pct: 200, reward: 1500, label: 'Meta Ouro' },
    { pct: 250, reward: 2000, label: 'Meta Platinum' }
  ],
  monthlyRanking: [500,220,150,80,50],
  weeklyRanking: [100,70,50],
  consistency: [
    { months: 3, reward: 500 },
    { months: 6, reward: 1000 }
  ]
};

function highestTier(value, tiers, key='min') {
  const number=Number(value||0);
  const ordered=[...tiers].sort((a,b)=>Number(a[key]||0)-Number(b[key]||0));
  let current=null;
  for(const tier of ordered){ if(number>=Number(tier[key]||0)) current=tier; }
  const next=current ? ordered.find(tier=>Number(tier[key]||0)>Number(current[key]||0)) : ordered[0] || null;
  return { current, next, reward:Number(current?.reward||0) };
}

function targetTier(actual, goal, tiers){
  const target=Number(goal||0);
  const realized=Number(actual||0);
  const pct=target>0 ? (realized/target)*100 : 0;
  const ordered=[...tiers].sort((a,b)=>a.pct-b.pct);
  let current=null;
  for(const tier of ordered){ if(pct>=tier.pct) current=tier; }
  const next=current ? ordered.find(tier=>tier.pct>current.pct) : ordered[0] || null;
  return { current, next, pct, reward:Number(current?.reward||0), goal:target, actual:realized };
}

function validRowsFor(rows,seller,month){
  return rows.filter(row =>
    row.audit_status === 'ok' &&
    row.seller_name === seller &&
    (!month || String(row.sale_date || '').startsWith(month))
  );
}

export function calculateCommissionRanking(rows,{month,sellers=SELLERS}={}){
  const ranking=sellers.map(seller=>{
    const sellerRows=validRowsFor(rows,seller,month);
    const quitadoRevenue=sellerRows
      .filter(row=>row.payment_type==='cartao')
      .reduce((sum,row)=>sum+Number(row.total_value||0),0);
    return {seller,quitadoRevenue};
  }).sort((a,b)=>b.quitadoRevenue-a.quitadoRevenue || a.seller.localeCompare(b.seller,'pt-BR',{sensitivity:'base'}));

  let lastRevenue=null,lastPosition=0;
  return ranking.map((entry,index)=>{
    const position=lastRevenue===entry.quitadoRevenue ? lastPosition : index+1;
    lastRevenue=entry.quitadoRevenue; lastPosition=position;
    const reward=entry.quitadoRevenue>0 && position<=FCA_RULES.monthlyRanking.length ? FCA_RULES.monthlyRanking[position-1] : 0;
    return {...entry,position,reward};
  });
}

export function calculateCommissionSnapshot(rows, { seller, month, goals = {}, rankingEntry = null }) {
  const validRows = validRowsFor(rows,seller,month);
  const boletoRows=validRows.filter(row=>row.payment_type==='boleto');
  const cardRows=validRows.filter(row=>row.payment_type==='cartao');

  const snapshot = {
    seller,
    month,
    salesCount: validRows.length,
    revenue: validRows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    enrollments: validRows.reduce((sum,row)=>sum+Number(row.course_quantity||0),0),
    cardRevenue: cardRows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    quitadoRevenue: cardRows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    boletoRevenue: boletoRows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    boletos: boletoRows.length,
    boletoEnrollments: boletoRows.reduce((sum,row)=>sum+Number(row.course_quantity||0),0)
  };

  const enrollmentCommission=highestTier(snapshot.enrollments,FCA_RULES.commissionEnrollment);
  const quitadoCommission=highestTier(snapshot.quitadoRevenue,FCA_RULES.commissionQuitado);
  const boletoBonification=highestTier(snapshot.boletoEnrollments,FCA_RULES.boletoBonification);
  const boletoBonus=targetTier(snapshot.boletos,goals.boleto_goal,FCA_RULES.boletoTargetBonus);
  const quitadoBonus=targetTier(snapshot.quitadoRevenue,goals.quitado_goal,FCA_RULES.quitadoTargetBonus);
  const ranking={
    position:Number(rankingEntry?.position||0),
    reward:Number(rankingEntry?.reward||0),
    quitadoRevenue:Number(rankingEntry?.quitadoRevenue||snapshot.quitadoRevenue||0)
  };

  const commissionTotal=enrollmentCommission.reward+quitadoCommission.reward;
  const bonificationTotal=boletoBonification.reward;
  const bonusTotal=boletoBonus.reward+quitadoBonus.reward;
  const premiationTotal=ranking.reward;
  const variableTotal=commissionTotal+bonificationTotal+bonusTotal+premiationTotal;

  return {
    ...snapshot,
    baseSalary:FCA_BASE_SALARY,
    enrollmentCommission,
    quitadoCommission,
    boletoBonification,
    boletoBonus,
    quitadoBonus,
    ranking,
    commissionTotal,
    bonificationTotal,
    bonusTotal,
    premiationTotal,
    variableTotal,
    totalWithBase:FCA_BASE_SALARY+variableTotal
  };
}
