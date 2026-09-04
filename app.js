import { STATES, PAYMENT_TYPES, MODALITIES, ORIGINS, COURSES, SELLERS } from './modules/catalogs.js';
import { SalesRepository } from './modules/repository.js';
import { calculateDashboard, calculateSellerDashboard, fillDashboardText, renderCharts, renderSellerCharts, destroyCharts } from './modules/dashboard.js';
import { escapeHTML, formatDateBR, formatDateTimeBR, fileSize, money, parseMoney, paymentLabel, todayISO, monthRangeISO } from './modules/utils.js';
import { SELLER_PROFILES, FCA_BASE_SALARY, FCA_RULES, calculateCommissionSnapshot, calculateCommissionRanking } from './modules/commissions.js';
import { ProfilePhotoStore, MAX_PROFILE_PHOTO_BYTES } from './modules/profile.js';
import { FcaRepository } from './modules/fca-repository.js';
import { WeeklyPerformanceRepository } from './modules/weekly-performance-repository.js';
import { GoalsRepository } from './modules/goals-repository.js';
import { loginAccount, logoutAccount, watchSession } from './modules/firebase.js';
import { PREVIEW_LOGIN_ENABLED, authenticatePreview, previewCredentials } from './modules/runtime.js';

const COMMON_ITEMS = [
  { id:'inicio', label:'Início', icon:'house', section:'Principal' },
  { id:'dashboard', label:'Dashboard', icon:'layout-dashboard', section:'Principal' },
  { id:'vendas', label:'Vendas', icon:'badge-dollar-sign', section:'Operação' },
  { id:'times', label:'Times', icon:'users-round', section:'Operação' },
  { id:'fca', label:'FCA', icon:'clipboard-check', section:'Operação' },
  { id:'campanhas', label:'Campanhas', icon:'megaphone', section:'Operação' },
  { id:'comissoes', label:'Comissões', icon:'circle-dollar-sign', section:'Análise' }
];
const MANAGER_ITEMS = [
  { id:'indicadores', label:'Indicadores', icon:'gauge', section:'Gestão' }
];
const PAGE_COPY = {
  times:['Times','Estrutura pronta para ranking, composição e acompanhamento dos times.'],
  campanhas:['Campanhas','Estrutura pronta para campanhas, metas e ações comerciais.']
};

let currentUser = null;
let currentPage = 'inicio';
let salesCache = [];
let activeSalesStatusFilter = 'all';
let commissionMonth = todayISO().slice(0,7);
let selectedCommissionSeller = '';
let activeProfilePhotoUrl = '';
let activeReceiptPreviewUrl = '';
let fcaReportsCache = [];
let fcaActionsCache = [];
let weeklyPerformanceReportsCache = [];
let weeklyPerformanceWeekStart = '';
let weeklyPerformanceSeller = SELLERS[0] || '';
let sellerDashboardMonth = todayISO().slice(0,7);
let indicatorsMonth = todayISO().slice(0,7);
let selectedIndicatorSeller = SELLERS[0] || '';

const $ = s => document.querySelector(s);
const loginView=$('#loginView'), appView=$('#appView'), loginForm=$('#loginForm'), loginError=$('#loginError');
const emailInput=$('#email'), passwordInput=$('#password'), sidebar=$('#sidebar'), sidebarNav=$('#sidebarNav');
const content=$('#content'), userName=$('#userName'), userRole=$('#userRole'), userAvatar=$('#userAvatar');
const mobileOverlay=$('#mobileOverlay'), modalHost=$('#modalHost');
const profileTrigger=$('#profileTrigger'), profileDrawer=$('#profileDrawer'), profileOverlay=$('#profileOverlay'), profileCloseButton=$('#profileCloseButton');
const profilePhotoInput=$('#profilePhotoInput'), profilePhotoPreview=$('#profilePhotoPreview'), removeProfilePhoto=$('#removeProfilePhoto');
const sidebarTooltip=document.createElement('div');
sidebarTooltip.className='sidebar-hover-tooltip';
sidebarTooltip.hidden=true;
sidebarTooltip.setAttribute('role','tooltip');
document.body.append(sidebarTooltip);

function refreshIcons(){ if(window.lucide) window.lucide.createIcons({attrs:{'stroke-width':1.9}}); }
function toast(message, type='ok'){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<i data-lucide="${type==='error'?'circle-alert':'circle-check'}"></i><span>${escapeHTML(message)}</span>`;
  $('#toastHost').append(el); refreshIcons(); setTimeout(()=>el.remove(),3600);
}
function getMenuItems(){
  if(!currentUser) return [];
  if(currentUser.role==='auditoria') return [{ id:'vendas', label:'Vendas', icon:'badge-check', section:'Auditoria' }];
  return currentUser.role==='gestor' ? [...COMMON_ITEMS,...MANAGER_ITEMS] : [...COMMON_ITEMS];
}
function canAudit(){ return currentUser?.role==='gestor' || currentUser?.role==='auditoria'; }
function canManageReceipts(){ return currentUser?.role!=='auditoria'; }
function userInitials(name){ return name.split(' ').filter(Boolean).map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

function setAvatarVisual(element, imageUrl='') {
  if (!element || !currentUser) return;
  const initials=escapeHTML(userInitials(currentUser.name));
  element.innerHTML=imageUrl?`<img src="${imageUrl}" alt="Foto de ${escapeHTML(currentUser.name)}">`:initials;
}
async function refreshUserPhoto(){
  if(activeProfilePhotoUrl){ URL.revokeObjectURL(activeProfilePhotoUrl); activeProfilePhotoUrl=''; }
  let blob=null;
  try{ blob=await ProfilePhotoStore.get(currentUser.id || currentUser.name); }catch{}
  activeProfilePhotoUrl=blob?URL.createObjectURL(blob):'';
  setAvatarVisual(userAvatar,activeProfilePhotoUrl); setAvatarVisual(profilePhotoPreview,activeProfilePhotoUrl);
  removeProfilePhoto.classList.toggle('is-hidden',!blob);
}
function openProfileDrawer(){ profileDrawer.classList.add('is-open'); profileOverlay.classList.add('visible'); profileTrigger.setAttribute('aria-expanded','true'); refreshIcons(); }
function closeProfileDrawer(){ profileDrawer.classList.remove('is-open'); profileOverlay.classList.remove('visible'); profileTrigger.setAttribute('aria-expanded','false'); }

loginForm.addEventListener('submit', async e=>{
  e.preventDefault();
  const email=emailInput.value.trim().toLowerCase();
  const password=passwordInput.value;
  if(!email || !password){ loginError.textContent='Informe o e-mail e a senha.'; return; }
  const submit=loginForm.querySelector('button[type="submit"]');
  submit.disabled=true; submit.textContent='Entrando...'; loginError.textContent='';
  try{
    const profile=PREVIEW_LOGIN_ENABLED
      ? authenticatePreview(email,password)
      : await loginAccount(email,password);
    if(!currentUser) await signIn(profile);
  }catch(error){ loginError.textContent=error.message||'Não foi possível entrar.'; }
  finally{ submit.disabled=false; submit.textContent='Entrar'; }
});

document.querySelectorAll('[data-demo]').forEach(button=>button.addEventListener('click',()=>{
  const credentials=previewCredentials(button.dataset.demo);
  emailInput.value=credentials.email;
  passwordInput.value=credentials.password;
  loginError.textContent='';
  emailInput.dispatchEvent(new Event('input',{bubbles:true}));
  passwordInput.dispatchEvent(new Event('input',{bubbles:true}));
}));

$('#togglePassword').addEventListener('click',()=>{
  const show=passwordInput.type==='password'; passwordInput.type=show?'text':'password';
  $('#togglePassword').innerHTML=`<i data-lucide="${show?'eye-off':'eye'}"></i>`; refreshIcons();
});
function hideSidebarTooltip(){ sidebarTooltip.hidden=true; }
function showSidebarTooltip(target){
  if(!target?.dataset?.tooltip || !sidebar.classList.contains('is-collapsed') || window.matchMedia('(max-width:900px)').matches){ hideSidebarTooltip(); return; }
  const rect=target.getBoundingClientRect();
  sidebarTooltip.textContent=target.dataset.tooltip;
  sidebarTooltip.hidden=false;
  sidebarTooltip.style.left=`${Math.round(rect.right+11)}px`;
  sidebarTooltip.style.top=`${Math.round(rect.top+(rect.height/2))}px`;
}
function bindSidebarTooltip(target){
  if(!target || target.dataset.tooltipBound==='1') return;
  target.dataset.tooltipBound='1';
  target.addEventListener('pointerenter',()=>showSidebarTooltip(target));
  target.addEventListener('pointerleave',hideSidebarTooltip);
  target.addEventListener('focus',()=>showSidebarTooltip(target));
  target.addEventListener('blur',hideSidebarTooltip);
}

function setSidebarCollapsed(collapsed){
  hideSidebarTooltip();
  sidebar.classList.toggle('is-collapsed',Boolean(collapsed));
  if(window.matchMedia('(min-width:901px)').matches){
    localStorage.setItem('unifaheSidebarCollapsed',collapsed?'1':'0');
  }
  const toggle=$('#sidebarToggle');
  toggle?.setAttribute('aria-label',collapsed?'Expandir menu':'Recolher menu');
}
$('#sidebarToggle').addEventListener('click',event=>{
  event.stopPropagation();
  setSidebarCollapsed(!sidebar.classList.contains('is-collapsed'));
});
document.addEventListener('pointerdown',event=>{
  if(!currentUser || window.matchMedia('(max-width:900px)').matches) return;
  if(sidebar.classList.contains('is-collapsed') || sidebar.contains(event.target)) return;
  setSidebarCollapsed(true);
});
$('#mobileMenuButton').addEventListener('click',()=>{ sidebar.classList.add('mobile-open'); mobileOverlay.classList.add('visible'); });
mobileOverlay.addEventListener('click',closeMobileMenu);
profileTrigger.addEventListener('click',openProfileDrawer);
profileOverlay.addEventListener('click',closeProfileDrawer);
profileCloseButton.addEventListener('click',closeProfileDrawer);
profilePhotoInput.addEventListener('change',async()=>{
  const file=profilePhotoInput.files?.[0]; if(!file)return;
  if(file.size>MAX_PROFILE_PHOTO_BYTES){ toast('A foto deve ter no máximo 4 MB.','error'); profilePhotoInput.value=''; return; }
  try{ await ProfilePhotoStore.save(currentUser.id || currentUser.name,file); await refreshUserPhoto(); toast('Foto de perfil atualizada.'); }
  catch(error){ toast(error.message||'Não foi possível salvar a foto.','error'); }
  finally{ profilePhotoInput.value=''; }
});
removeProfilePhoto.addEventListener('click',async()=>{
  try{ await ProfilePhotoStore.remove(currentUser.id || currentUser.name); await refreshUserPhoto(); toast('Foto de perfil removida.'); }
  catch{ toast('Não foi possível remover a foto.','error'); }
});
$('#logoutButton').dataset.tooltip='Sair';
bindSidebarTooltip($('#logoutButton'));
$('#logoutButton').addEventListener('click',signOut);

async function signIn(user){
  currentUser=user; currentPage=user.role==='auditoria'?'vendas':'inicio';
  userName.textContent=user.name; userRole.textContent=user.role==='gestor'?'Gestor':user.role==='auditoria'?'Auditoria':'Vendedor';
  loginView.classList.add('is-hidden'); appView.classList.remove('is-hidden');
  await refreshUserPhoto(); buildMenu();
  try{ await loadSales(); }catch(error){ salesCache=[]; toast(error.message||'Não foi possível carregar as vendas do Firebase.','error'); }
  renderPage(currentPage);
}
async function signOut(){
  closeProfileDrawer();
  if(!PREVIEW_LOGIN_ENABLED) await logoutAccount().catch(()=>{});
  resetSignedOutView();
}
function resetSignedOutView(){
  if(activeProfilePhotoUrl){URL.revokeObjectURL(activeProfilePhotoUrl);activeProfilePhotoUrl='';}
  currentUser=null; salesCache=[]; destroyCharts(); closeModal(); appView.classList.add('is-hidden'); loginView.classList.remove('is-hidden'); emailInput.value=''; passwordInput.value=''; closeMobileMenu();
}
async function loadSales(){ const result=await SalesRepository.list(); salesCache=result.rows; }
function closeMobileMenu(){ sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('visible'); }

function buildMenu(){
  sidebarNav.innerHTML=''; let section='';
  getMenuItems().forEach(item=>{
    if(item.section!==section){ section=item.section; sidebarNav.insertAdjacentHTML('beforeend',`<div class="nav-section-label">${section}</div>`); }
    const wrap=document.createElement('div');
    wrap.className=`nav-item-wrap${item.id==='fca'?' has-submenu':''}`;
    const btn=document.createElement('button');
    btn.className=`nav-item${item.id===currentPage?' active':''}`; btn.dataset.page=item.id; btn.dataset.tooltip=item.label;
    btn.innerHTML=`<span class="nav-icon"><i data-lucide="${item.icon}"></i></span><span class="nav-label">${item.label}</span>${item.id==='fca'?'<span class="nav-submenu-caret"><i data-lucide="chevron-right"></i></span>':''}`;
    bindSidebarTooltip(btn);
    btn.onclick=()=>{hideSidebarTooltip();renderPage(item.id);closeMobileMenu();}; wrap.append(btn);
    if(item.id==='fca'){
      const submenu=document.createElement('div'); submenu.className='nav-submenu';
      submenu.innerHTML=`<button type="button" class="nav-submenu-item" data-page="fca-semanal"><span><i data-lucide="calendar-check-2"></i></span><strong>Painel semanal de performance</strong></button>`;
      submenu.querySelector('button').onclick=event=>{event.stopPropagation();renderPage('fca-semanal');closeMobileMenu();};
      wrap.append(submenu);
    }
    sidebarNav.append(wrap);
  });
  refreshIcons();
}

function homeMetric(icon,label,value,helper=''){
  return `<div class="home-metric"><span class="home-metric-icon"><i data-lucide="${icon}"></i></span><div><small>${label}</small><strong>${value}</strong>${helper?`<span>${helper}</span>`:''}</div></div>`;
}
function homeShortcut(page,icon,title,description,accent=''){
  return `<button type="button" class="home-shortcut ${accent}" data-home-page="${page}"><span><i data-lucide="${icon}"></i></span><div><strong>${title}</strong><small>${description}</small></div><i data-lucide="arrow-up-right"></i></button>`;
}
function renderHome(){
  destroyCharts();
  const today=todayISO();
  const month=today.slice(0,7);
  const sellerOnly=currentUser.role==='vendedor';
  const scoped=sellerOnly?salesCache.filter(row=>row.seller_name===currentUser.name):salesCache;
  const approvedMonth=scoped.filter(row=>row.audit_status==='ok' && String(row.sale_date||'').startsWith(month));
  const approvedToday=approvedMonth.filter(row=>row.sale_date===today);
  const pending=scoped.filter(row=>row.audit_status==='pending').length;
  const revenue=approvedMonth.reduce((sum,row)=>sum+Number(row.total_value||0),0);
  const enrollments=approvedMonth.reduce((sum,row)=>sum+Number(row.course_quantity||0),0);
  const boletos=approvedMonth.filter(row=>row.payment_type==='boleto').length;
  const todayRevenue=approvedToday.reduce((sum,row)=>sum+Number(row.total_value||0),0);
  const activeSellers=new Set(approvedToday.map(row=>row.seller_name).filter(Boolean)).size;
  const firstName=escapeHTML(String(currentUser.name||'').split(' ')[0]||currentUser.name);
  const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(`${month}-01T12:00:00`));
  const roleText=sellerOnly?'Seu ponto de partida para acompanhar produção, metas e rotina comercial.':'Visão rápida da operação e atalhos para os principais controles do comercial.';
  const priorityTitle=pending?`${pending} ${pending===1?'venda aguarda':'vendas aguardam'} auditoria`:'Auditoria em dia';
  const priorityText=pending?(sellerOnly?'Acompanhe a validação para que essas vendas entrem nos seus indicadores.':'Há lançamentos pendentes de validação antes de entrarem nos dashboards.'):(sellerOnly?'Suas vendas lançadas não têm pendências de auditoria neste momento.':'Não há vendas pendentes de auditoria neste momento.');
  const shortcuts=sellerOnly?[
    ['dashboard','layout-dashboard','Meu dashboard','Metas, ritmo e projeções','orange'],
    ['vendas','badge-dollar-sign','Vendas','Consultar e lançar vendas',''],
    ['fca-semanal','calendar-check-2','Painel semanal','Meta e tarefas da semana','blue'],
    ['comissoes','circle-dollar-sign','Comissões','Acompanhar FCA e remuneração','']
  ]:[
    ['dashboard','layout-dashboard','Dashboard geral','Visão consolidada do comercial','orange'],
    ['vendas','badge-dollar-sign','Vendas','Operação e auditoria das vendas',''],
    ['indicadores','gauge','Indicadores','Metas e dashboards dos vendedores','blue'],
    ['fca-semanal','calendar-check-2','Painel semanal','Performance e relatórios da equipe',''],
    ['comissoes','circle-dollar-sign','Comissões','Faixas, bônus e bonificações','']
  ];
  content.innerHTML=`
    <section class="home-head">
      <div><span class="eyebrow">INÍCIO</span><h2>Olá, ${firstName}</h2><p>${roleText}</p></div>
      <div class="home-date"><span>MÊS ATUAL</span><strong>${monthLabel}</strong><small>${formatDateBR(today)}</small></div>
    </section>
    <section class="home-overview" aria-label="Resumo do mês">
      <div class="home-overview-title"><span class="section-kicker">RESUMO DO MÊS</span><h3>${sellerOnly?'Minha produção validada':'Produção validada da equipe'}</h3><p>Somente vendas com status OK entram nestes números.</p></div>
      <div class="home-metrics-grid">
        ${homeMetric('banknote','Faturado',money.format(revenue),'vendas OK')}
        ${homeMetric('graduation-cap','Matrículas',String(enrollments),'no mês')}
        ${homeMetric('barcode','Boletos',String(boletos),'no mês')}
        ${homeMetric('badge-check','Vendas OK',String(approvedMonth.length),'validadas')}
      </div>
    </section>
    <section class="home-main-grid">
      <div class="home-shortcuts-area">
        <div class="home-section-heading"><div><span class="section-kicker">ATALHOS</span><h3>Acesso rápido</h3></div><span>Entre direto no que precisa acompanhar.</span></div>
        <div class="home-shortcuts-grid">${shortcuts.map(item=>homeShortcut(...item)).join('')}</div>
      </div>
      <aside class="home-today-panel">
        <div class="home-section-heading compact"><div><span class="section-kicker">HOJE</span><h3>Operação do dia</h3></div></div>
        <div class="home-today-numbers">
          <div><span>Faturado OK hoje</span><strong>${money.format(todayRevenue)}</strong></div>
          <div><span>Vendas OK hoje</span><strong>${approvedToday.length}</strong></div>
          ${sellerOnly?`<div><span>Pendentes de auditoria</span><strong>${pending}</strong></div>`:`<div><span>Vendedores com venda OK</span><strong>${activeSellers}</strong></div>`}
        </div>
        <div class="home-priority ${pending?'attention':'clear'}"><span><i data-lucide="${pending?'circle-alert':'circle-check'}"></i></span><div><strong>${priorityTitle}</strong><p>${priorityText}</p></div></div>
      </aside>
    </section>`;
  content.querySelectorAll('[data-home-page]').forEach(button=>button.addEventListener('click',()=>renderPage(button.dataset.homePage)));
  refreshIcons();
}

function renderPage(id){
  closeModal();
  if(currentUser.role==='auditoria' && id!=='vendas') id='vendas';
  currentPage=id;
  document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===id || (id==='fca-semanal'&&el.dataset.page==='fca')));
  document.querySelectorAll('.nav-submenu-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===id));
  if(id==='inicio') return renderHome();
  if(id==='dashboard') return currentUser.role==='gestor'?renderDashboard({mode:'geral'}):renderSellerDashboard();
  if(id==='vendas') return renderSales();
  if(id==='fca') return renderFCA();
  if(id==='fca-semanal') return renderWeeklyPerformance();
  if(id==='comissoes') return renderCommissions();
  if(id==='indicadores') return currentUser.role==='gestor'?renderIndicators():renderSellerDashboard();
  const [title,desc]=PAGE_COPY[id]||['Módulo','Estrutura pronta para receber conteúdo.'];
  content.innerHTML=`<section class="page-intro"><div><span class="eyebrow">MÓDULO</span><h2>${title}</h2><p>${desc}</p></div></section><section class="blank-canvas"><div class="blank-canvas-mark"><i data-lucide="layout-dashboard"></i></div><span>Conteúdo em branco por enquanto</span></section>`;
  refreshIcons();
}

function salesSummary(rows){
  return {
    count:rows.length,
    total:rows.reduce((a,r)=>a+Number(r.total_value||0),0),
    courses:rows.reduce((a,r)=>a+Number(r.course_quantity||0),0),
    pending:rows.filter(r=>r.audit_status==='pending').length,
    ok:rows.filter(r=>r.audit_status==='ok').length,
    notOk:rows.filter(r=>r.audit_status==='not_ok').length,
    noReceipt:rows.filter(r=>!(r.receipts||[]).length).length
  };
}

function renderSales(){
  const allTeam=currentUser.role==='gestor' || currentUser.role==='auditoria';
  const ownRows=allTeam?salesCache:salesCache.filter(r=>r.seller_name===currentUser.name);
  const summary=salesSummary(ownRows);
  const auditMode=currentUser.role==='auditoria';
  content.innerHTML=`
    <section class="sales-command ${auditMode?'audit-workspace':''}">
      <div class="sales-title-copy">
        <span class="eyebrow">${auditMode?'AUDITORIA COMERCIAL':'OPERAÇÃO COMERCIAL'}</span>
        <h2>Vendas</h2>
        ${auditMode?'<p>Valide as vendas e confira os comprovantes anexados.</p>':''}
      </div>
      <div class="sales-command-center">
        <span class="sales-center-label">CONFERÊNCIA</span>
        <div class="audit-overview"><span class="pending"><i class="dot pending"></i><strong>${summary.pending}</strong> pendentes</span><span class="ok"><i class="dot ok"></i><strong>${summary.ok}</strong> OK</span><span class="not-ok"><i class="dot not-ok"></i><strong>${summary.notOk}</strong> não OK</span><span class="no-receipt"><i data-lucide="paperclip"></i><strong>${summary.noReceipt}</strong> sem comprovante</span></div>
      </div>
      <div class="sales-command-right">
        <div class="sales-command-summary" aria-label="Resumo das vendas">
          <div class="sales-stat"><span>Vendas</span><strong>${summary.count}</strong></div>
          <div class="sales-stat"><span>Valor total</span><strong>${money.format(summary.total)}</strong></div>
          <div class="sales-stat"><span>Matrículas</span><strong>${summary.courses}</strong></div>
        </div>
        ${auditMode?'':`<button id="toggleSaleForm" class="primary-action sales-add-button"><i data-lucide="plus"></i>Adicionar venda</button>`}
      </div>
    </section>
    ${auditMode?'':'<section id="saleFormPanel" class="sale-entry-panel is-collapsed"></section>'}
    <section class="sales-list-section">
      <div class="section-heading sales-list-heading">
        <div class="records-copy"><span class="section-kicker">REGISTROS</span><h3>${auditMode?'Fila de auditoria':'Vendas lançadas'}</h3><p>${auditMode?'Use os status à esquerda e o comprovante à direita para conferir cada venda.':'Passe o mouse sobre uma linha para consultar os detalhes do lançamento.'}</p></div>
        <div class="sales-filter-line" aria-label="Filtros de auditoria">
          ${salesStatusFilterButton('all','Todas',summary.count)}
          ${salesStatusFilterButton('pending','Pendentes',summary.pending)}
          ${salesStatusFilterButton('ok','OK',summary.ok)}
          ${salesStatusFilterButton('not_ok','Não OK',summary.notOk)}
          ${salesStatusFilterButton('no_receipt','Sem comprovante',summary.noReceipt)}
        </div>
        <div class="table-actions"><input id="salesSearch" class="compact-input" placeholder="Buscar aluno, curso ou vendedor"/><select id="salesPaymentFilter" class="compact-select"><option value="">Todos os pagamentos</option>${PAYMENT_TYPES.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')}</select></div>
      </div>
      <div id="salesTableWrap" class="sales-table-wrap${auditMode?' audit-only-table':''}"></div>
    </section>`;

  if(!auditMode){
    $('#toggleSaleForm').onclick=()=>{
      const panel=$('#saleFormPanel'); panel.classList.toggle('is-collapsed');
      if(!panel.dataset.ready) mountSaleForm(panel);
      $('#toggleSaleForm').innerHTML=panel.classList.contains('is-collapsed')?'<i data-lucide="plus"></i>Adicionar venda':'<i data-lucide="x"></i>Fechar lançamento'; refreshIcons();
    };
  }
  $('#salesSearch').addEventListener('input',()=>renderSalesTable(ownRows));
  $('#salesPaymentFilter').addEventListener('change',()=>renderSalesTable(ownRows));
  document.querySelectorAll('[data-sales-status]').forEach(btn=>btn.addEventListener('click',()=>{
    activeSalesStatusFilter=btn.dataset.salesStatus;
    document.querySelectorAll('[data-sales-status]').forEach(x=>x.classList.toggle('active',x===btn));
    renderSalesTable(ownRows);
  }));
  renderSalesTable(ownRows); refreshIcons();
}

function salesStatusFilterButton(value,label,count){
  return `<button type="button" class="sales-filter-chip status-${value} ${activeSalesStatusFilter===value?'active':''}" data-sales-status="${value}"><span>${label}</span><strong>${count}</strong></button>`;
}

function mountSaleForm(panel){
  panel.dataset.ready='1';
  const sellerControl=currentUser.role==='gestor'
    ?`<label class="form-field"><span>Vendedor</span><select name="seller_name" required><option value="">Selecione</option>${SELLERS.map(v=>`<option>${v}</option>`).join('')}</select></label>`
    :`<label class="form-field"><span>Vendedor</span><div class="readonly-value"><i data-lucide="user-check"></i>${escapeHTML(currentUser.name)}</div><input type="hidden" name="seller_name" value="${escapeHTML(currentUser.name)}"></label>`;
  panel.innerHTML=`<form id="saleForm" class="sale-form">
    <div class="sale-form-head"><div><span class="section-kicker">NOVA VENDA</span><h3>Informações do lançamento</h3></div></div>
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
    if(pay.value==='boleto'){
      const fee=$('#feeValue'), inst=$('#installments'), total=$('#totalValue');
      const calc=()=>{ total.value=money.format(parseMoney(fee.value)*Number(inst.value||0)); };
      fee.oninput=calc; inst.oninput=calc; calc();
    }
  };
  const renderPending=()=>{ pending.innerHTML=['Migração R2','Refinfahe'].includes(modality.value)?`<label class="form-field"><span>Pendência</span><input name="pending" placeholder="Informe a pendência" required></label>`:''; };
  pay.onchange=renderPayment; modality.onchange=renderPending; renderPayment(); renderPending();
  $('#cancelSale').onclick=()=>$('#toggleSaleForm').click();
  $('#saleForm').onsubmit=handleSaleSubmit; refreshIcons();
}

