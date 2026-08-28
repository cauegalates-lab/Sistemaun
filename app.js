import { STATES, PAYMENT_TYPES, MODALITIES, ORIGINS, COURSES, DEMO_USERS, SELLERS } from './modules/catalogs.js';
import { SalesRepository } from './modules/repository.js';
import { calculateDashboard, fillDashboardText, renderCharts, destroyCharts } from './modules/dashboard.js';
import { escapeHTML, formatDateBR, money, parseMoney, paymentLabel, todayISO, monthRangeISO } from './modules/utils.js';

const COMMON_ITEMS = [
  { id:'inicio', label:'Início', icon:'house', section:'Principal' },
  { id:'vendas', label:'Vendas', icon:'badge-dollar-sign', section:'Operação' },
  { id:'times', label:'Times', icon:'users-round', section:'Operação' },
  { id:'fca', label:'FCA', icon:'clipboard-check', section:'Operação' },
  { id:'campanhas', label:'Campanhas', icon:'megaphone', section:'Operação' }
];
const SELLER_DASHBOARDS = [{ id:'dashboard-vendedor', label:'Dashboard vendedor', icon:'chart-column-big', section:'Dashboards' }];
const MANAGER_DASHBOARDS = [...SELLER_DASHBOARDS, { id:'dashboard-geral', label:'Dashboard geral', icon:'chart-pie', section:'Dashboards' }];
const PAGE_COPY = {
  times:['Times','Estrutura pronta para ranking, composição e acompanhamento dos times.'],
  fca:['FCA','Estrutura pronta para os indicadores e rotinas de FCA.'],
  campanhas:['Campanhas','Estrutura pronta para campanhas, metas e ações comerciais.']
};

let currentUser = null;
let currentPage = 'inicio';
let salesCache = [];
let dataSource = 'local-demo';

const $ = s => document.querySelector(s);
const loginView=$('#loginView'), appView=$('#appView'), loginForm=$('#loginForm'), loginError=$('#loginError');
const emailInput=$('#email'), passwordInput=$('#password'), sidebar=$('#sidebar'), sidebarNav=$('#sidebarNav');
const content=$('#content'), pageTitle=$('#pageTitle'), userName=$('#userName'), userRole=$('#userRole'), userAvatar=$('#userAvatar');
const mobileOverlay=$('#mobileOverlay');

function refreshIcons(){ if(window.lucide) window.lucide.createIcons({attrs:{'stroke-width':1.9}}); }
function toast(message, type='ok'){ const el=document.createElement('div'); el.className=`toast ${type}`; el.innerHTML=`<i data-lucide="${type==='error'?'circle-alert':'circle-check'}"></i><span>${escapeHTML(message)}</span>`; $('#toastHost').append(el); refreshIcons(); setTimeout(()=>el.remove(),3600); }

