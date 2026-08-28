import { STATES, PAYMENT_TYPES, MODALITIES, ORIGINS, COURSES, DEMO_USERS, SELLERS } from './modules/catalogs.js';
import { SalesRepository } from './modules/repository.js';
import { calculateDashboard, fillDashboardText, renderCharts, destroyCharts } from './modules/dashboard.js';
import { escapeHTML, formatDateBR, formatDateTimeBR, fileSize, money, parseMoney, paymentLabel, todayISO, monthRangeISO } from './modules/utils.js';

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
let activeSalesStatusFilter = 'all';

const $ = s => document.querySelector(s);
const loginView=$('#loginView'), appView=$('#appView'), loginForm=$('#loginForm'), loginError=$('#loginError');
const emailInput=$('#email'), passwordInput=$('#password'), sidebar=$('#sidebar'), sidebarNav=$('#sidebarNav');
const content=$('#content'), pageTitle=$('#pageTitle'), userName=$('#userName'), userRole=$('#userRole'), userAvatar=$('#userAvatar');
const mobileOverlay=$('#mobileOverlay'), modalHost=$('#modalHost');

function refreshIcons(){ if(window.lucide) window.lucide.createIcons({attrs:{'stroke-width':1.9}}); }
function toast(message, type='ok'){
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.innerHTML=`<i data-lucide="${type==='error'?'circle-alert':'circle-check'}"></i><span>${escapeHTML(message)}</span>`;
  $('#toastHost').append(el); refreshIcons(); setTimeout(()=>el.remove(),3600);
}
function getMenuItems(){ return currentUser ? [...COMMON_ITEMS, ...(currentUser.role==='gestor'?MANAGER_DASHBOARDS:SELLER_DASHBOARDS)] : []; }
function userInitials(name){ return name.split(' ').filter(Boolean).map(p=>p[0]).slice(0,2).join('').toUpperCase(); }

loginForm.addEventListener('submit', e=>{
  e.preventDefault();
  const email=emailInput.value.trim().toLowerCase();
  const user=DEMO_USERS[email];
  if(!user || user.password!==passwordInput.value){ loginError.textContent='E-mail ou senha inválidos.'; return; }
  loginError.textContent=''; signIn(user);
});
document.querySelectorAll('[data-demo]').forEach(btn=>btn.addEventListener('click',()=>{
  const email=btn.dataset.demo==='gestor'?'gestor@unifahe.com.br':'vendedor@unifahe.com.br';
  emailInput.value=email; passwordInput.value='123456';
}));
$('#togglePassword').addEventListener('click',()=>{
  const show=passwordInput.type==='password'; passwordInput.type=show?'text':'password';
  $('#togglePassword').innerHTML=`<i data-lucide="${show?'eye-off':'eye'}"></i>`; refreshIcons();
});
$('#sidebarToggle').addEventListener('click',()=>{
  sidebar.classList.toggle('is-collapsed');
  localStorage.setItem('unifaheSidebarCollapsed',sidebar.classList.contains('is-collapsed')?'1':'0');
});
$('#mobileMenuButton').addEventListener('click',()=>{ sidebar.classList.add('mobile-open'); mobileOverlay.classList.add('visible'); });
mobileOverlay.addEventListener('click',closeMobileMenu);
$('#logoutButton').addEventListener('click',signOut);

async function signIn(user){
  currentUser=user; currentPage='inicio';
  userName.textContent=user.name; userRole.textContent=user.role==='gestor'?'Gestor':'Vendedor'; userAvatar.textContent=userInitials(user.name);
  loginView.classList.add('is-hidden'); appView.classList.remove('is-hidden');
  buildMenu(); await loadSales(); renderPage('inicio');
}
function signOut(){ currentUser=null; salesCache=[]; destroyCharts(); closeModal(); appView.classList.add('is-hidden'); loginView.classList.remove('is-hidden'); passwordInput.value=''; closeMobileMenu(); }
async function loadSales(){ const result=await SalesRepository.list(); salesCache=result.rows; dataSource=result.source; }
function closeMobileMenu(){ sidebar.classList.remove('mobile-open'); mobileOverlay.classList.remove('visible'); }