async function handleSaleSubmit(event){
  event.preventDefault(); const form=event.currentTarget; const fd=new FormData(form); const payment=fd.get('payment_type');
  const sale={
    sale_date:fd.get('sale_date'), seller_name:fd.get('seller_name'), student_name:String(fd.get('student_name')||'').trim(),
    payment_type:payment, fee_value:payment==='boleto'?parseMoney(fd.get('fee_value')):0, installments:Number(fd.get('installments')||0),
    total_value:parseMoney(fd.get('total_value')), modality:fd.get('modality'), pending:fd.get('pending')||'', course:fd.get('course'),
    state:fd.get('state'), origin:fd.get('origin'), course_quantity:Number(fd.get('course_quantity')||1)
  };
  if(payment==='boleto') sale.total_value=sale.fee_value*sale.installments;
  const submit=form.querySelector('button[type=submit]'); submit.disabled=true; submit.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Salvando'; refreshIcons();
  try{
    const result=await SalesRepository.create(sale); salesCache.unshift(result.sale);
    toast('Venda salva com sucesso.'); renderSales();
  } catch(e){ toast(e.message||'Não foi possível salvar a venda.','error'); submit.disabled=false; submit.innerHTML='<i data-lucide="save"></i>Salvar venda'; refreshIcons(); }
}

function filterSalesRows(baseRows){
  const term=($('#salesSearch')?.value||'').toLowerCase();
  const pay=$('#salesPaymentFilter')?.value||'';
  return baseRows.filter(r=>{
    const matchesPay=!pay||r.payment_type===pay;
    const matchesTerm=!term||[r.student_name,r.seller_name,r.course,r.modality,r.origin].join(' ').toLowerCase().includes(term);
    const matchesStatus=activeSalesStatusFilter==='all'
      || (activeSalesStatusFilter==='no_receipt' ? !(r.receipts||[]).length : r.audit_status===activeSalesStatusFilter);
    return matchesPay&&matchesTerm&&matchesStatus;
  }).sort((a,b)=>b.sale_date.localeCompare(a.sale_date)||String(b.created_at).localeCompare(String(a.created_at)));
}

function auditInfo(status){
  if(status==='ok') return {icon:'check',label:'OK',tooltip:'Venda OK',cls:'ok'};
  if(status==='not_ok') return {icon:'x',label:'Não OK',tooltip:'Falta comprovante',cls:'not-ok'};
  return {icon:'',label:'Pendente',tooltip:'Pendente',cls:'pending'};
}

function auditIconMarkup(audit){
  return audit.cls==='pending'?'<span class="audit-yellow-dot" aria-hidden="true"></span>':`<i data-lucide="${audit.icon}"></i>`;
}

function closeAuditSelects(except=null){
  document.querySelectorAll('.audit-icon-select.is-open').forEach(menu=>{
    if(menu===except) return;
    menu.classList.remove('is-open');
    menu.querySelector('[data-audit-trigger]')?.setAttribute('aria-expanded','false');
    const options=menu.querySelector('.audit-icon-options');
    if(options){ options.style.left=''; options.style.top=''; }
  });
}

function positionAuditOptions(menu,trigger){
  const options=menu?.querySelector('.audit-icon-options');
  if(!options || !trigger) return;
  const rect=trigger.getBoundingClientRect();
  const gap=10;
  const width=options.offsetWidth||136;
  const height=options.offsetHeight||52;
  let left=rect.right+gap;
  let top=rect.top+(rect.height-height)/2;
  if(left+width>window.innerWidth-12) left=rect.left-width-gap;
  top=Math.max(10,Math.min(top,window.innerHeight-height-10));
  options.style.left=`${Math.round(left)}px`;
  options.style.top=`${Math.round(top)}px`;
}

let auditTooltipEl=null;
function ensureAuditTooltip(){
  if(auditTooltipEl?.isConnected) return auditTooltipEl;
  auditTooltipEl=document.createElement('div');
  auditTooltipEl.className='audit-tooltip-portal';
  auditTooltipEl.setAttribute('role','tooltip');
  document.body.appendChild(auditTooltipEl);
  return auditTooltipEl;
}
function showAuditTooltip(target){
  const text=target?.dataset?.tooltip;
  if(!text) return;
  const tooltip=ensureAuditTooltip();
  tooltip.textContent=text;
  tooltip.classList.remove('is-left');
  tooltip.classList.add('is-visible');
  const rect=target.getBoundingClientRect();
  const gap=11;
  const width=tooltip.offsetWidth;
  const height=tooltip.offsetHeight;
  let left=rect.right+gap;
  let top=rect.top+(rect.height-height)/2;
  if(left+width>window.innerWidth-10){
    left=rect.left-width-gap;
    tooltip.classList.add('is-left');
  }
  top=Math.max(8,Math.min(top,window.innerHeight-height-8));
  tooltip.style.left=`${Math.round(left)}px`;
  tooltip.style.top=`${Math.round(top)}px`;
}
function hideAuditTooltip(){
  auditTooltipEl?.classList.remove('is-visible','is-left');
}

document.addEventListener('mouseover',event=>{
  const target=event.target.closest('[data-tooltip]');
  if(!target || target.contains(event.relatedTarget)) return;
  showAuditTooltip(target);
});
document.addEventListener('mouseout',event=>{
  const target=event.target.closest('[data-tooltip]');
  if(!target || target.contains(event.relatedTarget)) return;
  hideAuditTooltip();
});
window.addEventListener('resize',()=>{ closeAuditSelects(); hideAuditTooltip(); });
window.addEventListener('scroll',()=>{ closeAuditSelects(); hideAuditTooltip(); },true);

function renderSalesTable(baseRows){
  hideAuditTooltip();
  const wrap=$('#salesTableWrap'); if(!wrap) return;
  const rows=filterSalesRows(baseRows);
  if(!rows.length){ wrap.innerHTML=`<div class="empty-sales"><i data-lucide="receipt-text"></i><strong>Nenhuma venda encontrada</strong><span>Ajuste os filtros ou faça um novo lançamento.</span></div>`; refreshIcons(); return; }
  wrap.innerHTML=`<table class="sales-table"><thead><tr><th class="audit-col">Auditoria</th><th>Data</th><th>Aluno</th><th>Vendedor</th><th>Pagamento</th><th>Modalidade / curso</th><th>Origem</th><th class="num">Qtd.</th><th class="num">Total</th><th class="receipt-col">Comprovante</th></tr></thead><tbody>${rows.map(saleRowsMarkup).join('')}</tbody></table>`;

  wrap.querySelectorAll('[data-sale-main]').forEach(row=>{
    const details=wrap.querySelector(`[data-sale-details="${row.dataset.saleMain}"]`);
    if(!details) return;
    const openDetails=()=>details.classList.remove('is-hidden');
    const closeDetails=()=>details.classList.add('is-hidden');
    row.addEventListener('mouseenter',openDetails);
    row.addEventListener('mouseleave',event=>{
      if(details.contains(event.relatedTarget)) return;
      closeDetails();
    });
    details.addEventListener('mouseenter',openDetails);
    details.addEventListener('mouseleave',event=>{
      if(row.contains(event.relatedTarget)) return;
      closeDetails();
    });
  });
  wrap.querySelectorAll('[data-receipt-sale]').forEach(btn=>btn.addEventListener('click',event=>{
    event.stopPropagation(); openReceiptModal(btn.dataset.receiptSale);
  }));
  refreshIcons();
}

function saleRowsMarkup(r){
  const audit=auditInfo(r.audit_status);
  const auditControl=canAudit()?`<div class="audit-icon-select" data-audit-menu="${r.id}">
      <button type="button" class="audit-icon-trigger ${audit.cls}" data-audit-trigger="${r.id}" aria-haspopup="listbox" aria-expanded="false" aria-label="${audit.tooltip}" data-tooltip="${audit.tooltip}">${auditIconMarkup(audit)}</button>
      <div class="audit-icon-options" role="listbox" aria-label="Auditoria de ${escapeHTML(r.student_name)}">
        <button type="button" class="audit-icon-option ok" data-audit-choice="ok" data-audit-sale="${r.id}" data-tooltip="Venda OK" aria-label="Venda OK"><i data-lucide="check"></i></button>
        <button type="button" class="audit-icon-option not-ok" data-audit-choice="not_ok" data-audit-sale="${r.id}" data-tooltip="Falta comprovante" aria-label="Falta comprovante"><i data-lucide="x"></i></button>
        <button type="button" class="audit-icon-option pending" data-audit-choice="pending" data-audit-sale="${r.id}" data-tooltip="Pendente" aria-label="Pendente"><span class="audit-yellow-dot" aria-hidden="true"></span></button>
      </div>
    </div>`:`<span class="audit-status ${audit.cls}" aria-label="${audit.tooltip}" data-tooltip="${audit.tooltip}">${auditIconMarkup(audit)}</span>`;
  const receiptCount=(r.receipts||[]).length;
  const receiptClass=receiptCount?'has-file':'empty';
  const receiptIcon=receiptCount?'files':'paperclip';
  const receiptNames=receiptCount?r.receipts.map(item=>escapeHTML(item.name)).join(', '):'Não anexado';
  return `<tr class="sale-main-row" data-sale-main="${r.id}">
    <td class="audit-col">${auditControl}</td>
    <td><span class="date-cell">${formatDateBR(r.sale_date)}</span></td>
    <td><strong>${escapeHTML(r.student_name)}</strong><small>${escapeHTML(r.state)}</small></td>
    <td>${escapeHTML(r.seller_name)}</td>
    <td><span class="payment-badge ${r.payment_type}">${paymentLabel(r.payment_type)}</span>${r.installments?`<small>${r.installments}x${r.payment_type==='boleto'&&r.fee_value?` de ${money.format(r.fee_value)}`:''}</small>`:''}</td>
    <td><strong>${escapeHTML(r.modality)}</strong><small>${escapeHTML(r.course)}</small></td>
    <td>${escapeHTML(r.origin)}</td><td class="num">${r.course_quantity}</td><td class="num money-cell">${money.format(r.total_value)}</td>
    <td class="receipt-col"><button type="button" class="receipt-button ${receiptClass}" data-receipt-sale="${r.id}" title="${receiptCount?`${receiptCount} comprovante${receiptCount>1?'s':''}`:'Sem comprovante'}"><i data-lucide="${receiptIcon}"></i>${receiptCount?`<span class="receipt-count">${receiptCount}</span>`:'<span class="receipt-missing-dot"></span>'}</button></td>
  </tr>
  <tr class="sale-details-row is-hidden" data-sale-details="${r.id}"><td colspan="10"><div class="sale-details-inner">
    <span><b>Estado</b>${escapeHTML(r.state)}</span><span><b>Parcelas</b>${r.installments?`${r.installments}x`:'—'}</span><span><b>Taxa/parcela</b>${r.fee_value?money.format(r.fee_value):'—'}</span><span><b>Pendência</b>${r.pending?escapeHTML(r.pending):'—'}</span><span><b>Auditoria</b>${audit.label}${r.audited_by?` • ${escapeHTML(r.audited_by)}`:''}</span><span><b>Comprovantes</b>${receiptCount} de 3${receiptCount?` • ${receiptNames}`:''}</span><span><b>ID</b>${escapeHTML(r.id)}</span>
  </div></td></tr>`;
}