function getMenuItems(){ return currentUser ? [...COMMON_ITEMS, ...(currentUser.role==='gestor'?MANAGER_DASHBOARDS:SELLER_DASHBOARDS)] : []; }
function userInitials(name){ return name.split(' ').filter(Boolean).map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

loginForm.addEventListener('submit', e=>{ e.preventDefault(); const email=emailInput.value.trim().toLowerCase(); const user=DEMO_USERS[email]; if(!user || user.password!==passwordInput.value){ loginError.textContent='E-mail ou senha inválidos.'; return; } loginError.textContent=''; signIn(user); });
document.querySelectorAll('[data-demo]').forEach(btn=>btn.addEventListener('click',()=>{ const email=btn.dataset.demo==='gestor'?'gestor@unifahe.com.br':'vendedor@unifahe.com.br'; emailInput.value=email; passwordInput.value='123456'; }));
$('#togglePassword').addEventListener('click',()=>{ const show=passwordInput.type==='password'; passwordInput.type=show?'text':'password'; $('#togglePassword').innerHTML=`<i data-lucide="${show?'eye-off':'eye'}"></i>`; refreshIcons(); });
$('#sidebarToggle').addEventListener('click',()=>{ sidebar.classList.toggle('is-collapsed'); localStorage.setItem('unifaheSidebarCollapsed',sidebar.classList.contains('is-collapsed')?'1':'0'); });
$('#mobileMenuButton').addEventListener('click',()=>{ sidebar.classList.add('mobile-open'); mobileOverlay.classList.add('visible'); });
mobileOverlay.addEventListener('click',closeMobileMenu); $('#logoutButton').addEventListener('click',signOut);

async function signIn(user){ currentUser=user; currentPage='inicio'; userName.textContent=user.name; userRole.textContent=user.role==='gestor'?'Gestor':'Vendedor'; userAvatar.textContent=userInitials(user.name); loginView.classList.add('is-hidden'); appView.classList.remove('is-hidden'); buildMenu(); await loadSales(); renderPage('inicio'); }
function signOut(){ currentUser=null; salesCache=[]; destroyCharts(); appView.classList.add('is-hidden'); loginView.classList.remove('is-hidden'); passwordInput.value=''; closeMobileMenu(); }
async function loadSales(){ const result=await SalesRepository.list(); salesCache=result.rows; dataSource=result.source; }
function closeMobileMenu(){ sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('visible'); }

function buildMenu(){ sidebarNav.innerHTML=''; let section=''; getMenuItems().forEach(item=>{ if(item.section!==section){ section=item.section; sidebarNav.insertAdjacentHTML('beforeend',`<div class="nav-section-label">${section}</div>`); } const btn=document.createElement('button'); btn.className=`nav-item${item.id===currentPage?' active':''}`; btn.dataset.page=item.id; btn.innerHTML=`<span class="nav-icon"><i data-lucide="${item.icon}"></i></span><span class="nav-label">${item.label}</span>`; btn.onclick=()=>{renderPage(item.id);closeMobileMenu();}; sidebarNav.append(btn); }); refreshIcons(); }

function renderPage(id){ currentPage=id; document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===id)); if(id==='inicio'){ pageTitle.textContent='Início'; return currentUser.role==='gestor'?renderDashboard({mode:'geral'}):renderDashboard({mode:'individual',seller:currentUser.name}); } if(id==='vendas'){ pageTitle.textContent='Vendas'; return renderSales(); } if(id==='dashboard-geral'){ pageTitle.textContent='Dashboard geral'; return renderDashboard({mode:'geral'}); } if(id==='dashboard-vendedor'){ pageTitle.textContent='Dashboard vendedor'; return renderDashboard({mode:'individual',seller:currentUser.role==='vendedor'?currentUser.name:''}); } const [title,desc]=PAGE_COPY[id]||['Módulo','Estrutura pronta para receber conteúdo.']; pageTitle.textContent=title; content.innerHTML=`<section class="page-intro"><div><span class="eyebrow">MÓDULO</span><h2>${title}</h2><p>${desc}</p></div></section><section class="blank-canvas"><div class="blank-canvas-mark"><i data-lucide="layout-dashboard"></i></div><span>Conteúdo em branco por enquanto</span></section>`; refreshIcons(); }

function salesSummary(rows){ return { count:rows.length, total:rows.reduce((a,r)=>a+Number(r.total_value||0),0), courses:rows.reduce((a,r)=>a+Number(r.course_quantity||0),0) }; }

