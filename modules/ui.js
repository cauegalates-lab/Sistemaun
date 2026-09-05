import { escapeHTML } from './utils.js';

export function loadingState(message='Carregando...'){
  return `<section class="system-state is-loading" role="status" aria-live="polite"><span class="system-state-icon"><i data-lucide="loader-circle" class="spin"></i></span><strong>${escapeHTML(message)}</strong></section>`;
}

export function errorState(message='Não foi possível carregar esta área.'){
  return `<section class="system-state is-error" role="alert"><span class="system-state-icon"><i data-lucide="circle-alert"></i></span><strong>${escapeHTML(message)}</strong><span>Tente novamente em instantes.</span></section>`;
}

export function emptyState({icon='inbox',title='Nenhum registro encontrado',description='',action=''}={}){
  return `<div class="empty-state"><span class="empty-state-icon"><i data-lucide="${escapeHTML(icon)}"></i></span><strong>${escapeHTML(title)}</strong>${description?`<p>${escapeHTML(description)}</p>`:''}${action||''}</div>`;
}

export function pageHeader({eyebrow='',title='',description='',actions='',meta='',className=''}={}){
  return `<section class="page-header ${escapeHTML(className)}">
    <div class="page-header-copy">${eyebrow?`<span class="eyebrow">${escapeHTML(eyebrow)}</span>`:''}<h2>${escapeHTML(title)}</h2>${description?`<p>${escapeHTML(description)}</p>`:''}</div>
    ${actions||meta?`<div class="page-header-actions">${meta||''}${actions||''}</div>`:''}
  </section>`;
}

export function sectionHeader({eyebrow='',title='',description='',aside='',className=''}={}){
  return `<div class="section-header ${escapeHTML(className)}"><div>${eyebrow?`<span class="section-kicker">${escapeHTML(eyebrow)}</span>`:''}<h3>${escapeHTML(title)}</h3>${description?`<p>${escapeHTML(description)}</p>`:''}</div>${aside?`<div class="section-header-aside">${aside}</div>`:''}</div>`;
}