document.addEventListener('click',async event=>{
  const choice=event.target.closest('[data-audit-choice]');
  if(choice){
    event.preventDefault(); event.stopPropagation();
    hideAuditTooltip();
    if(!canAudit() || choice.disabled) return;
    const saleId=choice.dataset.auditSale;
    const next=choice.dataset.auditChoice;
    const sale=salesCache.find(row=>row.id===saleId);
    const needsSheetRetry=next==='ok' && sale?.audit_status==='ok' && sale?.sheet_sync_status!=='synced';
    if(!sale || !['pending','ok','not_ok'].includes(next) || (sale.audit_status===next && !needsSheetRetry)){ closeAuditSelects(); return; }
    const menu=choice.closest('.audit-icon-select');
    menu?.classList.add('is-busy');
    menu?.querySelectorAll('button').forEach(button=>button.disabled=true);
    try{
      const result=await SalesRepository.updateAudit(saleId,next,currentUser.name);
      replaceSale(result.sale);
      if(next==='ok' && result.sheetSync?.status==='synced') toast('Venda OK e enviada para a planilha.');
      else if(next==='ok' && result.sheetSync?.status==='already_synced') toast('Venda OK. Ela já estava registrada na planilha.');
      else if(next==='ok' && result.sheetSync?.status==='error') toast(`Venda OK, mas não foi enviada à planilha: ${result.sheetSync.message||'erro de sincronização'}`,'error');
      else if(next==='ok' && result.sheetSync?.status==='not_configured') toast('Venda OK. Configure o webhook da planilha para sincronizar.','error');
      else toast('Auditoria atualizada.');
      hideAuditTooltip();
      closeAuditSelects();
      renderSales();
    }catch(error){
      menu?.classList.remove('is-busy');
      menu?.querySelectorAll('button').forEach(button=>button.disabled=false);
      toast(error.message||'Não foi possível atualizar a auditoria.','error');
    }
    return;
  }
  const trigger=event.target.closest('[data-audit-trigger]');
  if(trigger){
    event.preventDefault(); event.stopPropagation();
    if(!canAudit() || trigger.disabled) return;
    const menu=trigger.closest('.audit-icon-select');
    const willOpen=!menu.classList.contains('is-open');
    closeAuditSelects(menu);
    menu.classList.toggle('is-open',willOpen);
    trigger.setAttribute('aria-expanded',String(willOpen));
    hideAuditTooltip();
    if(willOpen) requestAnimationFrame(()=>positionAuditOptions(menu,trigger));
    return;
  }
  closeAuditSelects();
});

function replaceSale(updated){
  salesCache=salesCache.map(row=>row.id===updated.id?updated:row);
}

function openReceiptModal(id){
  const sale=salesCache.find(r=>r.id===id); if(!sale) return;
  const receipts=sale.receipts||[];
  const manage=canManageReceipts();
  const canAdd=manage && receipts.length<SalesRepository.MAX_RECEIPTS;
  openModal(`<div class="mini-modal receipt-modal">
    <div class="modal-head"><div><span class="section-kicker">COMPROVANTES</span><h3>Documentos da venda</h3><p>${escapeHTML(sale.student_name)} • ${formatDateBR(sale.sale_date)}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div>
    ${receipts.length?`<div class="receipt-list">${receipts.map((receipt,index)=>receiptItemMarkup(receipt,index,manage)).join('')}</div>`:''}
    ${manage?`<div class="receipt-command receipt-command-compact">
      <span class="receipt-limit"><strong>${receipts.length}</strong>/3 comprovantes</span>
      ${canAdd?'':`<span class="receipt-limit-reached"><i data-lucide="circle-check-big"></i>Limite de 3 comprovantes atingido</span>`}
    </div>`:'<div class="receipt-view-only"><i data-lucide="eye"></i><span>Visualização somente. Este perfil não altera comprovantes.</span></div>'}
    ${canAdd?`<div id="receiptUploadArea" class="receipt-upload-area receipt-upload-visible">
      <label class="receipt-drop receipt-drop-direct" id="receiptDrop"><input id="receiptFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.odt" hidden><i data-lucide="paperclip"></i><strong>${receipts.length?'Anexar outro comprovante':'Anexar comprovante'}</strong><span>Clique aqui para escolher o arquivo</span><small id="receiptSelected">PDF, imagem ou documento • até 3 MB</small></label>
      <div class="modal-actions receipt-upload-actions"><button type="button" class="primary-action" id="uploadReceipt" disabled><i data-lucide="upload"></i>Salvar comprovante</button></div>
    </div>`:''}
    ${!receipts.length&&!canAdd?'<div class="receipt-empty-state"><i data-lucide="file-x-2"></i><strong>Nenhum comprovante anexado</strong><span>A venda ainda não possui documento para visualização.</span></div>':''}
  </div>`);
  modalHost.querySelector('.modal-stage')?.classList.add('receipt-list-stage');

  modalHost.querySelectorAll('[data-view-receipt]').forEach(btn=>btn.addEventListener('click',()=>{
    const receipt=receipts.find(item=>item.id===btn.dataset.viewReceipt); if(!receipt)return;
    openReceiptPreview(id,receipt.id);
  }));

  if(manage){
    modalHost.querySelectorAll('[data-delete-receipt]').forEach(btn=>btn.addEventListener('click',async()=>{
      const receipt=receipts.find(item=>item.id===btn.dataset.deleteReceipt); if(!receipt)return;
      if(!confirm(`Excluir o comprovante "${receipt.name}"?`))return;
      try{ const result=await SalesRepository.removeReceipt(id,receipt.id); replaceSale(result.sale); toast('Comprovante excluído.'); openReceiptModal(id); renderSalesTable(currentUser.role==='gestor'||currentUser.role==='auditoria'?salesCache:salesCache.filter(r=>r.seller_name===currentUser.name)); }
      catch(error){ toast(error.message||'Não foi possível excluir o comprovante.','error'); }
    }));
  }

  if(!canAdd){ refreshIcons(); return; }
  const input=$('#receiptFile'),drop=$('#receiptDrop'),selected=$('#receiptSelected'),upload=$('#uploadReceipt');
  const resetFile=()=>{ input.value=''; selected.textContent='PDF, imagem ou documento • até 3 MB'; upload.disabled=true; };
  const setFile=file=>{
    if(!file)return;
    if(file.size>SalesRepository.MAX_RECEIPT_BYTES){toast('O comprovante deve ter no máximo 3 MB.','error');resetFile();return;}
    selected.textContent=`${file.name} • ${fileSize(file.size)}`; upload.disabled=false;
  };
  input.addEventListener('change',()=>setFile(input.files[0]));
  ['dragenter','dragover'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type=>drop.addEventListener(type,event=>{event.preventDefault();drop.classList.remove('dragging');}));
  drop.addEventListener('drop',event=>{const file=event.dataTransfer.files[0];if(!file)return;const dt=new DataTransfer();dt.items.add(file);input.files=dt.files;setFile(file);});
  upload.addEventListener('click',async()=>{
    const file=input.files[0];if(!file)return;upload.disabled=true;upload.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Enviando';refreshIcons();
    try{const result=await SalesRepository.saveReceipt(id,file);replaceSale(result.sale);toast('Comprovante salvo.');openReceiptModal(id);renderSalesTable(currentUser.role==='gestor'||currentUser.role==='auditoria'?salesCache:salesCache.filter(r=>r.seller_name===currentUser.name));}
    catch(error){upload.disabled=false;upload.innerHTML='<i data-lucide="upload"></i>Salvar comprovante';refreshIcons();toast(error.message||'Não foi possível salvar o comprovante.','error');}
  });
}

function receiptItemMarkup(receipt,index,manage=true){
  return `<div class="current-receipt">
    <span class="receipt-index">${index+1}</span><span class="file-icon"><i data-lucide="file-check-2"></i></span>
    <div><strong>${escapeHTML(receipt.name||'Comprovante')}</strong><small>${fileSize(receipt.size)}${receipt.uploaded_at?` • ${formatDateTimeBR(receipt.uploaded_at)}`:''}</small></div>
    <div class="current-receipt-actions"><button type="button" data-view-receipt="${receipt.id}" title="Visualizar aqui"><i data-lucide="eye"></i></button>${manage?`<button type="button" data-delete-receipt="${receipt.id}" title="Excluir"><i data-lucide="trash-2"></i></button>`:''}</div>
  </div>`;
}

function releaseReceiptPreviewUrl(){
  if(activeReceiptPreviewUrl && activeReceiptPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(activeReceiptPreviewUrl);
  activeReceiptPreviewUrl='';
}
function isReceiptImage(receipt){
  const type=String(receipt?.type||'').toLowerCase();
  const name=String(receipt?.name||'');
  return type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name);
}
function isReceiptPdf(receipt){
  const type=String(receipt?.type||'').toLowerCase();
  const name=String(receipt?.name||'');
  return type==='application/pdf' || /\.pdf$/i.test(name);
}
function receiptPreviewContent(receipt,url){
  const type=String(receipt.type||'').toLowerCase();
  const name=String(receipt.name||'Comprovante');
  const safeUrl=escapeHTML(url);
  const safeName=escapeHTML(name);
  if(isReceiptImage(receipt)) return `<div class="receipt-preview-canvas image-preview" data-image-viewport><img src="${safeUrl}" alt="${safeName}" data-receipt-image draggable="false"><div class="receipt-viewer-hint"><i data-lucide="mouse-pointer-2"></i><span>Gire a roda do mouse para zoom • segure o botão esquerdo e arraste para mover</span></div></div>`;
  if(isReceiptPdf(receipt)) return `<div class="receipt-preview-canvas document-preview"><iframe src="${safeUrl}#toolbar=0&navpanes=0" title="${safeName}"></iframe></div>`;
  return `<div class="receipt-preview-canvas unsupported-preview"><span class="unsupported-preview-icon"><i data-lucide="file-text"></i></span><strong>${safeName}</strong><span>${escapeHTML(type||'Documento')}</span><p>Este formato permanece anexado à venda, mas não possui visualização incorporada confiável no navegador. Para visualizar dentro do painel, prefira PDF, JPG, PNG ou WEBP.</p></div>`;
}