function renderSales(){
  const ownRows=currentUser.role==='gestor'?salesCache:salesCache.filter(r=>r.seller_name===currentUser.name); const summary=salesSummary(ownRows);
  const sourceLabel=dataSource==='database'?'Banco de dados principal':'Demonstração local';
  content.innerHTML=`
    <section class="sales-command">
      <div class="sales-title-copy">
        <span class="eyebrow">OPERAÇÃO COMERCIAL</span>
        <h2>Vendas</h2>
        <div class="sales-sector-note"><i data-lucide="database"></i><span><strong>${sourceLabel}</strong> • Os lançamentos alimentam os dashboards; a planilha funciona apenas como registro em segundo plano.</span></div>
      </div>
      <div class="sales-command-summary" aria-label="Resumo das vendas">
        <div class="sales-stat"><span>Vendas registradas</span><strong>${summary.count}</strong></div>
        <div class="sales-stat"><span>Valor total</span><strong>${money.format(summary.total)}</strong></div>
        <div class="sales-stat"><span>Matrículas</span><strong>${summary.courses}</strong></div>
      </div>
      <button id="toggleSaleForm" class="primary-action sales-add-button"><i data-lucide="plus"></i>Adicionar venda</button>
    </section>
    <section id="saleFormPanel" class="sale-entry-panel is-collapsed"></section>
    <section class="sales-list-section">
      <div class="section-heading"><div><span class="section-kicker">REGISTROS</span><h3>Vendas lançadas</h3><p>Histórico dos lançamentos disponíveis para consulta.</p></div><div class="table-actions"><input id="salesSearch" class="compact-input" placeholder="Buscar aluno, curso ou vendedor"/><select id="salesPaymentFilter" class="compact-select"><option value="">Todos os pagamentos</option>${PAYMENT_TYPES.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')}</select></div></div>
      <div id="salesTableWrap" class="sales-table-wrap"></div>
    </section>`;
  $('#toggleSaleForm').onclick=()=>{ const panel=$('#saleFormPanel'); panel.classList.toggle('is-collapsed'); if(!panel.dataset.ready) mountSaleForm(panel); $('#toggleSaleForm').innerHTML=panel.classList.contains('is-collapsed')?'<i data-lucide="plus"></i>Adicionar venda':'<i data-lucide="x"></i>Fechar lançamento'; refreshIcons(); };
  $('#salesSearch').addEventListener('input',()=>renderSalesTable(ownRows)); $('#salesPaymentFilter').addEventListener('change',()=>renderSalesTable(ownRows)); renderSalesTable(ownRows); refreshIcons();
}

function mountSaleForm(panel){
  panel.dataset.ready='1';
  const sellerControl=currentUser.role==='gestor'?`<label class="form-field"><span>Vendedor</span><select name="seller_name" required><option value="">Selecione</option>${SELLERS.map(v=>`<option>${v}</option>`).join('')}</select></label>`:`<label class="form-field"><span>Vendedor</span><div class="readonly-value"><i data-lucide="user-check"></i>${escapeHTML(currentUser.name)}</div><input type="hidden" name="seller_name" value="${escapeHTML(currentUser.name)}"></label>`;
  panel.innerHTML=`<form id="saleForm" class="sale-form">
    <div class="sale-form-head"><div><span class="section-kicker">NOVA VENDA</span><h3>Informações do lançamento</h3></div><span class="form-note"><i data-lucide="database"></i>Salva primeiro no banco</span></div>
    <div class="form-grid">
      <label class="form-field"><span>Data</span><input type="date" name="sale_date" value="${todayISO()}" required></label>${sellerControl}
      <label class="form-field wide"><span>Nome do aluno</span><input name="student_name" placeholder="Nome completo" required></label>
      <label class="form-field"><span>Tipo de pagamento</span><select id="paymentType" name="payment_type" required><option value="">Selecione</option>${PAYMENT_TYPES.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')}</select></label>
      <div id="paymentDynamic" class="dynamic-fields"></div>
      <label class="form-field"><span>Modalidade</span><select id="modality" name="modality" required><option value="">Selecione</option>${MODALITIES.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <div id="pendingDynamic" class="dynamic-fields"></div>
      <label class="form-field"><span>Curso</span><select name="course" required><option value="">Selecione</option>${COURSES.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <label class="form-field"><span>Estado</span><select name="state" required><option value="">Selecione</option>${STATES.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <label class="form-field"><span>Origem</span><select name="origin" required><option value="">Selecione</option>${ORIGINS.map(v=>`<option>${v}</option>`).join('')}</select></label>
      <label class="form-field"><span>Quantidade de cursos</span><input type="number" name="course_quantity" min="1" value="1" required></label>
    </div>
    <div class="sale-form-footer"><button type="button" id="cancelSale" class="secondary-action">Cancelar</button><button class="primary-action" type="submit"><i data-lucide="save"></i>Salvar venda</button></div>
  </form>`;
  const pay=$('#paymentType'), modality=$('#modality'), dynamic=$('#paymentDynamic'), pending=$('#pendingDynamic');
  const renderPayment=()=>{
    if(pay.value==='boleto') dynamic.innerHTML=`<label class="form-field"><span>Valor da taxa/parcela</span><input id="feeValue" name="fee_value" inputmode="decimal" placeholder="R$ 0,00" required></label><label class="form-field"><span>Quantidade de vezes</span><input id="installments" name="installments" type="number" min="1" value="1" required></label><label class="form-field"><span>Valor total</span><input id="totalValue" name="total_value" readonly required></label>`;
    else if(pay.value==='cartao') dynamic.innerHTML=`<label class="form-field"><span>Valor total pago</span><input name="total_value" inputmode="decimal" placeholder="R$ 0,00" required></label>`;
    else if(pay.value==='sem_taxa_migracao') dynamic.innerHTML=`<label class="form-field"><span>Valor total do boleto</span><input name="total_value" inputmode="decimal" placeholder="R$ 0,00" required></label><label class="form-field"><span>Quantidade de vezes</span><input name="installments" type="number" min="1" value="1" required></label>`;
    else dynamic.innerHTML='';
    if(pay.value==='boleto'){ const fee=$('#feeValue'), inst=$('#installments'), total=$('#totalValue'); const calc=()=>{ const value=parseMoney(fee.value)*Number(inst.value||0); total.value=money.format(value); }; fee.oninput=calc; inst.oninput=calc; calc(); }
  };
  const renderPending=()=>{ pending.innerHTML=['Migração R2','Refinfahe'].includes(modality.value)?`<label class="form-field"><span>Pendência</span><input name="pending" placeholder="Informe a pendência" required></label>`:''; };
  pay.onchange=renderPayment; modality.onchange=renderPending; renderPayment(); renderPending();
  $('#cancelSale').onclick=()=>$('#toggleSaleForm').click();
  $('#saleForm').onsubmit=handleSaleSubmit; refreshIcons();
}