function buildMenu(){
  sidebarNav.innerHTML=''; let section='';
  getMenuItems().forEach(item=>{
    if(item.section!==section){ section=item.section; sidebarNav.insertAdjacentHTML('beforeend',`<div class="nav-section-label">${section}</div>`); }
    const btn=document.createElement('button');
    btn.className=`nav-item${item.id===currentPage?' active':''}`; btn.dataset.page=item.id;
    btn.innerHTML=`<span class="nav-icon"><i data-lucide="${item.icon}"></i></span><span class="nav-label">${item.label}</span>`;
    btn.onclick=()=>{renderPage(item.id);closeMobileMenu();}; sidebarNav.append(btn);
  });
  refreshIcons();
}

function renderPage(id){
  closeModal(); currentPage=id;
  document.querySelectorAll('.nav-item[data-page]').forEach(el=>el.classList.toggle('active',el.dataset.page===id));
  if(id==='inicio'){ pageTitle.textContent='Início'; return currentUser.role==='gestor'?renderDashboard({mode:'geral'}):renderDashboard({mode:'individual',seller:currentUser.name}); }
  if(id==='vendas'){ pageTitle.textContent='Vendas'; return renderSales(); }
  if(id==='dashboard-geral'){ pageTitle.textContent='Dashboard geral'; return renderDashboard({mode:'geral'}); }
  if(id==='dashboard-vendedor'){ pageTitle.textContent='Dashboard vendedor'; return renderDashboard({mode:'individual',seller:currentUser.role==='vendedor'?currentUser.name:''}); }
  const [title,desc]=PAGE_COPY[id]||['Módulo','Estrutura pronta para receber conteúdo.'];
  pageTitle.textContent=title;
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
    noReceipt:rows.filter(r=>!r.receipt_path).length
  };
}

function renderSales(){
  const ownRows=currentUser.role==='gestor'?salesCache:salesCache.filter(r=>r.seller_name===currentUser.name);
  const summary=salesSummary(ownRows);
  const sourceLabel=dataSource==='database'?'Banco de dados principal':'Demonstração local';
  content.innerHTML=`
    <section class="sales-command">
      <div class="sales-title-copy">
        <span class="eyebrow">OPERAÇÃO COMERCIAL</span>
        <h2>Vendas</h2>
        <div class="sales-sector-note"><i data-lucide="database"></i><span><strong>${sourceLabel}</strong> • Dashboard alimentado por Vendas; a planilha permanece como espelho em segundo plano.</span></div>
        <div class="audit-overview"><span><i class="dot pending"></i>${summary.pending} pendentes</span><span><i class="dot ok"></i>${summary.ok} OK</span><span><i class="dot not-ok"></i>${summary.notOk} não OK</span><span><i data-lucide="paperclip"></i>${summary.noReceipt} sem comprovante</span></div>
      </div>
      <div class="sales-command-summary" aria-label="Resumo das vendas">
        <div class="sales-stat"><span>Vendas</span><strong>${summary.count}</strong></div>
        <div class="sales-stat"><span>Valor total</span><strong>${money.format(summary.total)}</strong></div>
        <div class="sales-stat"><span>Matrículas</span><strong>${summary.courses}</strong></div>
      </div>
      <button id="toggleSaleForm" class="primary-action sales-add-button"><i data-lucide="plus"></i>Adicionar venda</button>
    </section>
    <section id="saleFormPanel" class="sale-entry-panel is-collapsed"></section>
    <section class="sales-list-section">
      <div class="section-heading">
        <div><span class="section-kicker">REGISTROS</span><h3>Vendas lançadas</h3><p>Clique em uma linha para consultar os detalhes do lançamento.</p></div>
        <div class="table-actions"><input id="salesSearch" class="compact-input" placeholder="Buscar aluno, curso ou vendedor"/><select id="salesPaymentFilter" class="compact-select"><option value="">Todos os pagamentos</option>${PAYMENT_TYPES.map(p=>`<option value="${p.value}">${p.label}</option>`).join('')}</select></div>
      </div>
      <div class="sales-filter-line" aria-label="Filtros de auditoria">
        ${salesStatusFilterButton('all','Todas',summary.count)}
        ${salesStatusFilterButton('pending','Pendentes',summary.pending)}
        ${salesStatusFilterButton('ok','OK',summary.ok)}
        ${salesStatusFilterButton('not_ok','Não OK',summary.notOk)}
        ${salesStatusFilterButton('no_receipt','Sem comprovante',summary.noReceipt)}
      </div>
      <div id="salesTableWrap" class="sales-table-wrap"></div>
    </section>`;

  $('#toggleSaleForm').onclick=()=>{
    const panel=$('#saleFormPanel'); panel.classList.toggle('is-collapsed');
    if(!panel.dataset.ready) mountSaleForm(panel);
    $('#toggleSaleForm').innerHTML=panel.classList.contains('is-collapsed')?'<i data-lucide="plus"></i>Adicionar venda':'<i data-lucide="x"></i>Fechar lançamento'; refreshIcons();
  };
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
  return `<button type="button" class="sales-filter-chip ${activeSalesStatusFilter===value?'active':''}" data-sales-status="${value}"><span>${label}</span><strong>${count}</strong></button>`;
}