function initializeReceiptImageViewer(stage){
  const viewport=stage.querySelector('[data-image-viewport]');
  const image=stage.querySelector('[data-receipt-image]');
  if(!viewport || !image) return;

  let scale=1;
  let fitScale=1;
  let x=0;
  let y=0;
  let dragging=false;
  let dragStartX=0;
  let dragStartY=0;
  let originX=0;
  let originY=0;
  const minScaleFactor=.45;
  const maxScale=6;
  const padding=28;

  const bounds=()=>({w:viewport.clientWidth,h:viewport.clientHeight,iw:image.naturalWidth*scale,ih:image.naturalHeight*scale});
  const clampPan=()=>{
    const {w,h,iw,ih}=bounds();
    if(iw<=w) x=(w-iw)/2; else x=Math.min(0,Math.max(w-iw,x));
    if(ih<=h) y=(h-ih)/2; else y=Math.min(0,Math.max(h-ih,y));
  };
  const applyTransform=()=>{
    clampPan();
    image.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  };
  const fitImage=()=>{
    if(!image.naturalWidth || !image.naturalHeight) return;
    const availableWidth=Math.max(160,viewport.clientWidth-padding*2);
    const availableHeight=Math.max(160,viewport.clientHeight-padding*2);
    fitScale=Math.min(availableWidth/image.naturalWidth,availableHeight/image.naturalHeight,1);
    scale=fitScale;
    x=(viewport.clientWidth-image.naturalWidth*scale)/2;
    y=(viewport.clientHeight-image.naturalHeight*scale)/2;
    applyTransform();
  };
  const zoomAt=(clientX,clientY,factor)=>{
    if(!image.naturalWidth || !image.naturalHeight) return;
    const rect=viewport.getBoundingClientRect();
    const px=clientX-rect.left;
    const py=clientY-rect.top;
    const imageX=(px-x)/scale;
    const imageY=(py-y)/scale;
    const next=Math.min(maxScale,Math.max(Math.max(.05,fitScale*minScaleFactor),scale*factor));
    if(Math.abs(next-scale)<.0001) return;
    scale=next;
    x=px-imageX*scale;
    y=py-imageY*scale;
    applyTransform();
  };

  viewport.addEventListener('wheel',event=>{
    event.preventDefault();
    zoomAt(event.clientX,event.clientY,event.deltaY<0?1.12:.89);
  },{passive:false});
  viewport.addEventListener('pointerdown',event=>{
    if(event.pointerType!=='touch' && event.button!==0) return;
    dragging=true;
    dragStartX=event.clientX;
    dragStartY=event.clientY;
    originX=x;
    originY=y;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  viewport.addEventListener('pointermove',event=>{
    if(!dragging) return;
    x=originX+(event.clientX-dragStartX);
    y=originY+(event.clientY-dragStartY);
    applyTransform();
  });
  const stopDragging=event=>{
    if(!dragging) return;
    dragging=false;
    viewport.classList.remove('is-dragging');
    if(event?.pointerId!=null && viewport.hasPointerCapture?.(event.pointerId)) viewport.releasePointerCapture(event.pointerId);
  };
  viewport.addEventListener('pointerup',stopDragging);
  viewport.addEventListener('pointercancel',stopDragging);
  window.addEventListener('blur',()=>stopDragging(),{once:true});
  if(image.complete) fitImage(); else image.addEventListener('load',fitImage,{once:true});
}

async function openReceiptPreview(saleId,receiptId){
  const sale=salesCache.find(row=>row.id===saleId);
  const receipt=sale?.receipts?.find(item=>item.id===receiptId);
  if(!sale || !receipt) return;
  const stage=modalHost.querySelector('.modal-stage');
  if(!stage) return;
  stage.innerHTML=`<div class="mini-modal receipt-modal receipt-preview-loading"><div class="receipt-preview-loading-state"><i data-lucide="loader-circle" class="spin"></i><strong>Carregando comprovante</strong></div></div>`;
  stage.classList.remove('receipt-list-stage');
  stage.classList.add('receipt-preview-stage');
  refreshIcons();
  try{
    releaseReceiptPreviewUrl();
    const url=await SalesRepository.receiptUrl(sale,receipt);
    if(!url) throw new Error('Arquivo não encontrado.');
    if(url.startsWith('blob:')) activeReceiptPreviewUrl=url;
    stage.innerHTML=`<div class="mini-modal receipt-modal receipt-preview-modal">
      <div class="receipt-preview-head">
        <button type="button" class="receipt-back-button" data-back-receipts><i data-lucide="arrow-left"></i><span>Voltar</span></button>
        <div><span class="section-kicker">COMPROVANTE</span><h3>${escapeHTML(receipt.name||'Comprovante')}</h3><p>${escapeHTML(sale.student_name)} • ${fileSize(receipt.size)}</p></div>
        <button class="modal-close" data-close-modal type="button" aria-label="Fechar"><i data-lucide="x"></i></button>
      </div>
      ${receiptPreviewContent(receipt,url)}
    </div>`;
    stage.querySelector('[data-back-receipts]').addEventListener('click',()=>{ releaseReceiptPreviewUrl(); openReceiptModal(saleId); });
    stage.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',closeModal));
    refreshIcons();
    if(isReceiptImage(receipt)) initializeReceiptImageViewer(stage);
  }catch(error){
    releaseReceiptPreviewUrl();
    toast(error.message||'Não foi possível abrir o comprovante.','error');
    openReceiptModal(saleId);
  }
}

function openModal(html){
  modalHost.innerHTML=`<div class="modal-backdrop"><div class="modal-stage">${html}</div></div>`;
  modalHost.querySelector('.modal-backdrop').addEventListener('mousedown',e=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(); });
  modalHost.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',closeModal));
  document.addEventListener('keydown',modalEscape); refreshIcons();
}
function modalEscape(e){ if(e.key==='Escape')closeModal(); }
function closeModal(){ if(!modalHost)return; releaseReceiptPreviewUrl(); modalHost.innerHTML=''; document.removeEventListener('keydown',modalEscape); }



const WEEKLY_DAY_LABELS=['Segunda','Terça','Quarta','Quinta','Sexta'];
function weeklyDatePlus(date,days){const d=new Date(`${date}T12:00:00`);d.setDate(d.getDate()+days);return d.toISOString().slice(0,10);}
function weeklyStartFromDate(date=todayISO()){const d=new Date(`${date}T12:00:00`);const day=d.getDay()||7;d.setDate(d.getDate()-(day-1));return d.toISOString().slice(0,10);}
function weeklyEndFromStart(start){return weeklyDatePlus(start,4);}
function weeklyDates(start){return WEEKLY_DAY_LABELS.map((label,index)=>({label,date:weeklyDatePlus(start,index)}));}
function weeklyApprovedRevenue(seller,from,to){return salesCache.filter(row=>row.seller_name===seller&&row.audit_status==='ok'&&row.sale_date>=from&&row.sale_date<=to).reduce((sum,row)=>sum+Number(row.total_value||0),0);}
function weeklyTaskState(record,taskId){return Boolean(record?.tasks?.[taskId]);}
function weeklyCanEdit(date,record){const now=new Date();return currentUser.role==='vendedor'&&date===todayISO()&&!record?.closed&&!(now.getHours()===23&&now.getMinutes()>=59);}
function weeklyStatusCell({date,record,task,managerView}){
  const today=todayISO(),done=weeklyTaskState(record,task.id),editable=weeklyCanEdit(date,record)&&!managerView;
  if(editable)return `<button type="button" class="weekly-task-toggle ${done?'done':''}" data-weekly-task="${task.id}" data-weekly-date="${date}" aria-label="${escapeHTML(task.label)}"><i data-lucide="${done?'check':'plus'}"></i></button>`;
  if(date>today)return `<span class="weekly-task-state future"><i data-lucide="minus"></i></span>`;
  if(record?.closed)return `<span class="weekly-task-state ${done?'done':'missed'}" title="${done?'Realizado':'Não realizado'}"><i data-lucide="${done?'check':'x'}"></i></span>`;
  return `<span class="weekly-task-state pending"><i data-lucide="clock-3"></i></span>`;
}
function weeklyRecordForDate(records,date){return records.find(row=>row.date===date)||null;}
function weeklySoldForDay(seller,date,record){return record?.closed?Number(record.sold_today||0):weeklyApprovedRevenue(seller,date,date);}
function weeklyCumulative(seller,weekStart,date,record){return record?.closed?Number(record.cumulative_sold||0):weeklyApprovedRevenue(seller,weekStart,date);}
function weeklySellerFocusData(seller,weekStart,goal){
  const today=todayISO(),days=weeklyDates(weekStart),weekEnd=weeklyEndFromStart(weekStart),target=Math.max(Number(goal.weekly_target||0),0);
  const todayIndex=days.findIndex(day=>day.date===today);
  const isCurrentWeek=today>=weekStart&&today<=weekEnd;
  const effectiveTo=today<weekStart?weekStart:(today>weekEnd?weekEnd:today);
  const weekRevenue=today<weekStart?0:weeklyApprovedRevenue(seller,weekStart,effectiveTo);
  const todayRevenue=isCurrentWeek?weeklyApprovedRevenue(seller,today,today):0;
  const beforeToday=isCurrentWeek&&todayIndex>0?weeklyApprovedRevenue(seller,weekStart,weeklyDatePlus(today,-1)):0;
  const expectedThroughToday=target&&todayIndex>=0?target*((todayIndex+1)/5):0;
  const todayTarget=target&&todayIndex>=0?Math.max(expectedThroughToday-beforeToday,0):0;
  const todayRemaining=Math.max(todayTarget-todayRevenue,0);
  const weekRemaining=Math.max(target-weekRevenue,0);
  const pct=target?Math.min((weekRevenue/target)*100,100):0;
  const paceGap=target&&todayIndex>=0?weekRevenue-expectedThroughToday:0;
  const status=!target?'waiting':!isCurrentWeek?'neutral':paceGap>=0?'ahead':'behind';
  return {today,days,weekEnd,target,todayIndex,isCurrentWeek,weekRevenue,todayRevenue,beforeToday,expectedThroughToday,todayTarget,todayRemaining,weekRemaining,pct,paceGap,status};
}
function weeklySellerGuidance(seller,focus,monthlyData){
  if(!focus.target) return {cls:'neutral',title:'Aguardando a meta semanal do gestor.',detail:'Quando a meta for definida, o painel calcula automaticamente o ritmo necessário para o dia.'};
  if(!focus.isCurrentWeek) return {cls:'neutral',title:'Semana selecionada para consulta.',detail:'Volte para a semana atual para receber a orientação diária de ritmo.'};
  const parts=[];
  if(focus.todayRemaining>0) parts.push(`R$ ${money.format(focus.todayRemaining).replace('R$ ','').replace('R$ ','')} em faturamento`);
  const boletoNeed=Number(monthlyData?.boleto?.dailyNeed||0);
  const enrollNeed=Number(monthlyData?.enroll?.dailyNeed||0);
  if(boletoNeed>0) parts.push(`${Math.max(1,Math.ceil(boletoNeed))} boleto${Math.ceil(boletoNeed)>1?'s':''}`);
  if(enrollNeed>0) parts.push(`${Math.max(1,Math.ceil(enrollNeed))} matrícula${Math.ceil(enrollNeed)>1?'s':''}`);
  let title='Seu ritmo de hoje está em dia.';
  let detail='Mantenha a cadência comercial e conclua as tarefas previstas para fechar o dia completo.';
  let cls='ahead';
  if(parts.length){
    cls='behind';
    title=`Hoje, seu foco é ${parts.join(' + ')}.`;
    if(boletoNeed>=1) detail='Sua meta mensal indica necessidade de reforçar boleto hoje. Priorize essa forma de pagamento quando fizer sentido na negociação e mantenha o faturamento no ritmo semanal.';
    else if(focus.todayRemaining>0) detail='Concentre as próximas oportunidades no faturamento que falta e complete as tarefas do dia para voltar à média semanal.';
    else detail='O faturamento semanal está no ritmo; use o restante do dia para aproximar as metas mensais e concluir a rotina comercial.';
  }
  return {cls,title,detail};
}

function weeklySellerBoardMarkup({seller,weekStart,goal,records,monthlyData=null}){
  const tasks=WeeklyPerformanceRepository.tasks||[],days=weeklyDates(weekStart),focus=weeklySellerFocusData(seller,weekStart,goal),today=todayISO();
  const todayRecord=weeklyRecordForDate(records,today),doneToday=tasks.filter(task=>weeklyTaskState(todayRecord,task.id)).length;
  const targetLabel=focus.target?money.format(focus.target):'Aguardando definição';
  const guidance=weeklySellerGuidance(seller,focus,monthlyData);
  const paceText=!focus.target?'O gestor ainda não definiu sua meta semanal.':!focus.isCurrentWeek?'Acompanhe os resultados da semana selecionada.':focus.status==='ahead'?'Você está no ritmo ou acima da média da semana.':'Você está abaixo do ritmo esperado da semana.';
  const dailyText=!focus.target?'—':!focus.isCurrentWeek?'—':focus.todayRemaining<=0?'Ritmo de hoje atingido':money.format(focus.todayRemaining);
  return `<section class="weekly-seller-overview">
    <div class="weekly-seller-overview-main"><span class="section-kicker">SEU DESAFIO DA SEMANA</span><h3>${escapeHTML(goal.indicator||'Faturamento semanal')}</h3><p>${paceText}</p></div>
    <div class="weekly-seller-overview-metrics">
      <div><span>Meta semanal</span><strong>${targetLabel}</strong></div>
      <div><span>Faturado na semana</span><strong>${money.format(focus.weekRevenue)}</strong></div>
      <div><span>Quanto falta</span><strong>${focus.target?money.format(focus.weekRemaining):'—'}</strong></div>
      <div><span>Atingimento</span><strong>${focus.target?focus.pct.toFixed(1).replace('.',',')+'%':'—'}</strong></div>
    </div>
    <div class="weekly-seller-progress"><span style="width:${focus.pct}%"></span></div>
  </section>

  <section class="weekly-today-focus ${focus.status}">
    <div class="weekly-today-focus-icon"><i data-lucide="target"></i></div>
    <div class="weekly-today-focus-copy"><span>FOCO DE HOJE</span><h3>${focus.isCurrentWeek&&focus.target?`Para ficar na média hoje, faltam ${dailyText}.`:'Acompanhe sua rotina comercial.'}</h3><p>${focus.isCurrentWeek&&focus.target?`Você já faturou ${money.format(focus.todayRevenue)} hoje. Complete também as tarefas do dia para fechar a rotina.`:'As atividades ficam disponíveis no dia correspondente e o faturamento considera somente vendas OK.'}</p></div>
    <div class="weekly-today-focus-values">
      <div><span>Meta ajustada de hoje</span><strong>${focus.isCurrentWeek&&focus.target?money.format(focus.todayTarget):'—'}</strong></div>
      <div><span>Já feito hoje</span><strong>${focus.isCurrentWeek?money.format(focus.todayRevenue):'—'}</strong></div>
      <div><span>Tarefas de hoje</span><strong>${focus.isCurrentWeek?`${doneToday}/${tasks.length}`:'—'}</strong></div>
    </div>
  </section>

  <div class="weekly-guidance-line ${guidance.cls}"><span class="weekly-guidance-icon"><i data-lucide="sparkles"></i></span><div><strong>${guidance.title}</strong><p>${guidance.detail}</p></div></div>

  <section class="weekly-integrated-section">
    <div class="weekly-integrated-heading"><div><span class="section-kicker">ROTINA DIÁRIA</span><h3>Tarefas da semana</h3></div><p>Marque os checkzinhos no dia atual. Após 23:59, o resultado do dia é registrado.</p></div>
    <div class="weekly-task-table weekly-task-table-integrated"><div class="weekly-task-row header"><strong>INDICADORES / TAREFAS</strong>${days.map(day=>`<span class="${day.date===today?'current-day':''}">${day.label.slice(0,3).toUpperCase()}</span>`).join('')}</div>${tasks.map(task=>`<div class="weekly-task-row"><strong>${escapeHTML(task.label)}</strong>${days.map(day=>`<span class="weekly-task-cell ${day.date===today?'current-day':''}">${weeklyStatusCell({date:day.date,record:weeklyRecordForDate(records,day.date),task,managerView:false})}</span>`).join('')}</div>`).join('')}</div>
  </section>

  <section class="weekly-integrated-section weekly-challenge-integrated">
    <div class="weekly-integrated-heading"><div><span class="section-kicker">ACOMPANHAMENTO</span><h3>Faturamento da semana</h3></div><p>Vendido no dia, meta semanal e saldo restante em uma única leitura.</p></div>
    <div class="weekly-challenge-title">CONTROLE DO DESAFIO SEMANAL</div>
    <div class="weekly-challenge-table"><div class="weekly-challenge-row header"><strong>DIA</strong><span>VENDIDO NO DIA</span><span>META SEMANAL</span><span>QUANTO FALTA</span></div>${days.map(day=>{const record=weeklyRecordForDate(records,day.date),sold=weeklySoldForDay(seller,day.date,record),cumulative=weeklyCumulative(seller,weekStart,day.date,record),remaining=Math.max(Number(goal.weekly_target||0)-cumulative,0);return `<div class="weekly-challenge-row ${day.date===today?'today':''}"><strong>${day.label}</strong><span>${money.format(sold)}</span><span>${goal.weekly_target?money.format(goal.weekly_target):'—'}</span><span>${goal.weekly_target?money.format(remaining):'—'}</span></div>`;}).join('')}<div class="weekly-challenge-row total"><strong>TOTAL</strong><span>${money.format(focus.weekRevenue)}</span><span>${goal.weekly_target?money.format(goal.weekly_target):'—'}</span><span>${goal.weekly_target?money.format(focus.weekRemaining):'—'}</span></div></div>
    <div class="weekly-performance-foot weekly-performance-foot-integrated"><span><i data-lucide="shield-check"></i>Somente vendas OK alimentam o faturamento.</span><span><i data-lucide="clock-3"></i>Fechamento diário automático às 23:59.</span></div>
  </section>`;
}

function weeklyBoardMarkup({seller,weekStart,goal,records,managerView=false}){
  const days=weeklyDates(weekStart),tasks=WeeklyPerformanceRepository.tasks||[],today=todayISO();
  const weekRevenue=weeklyApprovedRevenue(seller,weekStart,weeklyEndFromStart(weekStart));
  const remaining=goal.weekly_target?Math.max(Number(goal.weekly_target)-weekRevenue,0):0;
  const pct=goal.weekly_target?Math.min((weekRevenue/Number(goal.weekly_target))*100,100):0;
  return `<section class="weekly-manager-board-integrated">
    <div class="weekly-performance-identity weekly-performance-identity-integrated"><div><span>VENDEDOR(A)</span><strong>${escapeHTML(seller)}</strong></div><div><span>INDICADOR</span><strong>${escapeHTML(goal.indicator||'Faturamento semanal')}</strong></div><div><span>META SEMANAL</span><strong>${goal.weekly_target?money.format(goal.weekly_target):'Não definida'}</strong></div><div><span>FATURADO</span><strong>${money.format(weekRevenue)}</strong></div><div><span>QUANTO FALTA</span><strong>${goal.weekly_target?money.format(remaining):'—'}</strong></div></div>
    <div class="weekly-manager-progress"><span style="width:${pct}%"></span></div>
    <section class="weekly-integrated-section weekly-manager-integrated-section"><div class="weekly-integrated-heading"><div><span class="section-kicker">ROTINA DIÁRIA</span><h3>Tarefas da semana</h3></div><p>Visualização geral do que foi concluído, ficou pendente ou ainda está por acontecer.</p></div><div class="weekly-task-table weekly-task-table-integrated"><div class="weekly-task-row header"><strong>INDICADORES / TAREFAS</strong>${days.map(day=>`<span class="${day.date===today?'current-day':''}">${day.label.slice(0,3).toUpperCase()}</span>`).join('')}</div>${tasks.map(task=>`<div class="weekly-task-row"><strong>${escapeHTML(task.label)}</strong>${days.map(day=>`<span class="weekly-task-cell ${day.date===today?'current-day':''}">${weeklyStatusCell({date:day.date,record:weeklyRecordForDate(records,day.date),task,managerView})}</span>`).join('')}</div>`).join('')}</div></section>
    <section class="weekly-integrated-section weekly-challenge-integrated weekly-manager-integrated-section"><div class="weekly-integrated-heading"><div><span class="section-kicker">ACOMPANHAMENTO</span><h3>Faturamento da semana</h3></div><p>O vendido considera somente vendas aprovadas pela auditoria.</p></div><div class="weekly-challenge-title">CONTROLE DO DESAFIO SEMANAL</div><div class="weekly-challenge-table"><div class="weekly-challenge-row header"><strong>DIA</strong><span>VENDIDO NO DIA</span><span>META SEMANAL</span><span>QUANTO FALTA</span></div>${days.map(day=>{const record=weeklyRecordForDate(records,day.date),sold=weeklySoldForDay(seller,day.date,record),cumulative=weeklyCumulative(seller,weekStart,day.date,record),dayRemaining=Math.max(Number(goal.weekly_target||0)-cumulative,0);return `<div class="weekly-challenge-row ${day.date===today?'today':''}"><strong>${day.label}</strong><span>${money.format(sold)}</span><span>${goal.weekly_target?money.format(goal.weekly_target):'—'}</span><span>${goal.weekly_target?money.format(dayRemaining):'—'}</span></div>`;}).join('')}<div class="weekly-challenge-row total"><strong>TOTAL</strong><span>${money.format(weekRevenue)}</span><span>${goal.weekly_target?money.format(goal.weekly_target):'—'}</span><span>${goal.weekly_target?money.format(remaining):'—'}</span></div></div><div class="weekly-performance-foot weekly-performance-foot-integrated"><span><i data-lucide="shield-check"></i>Somente vendas OK alimentam o faturamento.</span><span><i data-lucide="clock-3"></i>Fechamento diário automático às 23:59.</span></div></section>
  </section>`;
}
function weeklyClosedReportCard(record){
  const tasks=WeeklyPerformanceRepository.tasks||[],done=tasks.filter(task=>weeklyTaskState(record,task.id)).length,missed=tasks.length-done;
  return `<button type="button" class="weekly-report-card" data-weekly-report="${record.id}"><span class="weekly-report-date"><strong class="weekly-report-seller">${escapeHTML(record.seller_name)}</strong><small>${formatDateBR(record.date)}</small></span><span class="weekly-report-task ok"><strong>${done}/${tasks.length}</strong><small>tarefas feitas</small></span><span class="weekly-report-task ${missed?'missed':'ok'}"><strong>${missed}</strong><small>não feitas</small></span><span><strong>${money.format(record.sold_today)}</strong><small>vendido no dia</small></span><span><strong>${record.weekly_target?money.format(record.remaining):'—'}</strong><small>quanto faltava</small></span><i data-lucide="chevron-right"></i></button>`;
}
function openWeeklyClosedReport(record){
  const tasks=WeeklyPerformanceRepository.tasks||[];
  openModal(`<div class="mini-modal weekly-report-modal"><div class="modal-head"><div><span class="section-kicker">FECHAMENTO AUTOMÁTICO</span><h3>${escapeHTML(record.seller_name)}</h3><p>${formatDateBR(record.date)} • encerrado ${record.closed_at?formatDateTimeBR(record.closed_at):'às 23:59'}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div><div class="weekly-report-summary"><div><span>Vendido</span><strong>${money.format(record.sold_today)}</strong></div><div><span>Acumulado semanal</span><strong>${money.format(record.cumulative_sold)}</strong></div><div><span>Meta semanal</span><strong>${record.weekly_target?money.format(record.weekly_target):'—'}</strong></div><div><span>Quanto faltava</span><strong>${record.weekly_target?money.format(record.remaining):'—'}</strong></div></div><div class="weekly-report-task-list">${tasks.map(task=>`<div class="${weeklyTaskState(record,task.id)?'done':'missed'}"><span><i data-lucide="${weeklyTaskState(record,task.id)?'check':'x'}"></i></span><strong>${escapeHTML(task.label)}</strong><small>${weeklyTaskState(record,task.id)?'Realizado':'Não realizado'}</small></div>`).join('')}</div></div>`);refreshIcons();
}

async function renderWeeklyPerformance(){
  destroyCharts();
  if(!weeklyPerformanceWeekStart)weeklyPerformanceWeekStart=weeklyStartFromDate(todayISO());
  if(currentUser.role==='vendedor')weeklyPerformanceSeller=currentUser.name;
  content.innerHTML=`<section class="fca-loading"><i data-lucide="loader-circle" class="spin"></i><strong>Carregando painel semanal</strong></section>`;refreshIcons();
  try{
    if(PREVIEW_LOGIN_ENABLED)await WeeklyPerformanceRepository.finalizeOverdue({sales:salesCache,sellers:SELLERS,today:todayISO()});
    const [goal,records]=await Promise.all([WeeklyPerformanceRepository.getGoal(weeklyPerformanceSeller,weeklyPerformanceWeekStart),WeeklyPerformanceRepository.getWeekRecords(weeklyPerformanceSeller,weeklyPerformanceWeekStart)]);
    if(currentPage!=='fca-semanal')return;
    if(currentUser.role==='gestor')renderManagerWeeklyPerformance(goal,records);
    else {
      const monthKey=(todayISO()>=weeklyPerformanceWeekStart&&todayISO()<=weeklyEndFromStart(weeklyPerformanceWeekStart)?todayISO():weeklyPerformanceWeekStart).slice(0,7);
      const monthlyGoals=await GoalsRepository.getForSeller(currentUser.name,monthKey);
      const monthlyData=calculateSellerDashboard(salesCache,{month:monthKey,seller:currentUser.name,goals:monthlyGoals,referenceDate:todayISO()});
      renderSellerWeeklyPerformance(goal,records,monthlyData);
    }
  }catch(error){content.innerHTML=`<section class="fca-loading"><i data-lucide="circle-alert"></i><strong>${escapeHTML(error.message||'Não foi possível carregar o painel semanal.')}</strong></section>`;refreshIcons();}
}
function renderSellerWeeklyPerformance(goal,records,monthlyData=null){
  content.innerHTML=`<section class="weekly-head weekly-seller-head"><div><span class="eyebrow">FCA • ROTINA COMERCIAL</span><h2>Painel semanal de performance</h2><p>Sua meta, suas tarefas do dia e o faturamento da semana em uma única visão.</p></div><div class="weekly-week-actions"><button type="button" class="toolbar-action" id="weeklyPrev"><i data-lucide="chevron-left"></i></button><div><span>SEMANA</span><strong>${formatDateBR(weeklyPerformanceWeekStart)} – ${formatDateBR(weeklyEndFromStart(weeklyPerformanceWeekStart))}</strong></div><button type="button" class="toolbar-action" id="weeklyNext"><i data-lucide="chevron-right"></i></button></div></section>${weeklySellerBoardMarkup({seller:currentUser.name,weekStart:weeklyPerformanceWeekStart,goal,records,monthlyData})}`;
  bindWeeklyBoard(records);bindWeeklyNavigation();refreshIcons();
}
function renderManagerWeeklyPerformance(goal,records){
  content.innerHTML=`<section class="weekly-head"><div><span class="eyebrow">FCA • GESTÃO DE PERFORMANCE</span><h2>Painel semanal de performance</h2><p>Defina manualmente a meta semanal e acompanhe o que cada vendedor realizou em cada dia.</p></div><button type="button" class="secondary-action" id="backToFca"><i data-lucide="arrow-left"></i>FCA do gestor</button></section><section class="weekly-manager-controls"><label><span>VENDEDOR</span><select id="weeklySeller">${SELLERS.map(name=>`<option ${name===weeklyPerformanceSeller?'selected':''}>${name}</option>`).join('')}</select></label><label><span>INÍCIO DA SEMANA</span><input id="weeklyWeekStart" type="date" value="${weeklyPerformanceWeekStart}"></label><form id="weeklyGoalForm"><label><span>INDICADOR</span><input name="indicator" value="${escapeHTML(goal.indicator||'Faturamento semanal')}" placeholder="Faturamento semanal"></label><label><span>META SEMANAL</span><input name="weekly_target" inputmode="decimal" value="${goal.weekly_target||''}" placeholder="R$ 0,00"></label><button class="primary-action" type="submit"><i data-lucide="save"></i>Salvar meta</button></form></section>${weeklyBoardMarkup({seller:weeklyPerformanceSeller,weekStart:weeklyPerformanceWeekStart,goal,records,managerView:true})}`;
  $('#backToFca').onclick=()=>renderPage('fca');
  $('#weeklySeller').onchange=e=>{weeklyPerformanceSeller=e.target.value;renderWeeklyPerformance();};
  $('#weeklyWeekStart').onchange=e=>{weeklyPerformanceWeekStart=weeklyStartFromDate(e.target.value||todayISO());renderWeeklyPerformance();};
  $('#weeklyGoalForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form),button=form.querySelector('button[type=submit]');button.disabled=true;try{await WeeklyPerformanceRepository.saveGoal({seller_name:weeklyPerformanceSeller,week_start:weeklyPerformanceWeekStart,indicator:String(fd.get('indicator')||'').trim(),weekly_target:parseMoney(fd.get('weekly_target')),updated_by:currentUser.name});toast(`Meta semanal de ${weeklyPerformanceSeller} salva.`);renderWeeklyPerformance();}catch(error){button.disabled=false;toast(error.message||'Não foi possível salvar a meta.','error');}};
  refreshIcons();
}
function bindWeeklyNavigation(){
  $('#weeklyPrev').onclick=()=>{weeklyPerformanceWeekStart=weeklyDatePlus(weeklyPerformanceWeekStart,-7);renderWeeklyPerformance();};
  $('#weeklyNext').onclick=()=>{weeklyPerformanceWeekStart=weeklyDatePlus(weeklyPerformanceWeekStart,7);renderWeeklyPerformance();};
}
function bindWeeklyBoard(records){
  content.querySelectorAll('[data-weekly-task]').forEach(button=>button.onclick=async()=>{
    const date=button.dataset.weeklyDate,taskId=button.dataset.weeklyTask,record=weeklyRecordForDate(records,date),next=!weeklyTaskState(record,taskId);button.disabled=true;
    try{await WeeklyPerformanceRepository.saveTasks({seller_name:currentUser.name,date,week_start:weeklyPerformanceWeekStart,tasks:{[taskId]:next}});renderWeeklyPerformance();}catch(error){button.disabled=false;toast(error.message||'Não foi possível atualizar a tarefa.','error');}
  });
}

function fcaPeriodRange(type='weekly'){
  const today=todayISO();
  if(type==='monthly') return {from:`${today.slice(0,7)}-01`,to:today};
  const now=new Date(`${today}T12:00:00`);
  const day=now.getDay()||7;
  now.setDate(now.getDate()-(day-1));
  const offset=now.getTimezoneOffset()*60000;
  return {from:new Date(now-offset).toISOString().slice(0,10),to:today};
}
function fcaSnapshot(seller,from,to){
  const rows=salesCache.filter(row=>row.seller_name===seller && row.sale_date>=from && row.sale_date<=to && row.audit_status==='ok');
  return {
    revenue:rows.reduce((sum,row)=>sum+Number(row.total_value||0),0),
    sales_count:rows.length,
    enrollments:rows.reduce((sum,row)=>sum+Number(row.course_quantity||0),0),
    card_revenue:rows.filter(row=>row.payment_type==='cartao').reduce((sum,row)=>sum+Number(row.total_value||0),0),
    quitados:rows.filter(row=>row.payment_type==='cartao').length,
    boletos:rows.filter(row=>row.payment_type==='boleto').length
  };
}
function fcaStatusInfo(status){
  const map={
    submitted:['Recebido','received'], feedback_requested:['Feedback solicitado','feedback'],
    feedback_answered:['Feedback respondido','answered'], action_created:['Ação criada','action'], closed:['Concluído','done']
  };
  const [label,cls]=map[status]||map.submitted; return {label,cls};
}
function fcaSnapshotMarkup(snapshot={}){
  return `<div class="fca-snapshot">
    <div><span>Faturado</span><strong>${money.format(Number(snapshot.revenue||0))}</strong></div>
    <div><span>Vendas</span><strong>${Number(snapshot.sales_count||0)}</strong></div>
    <div><span>Matrículas</span><strong>${Number(snapshot.enrollments||0)}</strong></div>
    <div><span>Quitados/cartão</span><strong>${Number(snapshot.quitados||0)}</strong></div>
    <div><span>Boletos</span><strong>${Number(snapshot.boletos||0)}</strong></div>
  </div>`;
}
function fcaReportCard(report,managerView=false){
  const status=fcaStatusInfo(report.status);
  return `<button type="button" class="fca-report-card" data-fca-report="${report.id}">
    <span class="fca-report-status ${status.cls}">${status.label}</span>
    <div class="fca-report-main"><strong>${managerView?escapeHTML(report.seller_name):escapeHTML(report.indicator)}</strong><span>${escapeHTML(report.situation)}</span></div>
    <div class="fca-report-period"><span>${report.period_type==='monthly'?'MENSAL':'SEMANAL'}</span><strong>${formatDateBR(report.period_start)} – ${formatDateBR(report.period_end)}</strong></div>
    <div class="fca-report-result"><span>Faturado</span><strong>${money.format(Number(report.snapshot?.revenue||0))}</strong></div>
    <i data-lucide="chevron-right"></i>
  </button>`;
}
function fcaActionCard(action,managerView=false){
  return `<article class="fca-action-card ${action.status==='done'?'done':''}">
    <span class="fca-action-icon"><i data-lucide="${action.status==='done'?'circle-check-big':'list-checks'}"></i></span>
    <div class="fca-action-copy"><span>${managerView?escapeHTML(action.seller_name):'AÇÃO DO GESTOR'}</span><strong>${escapeHTML(action.title)}</strong><p>${escapeHTML(action.description)}</p><small>${action.due_date?`Prazo: ${formatDateBR(action.due_date)}`:'Sem prazo definido'}${managerView&&action.manager_name?` • ${escapeHTML(action.manager_name)}`:''}</small></div>
    ${!managerView&&action.status!=='done'?`<button type="button" class="secondary-action fca-complete-action" data-complete-fca-action="${action.id}"><i data-lucide="check"></i>Concluir</button>`:`<span class="fca-action-state ${action.status}">${action.status==='done'?'Concluída':'Em andamento'}</span>`}
  </article>`;
}

async function renderFCA(){
  if(currentUser.role==='auditoria') return renderSales();
  destroyCharts();
  content.innerHTML=`<section class="fca-loading"><i data-lucide="loader-circle" class="spin"></i><strong>Carregando FCA</strong></section>`; refreshIcons();
  if(PREVIEW_LOGIN_ENABLED) await WeeklyPerformanceRepository.finalizeOverdue({sales:salesCache,sellers:SELLERS,today:todayISO()});
  if(currentUser.role==='gestor') [fcaReportsCache,fcaActionsCache,weeklyPerformanceReportsCache]=await Promise.all([FcaRepository.listReports(),FcaRepository.listActions(),WeeklyPerformanceRepository.listClosedReports()]);
  else [fcaReportsCache,fcaActionsCache]=await Promise.all([FcaRepository.listReports(),FcaRepository.listActions()]);
  if(currentPage!=='fca') return;
  if(currentUser.role==='gestor') renderManagerFCA();
  else {
    if(!weeklyPerformanceWeekStart)weeklyPerformanceWeekStart=weeklyStartFromDate(todayISO());
    weeklyPerformanceSeller=currentUser.name;
    const [weeklyGoal,weeklyRecords,monthlyGoals]=await Promise.all([
      WeeklyPerformanceRepository.getGoal(currentUser.name,weeklyPerformanceWeekStart),
      WeeklyPerformanceRepository.getWeekRecords(currentUser.name,weeklyPerformanceWeekStart),
      GoalsRepository.getForSeller(currentUser.name,todayISO().slice(0,7))
    ]);
    const monthlyData=calculateSellerDashboard(salesCache,{month:todayISO().slice(0,7),seller:currentUser.name,goals:monthlyGoals,referenceDate:todayISO()});
    if(currentPage==='fca')renderSellerFCA(weeklyGoal,weeklyRecords,monthlyData);
  }
}

function renderSellerFCA(weeklyGoal=null,weeklyRecords=[],monthlyData=null){
  const reports=fcaReportsCache.filter(item=>item.seller_name===currentUser.name).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const actions=fcaActionsCache.filter(item=>item.seller_name===currentUser.name).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const feedbackCount=reports.filter(item=>item.status==='feedback_requested').length;
  const openActions=actions.filter(item=>item.status==='open').length;
  const range=fcaPeriodRange('weekly');
  content.innerHTML=`<section class="fca-head">
    <div><span class="eyebrow">ACOMPANHAMENTO COMERCIAL</span><h2>FCA</h2><p>Registre o que aconteceu no período, o motivo e o próximo passo para o gestor acompanhar.</p></div>
    <div class="fca-head-summary"><div><span>Relatórios</span><strong>${reports.length}</strong></div><div><span>Feedbacks</span><strong>${feedbackCount}</strong></div><div><span>Ações abertas</span><strong>${openActions}</strong></div><button id="toggleFcaReport" class="primary-action"><i data-lucide="plus"></i>Novo relatório</button></div>
  </section>
  <section class="seller-fca-weekly-shell"><div class="seller-fca-weekly-head"><div><span class="section-kicker">PAINEL RECEBIDO DO GESTOR</span><h3>Sua performance desta semana</h3></div><div class="weekly-week-actions seller-fca-week-actions"><button type="button" class="toolbar-action" id="weeklyFcaPrev"><i data-lucide="chevron-left"></i></button><div><span>SEMANA</span><strong>${formatDateBR(weeklyPerformanceWeekStart)} – ${formatDateBR(weeklyEndFromStart(weeklyPerformanceWeekStart))}</strong></div><button type="button" class="toolbar-action" id="weeklyFcaNext"><i data-lucide="chevron-right"></i></button></div></div>${weeklySellerBoardMarkup({seller:currentUser.name,weekStart:weeklyPerformanceWeekStart,goal:weeklyGoal||{},records:weeklyRecords||[],monthlyData})}</section>
  <section id="fcaReportPanel" class="fca-entry-panel is-collapsed"></section>
  <section class="fca-grid">
    <div class="fca-column"><div class="fca-section-title"><div><span class="section-kicker">HISTÓRICO</span><h3>Meus relatórios</h3></div><span>${reports.length}</span></div><div class="fca-report-list">${reports.length?reports.map(r=>fcaReportCard(r)).join(''):'<div class="fca-empty">Nenhum relatório enviado ainda.</div>'}</div></div>
    <div class="fca-column"><div class="fca-section-title"><div><span class="section-kicker">PLANO DE AÇÃO</span><h3>Ações recebidas</h3></div><span>${openActions} abertas</span></div><div class="fca-action-list">${actions.length?actions.map(a=>fcaActionCard(a)).join(''):'<div class="fca-empty">Nenhuma ação enviada pelo gestor.</div>'}</div></div>
  </section>`;
  $('#toggleFcaReport').onclick=()=>{
    const panel=$('#fcaReportPanel'); panel.classList.toggle('is-collapsed');
    if(!panel.dataset.ready) mountFcaReportForm(panel,range);
    $('#toggleFcaReport').innerHTML=panel.classList.contains('is-collapsed')?'<i data-lucide="plus"></i>Novo relatório':'<i data-lucide="x"></i>Fechar'; refreshIcons();
  };
  content.querySelectorAll('[data-weekly-task]').forEach(button=>button.onclick=async()=>{
    const date=button.dataset.weeklyDate,taskId=button.dataset.weeklyTask,record=weeklyRecordForDate(weeklyRecords,date),next=!weeklyTaskState(record,taskId);button.disabled=true;
    try{await WeeklyPerformanceRepository.saveTasks({seller_name:currentUser.name,date,week_start:weeklyPerformanceWeekStart,tasks:{[taskId]:next}});renderFCA();}catch(error){button.disabled=false;toast(error.message||'Não foi possível atualizar a tarefa.','error');}
  });
  $('#weeklyFcaPrev')?.addEventListener('click',()=>{weeklyPerformanceWeekStart=weeklyDatePlus(weeklyPerformanceWeekStart,-7);renderFCA();});
  $('#weeklyFcaNext')?.addEventListener('click',()=>{weeklyPerformanceWeekStart=weeklyDatePlus(weeklyPerformanceWeekStart,7);renderFCA();});
  content.querySelectorAll('[data-fca-report]').forEach(btn=>btn.onclick=()=>openSellerFcaReport(btn.dataset.fcaReport));
  content.querySelectorAll('[data-complete-fca-action]').forEach(btn=>btn.onclick=async()=>{
    btn.disabled=true;
    try{ await FcaRepository.completeAction(btn.dataset.completeFcaAction); toast('Ação marcada como concluída.'); renderFCA(); }
    catch(error){ btn.disabled=false; toast(error.message||'Não foi possível concluir a ação.','error'); }
  });
  refreshIcons();
}

function mountFcaReportForm(panel,initialRange){
  panel.dataset.ready='1';
  panel.innerHTML=`<form id="fcaReportForm" class="fca-report-form">
    <div class="fca-form-head"><div><span class="section-kicker">NOVO FCA</span><h3>Relatório do período</h3></div><div id="fcaLiveSnapshot"></div></div>
    <div class="fca-form-grid">
      <label class="form-field"><span>Período</span><select name="period_type" id="fcaPeriodType"><option value="weekly">Semanal</option><option value="monthly">Mensal</option></select></label>
      <label class="form-field"><span>De</span><input type="date" name="period_start" id="fcaFrom" value="${initialRange.from}" required></label>
      <label class="form-field"><span>Até</span><input type="date" name="period_end" id="fcaTo" value="${initialRange.to}" required></label>
      <label class="form-field"><span>Indicador principal</span><select name="indicator"><option>Faturamento</option><option>Matrículas</option><option>Quitados / cartão</option><option>Boletos</option><option>Conversão / retorno de lead</option><option>Outro</option></select></label>
      <label class="form-field"><span>Situação</span><select name="situation"><option>Meta não atingida</option><option>Meta atingida</option><option>Acima da meta</option><option>Ponto de atenção</option></select></label>
      <label class="form-field fca-span-2"><span>Motivo / por que aconteceu?</span><textarea name="reason" placeholder="Ex.: tive pouco retorno dos leads e não consegui atingir a meta de faturamento." required></textarea></label>
      <label class="form-field"><span>O que funcionou</span><textarea name="positives" placeholder="Pontos positivos do período"></textarea></label>
      <label class="form-field"><span>Principais dificuldades</span><textarea name="obstacles" placeholder="O que mais atrapalhou o resultado"></textarea></label>
      <label class="form-field"><span>Próxima ação do vendedor</span><textarea name="self_action" placeholder="O que você vai ajustar no próximo período"></textarea></label>
      <label class="form-field"><span>O que precisa do gestor</span><textarea name="support_needed" placeholder="Apoio, decisão, material, acompanhamento..."></textarea></label>
    </div>
    <div class="sale-form-footer"><button type="button" id="cancelFcaReport" class="secondary-action">Cancelar</button><button class="primary-action" type="submit"><i data-lucide="send"></i>Enviar ao gestor</button></div>
  </form>`;
  const updateSnapshot=()=>{ const snap=fcaSnapshot(currentUser.name,$('#fcaFrom').value,$('#fcaTo').value); $('#fcaLiveSnapshot').innerHTML=fcaSnapshotMarkup(snap); };
  $('#fcaPeriodType').onchange=event=>{const range=fcaPeriodRange(event.target.value);$('#fcaFrom').value=range.from;$('#fcaTo').value=range.to;updateSnapshot();};
  $('#fcaFrom').onchange=updateSnapshot; $('#fcaTo').onchange=updateSnapshot; updateSnapshot();
  $('#cancelFcaReport').onclick=()=>$('#toggleFcaReport').click();
  $('#fcaReportForm').onsubmit=async event=>{
    event.preventDefault(); const form=event.currentTarget,fd=new FormData(form),submit=form.querySelector('button[type=submit]');
    const from=String(fd.get('period_start')),to=String(fd.get('period_end'));
    if(from>to){toast('A data inicial não pode ser maior que a final.','error');return;}
    submit.disabled=true;submit.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Enviando';refreshIcons();
    try{
      await FcaRepository.createReport({seller_name:currentUser.name,period_type:fd.get('period_type'),period_start:from,period_end:to,indicator:fd.get('indicator'),situation:fd.get('situation'),reason:String(fd.get('reason')||'').trim(),positives:String(fd.get('positives')||'').trim(),obstacles:String(fd.get('obstacles')||'').trim(),self_action:String(fd.get('self_action')||'').trim(),support_needed:String(fd.get('support_needed')||'').trim(),snapshot:fcaSnapshot(currentUser.name,from,to)});
      toast('Relatório FCA enviado ao gestor.'); renderFCA();
    }catch(error){submit.disabled=false;submit.innerHTML='<i data-lucide="send"></i>Enviar ao gestor';refreshIcons();toast(error.message||'Não foi possível enviar o relatório.','error');}
  };
  refreshIcons();
}

function renderManagerFCA(){
  const reports=[...fcaReportsCache].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const actions=[...fcaActionsCache].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)));
  const feedbackPending=reports.filter(item=>item.status==='feedback_requested').length;
  const openActions=actions.filter(item=>item.status==='open').length;
  content.innerHTML=`<section class="fca-head manager-fca-head"><div><span class="eyebrow">GESTÃO DE DESEMPENHO</span><h2>FCA</h2><p>Relatórios dos vendedores, fechamento diário de performance e ações de acompanhamento.</p></div><div class="fca-head-summary"><div><span>Recebidos</span><strong>${reports.length}</strong></div><div><span>Fechamentos diários</span><strong>${weeklyPerformanceReportsCache.length}</strong></div><div><span>Ações abertas</span><strong>${openActions}</strong></div><button type="button" class="primary-action" id="openWeeklyPanel"><i data-lucide="calendar-check-2"></i>Painel semanal</button></div></section>
  <section class="weekly-manager-report-section"><div class="fca-section-title"><div><span class="section-kicker">FECHAMENTO AUTOMÁTICO • 23:59</span><h3>Relatório diário de performance</h3></div><span>${weeklyPerformanceReportsCache.length} registros</span></div><div class="weekly-report-list">${weeklyPerformanceReportsCache.length?weeklyPerformanceReportsCache.slice(0,20).map(weeklyClosedReportCard).join(''):'<div class="fca-empty">Nenhum dia encerrado automaticamente ainda.</div>'}</div></section>
  <section class="fca-grid manager-fca-grid">
    <div class="fca-column"><div class="fca-section-title"><div><span class="section-kicker">RECEBIMENTO</span><h3>Relatórios dos vendedores</h3></div><span>${reports.length}</span></div><div class="fca-report-list">${reports.length?reports.map(r=>fcaReportCard(r,true)).join(''):'<div class="fca-empty">Nenhum relatório recebido.</div>'}</div></div>
    <div class="fca-column"><div class="fca-section-title"><div><span class="section-kicker">ACOMPANHAMENTO</span><h3>Ações enviadas</h3></div><span>${openActions} abertas</span></div><div class="fca-action-list">${actions.length?actions.map(a=>fcaActionCard(a,true)).join(''):'<div class="fca-empty">Nenhuma ação criada.</div>'}</div></div>
  </section>`;
  $('#openWeeklyPanel').onclick=()=>renderPage('fca-semanal');
  content.querySelectorAll('[data-fca-report]').forEach(btn=>btn.onclick=()=>openManagerFcaReport(btn.dataset.fcaReport));
  content.querySelectorAll('[data-weekly-report]').forEach(btn=>{const record=weeklyPerformanceReportsCache.find(item=>item.id===btn.dataset.weeklyReport);btn.onclick=()=>record&&openWeeklyClosedReport(record);});
  refreshIcons();
}