async function handleSaleSubmit(event){
  event.preventDefault(); const form=event.currentTarget; const fd=new FormData(form); const payment=fd.get('payment_type');
  const sale={ sale_date:fd.get('sale_date'), seller_name:fd.get('seller_name'), student_name:String(fd.get('student_name')||'').trim(), payment_type:payment, fee_value:payment==='boleto'?parseMoney(fd.get('fee_value')):0, installments:Number(fd.get('installments')||0), total_value:parseMoney(fd.get('total_value')), modality:fd.get('modality'), pending:fd.get('pending')||'', course:fd.get('course'), state:fd.get('state'), origin:fd.get('origin'), course_quantity:Number(fd.get('course_quantity')||1) };
  if(payment==='boleto') sale.total_value=sale.fee_value*sale.installments;
  const submit=form.querySelector('button[type=submit]'); submit.disabled=true; submit.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Salvando'; refreshIcons();
  try{ const result=await SalesRepository.create(sale); salesCache.unshift(result.sale); dataSource=result.source; toast(result.source==='database'?'Venda salva no banco de dados.':'Venda salva no modo local de demonstração.'); renderSales(); }
  catch(e){ toast('Não foi possível salvar a venda.','error'); submit.disabled=false; submit.innerHTML='<i data-lucide="save"></i>Salvar venda'; refreshIcons(); }
}