function mountSaleForm(panel){
  panel.dataset.ready='1';
  const sellerControl=currentUser.role==='gestor'
    ?`<label class="form-field"><span>Vendedor</span><select name="seller_name" required><option value="">Selecione</option>${SELLERS.map(v=>`<option>${v}</option>`).join('')}</select></label>`
    :`<label class="form-field"><span>Vendedor</span><div class="readonly-value"><i data-lucide="user-check"></i>${escapeHTML(currentUser.name)}</div><input type="hidden" name="seller_name" value="${escapeHTML(currentUser.name)}"></label>`;
  panel.innerHTML=`<form id="saleForm" class="sale-form">
    <div class="sale-form-head"><div><span class="section-kicker">NOVA VENDA</span><h3>Informações do lançamento</h3></div><span class="form-note"><i data-lucide="database"></i>Banco primeiro • planilha em segundo plano</span></div>
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
    const result=await SalesRepository.create(sale); salesCache.unshift(result.sale); dataSource=result.source;
    toast(result.source==='database'?'Venda salva no banco de dados.':'Venda salva no modo local de demonstração.'); renderSales();
  } catch(e){ toast(e.message||'Não foi possível salvar a venda.','error'); submit.disabled=false; submit.innerHTML='<i data-lucide="save"></i>Salvar venda'; refreshIcons(); }
}

function filterSalesRows(baseRows){
  const term=($('#salesSearch')?.value||'').toLowerCase();
  const pay=$('#salesPaymentFilter')?.value||'';
  return baseRows.filter(r=>{
    const matchesPay=!pay||r.payment_type===pay;
    const matchesTerm=!term||[r.student_name,r.seller_name,r.course,r.modality,r.origin].join(' ').toLowerCase().includes(term);
    const matchesStatus=activeSalesStatusFilter==='all'
      || (activeSalesStatusFilter==='no_receipt' ? !r.receipt_path : r.audit_status===activeSalesStatusFilter);
    return matchesPay&&matchesTerm&&matchesStatus;
  }).sort((a,b)=>b.sale_date.localeCompare(a.sale_date)||String(b.created_at).localeCompare(String(a.created_at)));
}

function auditInfo(status){
  if(status==='ok') return {icon:'badge-check',label:'OK',title:'Venda validada',cls:'ok'};
  if(status==='not_ok') return {icon:'circle-x',label:'Não OK',title:'Venda não validada',cls:'not-ok'};
  return {icon:'clock-3',label:'Pendente',title:'Pendente de auditoria',cls:'pending'};
}

function renderSalesTable(baseRows){
  const wrap=$('#salesTableWrap'); if(!wrap) return;
  const rows=filterSalesRows(baseRows);
  if(!rows.length){ wrap.innerHTML=`<div class="empty-sales"><i data-lucide="receipt-text"></i><strong>Nenhuma venda encontrada</strong><span>Ajuste os filtros ou faça um novo lançamento.</span></div>`; refreshIcons(); return; }
  wrap.innerHTML=`<table class="sales-table"><thead><tr><th class="audit-col">Auditoria</th><th>Data</th><th>Aluno</th><th>Vendedor</th><th>Pagamento</th><th>Modalidade / curso</th><th>Origem</th><th class="num">Qtd.</th><th class="num">Total</th><th class="receipt-col">Comprovante</th></tr></thead><tbody>${rows.map(saleRowsMarkup).join('')}</tbody></table>`;

  wrap.querySelectorAll('[data-sale-main]').forEach(row=>row.addEventListener('click',()=>{
    const details=wrap.querySelector(`[data-sale-details="${row.dataset.saleMain}"]`); if(details) details.classList.toggle('is-hidden');
  }));
  wrap.querySelectorAll('[data-audit-sale]').forEach(btn=>btn.addEventListener('click',event=>{
    event.stopPropagation();
    if(currentUser.role!=='gestor') return;
    openAuditModal(btn.dataset.auditSale);
  }));
  wrap.querySelectorAll('[data-receipt-sale]').forEach(btn=>btn.addEventListener('click',event=>{
    event.stopPropagation(); openReceiptModal(btn.dataset.receiptSale);
  }));
  refreshIcons();
}

function saleRowsMarkup(r){
  const audit=auditInfo(r.audit_status);
  const auditDisabled=currentUser.role==='gestor'?'':'disabled';
  const receiptClass=r.receipt_path?'has-file':'empty';
  const receiptIcon=r.receipt_path?'file-check-2':'paperclip';
  return `<tr class="sale-main-row" data-sale-main="${r.id}">
    <td class="audit-col"><button type="button" class="audit-status ${audit.cls}" data-audit-sale="${r.id}" ${auditDisabled} title="${currentUser.role==='gestor'?'Definir auditoria':audit.title}"><i data-lucide="${audit.icon}"></i><span>${audit.label}</span></button></td>
    <td><span class="date-cell">${formatDateBR(r.sale_date)}</span></td>
    <td><strong>${escapeHTML(r.student_name)}</strong><small>${escapeHTML(r.state)}</small></td>
    <td>${escapeHTML(r.seller_name)}</td>
    <td><span class="payment-badge ${r.payment_type}">${paymentLabel(r.payment_type)}</span>${r.installments?`<small>${r.installments}x${r.payment_type==='boleto'&&r.fee_value?` de ${money.format(r.fee_value)}`:''}</small>`:''}</td>
    <td><strong>${escapeHTML(r.modality)}</strong><small>${escapeHTML(r.course)}</small></td>
    <td>${escapeHTML(r.origin)}</td><td class="num">${r.course_quantity}</td><td class="num money-cell">${money.format(r.total_value)}</td>
    <td class="receipt-col"><button type="button" class="receipt-button ${receiptClass}" data-receipt-sale="${r.id}" title="${r.receipt_path?'Abrir comprovante':'Adicionar comprovante'}"><i data-lucide="${receiptIcon}"></i>${r.receipt_path?'<span class="receipt-dot"></span>':''}</button></td>
  </tr>
  <tr class="sale-details-row is-hidden" data-sale-details="${r.id}"><td colspan="10"><div class="sale-details-inner">
    <span><b>Estado</b>${escapeHTML(r.state)}</span><span><b>Parcelas</b>${r.installments?`${r.installments}x`:'—'}</span><span><b>Taxa/parcela</b>${r.fee_value?money.format(r.fee_value):'—'}</span><span><b>Pendência</b>${r.pending?escapeHTML(r.pending):'—'}</span><span><b>Auditoria</b>${audit.label}${r.audited_by?` • ${escapeHTML(r.audited_by)}`:''}</span><span><b>Comprovante</b>${r.receipt_name?escapeHTML(r.receipt_name):'Não anexado'}</span><span><b>ID</b>${escapeHTML(r.id)}</span>
  </div></td></tr>`;
}

function replaceSale(updated){
  salesCache=salesCache.map(row=>row.id===updated.id?updated:row);
}

function openAuditModal(id){
  const sale=salesCache.find(r=>r.id===id); if(!sale) return;
  openModal(`<div class="mini-modal audit-modal">
    <div class="modal-head"><div><span class="section-kicker">AUDITORIA</span><h3>Venda está válida?</h3><p>${escapeHTML(sale.student_name)} • ${money.format(sale.total_value)}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div>
    <div class="audit-choice-grid">
      <button type="button" class="audit-choice ok ${sale.audit_status==='ok'?'selected':''}" data-audit-choice="ok"><i data-lucide="badge-check"></i><span><strong>Venda OK</strong><small>Confirma a venda como válida.</small></span></button>
      <button type="button" class="audit-choice not-ok ${sale.audit_status==='not_ok'?'selected':''}" data-audit-choice="not_ok"><i data-lucide="circle-x"></i><span><strong>Venda não OK</strong><small>Desconsidera a venda dos dashboards.</small></span></button>
    </div>
    ${sale.audited_at?`<div class="modal-meta">Última definição: ${formatDateTimeBR(sale.audited_at)}${sale.audited_by?` por ${escapeHTML(sale.audited_by)}`:''}</div>`:''}
  </div>`);
  modalHost.querySelectorAll('[data-audit-choice]').forEach(btn=>btn.addEventListener('click',async()=>{
    const buttons=[...modalHost.querySelectorAll('[data-audit-choice]')]; buttons.forEach(x=>x.disabled=true);
    try{
      const result=await SalesRepository.updateAudit(id,btn.dataset.auditChoice,currentUser.name); replaceSale(result.sale); dataSource=result.source; closeModal(); toast('Auditoria atualizada.'); renderSales();
    }catch(e){ buttons.forEach(x=>x.disabled=false); toast(e.message||'Não foi possível atualizar a auditoria.','error'); }
  }));
}

function openReceiptModal(id){
  const sale=salesCache.find(r=>r.id===id); if(!sale) return;
  openModal(`<div class="mini-modal receipt-modal">
    <div class="modal-head"><div><span class="section-kicker">COMPROVANTE</span><h3>Documento da venda</h3><p>${escapeHTML(sale.student_name)} • ${formatDateBR(sale.sale_date)}</p></div><button class="modal-close" data-close-modal><i data-lucide="x"></i></button></div>
    ${sale.receipt_path?`<div class="current-receipt"><span class="file-icon"><i data-lucide="file-check-2"></i></span><div><strong>${escapeHTML(sale.receipt_name||'Comprovante')}</strong><small>${fileSize(sale.receipt_size)}${sale.receipt_uploaded_at?` • ${formatDateTimeBR(sale.receipt_uploaded_at)}`:''}</small></div><div class="current-receipt-actions"><button type="button" data-view-receipt title="Visualizar"><i data-lucide="external-link"></i></button><button type="button" data-delete-receipt title="Excluir"><i data-lucide="trash-2"></i></button></div></div>`:''}
    <label class="receipt-drop" id="receiptDrop"><input id="receiptFile" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.odt" hidden><i data-lucide="cloud-upload"></i><strong>${sale.receipt_path?'Substituir comprovante':'Adicionar comprovante'}</strong><span>PDF, imagem ou documento • até 3 MB</span><small id="receiptSelected">Clique ou arraste um arquivo</small></label>
    <div class="modal-actions"><button type="button" class="secondary-action" data-close-modal>Cancelar</button><button type="button" class="primary-action" id="uploadReceipt" disabled><i data-lucide="upload"></i>Salvar comprovante</button></div>
  </div>`);

  const input=$('#receiptFile'), drop=$('#receiptDrop'), selected=$('#receiptSelected'), upload=$('#uploadReceipt');
  const setFile=file=>{
    if(!file) return;
    if(file.size>SalesRepository.MAX_RECEIPT_BYTES){ toast('O comprovante deve ter no máximo 3 MB.','error'); input.value=''; upload.disabled=true; return; }
    selected.textContent=`${file.name} • ${fileSize(file.size)}`; upload.disabled=false;
  };
  input.addEventListener('change',()=>setFile(input.files[0]));
  ['dragenter','dragover'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.add('dragging');}));
  ['dragleave','drop'].forEach(type=>drop.addEventListener(type,e=>{e.preventDefault();drop.classList.remove('dragging');}));
  drop.addEventListener('drop',e=>{ const file=e.dataTransfer.files[0]; if(!file)return; const dt=new DataTransfer(); dt.items.add(file); input.files=dt.files; setFile(file); });
  upload.addEventListener('click',async()=>{
    const file=input.files[0]; if(!file)return; upload.disabled=true; upload.innerHTML='<i data-lucide="loader-circle" class="spin"></i>Enviando'; refreshIcons();
    try{ const result=await SalesRepository.saveReceipt(id,file); replaceSale(result.sale); dataSource=result.source; closeModal(); toast('Comprovante salvo.'); renderSales(); }
    catch(e){ upload.disabled=false; upload.innerHTML='<i data-lucide="upload"></i>Salvar comprovante'; refreshIcons(); toast(e.message||'Não foi possível salvar o comprovante.','error'); }
  });
  modalHost.querySelector('[data-view-receipt]')?.addEventListener('click',async()=>{
    const win=window.open('about:blank','_blank');
    try{ const url=await SalesRepository.receiptUrl(sale); if(!url) throw new Error('Arquivo não encontrado.'); if(win) win.location.href=url; }
    catch(e){ if(win)win.close(); toast(e.message||'Não foi possível abrir o comprovante.','error'); }
  });
  modalHost.querySelector('[data-delete-receipt]')?.addEventListener('click',async()=>{
    if(!confirm('Excluir o comprovante desta venda?')) return;
    try{ const result=await SalesRepository.removeReceipt(id); replaceSale(result.sale); dataSource=result.source; closeModal(); toast('Comprovante excluído.'); renderSales(); }
    catch(e){ toast(e.message||'Não foi possível excluir o comprovante.','error'); }
  });
}

function openModal(html){
  modalHost.innerHTML=`<div class="modal-backdrop"><div class="modal-stage">${html}</div></div>`;
  modalHost.querySelector('.modal-backdrop').addEventListener('mousedown',e=>{ if(e.target.classList.contains('modal-backdrop')) closeModal(); });
  modalHost.querySelectorAll('[data-close-modal]').forEach(btn=>btn.addEventListener('click',closeModal));
  document.addEventListener('keydown',modalEscape); refreshIcons();
}
function modalEscape(e){ if(e.key==='Escape')closeModal(); }
function closeModal(){ if(!modalHost)return; modalHost.innerHTML=''; document.removeEventListener('keydown',modalEscape); }

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
    <div class="dashboard-title-block"><span class="eyebrow">${mode==='geral'?'GESTÃO COMERCIAL':'DESEMPENHO INDIVIDUAL'}</span><h2>${mode==='geral'?'Dashboard geral':'Dashboard vendedor'}</h2><p>${mode==='geral'?'Leitura consolidada do comercial em uma única visão.':'Resultados do vendedor calculados diretamente a partir de Vendas.'}</p></div>
    <div class="dashboard-controls">
      <div class="dashboard-control-row">
        ${mode==='geral'?`<button id="switchDashboard" class="orange-action"><i data-lucide="user-round"></i>Individual</button>`:`${currentUser.role==='gestor'?'<button id="switchDashboard" class="navy-action"><i data-lucide="layout-dashboard"></i>Geral</button>':''}`}
        ${mode==='individual'&&canChooseSeller?`<label class="filter-field seller-filter"><span>VENDEDOR</span><select id="dashSeller">${SELLERS.map(v=>`<option ${v===selectedSeller?'selected':''}>${v}</option>`).join('')}</select></label>`:''}
        <div class="date-filter"><label class="filter-field"><span>DE</span><input id="dashFrom" type="date" value="${from}"></label><label class="filter-field"><span>ATÉ</span><input id="dashTo" type="date" value="${to}"></label><button id="applyDash" class="navy-action"><i data-lucide="sliders-horizontal"></i>Filtrar</button></div>
      </div>
      <div class="dashboard-utility-row"><button id="saveDashboard" class="toolbar-action"><i data-lucide="bookmark-plus"></i>Salvar</button><button id="openSavedDashboards" class="toolbar-action"><i data-lucide="folder-clock"></i>Dashboards salvos</button></div>
    </div>
  </section>
  <section id="savedDashboardsPanel" class="saved-dashboards-panel is-hidden"></section>

  <section class="dashboard-summary-strip">
    ${summaryMetric('banknote','Faturado','mFaturado')}
    ${summaryMetric('graduation-cap','Matrículas','mMatriculas')}
    ${summaryMetric('barcode','Boletos','mBoletos')}
    ${summaryMetric('credit-card','Cartão','mCartao')}
    ${summaryMetric('coins','Taxa boleto','mTaxa')}
    ${summaryMetric('receipt-text','Vendas','mVendas')}
  </section>
  <section class="dashboard-daily-strip"><span class="daily-label"><i data-lucide="calendar-days"></i>Dia selecionado</span>${dailyMetric('Faturado','dFaturado')}${dailyMetric('Matrículas','dMatriculas')}${dailyMetric('Cartão','dCartao')}${dailyMetric('Boletos','dBoletos')}${dailyMetric('Taxa','dTaxa')}</section>

  <section class="goals-section">
    <div class="goals-heading"><span class="section-kicker">METAS DO MÊS</span><strong id="goalMonthLabel">—</strong><small>Realizado, meta e saldo restante na mesma leitura.</small></div>
    ${goalRow('Faturamento','goalRevenueInput',goals.revenue||'','R$ 0,00','goalRevenueText','goalRevenueMissing','revenueProgress','revenuePctText','banknote')}
    ${goalRow('Matrículas','goalEnrollInput',goals.enroll||'','0','goalEnrollText','goalEnrollMissing','enrollProgress','enrollPctText','graduation-cap',true)}
  </section>

  <section class="dashboard-charts">
    <article class="chart-panel chart-wide"><div class="panel-heading"><div><span>EVOLUÇÃO</span><h3>Projeção das metas</h3></div><i data-lucide="chart-no-axes-combined"></i></div><div class="chart-box large"><canvas id="projectionChart"></canvas></div></article>
    <article class="chart-panel"><div class="panel-heading"><div><span>COMPOSIÇÃO</span><h3>Distribuição por pagamento</h3></div><i data-lucide="chart-pie"></i></div><div class="chart-box"><canvas id="distributionChart"></canvas></div></article>
    <article class="chart-panel chart-full"><div class="panel-heading"><div><span>MODALIDADES</span><h3>Faturamento por modalidade</h3></div><i data-lucide="chart-column-big"></i></div><div class="chart-box medium"><canvas id="categoryChart"></canvas></div></article>
  </section>
  <p id="dashboardBase" class="dashboard-base-note"></p>`;
}
function summaryMetric(icon,label,id){ return `<div class="summary-metric"><span class="summary-metric-icon"><i data-lucide="${icon}"></i></span><div><span>${label}</span><strong id="${id}">—</strong></div></div>`; }
function dailyMetric(label,id){ return `<div class="daily-metric"><span>${label}</span><strong id="${id}">—</strong></div>`; }
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
  $('#dashboardBase').textContent=`Base: Vendas • ${formatDateBR(from)} até ${formatDateBR(to)}${seller?` • ${seller}`:''} • vendas marcadas como “não OK” não entram nos indicadores.`;
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

if(localStorage.getItem('unifaheSidebarCollapsed')==='1') sidebar.classList.add('is-collapsed');
setTimeout(refreshIcons,0);