function fcaReportDetailMarkup(report){
  const status=fcaStatusInfo(report.status);
  return `<div class="fca-report-detail">
    <div class="fca-detail-top"><span class="fca-report-status ${status.cls}">${status.label}</span><span>${report.period_type==='monthly'?'Mensal':'Semanal'} • ${formatDateBR(report.period_start)} – ${formatDateBR(report.period_end)}</span></div>
    ${fcaSnapshotMarkup(report.snapshot)}
    <div class="fca-detail-grid">
      <div><span>Indicador</span><strong>${escapeHTML(report.indicator)}</strong></div><div><span>Situação</span><strong>${escapeHTML(report.situation)}</strong></div>
      <div class="wide"><span>Motivo</span><p>${escapeHTML(report.reason)||'—'}</p></div>
      <div><span>O que funcionou</span><p>${escapeHTML(report.positives)||'—'}</p></div><div><span>Dificuldades</span><p>${escapeHTML(report.obstacles)||'—'}</p></div>
      <div><span>Próxima ação do vendedor</span><p>${escapeHTML(report.self_action)||'—'}</p></div><div><span>Precisa do gestor</span><p>${escapeHTML(report.support_needed)||'—'}</p></div>
    </div>
    ${report.feedback_request?`<div class="fca-feedback-box"><span>FEEDBACK SOLICITADO${report.feedback_requested_by?` POR ${escapeHTML(report.feedback_requested_by).toUpperCase()}`:''}</span><strong>${escapeHTML(report.feedback_request)}</strong>${report.feedback_response?`<div><span>RESPOSTA DO VENDEDOR</span><p>${escapeHTML(report.feedback_response)}</p></div>`:''}</div>`:''}
  </div>`;
}