function renderSalesTable(baseRows){
  const wrap=$('#salesTableWrap'); if(!wrap) return; const term=($('#salesSearch')?.value||'').toLowerCase(); const pay=$('#salesPaymentFilter')?.value||''; const rows=baseRows.filter(r=>(!pay||r.payment_type===pay)&&(!term||[r.student_name,r.seller_name,r.course,r.modality].join(' ').toLowerCase().includes(term))).sort((a,b)=>b.sale_date.localeCompare(a.sale_date)||b.created_at.localeCompare(a.created_at));
  if(!rows.length){ wrap.innerHTML=`<div class="empty-sales"><i data-lucide="receipt-text"></i><strong>Nenhuma venda encontrada</strong><span>Os lançamentos salvos aparecerão aqui.</span></div>`; refreshIcons(); return; }
  wrap.innerHTML=`<table class="sales-table"><thead><tr><th>Data</th><th>Aluno</th><th>Vendedor</th><th>Pagamento</th><th>Modalidade / curso</th><th>Origem</th><th class="num">Qtd.</th><th class="num">Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td><span class="date-cell">${formatDateBR(r.sale_date)}</span></td><td><strong>${escapeHTML(r.student_name)}</strong><small>${escapeHTML(r.state)}</small></td><td>${escapeHTML(r.seller_name)}</td><td><span class="payment-badge ${r.payment_type}">${paymentLabel(r.payment_type)}</span>${r.installments?`<small>${r.installments}x${r.payment_type==='boleto'&&r.fee_value?` de ${money.format(r.fee_value)}`:''}</small>`:''}</td><td><strong>${escapeHTML(r.modality)}</strong><small>${escapeHTML(r.course)}${r.pending?` • Pend.: ${escapeHTML(r.pending)}`:''}</small></td><td>${escapeHTML(r.origin)}</td><td class="num">${r.course_quantity}</td><td class="num money-cell">${money.format(r.total_value)}</td></tr>`).join('')}</tbody></table>`;
}

function goalKey(seller, to){ return `unifahe.goals.${(to||todayISO()).slice(0,7)}.${seller||'geral'}`; }
function getGoals(seller,to){ try{return JSON.parse(localStorage.getItem(goalKey(seller,to))||'{"revenue":0,"enroll":0}')}catch{return{revenue:0,enroll:0}} }
function saveGoals(seller,to,goals){ localStorage.setItem(goalKey(seller,to),JSON.stringify(goals)); }

function renderDashboard({mode='geral',seller=''}){
  destroyCharts(); const range=monthRangeISO(); const selectedSeller=mode==='individual'?(seller||SELLERS[0]):''; const goals=getGoals(selectedSeller,range.to);
  content.innerHTML=dashboardMarkup({mode,selectedSeller,from:range.from,to:range.to,goals});
  bindDashboard({mode,defaultSeller:selectedSeller}); refreshDashboard({mode}); refreshIcons();
}

function dashboardMarkup({mode,selectedSeller,from,to,goals}){
  const canChooseSeller=currentUser.role==='gestor';
  return `<section class="dashboard-head">
    <div class="dashboard-title-block"><span class="eyebrow">${mode==='geral'?'GESTÃO COMERCIAL':'DESEMPENHO INDIVIDUAL'}</span><h2>${mode==='geral'?'Dashboard geral':'Dashboard vendedor'}</h2><p>${mode==='geral'?'Visão consolidada dos resultados lançados em Vendas.':'Indicadores do vendedor alimentados diretamente pelos próprios lançamentos.'}</p></div>
    <div class="dashboard-toolbar">
      <div class="dashboard-toolbar-main">
        ${mode==='geral'?`<button id="switchDashboard" class="orange-action"><i data-lucide="user-round"></i>Dashboard individual</button>`:`${currentUser.role==='gestor'?'<button id="switchDashboard" class="navy-action"><i data-lucide="layout-dashboard"></i>Dashboard geral</button>':''}`}
        ${mode==='individual'&&canChooseSeller?`<label class="filter-field seller-filter"><span>VENDEDOR</span><select id="dashSeller">${SELLERS.map(v=>`<option ${v===selectedSeller?'selected':''}>${v}</option>`).join('')}</select></label>`:''}
        <div class="date-filter"><label class="filter-field"><span>DE</span><input id="dashFrom" type="date" value="${from}"></label><label class="filter-field"><span>ATÉ</span><input id="dashTo" type="date" value="${to}"></label><button id="applyDash" class="navy-action"><i data-lucide="sliders-horizontal"></i>Filtrar</button></div>
      </div>
      <div class="dashboard-toolbar-actions">
        <button id="saveDashboard" class="toolbar-action"><i data-lucide="bookmark-plus"></i><span>Salvar dashboard</span></button>
        <button id="openSavedDashboards" class="toolbar-action"><i data-lucide="folder-clock"></i><span>Dashboards salvos</span></button>
      </div>
    </div>
  </section>
  <section id="savedDashboardsPanel" class="saved-dashboards-panel is-hidden"></section>
  <section class="period-bars"><div class="period-title monthly">MENSAL</div><div class="period-title daily">DIÁRIO</div></section>
  <section class="metric-groups">
    <div class="metric-group monthly-group">
      ${metricBox('banknote','Faturados','mFaturado','mVendas','MATRÍCULAS','metric-blue')}
      ${metricBox('barcode','Taxa Boleto','mTaxa','mBoletos','BOLETOS','metric-purple')}
      ${metricBox('graduation-cap','Matrículas','mMatriculas','mLancamentos','LANÇ.','metric-green')}
    </div>
    <div class="metric-group daily-group">
      ${metricBox('credit-card','Cartão Diário','dCartao','dCartaoQtd','MATRÍCULAS','metric-cyan')}
      ${metricBox('coins','Taxa Diário','dTaxa','dBoletos','BOLETOS','metric-amber')}
      ${metricBox('user-plus','Matrículas Diárias','dMatriculas','dLancamentos','LANÇ.','metric-red')}
    </div>
  </section>
  <section class="goals-panel">
    <div class="goal-month"><span>METAS DO MÊS</span><strong id="goalMonthLabel"></strong></div>
    <div class="goal-block">
      <div class="goal-block-top"><label class="goal-input"><span>META FATURADOS</span><input id="goalRevenueInput" inputmode="decimal" value="${goals.revenue||''}" placeholder="R$ 0,00"></label><div class="goal-result"><span>REALIZADO / META</span><strong id="goalRevenueText">—</strong><small id="goalRevenueMissing">Faltam —</small></div></div>
      <div class="progress-track"><span id="revenueProgress"></span></div>
    </div>
    <div class="goal-block">
      <div class="goal-block-top"><label class="goal-input"><span>META MATRÍCULAS</span><input id="goalEnrollInput" type="number" min="0" value="${goals.enroll||''}" placeholder="0"></label><div class="goal-result"><span>REALIZADO / META</span><strong id="goalEnrollText">—</strong><small id="goalEnrollMissing">Faltam —</small></div></div>
      <div class="progress-track"><span id="enrollProgress"></span></div>
    </div>
  </section>
  <section class="dashboard-grid">
    <article class="chart-panel"><div class="panel-title">Resultados por Categoria</div><div class="chart-box"><canvas id="categoryChart"></canvas></div></article>
    <article class="chart-panel"><div class="panel-title">Projeção das Metas</div><div class="chart-box"><canvas id="projectionChart"></canvas></div></article>
    <article class="chart-panel distribution"><div class="panel-title">Distribuição dos Resultados</div><div class="chart-box"><canvas id="distributionChart"></canvas></div></article>
    <article class="summary-panel"><div class="panel-title">Resumo Geral</div><div class="summary-top"><div><span>FATURADO MENSAL</span><strong id="summaryRevenue">—</strong></div><div><span>MATRÍCULAS MENSAIS</span><strong id="summaryEnroll">—</strong></div></div><p id="summaryBase" class="summary-base"></p>${summaryLine('Meta faturados','summaryGoalRevenue')}${summaryLine('Meta matrículas','summaryGoalEnroll')}${summaryLine('Quantidade de vendas lançadas no mês','summarySales')}${summaryLine('Qtd. cartão no mês','summaryCards')}${summaryLine('Qtd. boletos no mês','summaryBoletos')}${summaryLine('Faturado no dia selecionado','summaryDayRevenue')}${summaryLine('Matrículas no dia selecionado','summaryDayEnroll')}</article>
  </section>`;
}
function metricBox(icon,title,mainId,subId,subLabel,cls){return `<div class="dashboard-metric"><div class="metric-heading"><span class="metric-round ${cls}"><i data-lucide="${icon}"></i></span><h3>${title}</h3></div><div class="metric-values"><div><span>${title.includes('Matrícula')?'QTD.':title.includes('Taxa')?'TAXA':'VALOR'}</span><strong id="${mainId}">—</strong></div><div><span>${subLabel}</span><strong id="${subId}">—</strong></div></div></div>`;}
function summaryLine(label,id){return `<div class="summary-line"><span>${label}</span><strong id="${id}">—</strong></div>`;}

function bindDashboard({mode}){
  $('#switchDashboard')?.addEventListener('click',()=>renderDashboard(mode==='geral'?{mode:'individual',seller:currentUser.role==='vendedor'?currentUser.name:SELLERS[0]}:{mode:'geral'}));
  $('#applyDash').onclick=()=>refreshDashboard({mode}); $('#dashSeller')?.addEventListener('change',()=>refreshDashboard({mode}));
  const saveGoal=()=>{ const seller=getDashSeller(mode); const to=$('#dashTo').value; saveGoals(seller,to,{revenue:parseMoney($('#goalRevenueInput').value),enroll:Number($('#goalEnrollInput').value||0)}); refreshDashboard({mode}); };
  $('#goalRevenueInput').addEventListener('change',saveGoal); $('#goalEnrollInput').addEventListener('change',saveGoal);
  $('#saveDashboard').onclick=()=>saveDashboardPreset(mode); $('#openSavedDashboards').onclick=()=>toggleSavedDashboards(mode);
}
function getDashSeller(mode){ if(mode==='geral') return ''; if(currentUser.role==='vendedor') return currentUser.name; return $('#dashSeller')?.value||''; }
function refreshDashboard({mode}){
  const from=$('#dashFrom').value,to=$('#dashTo').value,seller=getDashSeller(mode),goals=getGoals(seller,to); const data=calculateDashboard(salesCache,{from,to,seller,goals}); fillDashboardText(content,data); $('#goalMonthLabel').textContent=to?`${to.slice(5,7)}/${to.slice(0,4)}`:'—'; $('#summaryBase').textContent=`Base: área Vendas • ${formatDateBR(from)} até ${formatDateBR(to)}${seller?` • ${seller}`:''}`; renderCharts(content,data,{from,to}); refreshIcons();
}
function presetsKey(){ return `unifahe.dashboardPresets.${currentUser.id}`; }
function saveDashboardPreset(mode){ const list=JSON.parse(localStorage.getItem(presetsKey())||'[]'); const preset={id:Date.now(),mode,from:$('#dashFrom').value,to:$('#dashTo').value,seller:getDashSeller(mode),label:`${mode==='geral'?'Geral':getDashSeller(mode)} • ${formatDateBR($('#dashFrom').value)}–${formatDateBR($('#dashTo').value)}`}; list.unshift(preset); localStorage.setItem(presetsKey(),JSON.stringify(list.slice(0,10))); toast('Dashboard salvo.'); }
function toggleSavedDashboards(mode){ const panel=$('#savedDashboardsPanel'); panel.classList.toggle('is-hidden'); if(panel.classList.contains('is-hidden')) return; const list=JSON.parse(localStorage.getItem(presetsKey())||'[]'); panel.innerHTML=list.length?`<div class="saved-list">${list.map(p=>`<button class="saved-item" data-id="${p.id}"><i data-lucide="bookmark"></i><span>${escapeHTML(p.label)}</span><i data-lucide="arrow-right"></i></button>`).join('')}</div>`:`<div class="empty-saved">Nenhum dashboard salvo ainda.</div>`; panel.querySelectorAll('.saved-item').forEach(btn=>btn.onclick=()=>{ const p=list.find(x=>String(x.id)===btn.dataset.id); if(!p)return; renderDashboard({mode:p.mode,seller:p.seller}); setTimeout(()=>{ $('#dashFrom').value=p.from; $('#dashTo').value=p.to; if($('#dashSeller')&&p.seller) $('#dashSeller').value=p.seller; refreshDashboard({mode:p.mode}); },0); }); refreshIcons(); }

if(localStorage.getItem('unifaheSidebarCollapsed')==='1') sidebar.classList.add('is-collapsed'); setTimeout(refreshIcons,0);