function openManagerFcaReport(id){
  const report=fcaReportsCache.find(item=>item.id===id); if(!report)return;
  openModal(`<div class="mini-modal fca-detail-modal"><div class="modal-head"><div><span class="section-kicker">FCA RECEBIDO</span><h3>${escapeHTML(report.seller_name)}</h3><p>Enviado em ${formatDateTimeBR(report.created_at)}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div>${fcaReportDetailMarkup(report)}<div class="fca-manager-actions"><button type="button" class="secondary-action" id="requestFcaFeedback"><i data-lucide="message-square-text"></i>Solicitar feedback</button><button type="button" class="primary-action" id="createFcaAction"><i data-lucide="list-plus"></i>Criar ação</button></div></div>`);
  $('#requestFcaFeedback').onclick=()=>openFeedbackRequestModal(report);
  $('#createFcaAction').onclick=()=>openCreateFcaActionModal(report);
  refreshIcons();
}
function openSellerFcaReport(id){
  const report=fcaReportsCache.find(item=>item.id===id); if(!report)return;
  openModal(`<div class="mini-modal fca-detail-modal"><div class="modal-head"><div><span class="section-kicker">MEU FCA</span><h3>${escapeHTML(report.indicator)}</h3><p>${formatDateBR(report.period_start)} – ${formatDateBR(report.period_end)}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div>${fcaReportDetailMarkup(report)}${report.status==='feedback_requested'?`<form id="fcaFeedbackResponse" class="fca-response-form"><label class="form-field"><span>Responder ao gestor</span><textarea name="response" placeholder="Explique o ponto solicitado pelo gestor" required></textarea></label><div class="modal-actions"><button class="primary-action" type="submit"><i data-lucide="send"></i>Enviar resposta</button></div></form>`:''}</div>`);
  $('#fcaFeedbackResponse')?.addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type=submit]'),response=String(new FormData(form).get('response')||'').trim();if(!response)return;
    submit.disabled=true;try{await FcaRepository.respondFeedback(report.id,response);closeModal();toast('Feedback enviado ao gestor.');renderFCA();}catch(error){submit.disabled=false;toast(error.message||'Não foi possível enviar o feedback.','error');}
  });
  refreshIcons();
}
function openFeedbackRequestModal(report){
  openModal(`<div class="mini-modal fca-action-modal"><div class="modal-head"><div><span class="section-kicker">SOLICITAR FEEDBACK</span><h3>${escapeHTML(report.seller_name)}</h3><p>O vendedor receberá esta solicitação dentro do FCA.</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div><form id="feedbackRequestForm" class="fca-modal-form"><label class="form-field"><span>O que você quer que o vendedor explique?</span><textarea name="message" placeholder="Ex.: detalhe por que o retorno dos leads caiu nesta semana e quais tentativas foram feitas." required></textarea></label><div class="modal-actions"><button type="button" class="secondary-action" data-close-modal>Cancelar</button><button type="submit" class="primary-action"><i data-lucide="send"></i>Enviar solicitação</button></div></form></div>`);
  $('#feedbackRequestForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,submit=form.querySelector('button[type=submit]'),message=String(new FormData(form).get('message')||'').trim();if(!message)return;submit.disabled=true;try{await FcaRepository.requestFeedback(report.id,message,currentUser.name);closeModal();toast('Feedback solicitado ao vendedor.');renderFCA();}catch(error){submit.disabled=false;toast(error.message||'Não foi possível solicitar o feedback.','error');}};
  refreshIcons();
}
function openCreateFcaActionModal(report){
  openModal(`<div class="mini-modal fca-action-modal"><div class="modal-head"><div><span class="section-kicker">NOVA AÇÃO</span><h3>Ação para ${escapeHTML(report.seller_name)}</h3><p>Ela ficará disponível no FCA do vendedor.</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div><form id="createFcaActionForm" class="fca-modal-form"><label class="form-field"><span>Título da ação</span><input name="title" placeholder="Ex.: Recuperar leads sem retorno" required></label><label class="form-field"><span>O que deve ser feito</span><textarea name="description" placeholder="Descreva a ação de forma objetiva" required></textarea></label><label class="form-field"><span>Prazo</span><input type="date" name="due_date"></label><div class="modal-actions"><button type="button" class="secondary-action" data-close-modal>Cancelar</button><button type="submit" class="primary-action"><i data-lucide="send"></i>Enviar ao vendedor</button></div></form></div>`);
  $('#createFcaActionForm').onsubmit=async event=>{event.preventDefault();const form=event.currentTarget,fd=new FormData(form),submit=form.querySelector('button[type=submit]');submit.disabled=true;try{await FcaRepository.createAction({report_id:report.id,seller_name:report.seller_name,manager_name:currentUser.name,title:String(fd.get('title')||'').trim(),description:String(fd.get('description')||'').trim(),due_date:fd.get('due_date')||''});closeModal();toast('Ação enviada ao vendedor.');renderFCA();}catch(error){submit.disabled=false;toast(error.message||'Não foi possível criar a ação.','error');}};
  refreshIcons();
}


async function renderCommissions(){
  const availableSellers=currentUser.role==='gestor'?SELLERS:[currentUser.name];
  if(!selectedCommissionSeller || !availableSellers.includes(selectedCommissionSeller)) selectedCommissionSeller=availableSellers[0];
  const profileMap=new Map(SELLER_PROFILES.map(profile=>[profile.name,profile]));
  const selectedProfile=profileMap.get(selectedCommissionSeller)||{name:selectedCommissionSeller,photo:''};
  content.innerHTML=`<section class="seller-dashboard-loading"><i data-lucide="loader-circle" class="spin"></i><strong>Calculando comissões...</strong></section>`; refreshIcons();
  try{
    const goals=await GoalsRepository.getForSeller(selectedCommissionSeller,commissionMonth);
    const ranking=calculateCommissionRanking(salesCache,{month:commissionMonth,sellers:SELLERS});
    const rankingMap=new Map(ranking.map(item=>[item.seller,item]));
    const selectedSnapshot=calculateCommissionSnapshot(salesCache,{seller:selectedCommissionSeller,month:commissionMonth,goals,rankingEntry:rankingMap.get(selectedCommissionSeller)});

    content.innerHTML=`
      <section class="commission-head">
        <div class="commission-title"><span class="eyebrow">MODELO FCA</span><h2>Comissões</h2><p>Comissão, bonificação, bônus e premiações separados para não misturar as regras de remuneração.</p></div>
        <label class="commission-month filter-field"><span>MÊS</span><input id="commissionMonth" type="month" value="${commissionMonth}"></label>
      </section>

      ${currentUser.role==='gestor'?`<section class="commission-team">
        <div class="commission-section-heading"><div><span class="section-kicker">EQUIPE</span><h3>Perfis dos vendedores</h3></div><span>${availableSellers.length} vendedores</span></div>
        <div class="commission-profile-grid">
          ${availableSellers.map(name=>commissionProfileButton(profileMap.get(name)||{name,photo:''},calculateCommissionSnapshot(salesCache,{seller:name,month:commissionMonth}),name===selectedCommissionSeller)).join('')}
        </div>
      </section>`:''}

      <section class="commission-detail commission-detail-v30">
        <header class="commission-person-head commission-person-head-v30">
          <div class="commission-person-main">${commissionAvatar(selectedProfile,'large')}<div><span class="section-kicker">RESUMO DO MÊS</span><h3>${escapeHTML(selectedCommissionSeller)}</h3><small>${formatCommissionMonth(commissionMonth)} · somente vendas OK</small></div></div>
          <div class="commission-variable-total"><span>VARIÁVEL ATINGIDO</span><strong>${money.format(selectedSnapshot.variableTotal)}</strong><small>Comissão + bonificação + bônus + premiação mensal</small></div>
        </header>

        <div class="commission-production" aria-label="Produção do mês">
          ${commissionMetric('banknote','Faturado',money.format(selectedSnapshot.revenue))}
          ${commissionMetric('credit-card','Quitado / Cartão',money.format(selectedSnapshot.quitadoRevenue))}
          ${commissionMetric('graduation-cap','Matrículas',String(selectedSnapshot.enrollments))}
          ${commissionMetric('barcode','Boletos',String(selectedSnapshot.boletos))}
          ${commissionMetric('layers-3','Matrículas em boleto',String(selectedSnapshot.boletoEnrollments))}
        </div>

        <section class="commission-summary-grid">
          ${remunerationSummaryCard('wallet-cards','Fixo base',money.format(FCA_BASE_SALARY),'Separado da comissão variável.','base')}
          ${remunerationSummaryCard('badge-dollar-sign','Comissão',money.format(selectedSnapshot.commissionTotal),'Somente as faixas de matrícula e quitado.','commission')}
          ${remunerationSummaryCard('gift','Bonificação',money.format(selectedSnapshot.bonificationTotal),'Produção de matrículas em boleto.','bonification')}
          ${remunerationSummaryCard('sparkles','Bônus',money.format(selectedSnapshot.bonusTotal),'Superação das metas de boleto e quitado.','bonus')}
          ${remunerationSummaryCard('trophy','Premiação',money.format(selectedSnapshot.premiationTotal),selectedSnapshot.ranking.position?`${selectedSnapshot.ranking.position}º no ranking mensal de quitado`:'Sem posição premiada','premiation')}
        </section>

        <section class="remuneration-breakdown">
          ${commissionCategoryMarkup(selectedSnapshot)}
          ${bonificationCategoryMarkup(selectedSnapshot)}
          ${bonusCategoryMarkup(selectedSnapshot,goals)}
          ${premiationCategoryMarkup(selectedSnapshot)}
        </section>

        <section class="commission-rules-note">
          <i data-lucide="info"></i>
          <div><strong>Regras de aplicação</strong><p>Os valores exibidos são atingidos pela produção cadastrada. Bônus e premiações que exigem 3 meses dependem da validação de elegibilidade. Matrículas canceladas dentro de 7 dias não devem compor o comissionamento.</p></div>
        </section>
      </section>`;

    $('#commissionMonth').addEventListener('change',e=>{ commissionMonth=e.target.value||todayISO().slice(0,7); renderCommissions(); });
    content.querySelectorAll('[data-commission-seller]').forEach(button=>button.addEventListener('click',()=>{ selectedCommissionSeller=button.dataset.commissionSeller; renderCommissions(); }));
    refreshIcons();
  }catch(error){ content.innerHTML=`<section class="seller-dashboard-loading error"><i data-lucide="circle-alert"></i><strong>${escapeHTML(error.message||'Não foi possível calcular as comissões.')}</strong></section>`; refreshIcons(); }
}

function commissionProfileButton(profile,snapshot,active){
  return `<button type="button" class="commission-profile${active?' active':''}" data-commission-seller="${escapeHTML(profile.name)}">
    ${commissionAvatar(profile)}
    <span class="commission-profile-copy"><strong>${escapeHTML(profile.name)}</strong><small>${snapshot.salesCount} vendas OK · ${money.format(snapshot.revenue)}</small></span>
    <i data-lucide="chevron-right"></i>
  </button>`;
}
function commissionAvatar(profile,size='normal'){
  if(profile.photo) return `<span class="commission-avatar ${size}"><img src="${escapeHTML(profile.photo)}" alt="${escapeHTML(profile.name)}"></span>`;
  return `<span class="commission-avatar ${size}">${escapeHTML(userInitials(profile.name))}</span>`;
}
function commissionMetric(icon,label,value){ return `<div class="commission-metric"><span><i data-lucide="${icon}"></i></span><div><small>${label}</small><strong>${value}</strong></div></div>`; }
function remunerationSummaryCard(icon,label,value,description,type){
  return `<article class="remuneration-summary-card ${type}"><span class="remuneration-summary-icon"><i data-lucide="${icon}"></i></span><div><small>${label}</small><strong>${value}</strong><p>${description}</p></div></article>`;
}
function tierNextText(tier,formatter=(value)=>String(value)){
  if(!tier.next) return 'Faixa máxima atingida';
  return `Próxima faixa: ${formatter(tier.next.min)}`;
}
function remunerationLine(label,detail,value,earned=true){
  return `<div class="remuneration-line${earned?' earned':''}"><div><strong>${label}</strong><span>${detail}</span></div><strong>${value}</strong></div>`;
}
function commissionCategoryMarkup(snapshot){
  const enrollment=snapshot.enrollmentCommission;
  const quitado=snapshot.quitadoCommission;
  return `<article class="remuneration-category commission-category">
    <header><div><span class="section-kicker">COMISSÃO</span><h3>Faixas de comissão</h3><p>Somente as faixas entram no total de comissão.</p></div><strong>${money.format(snapshot.commissionTotal)}</strong></header>
    <div class="remuneration-lines">
      ${remunerationLine('Faixa variável por matrícula',enrollment.current?`${enrollment.current.label} · ${tierNextText(enrollment,value=>`${value} matrículas`)}`:`Ainda não atingiu 75 matrículas · próxima: 75`,money.format(enrollment.reward),Boolean(enrollment.current))}
      ${remunerationLine('Comissão sobre quitado',quitado.current?`Quitado atual ${money.format(snapshot.quitadoRevenue)} · ${tierNextText(quitado,value=>money.format(value))}`:`Quitado atual ${money.format(snapshot.quitadoRevenue)} · próxima faixa ${money.format(5000)}`,money.format(quitado.reward),Boolean(quitado.current))}
    </div>
  </article>`;
}
function bonificationCategoryMarkup(snapshot){
  const tier=snapshot.boletoBonification;
  const next=tier.next ? (tier.next.min===101?'acima de 100 matrículas em boleto':`${tier.next.min} matrículas em boleto`) : 'faixa máxima';
  return `<article class="remuneration-category bonification-category">
    <header><div><span class="section-kicker">BONIFICAÇÃO</span><h3>Produção em boleto</h3><p>Calculada pelas matrículas de vendas em boleto.</p></div><strong>${money.format(snapshot.bonificationTotal)}</strong></header>
    <div class="remuneration-focus"><span>Produção atual</span><strong>${snapshot.boletoEnrollments} matrículas</strong><small>${tier.current?`Faixa atual ${money.format(tier.reward)} · próxima: ${next}`:`Primeira faixa aos 5 boletos/matrículas`}</small></div>
  </article>`;
}
function bonusCategoryMarkup(snapshot,goals){
  const boleto=snapshot.boletoBonus, quitado=snapshot.quitadoBonus;
  const boletoDetail=Number(goals.boleto_goal||0)>0?`${boleto.pct.toFixed(1).replace('.',',')}% da meta de ${goals.boleto_goal} boletos`:'Defina a meta de boletos em Indicadores';
  const quitadoDetail=Number(goals.quitado_goal||0)>0?`${quitado.pct.toFixed(1).replace('.',',')}% da meta de ${money.format(goals.quitado_goal)}`:'Defina a meta de quitado em Indicadores';
  return `<article class="remuneration-category bonus-category">
    <header><div><span class="section-kicker">BÔNUS</span><h3>Superação de metas</h3><p>Separado da comissão e da bonificação por produção.</p></div><strong>${money.format(snapshot.bonusTotal)}</strong></header>
    <div class="remuneration-lines">
      ${remunerationLine('Superação da meta de boleto',boleto.current?`${boleto.current.label} · ${boletoDetail}`:boletoDetail,money.format(boleto.reward),Boolean(boleto.current))}
      ${remunerationLine('Superação da meta de quitado',quitado.current?`${quitado.current.label} · ${quitadoDetail}`:quitadoDetail,money.format(quitado.reward),Boolean(quitado.current))}
    </div>
    <div class="remuneration-eligibility"><i data-lucide="clock-3"></i><span>Pagamento sujeito à regra de elegibilidade a partir de 3 meses.</span></div>
  </article>`;
}
function premiationCategoryMarkup(snapshot){
  const rank=snapshot.ranking.position;
  return `<article class="remuneration-category premiation-category">
    <header><div><span class="section-kicker">PREMIAÇÕES</span><h3>Ranking e consistência</h3><p>Premiações ficam fora de comissão, bonificação e bônus.</p></div><strong>${money.format(snapshot.premiationTotal)}</strong></header>
    <div class="remuneration-lines">
      ${remunerationLine('Ranking mensal de quitado',rank?`${rank}º lugar · quitado ${money.format(snapshot.quitadoRevenue)}`:'Sem produção quitada para posição premiada',money.format(snapshot.premiationTotal),snapshot.premiationTotal>0)}
      ${remunerationLine('Destaque da semana','O documento define valores para top 3, mas não define o critério do destaque.','Regra manual',false)}
      ${remunerationLine('Bônus por consistência','R$ 500 em 3 meses e R$ 1.000 em 6 meses consecutivos a 100% da meta.','Histórico',false)}
    </div>
  </article>`;
}
function formatCommissionMonth(value){
  if(!/^\d{4}-\d{2}$/.test(value||'')) return 'Mês atual';
  const [year,month]=value.split('-');
  return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(Number(year),Number(month)-1,1));
}


function sellerMetricFormat(kind,value){
  return kind==='revenue' ? money.format(value||0) : new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value||0);
}
function sellerGoalRow({kind,icon,label,metric}){
  const format=value=>sellerMetricFormat(kind,value);
  const hasGoal=metric.goal>0;
  const gapClass=!hasGoal?'neutral':metric.gap>=0?'ahead':'behind';
  const gapText=!hasGoal?'Meta não definida':metric.gap>=0?`+ ${format(metric.gap)} à frente`:`${format(Math.abs(metric.gap))} abaixo`;
  const projectionClass=!hasGoal?'neutral':metric.projection>=metric.goal?'ahead':'behind';
  return `<div class="seller-goal-row">
    <div class="seller-goal-name"><span><i data-lucide="${icon}"></i></span><div><small>META DO MÊS</small><strong>${label}</strong></div></div>
    <div class="seller-goal-value"><span>REALIZADO / META</span><strong>${format(metric.actual)} <small>/ ${hasGoal?format(metric.goal):'—'}</small></strong></div>
    <div class="seller-goal-stat ${gapClass}"><span>GAP DO RITMO</span><strong>${gapText}</strong></div>
    <div class="seller-goal-stat"><span>QUANTO FALTA</span><strong>${hasGoal?format(metric.missing):'—'}</strong></div>
    <div class="seller-goal-stat"><span>PRECISA / DIA ÚTIL</span><strong>${hasGoal?format(metric.dailyNeed):'—'}</strong></div>
    <div class="seller-goal-stat ${projectionClass}"><span>PROJEÇÃO DO MÊS</span><strong>${hasGoal?format(metric.projection):format(metric.actual)}</strong></div>
    <div class="seller-goal-progress"><div><span style="width:${metric.pct}%"></span></div><strong>${hasGoal?metric.pct.toFixed(1).replace('.',',')+'%':'Sem meta'}</strong></div>
  </div>`;
}
function buildSellerMood(data){
  const tracked=[
    { key:'revenue', label:'Faturado', metric:data.revenue, format:value=>money.format(value||0) },
    { key:'boleto', label:'Boletos', metric:data.boleto, format:value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value||0) },
    { key:'enroll', label:'Matrículas', metric:data.enroll, format:value=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value||0) }
  ].filter(item=>Number(item.metric.goal||0) > 0);

  if(!tracked.length){
    return {
      mood:'neutral',
      emoji:'🙂',
      title:'As metas ainda não foram definidas.',
      text:'Assim que o gestor configurar suas metas, esta faixa passa a mostrar o ritmo ideal para hoje.',
      targets:[
        {label:'Faturado hoje', value:'—'},
        {label:'Boletos hoje', value:'—'},
        {label:'Matrículas hoje', value:'—'}
      ]
    };
  }

  const negatives=tracked.filter(item=>Number(item.metric.gap||0) < 0).length;
  const positives=tracked.filter(item=>Number(item.metric.gap||0) >= 0).length;
  let mood='neutral';
  if(negatives>=2 || Number(data.revenue.gap||0) < 0) mood='behind';
  else if(positives===tracked.length) mood='ahead';

  const copy={
    behind:{emoji:'😟',title:'Hoje, para sair do vermelho, você precisa reagir neste ritmo.',text:`Se bater esses números hoje, você volta para a média do mês e encurta o gap das metas.`},
    neutral:{emoji:'😐',title:'Hoje, para se manter na média, este é o ritmo ideal.',text:`Mantendo esse ritmo hoje, você segue alinhado com o fechamento esperado do mês.`},
    ahead:{emoji:'😄',title:'Você está acima da média. Mantendo este ritmo hoje, segue forte.',text:`Seu desempenho está saudável. Se repetir esse ritmo hoje, você mantém a projeção acima do esperado.`}
  };

  const targetMap=new Map(tracked.map(item=>[item.key,item]));
  const revenueTarget=targetMap.get('revenue');
  const boletoTarget=targetMap.get('boleto');
  const enrollTarget=targetMap.get('enroll');

  return {
    mood,
    emoji:copy[mood].emoji,
    title:copy[mood].title,
    text:copy[mood].text,
    targets:[
      {label:'Faturado hoje', value:revenueTarget ? revenueTarget.format(revenueTarget.metric.dailyNeed) : '—'},
      {label:'Boletos hoje', value:boletoTarget ? boletoTarget.format(boletoTarget.metric.dailyNeed) : '—'},
      {label:'Matrículas hoje', value:enrollTarget ? enrollTarget.format(enrollTarget.metric.dailyNeed) : '—'}
    ]
  };
}

function indicatorSellerOrder(){
  return [...SELLERS].sort((a,b)=>a.localeCompare(b,'pt-BR',{sensitivity:'base'}));
}
function adjacentIndicatorSeller(name,direction=1){
  const sellers=indicatorSellerOrder();
  if(!sellers.length) return '';
  const index=Math.max(sellers.indexOf(name),0);
  return sellers[(index+direction+sellers.length)%sellers.length];
}
function normalizeSellerSearch(value=''){
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
}
function managerSellerToolbarMarkup(sellerName,showNavigator){
  const previous=adjacentIndicatorSeller(sellerName,-1);
  const next=adjacentIndicatorSeller(sellerName,1);
  return `<section class="manager-seller-toolbar">
    <button type="button" id="backToIndicators" class="manager-back-button"><i data-lucide="arrow-left"></i><span>Voltar aos indicadores</span></button>
    <div class="manager-seller-current"><span>VISUALIZANDO</span><strong>${escapeHTML(sellerName)}</strong></div>
    <div class="manager-seller-actions">
      <button type="button" id="previousIndicatorSeller" class="manager-seller-nav" title="Vendedor anterior: ${escapeHTML(previous)}"><i data-lucide="chevron-left"></i><span>Anterior</span></button>
      <button type="button" id="toggleSellerDirectory" class="manager-directory-button ${showNavigator?'active':''}"><i data-lucide="users-round"></i><span>${showNavigator?'Fechar vendedores':'Ver todos os vendedores'}</span></button>
      <button type="button" id="nextIndicatorSeller" class="manager-seller-nav manager-seller-nav-next" title="Próximo vendedor: ${escapeHTML(next)}"><span>Próximo</span><small>${escapeHTML(next)}</small><i data-lucide="chevron-right"></i></button>
    </div>
  </section>`;
}
function managerSellerDirectoryMarkup(sellerName){
  const sellers=indicatorSellerOrder();
  return `<section class="manager-seller-directory">
    <div class="manager-directory-head">
      <div><span class="section-kicker">TODOS OS VENDEDORES</span><h3>Localize um dashboard</h3></div>
      <label class="manager-seller-search"><i data-lucide="search"></i><input id="managerSellerSearch" type="search" placeholder="Pesquisar vendedor" autocomplete="off"></label>
    </div>
    <div id="managerSellerDirectoryList" class="manager-directory-list">
      ${sellers.map(name=>`<button type="button" class="manager-directory-person${name===sellerName?' active':''}" data-manager-seller="${escapeHTML(name)}"><span>${escapeHTML(userInitials(name))}</span><strong>${escapeHTML(name)}</strong><i data-lucide="arrow-up-right"></i></button>`).join('')}
    </div>
    <div id="managerSellerSearchEmpty" class="manager-directory-empty is-hidden">Nenhum vendedor encontrado.</div>
  </section>`;
}
function bindManagerSellerViewer(sellerName,showNavigator){
  $('#backToIndicators')?.addEventListener('click',()=>renderIndicators());
  $('#previousIndicatorSeller')?.addEventListener('click',()=>{
    const target=adjacentIndicatorSeller(sellerName,-1); selectedIndicatorSeller=target;
    renderSellerDashboard({sellerName:target,managerView:true,showNavigator});
  });
  $('#nextIndicatorSeller')?.addEventListener('click',()=>{
    const target=adjacentIndicatorSeller(sellerName,1); selectedIndicatorSeller=target;
    renderSellerDashboard({sellerName:target,managerView:true,showNavigator});
  });
  $('#toggleSellerDirectory')?.addEventListener('click',()=>renderSellerDashboard({sellerName,managerView:true,showNavigator:!showNavigator}));
  content.querySelectorAll('[data-manager-seller]').forEach(button=>button.addEventListener('click',()=>{
    const target=button.dataset.managerSeller; selectedIndicatorSeller=target;
    renderSellerDashboard({sellerName:target,managerView:true,showNavigator:true});
  }));
  const search=$('#managerSellerSearch');
  if(search){
    const filter=()=>{
      const query=normalizeSellerSearch(search.value);
      let visible=0;
      content.querySelectorAll('[data-manager-seller]').forEach(button=>{
        const matches=!query || normalizeSellerSearch(button.dataset.managerSeller).includes(query);
        button.classList.toggle('is-hidden',!matches); if(matches) visible++;
      });
      $('#managerSellerSearchEmpty')?.classList.toggle('is-hidden',visible>0);
    };
    search.addEventListener('input',filter);
    search.addEventListener('keydown',event=>{
      if(event.key!=='Enter') return;
      event.preventDefault();
      const first=[...content.querySelectorAll('[data-manager-seller]')].find(button=>!button.classList.contains('is-hidden'));
      if(first) first.click();
    });
    setTimeout(()=>search.focus({preventScroll:true}),0);
  }
}

async function renderSellerDashboard({sellerName="",managerView=false,showNavigator=false}={}){
  const isManagerView=currentUser?.role==='gestor' && managerView;
  if(currentUser?.role!=='vendedor' && !isManagerView) return renderDashboard({mode:'geral'});
  const targetSeller=isManagerView?(sellerName||selectedIndicatorSeller||indicatorSellerOrder()[0]):currentUser.name;
  if(isManagerView) selectedIndicatorSeller=targetSeller;
  const dashboardMonth=isManagerView?indicatorsMonth:sellerDashboardMonth;
  destroyCharts();
  content.innerHTML=`<section class="seller-dashboard-loading"><i data-lucide="loader-circle" class="spin"></i><strong>Carregando seu desempenho...</strong></section>`; refreshIcons();
  try{
    const goals=await GoalsRepository.getForSeller(targetSeller,dashboardMonth);
    const data=calculateSellerDashboard(salesCache,{month:dashboardMonth,seller:targetSeller,goals});
    const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(`${dashboardMonth}-01T12:00:00`));
    const pace= data.revenue.goal ? data.revenue.gap : 0;
    const paceClass=!data.revenue.goal?'neutral':pace>=0?'ahead':'behind';
    const paceLabel=!data.revenue.goal?'Metas aguardando definição do gestor':pace>=0?'Você está acima do ritmo esperado':'Você está abaixo do ritmo esperado';
    const mood=buildSellerMood(data);
    const sellerGoalCard=(kind,icon,label,metric)=>{
      const format=value=>kind==='revenue'?money.format(value||0):new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(value||0);
      const hasGoal=metric.goal>0;
      const gapClass=!hasGoal?'neutral':metric.gap>=0?'ahead':'behind';
      const projectionClass=!hasGoal?'neutral':metric.projection>=metric.goal?'ahead':'behind';
      return `<article class="seller-goal-card ${kind}">
        <header><span class="seller-goal-card-icon"><i data-lucide="${icon}"></i></span><div><small>META DO MÊS</small><h3>${label}</h3></div><strong>${hasGoal?metric.pct.toFixed(1).replace('.',',')+'%':'Sem meta'}</strong></header>
        <div class="seller-goal-card-value"><span>REALIZADO / META</span><strong>${format(metric.actual)} <small>/ ${hasGoal?format(metric.goal):'—'}</small></strong></div>
        <div class="seller-goal-card-progress"><span style="width:${metric.pct}%"></span></div>
        <div class="seller-goal-card-grid">
          <div class="seller-goal-mini ${gapClass}"><span>Gap do mês</span><strong>${hasGoal?(metric.gap>=0?'+ ':'- ')+format(Math.abs(metric.gap)):'—'}</strong></div>
          <div class="seller-goal-mini"><span>Quanto falta</span><strong>${hasGoal?format(metric.missing):'—'}</strong></div>
          <div class="seller-goal-mini"><span>Precisa por dia útil</span><strong>${hasGoal?format(metric.dailyNeed):'—'}</strong></div>
          <div class="seller-goal-mini ${projectionClass}"><span>Projeção de fechamento</span><strong>${hasGoal?format(metric.projection):format(metric.actual)}</strong></div>
        </div>
      </article>`;
    };
    content.innerHTML=`
      ${isManagerView?managerSellerToolbarMarkup(targetSeller,showNavigator):''}
      ${isManagerView&&showNavigator?managerSellerDirectoryMarkup(targetSeller):''}
      <section class="seller-dashboard-head seller-dashboard-head-rich">
        <div><span class="eyebrow">${isManagerView?'DASHBOARD DO VENDEDOR':'MEU DASHBOARD'}</span><h2>${escapeHTML(targetSeller)}</h2><p>${isManagerView?'Visualização individual pela área de indicadores.':'Leitura do mês com base somente nas vendas aprovadas pela auditoria.'}</p></div>
        <label class="seller-month-filter"><span>MÊS</span><input id="sellerDashboardMonth" type="month" value="${dashboardMonth}"></label>
      </section>

      <section class="seller-mood-banner ${'mood-'+mood.mood}">
        <div class="seller-mood-emoji ${mood.mood}" aria-hidden="true"><span>${mood.emoji}</span></div>
        <div class="seller-mood-copy">
          <span class="section-kicker">RITMO DE HOJE</span>
          <h3>${mood.title}</h3>
          <p>${mood.text}</p>
        </div>
        <div class="seller-mood-targets">
          ${mood.targets.map(target=>`<div><span>${target.label}</span><strong>${target.value}</strong></div>`).join('')}
        </div>
      </section>

      <div class="seller-dashboard-summary-grid">
      <section class="seller-hero-card seller-hero-card-expanded ${paceClass}">
        <div class="seller-hero-main">
          <div class="seller-hero-copy">
            <span class="seller-hero-pill">${monthLabel}</span>
            <h3>${paceLabel}</h3>
            <p>Acompanhe suas metas de faturamento, matrículas e boletos, além do ritmo necessário por dia útil para alcançar o fechamento esperado.</p>
          </div>
          <div class="seller-hero-summary">
            <div><span>Faturado no mês</span><strong>${money.format(data.revenue.actual)}</strong></div>
            <div><span>Matrículas no mês</span><strong>${data.enroll.actual}</strong></div>
            <div><span>Boletos no mês</span><strong>${data.boleto.actual}</strong></div>
          </div>
        </div>
        <div class="seller-hero-operations">
          <div><span>DIAS ÚTEIS</span><strong>${data.elapsedBusinessDays} / ${data.totalBusinessDays}</strong><small>Passados no mês</small></div>
          <div><span>RESTANTES</span><strong>${data.remainingBusinessDays}</strong><small>dias úteis para reagir</small></div>
          <div><span>VENDAS OK</span><strong>${data.monthRows.length}</strong><small>aprovadas no período</small></div>
        </div>
      </section>

      <section class="seller-today-band">
        <div class="seller-today-band-title"><span class="section-kicker">RESULTADO DE HOJE</span><strong>${formatDateBR(todayISO())}</strong></div>
        <div class="seller-today-band-grid">
          <div><span>Faturado</span><strong>${money.format(data.today.revenue)}</strong></div>
          <div><span>Matrículas</span><strong>${data.today.enroll}</strong></div>
          <div><span>Boletos</span><strong>${data.today.boletos}</strong></div>
          <div><span>Vendas</span><strong>${data.today.sales}</strong></div>
        </div>
      </section>
      </div>

      <section class="seller-goal-card-section">
        <div class="seller-goals-heading"><div><span class="section-kicker">METAS DO VENDEDOR</span><h3>O que falta para fechar o mês</h3></div><span>Gap = diferença entre o realizado e o ritmo esperado até hoje.</span></div>
        <div class="seller-goal-card-list">
          ${sellerGoalCard('revenue','banknote','Faturamento',data.revenue)}
          ${sellerGoalCard('enroll','graduation-cap','Matrículas',data.enroll)}
          ${sellerGoalCard('boleto','barcode','Boletos',data.boleto)}
        </div>
      </section>

      <section class="dashboard-charts seller-dashboard-charts">
        <article class="chart-panel chart-wide seller-chart-primary"><div class="panel-heading"><div><span>PREDITIVO</span><h3>Evolução e projeção do faturamento</h3></div><i data-lucide="chart-no-axes-combined"></i></div><div class="chart-box large"><canvas id="sellerProjectionChart"></canvas></div></article>
        <article class="chart-panel seller-chart-secondary"><div class="panel-heading"><div><span>MIX</span><h3>Distribuição por pagamento</h3></div><i data-lucide="chart-pie"></i></div><div class="chart-box"><canvas id="sellerMixChart"></canvas></div></article>
        <article class="chart-panel chart-full seller-chart-secondary seller-chart-performance"><div class="panel-heading"><div><span>COMPARATIVO</span><h3>Atingido x projeção das metas</h3></div><i data-lucide="chart-column-big"></i></div><div class="chart-box medium"><canvas id="sellerPerformanceChart"></canvas></div></article>
      </section>`;
    $('#sellerDashboardMonth').addEventListener('change',e=>{ const value=e.target.value||todayISO().slice(0,7); if(isManagerView){indicatorsMonth=value; renderSellerDashboard({sellerName:targetSeller,managerView:true,showNavigator});}else{sellerDashboardMonth=value; renderSellerDashboard();} });
    if(isManagerView) bindManagerSellerViewer(targetSeller,showNavigator);
    renderSellerCharts(content,data);
    refreshIcons();
  }catch(error){ content.innerHTML=`<section class="seller-dashboard-loading error"><i data-lucide="circle-alert"></i><strong>${escapeHTML(error.message||'Não foi possível carregar o dashboard.')}</strong></section>`; refreshIcons(); }
}

function indicatorGoalInput(icon,label,name,value,type='number'){
  return `<label class="indicator-goal-field"><span class="indicator-goal-icon"><i data-lucide="${icon}"></i></span><span class="indicator-goal-copy"><small>${label}</small><input name="${name}" ${type==='money'?'inputmode="decimal"':'type="number" min="0" step="1"'} value="${value||''}" placeholder="${type==='money'?'R$ 0,00':'0'}"></span></label>`;
}
async function renderIndicators(){
  if(currentUser.role!=='gestor') return renderSellerDashboard();
  content.innerHTML=`<section class="seller-dashboard-loading"><i data-lucide="loader-circle" class="spin"></i><strong>Carregando indicadores...</strong></section>`; refreshIcons();
  try{
    const [currentGoal,monthGoals]=await Promise.all([
      GoalsRepository.getForSeller(selectedIndicatorSeller,indicatorsMonth),
      GoalsRepository.listMonth(indicatorsMonth)
    ]);
    const map=new Map(monthGoals.map(item=>[item.seller_name,item]));
    content.innerHTML=`
      <section class="indicators-head">
        <div><span class="eyebrow">GESTÃO DE METAS</span><h2>Indicadores</h2><p>Defina as três metas mensais que alimentam o dashboard individual de cada vendedor.</p></div>
        <div class="indicator-head-actions">
          <label class="indicator-month"><span>MÊS DE REFERÊNCIA</span><input id="indicatorsMonth" type="month" value="${indicatorsMonth}"></label>
          <button type="button" id="viewAllSellerDashboards" class="indicator-view-all"><i data-lucide="layout-dashboard"></i><span>Ver todos os vendedores</span></button>
        </div>
      </section>
      <section class="indicator-editor">
        <div class="indicator-seller-selector"><span>VENDEDOR</span><select id="indicatorSeller">${SELLERS.map(v=>`<option ${v===selectedIndicatorSeller?'selected':''}>${v}</option>`).join('')}</select></div>
        <form id="indicatorGoalForm" class="indicator-goal-form">
          ${indicatorGoalInput('banknote','Meta de faturamento','revenue_goal',currentGoal.revenue_goal,'money')}
          ${indicatorGoalInput('graduation-cap','Meta de matrículas','enrollment_goal',currentGoal.enrollment_goal)}
          ${indicatorGoalInput('barcode','Meta de boletos','boleto_goal',currentGoal.boleto_goal)}
          ${indicatorGoalInput('credit-card','Meta de quitado (bônus FCA)','quitado_goal',currentGoal.quitado_goal,'money')}
          <button class="primary-action indicator-save" type="submit"><i data-lucide="save"></i>Salvar metas</button>
        </form>
      </section>
      <div class="indicator-remuneration-note"><i data-lucide="badge-dollar-sign"></i><span>As metas de boleto e quitado também alimentam automaticamente os bônus FCA na área Comissões.</span></div>
      <section class="indicator-team-section">
        <div class="indicator-team-heading"><div><span class="section-kicker">EQUIPE</span><h3>Metas de ${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(`${indicatorsMonth}-01T12:00:00`))}</h3></div><span>${monthGoals.length} de ${SELLERS.length} vendedores configurados</span></div>
        <div class="indicator-team-list">
          ${SELLERS.map(name=>indicatorTeamRow(name,map.get(name))).join('')}
        </div>
      </section>`;
    $('#indicatorsMonth').addEventListener('change',e=>{ indicatorsMonth=e.target.value||todayISO().slice(0,7); renderIndicators(); });
    $('#indicatorSeller').addEventListener('change',e=>{ selectedIndicatorSeller=e.target.value; renderIndicators(); });
    content.querySelectorAll('[data-indicator-seller]').forEach(btn=>btn.addEventListener('click',()=>{ selectedIndicatorSeller=btn.dataset.indicatorSeller; renderSellerDashboard({sellerName:selectedIndicatorSeller,managerView:true,showNavigator:false}); }));
    $('#viewAllSellerDashboards')?.addEventListener('click',()=>{ const seller=selectedIndicatorSeller||indicatorSellerOrder()[0]; renderSellerDashboard({sellerName:seller,managerView:true,showNavigator:true}); });
    $('#indicatorGoalForm').addEventListener('submit',async e=>{
      e.preventDefault(); const form=new FormData(e.currentTarget); const button=e.currentTarget.querySelector('button[type="submit"]');
      button.disabled=true; button.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Salvando'; refreshIcons();
      try{
        await GoalsRepository.save({seller_name:selectedIndicatorSeller,month:indicatorsMonth,revenue_goal:parseMoney(form.get('revenue_goal')),enrollment_goal:Number(form.get('enrollment_goal')||0),boleto_goal:Number(form.get('boleto_goal')||0),quitado_goal:parseMoney(form.get('quitado_goal')),updated_by:currentUser.name});
        toast(`Metas de ${selectedIndicatorSeller} salvas.`); renderIndicators();
      }catch(error){ toast(error.message||'Não foi possível salvar as metas.','error'); button.disabled=false; }
    });
    refreshIcons();
  }catch(error){ content.innerHTML=`<section class="seller-dashboard-loading error"><i data-lucide="circle-alert"></i><strong>${escapeHTML(error.message||'Não foi possível carregar os indicadores.')}</strong></section>`; refreshIcons(); }
}
function indicatorTeamRow(name,goal){
  const configured=Boolean(goal && (goal.revenue_goal || goal.enrollment_goal || goal.boleto_goal || goal.quitado_goal));
  return `<button type="button" class="indicator-team-row${name===selectedIndicatorSeller?' active':''}" data-indicator-seller="${escapeHTML(name)}">
    <div class="indicator-team-person"><span>${escapeHTML(userInitials(name))}</span><strong>${escapeHTML(name)}</strong></div>
    <div><span>Faturamento</span><strong>${goal?.revenue_goal?money.format(goal.revenue_goal):'—'}</strong></div>
    <div><span>Matrículas</span><strong>${goal?.enrollment_goal||'—'}</strong></div>
    <div><span>Boletos</span><strong>${goal?.boleto_goal||'—'}</strong></div>
    <div><span>Quitado</span><strong>${goal?.quitado_goal?money.format(goal.quitado_goal):'—'}</strong></div>
    <span class="indicator-config-status ${configured?'configured':'pending'}">${configured?'Configurado':'Pendente'}</span>
    <i data-lucide="chevron-right"></i>
  </button>`;
}

function goalKey(seller, to){ return `unifahe.goals.${(to||todayISO()).slice(0,7)}.${seller||'geral'}`; }
function getGoals(seller,to){ try{return JSON.parse(localStorage.getItem(goalKey(seller,to))||'{"revenue":0,"enroll":0}')}catch{return{revenue:0,enroll:0}} }
function saveGoals(seller,to,goals){ localStorage.setItem(goalKey(seller,to),JSON.stringify(goals)); }

function renderDashboard({mode='geral',seller=''}){
  destroyCharts(); const range=monthRangeISO(); range.to=todayISO(); const selectedSeller=mode==='individual'?(seller||SELLERS[0]):''; const goals=getGoals(selectedSeller,range.to);
  content.innerHTML=dashboardMarkup({mode,selectedSeller,from:range.from,to:range.to,goals});
  bindDashboard({mode}); refreshDashboard({mode}); refreshIcons();
}

function dashboardMarkup({mode,selectedSeller,from,to,goals}){
  const canChooseSeller=currentUser.role==='gestor';
  return `<section class="dashboard-head">
    <div class="dashboard-title-block"><span class="eyebrow">${mode==='geral'?'GESTÃO COMERCIAL':'DESEMPENHO INDIVIDUAL'}</span><h2>${mode==='geral'?'Dashboard geral':'Dashboard vendedor'}</h2><p>${mode==='geral'?'Leitura consolidada do comercial em uma única visão.':'Acompanhamento mensal e diário do vendedor.'}</p></div>
    <div class="dashboard-primary-controls">
      ${mode==='geral'?`<button id="switchDashboard" class="orange-action"><i data-lucide="user-round"></i>Individual</button>`:`${currentUser.role==='gestor'?'<button id="switchDashboard" class="navy-action"><i data-lucide="layout-dashboard"></i>Geral</button>':''}`}
      ${mode==='individual'&&canChooseSeller?`<label class="filter-field seller-filter"><span>VENDEDOR</span><select id="dashSeller">${SELLERS.map(v=>`<option ${v===selectedSeller?'selected':''}>${v}</option>`).join('')}</select></label>`:''}
      <div class="date-filter"><label class="filter-field"><span>DE</span><input id="dashFrom" type="date" value="${from}"></label><label class="filter-field"><span>ATÉ</span><input id="dashTo" type="date" value="${to}"></label><button id="applyDash" class="navy-action"><i data-lucide="sliders-horizontal"></i>Filtrar</button></div>
    </div>
    <div class="dashboard-utility-row"><button id="saveDashboard" class="toolbar-action"><i data-lucide="bookmark-plus"></i>Salvar</button><button id="openSavedDashboards" class="toolbar-action"><i data-lucide="folder-clock"></i>Dashboards salvos</button></div>
  </section>
  <section id="savedDashboardsPanel" class="saved-dashboards-panel is-hidden"></section>

  <section class="dashboard-period-grid" aria-label="Resultados mensal e diário">
    <article class="dashboard-period-panel monthly-period">
      <header class="period-heading"><div><span>MENSAL</span><strong id="monthlyPeriodLabel">Mês selecionado</strong></div><i data-lucide="calendar-range"></i></header>
      <div class="period-metrics">
        ${periodMetric('banknote','Faturado','mFaturado')}
        ${periodMetric('graduation-cap','Matrículas','mMatriculas')}
        ${periodMetric('barcode','Boletos','mBoletos')}
        ${periodMetric('credit-card','Cartão','mCartao')}
        ${periodMetric('coins','Taxa boleto','mTaxa')}
        ${periodMetric('receipt-text','Vendas','mVendas')}
      </div>
    </article>
    <article class="dashboard-period-panel daily-period">
      <header class="period-heading"><div><span>DIÁRIO</span><strong id="dailyPeriodDate">Dia selecionado</strong></div><i data-lucide="calendar-days"></i></header>
      <div class="period-metrics">
        ${periodMetric('banknote','Faturado','dFaturado')}
        ${periodMetric('graduation-cap','Matrículas','dMatriculas')}
        ${periodMetric('barcode','Boletos','dBoletos')}
        ${periodMetric('credit-card','Cartão','dCartao')}
        ${periodMetric('coins','Taxa boleto','dTaxa')}
        ${periodMetric('receipt-text','Vendas','dVendas')}
      </div>
    </article>
  </section>

  <section class="goals-section">
    <div class="goals-heading"><span class="section-kicker">METAS DO MÊS</span><strong id="goalMonthLabel">—</strong><small>Realizado, meta e saldo restante na mesma leitura.</small></div>
    ${goalRow('Faturamento','goalRevenueInput',goals.revenue||'','R$ 0,00','goalRevenueText','goalRevenueMissing','revenueProgress','revenuePctText','banknote')}
    ${goalRow('Matrículas','goalEnrollInput',goals.enroll||'','0','goalEnrollText','goalEnrollMissing','enrollProgress','enrollPctText','graduation-cap',true)}
  </section>

  <section class="dashboard-charts">
    <article class="chart-panel chart-wide"><div class="panel-heading"><div><span>EVOLUÇÃO</span><h3>Projeção das metas</h3></div><i data-lucide="chart-no-axes-combined"></i></div><div class="chart-box large"><canvas id="projectionChart"></canvas></div></article>
    <article class="chart-panel"><div class="panel-heading"><div><span>COMPOSIÇÃO</span><h3>Distribuição por pagamento</h3></div><i data-lucide="chart-pie"></i></div><div class="chart-box"><canvas id="distributionChart"></canvas></div></article>
    <article class="chart-panel chart-full"><div class="panel-heading"><div><span>MODALIDADES</span><h3>Faturamento por modalidade</h3></div><i data-lucide="chart-column-big"></i></div><div class="chart-box medium"><canvas id="categoryChart"></canvas></div></article>
  </section>`;
}
function periodMetric(icon,label,id){ return `<div class="period-metric"><span class="period-metric-icon"><i data-lucide="${icon}"></i></span><div><span>${label}</span><strong id="${id}">—</strong></div></div>`; }
function goalRow(label,inputId,value,placeholder,resultId,missingId,progressId,pctId,icon,isNumber=false){
  return `<div class="goal-row"><span class="goal-icon"><i data-lucide="${icon}"></i></span><div class="goal-name"><strong>${label}</strong><label class="goal-input-inline"><span>Meta</span><input id="${inputId}" ${isNumber?'type="number" min="0"':'inputmode="decimal"'} value="${value}" placeholder="${placeholder}"></label></div><div class="goal-realized"><span>REALIZADO / META</span><strong id="${resultId}">—</strong></div><div class="goal-missing"><span>QUANTO FALTA</span><strong id="${missingId}">—</strong></div><div class="goal-progress"><div class="progress-track"><span id="${progressId}"></span></div><strong id="${pctId}">0%</strong></div></div>`;
}

function bindDashboard({mode}){
  $('#switchDashboard')?.addEventListener('click',()=>renderDashboard(mode==='geral'?{mode:'individual',seller:currentUser.role==='vendedor'?currentUser.name:SELLERS[0]}:{mode:'geral'}));
  $('#applyDash').onclick=()=>refreshDashboard({mode}); $('#dashSeller')?.addEventListener('change',()=>refreshDashboard({mode}));
  const saveGoal=()=>{ const seller=getDashSeller(mode); const to=$('#dashTo').value; saveGoals(seller,to,{revenue:parseMoney($('#goalRevenueInput').value),enroll:Number($('#goalEnrollInput').value||0)}); refreshDashboard({mode}); };
  $('#goalRevenueInput').addEventListener('change',saveGoal); $('#goalEnrollInput').addEventListener('change',saveGoal);
  $('#saveDashboard').onclick=()=>saveDashboardPreset(mode); $('#openSavedDashboards').onclick=()=>toggleSavedDashboards();
}
function getDashSeller(mode){ if(mode==='geral') return ''; if(currentUser.role==='vendedor') return currentUser.name; return $('#dashSeller')?.value||''; }
function refreshDashboard({mode}){
  const from=$('#dashFrom').value,to=$('#dashTo').value,seller=getDashSeller(mode),goals=getGoals(seller,to);
  const data=calculateDashboard(salesCache,{from,to,seller,goals}); fillDashboardText(content,data);
  $('#goalMonthLabel').textContent=to?`${to.slice(5,7)}/${to.slice(0,4)}`:'—';
  if($('#monthlyPeriodLabel')) $('#monthlyPeriodLabel').textContent=to?`${to.slice(5,7)}/${to.slice(0,4)}`:'Mês selecionado';
  if($('#dailyPeriodDate')) $('#dailyPeriodDate').textContent=to?formatDateBR(to):'Dia selecionado';
  renderCharts(content,data,{from,to}); refreshIcons();
}
function presetsKey(){ return `unifahe.dashboardPresets.${currentUser.id}`; }
function saveDashboardPreset(mode){
  const list=JSON.parse(localStorage.getItem(presetsKey())||'[]');
  const preset={id:Date.now(),mode,from:$('#dashFrom').value,to:$('#dashTo').value,seller:getDashSeller(mode),label:`${mode==='geral'?'Geral':getDashSeller(mode)} • ${formatDateBR($('#dashFrom').value)}–${formatDateBR($('#dashTo').value)}`};
  list.unshift(preset); localStorage.setItem(presetsKey(),JSON.stringify(list.slice(0,10))); toast('Dashboard salvo.');
}
function toggleSavedDashboards(){
  const panel=$('#savedDashboardsPanel'); panel.classList.toggle('is-hidden'); if(panel.classList.contains('is-hidden')) return;
  const list=JSON.parse(localStorage.getItem(presetsKey())||'[]');
  panel.innerHTML=list.length?`<div class="saved-list">${list.map(p=>`<button class="saved-item" data-id="${p.id}"><i data-lucide="bookmark"></i><span>${escapeHTML(p.label)}</span><i data-lucide="arrow-right"></i></button>`).join('')}</div>`:`<div class="empty-saved">Nenhum dashboard salvo ainda.</div>`;
  panel.querySelectorAll('.saved-item').forEach(btn=>btn.onclick=()=>{
    const p=list.find(x=>String(x.id)===btn.dataset.id); if(!p)return;
    renderDashboard({mode:p.mode,seller:p.seller});
    setTimeout(()=>{ $('#dashFrom').value=p.from; $('#dashTo').value=p.to; if($('#dashSeller')&&p.seller) $('#dashSeller').value=p.seller; refreshDashboard({mode:p.mode}); },0);
  }); refreshIcons();
}

setSidebarCollapsed(localStorage.getItem('unifaheSidebarCollapsed')==='1');
setTimeout(refreshIcons,0);


if(!PREVIEW_LOGIN_ENABLED){
  watchSession(async profile=>{
    if(profile && !currentUser) await signIn(profile);
    if(!profile && currentUser) resetSignedOutView();
  });
}
