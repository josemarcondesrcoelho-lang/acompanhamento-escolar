/* =========================================================================
 * ui.js — componentes de interface: ícones, toast, modais, formulários
 * ========================================================================= */
import { STATUS_INFO, fmt } from './calc.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const P = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
  notas: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  livro: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>',
  analise: '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
  alerta: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  simulador: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h4"/>',
  plano: '<path d="M8 2v4M16 2v4"/><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M3 10h18M9 16l2 2 4-4"/>',
  historico: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  relatorio: '<path d="M6 2h9l5 5v15H6z"/><path d="M14 2v6h6M9 13h6M9 17h6"/>',
  config: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', mais: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>', lixo: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  check: '<path d="M20 6 9 17l-5-5"/>', sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  lua: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>', sair: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  cima: '<path d="m18 15-6-6-6 6"/>', baixo: '<path d="m6 9 6 6 6-6"/>', up: '<path d="M7 17 17 7M8 7h9v9"/>', down: '<path d="M7 7l10 10M17 8v9H8"/>', flat: '<path d="M5 12h14"/>',
  alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>', estrela: '<path d="m12 2 3.1 6.3 7 1-5 4.9 1.2 6.9L12 17.8 5.7 21.1 7 14.2 2 9.3l7-1z"/>',
  cadeado: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>', download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>', print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  refresh: '<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12A9 9 0 0 1 18.5 5.8L21 8M21 3v5h-5M3 21v-5h5"/>', cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>', grade: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  cards: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  media: '<path d="M3 3v18h18"/><rect x="7" y="12" width="3" height="6"/><rect x="12" y="8" width="3" height="10"/><rect x="17" y="5" width="3" height="13"/>',
  check2: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', raio: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  lupa: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', cerebro: '<path d="M9.5 2A2.5 2.5 0 0 0 7 4.5v0A2.5 2.5 0 0 0 4.5 7 2.5 2.5 0 0 0 3 9.5c0 1 .5 1.8 1.3 2.2A3 3 0 0 0 5 17.5 2.5 2.5 0 0 0 9.5 20 2.5 2.5 0 0 0 12 22V2z"/><path d="M14.5 2A2.5 2.5 0 0 1 17 4.5 2.5 2.5 0 0 1 19.5 7 2.5 2.5 0 0 1 21 9.5c0 1-.5 1.8-1.3 2.2A3 3 0 0 1 19 17.5 2.5 2.5 0 0 1 14.5 20 2.5 2.5 0 0 1 12 22"/>',
};
export const icone = (n, t = 18) => `<svg width="${t}" height="${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.info}</svg>`;

/* ---------- toast ---------- */
export function toast(msg, tipo = 'info', ms = 4200) {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`; el.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  el.innerHTML = `<div style="flex:1">${esc(msg)}</div>`;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), tipo === 'erro' ? Math.max(ms, 7000) : ms);
}

/* ---------- modal ---------- */
let pilha = [];
export function modal({ titulo, corpo, botoes = [], largura = 640, aoFechar, aoAbrir }) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo'; fundo.setAttribute('role', 'dialog'); fundo.setAttribute('aria-modal', 'true');
  fundo.innerHTML = `<div class="modal" style="--mw:${largura}px"><header><h2>${esc(titulo)}</h2><button class="btn fantasma btn-ico" data-fechar aria-label="Fechar">${icone('x')}</button></header><div class="m-corpo">${corpo}</div>${botoes.length ? '<footer></footer>' : ''}</div>`;
  const rodape = $('footer', fundo);
  const api = { el: fundo, fechar: () => { fundo.remove(); pilha = pilha.filter((x) => x !== api); aoFechar && aoFechar(); const t = pilha[pilha.length - 1]; if (t) t.el.querySelector('input,select,textarea,button')?.focus(); } };
  botoes.forEach((b) => {
    const bt = document.createElement('button'); bt.type = 'button'; bt.className = `btn ${b.classe || ''}`; bt.textContent = b.rotulo;
    if (b.id) bt.id = b.id;
    bt.addEventListener('click', () => b.acao(api, bt)); rodape.appendChild(bt);
  });
  fundo.addEventListener('mousedown', (e) => { if (e.target === fundo && !fundo.dataset.travado) api.fechar(); });
  $('[data-fechar]', fundo).addEventListener('click', api.fechar);
  fundo.addEventListener('keydown', (e) => { if (e.key === 'Escape') api.fechar(); });
  $('#modais').appendChild(fundo); pilha.push(api);
  (fundo.querySelector('input:not([type=hidden]),select,textarea') || fundo.querySelector('button'))?.focus();
  aoAbrir && aoAbrir(api);
  return api;
}

export function confirmar({ titulo = 'Confirmar', msg, rotulo = 'Confirmar', perigo = false }) {
  return new Promise((res) => {
    let feito = false;
    const fim = (v) => { if (!feito) { feito = true; res(v); } };
    modal({ titulo, corpo: `<p>${msg}</p>`, largura: 460, aoFechar: () => fim(false), botoes: [
      { rotulo: 'Cancelar', acao: (m) => { fim(false); m.fechar(); } },
      { rotulo, classe: perigo ? 'perigo' : 'primario', acao: (m) => { fim(true); m.fechar(); } },
    ] });
  });
}

/* ---------- formulário genérico ---------- */
export function campoHTML(c, v) {
  const id = `f_${c.n}`; const val = v ?? c.valor ?? '';
  const req = c.req ? ' required' : '';
  const dica = c.dica ? `<span class="dica">${esc(c.dica)}</span>` : '';
  let ctl;
  if (c.tipo === 'select') {
    ctl = `<select id="${id}" name="${c.n}"${req}>${(c.opcoes || []).map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  } else if (c.tipo === 'textarea') ctl = `<textarea id="${id}" name="${c.n}"${req}>${esc(val)}</textarea>`;
  else if (c.tipo === 'checkbox') return `<div class="field ${c.full ? 'full' : ''}"><label class="check"><input type="checkbox" id="${id}" name="${c.n}"${val ? ' checked' : ''}> ${esc(c.rotulo)}</label>${dica}</div>`;
  else if (c.tipo === 'number') ctl = `<input type="number" id="${id}" name="${c.n}" value="${esc(val)}" step="${c.step ?? 'any'}"${c.min !== undefined ? ` min="${c.min}"` : ''}${c.max !== undefined ? ` max="${c.max}"` : ''}${req} inputmode="decimal">`;
  else ctl = `<input type="${c.tipo || 'text'}" id="${id}" name="${c.n}" value="${esc(val)}"${req}${c.max ? ` maxlength="${c.max}"` : ''}${c.placeholder ? ` placeholder="${esc(c.placeholder)}"` : ''}>`;
  return `<div class="field ${c.full ? 'full' : ''}"><label for="${id}">${esc(c.rotulo)}${c.req ? ' *' : ''}</label>${ctl}${dica}</div>`;
}
export function lerForm(form, campos) {
  const o = {};
  campos.forEach((c) => {
    const el = form.elements[c.n]; if (!el) return;
    if (c.tipo === 'checkbox') o[c.n] = el.checked;
    else if (c.tipo === 'number') o[c.n] = el.value === '' ? null : Number(String(el.value).replace(',', '.'));
    else { const v = el.value.trim(); o[c.n] = v === '' ? null : v; }
  });
  return o;
}
/** Abre um formulário em modal. onSubmit(valores) deve lançar Error para mostrar a mensagem sem fechar. */
export function formModal({ titulo, campos, valores = {}, salvar = 'Salvar', onSubmit, largura = 640, extraTopo = '', validar }) {
  const corpo = `<form id="form-modal" novalidate>${extraTopo}<div class="form-grid">${campos.map((c) => campoHTML(c, valores[c.n])).join('')}</div><div class="form-erro" hidden></div></form>`;
  const m = modal({ titulo, corpo, largura, botoes: [
    { rotulo: 'Cancelar', acao: (mm) => mm.fechar() },
    { rotulo: salvar, classe: 'primario', id: 'btn-salvar-form', acao: () => form.requestSubmit() },
  ] });
  const form = $('#form-modal', m.el); const erro = $('.form-erro', m.el); const btn = $('#btn-salvar-form', m.el);
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); erro.hidden = true;
    $$('.invalido', form).forEach((x) => x.classList.remove('invalido'));
    for (const c of campos) {
      const el = form.elements[c.n];
      if (c.req && el && c.tipo !== 'checkbox' && String(el.value).trim() === '') { el.classList.add('invalido'); el.focus(); erro.textContent = `Preencha o campo "${c.rotulo}".`; erro.hidden = false; return; }
      if (c.tipo === 'number' && el && el.value !== '') {
        const n = Number(String(el.value).replace(',', '.'));
        if (!Number.isFinite(n) || (c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) { el.classList.add('invalido'); el.focus(); erro.textContent = `"${c.rotulo}" deve estar entre ${c.min ?? '−∞'} e ${c.max ?? '∞'}.`; erro.hidden = false; return; }
      }
    }
    const v = lerForm(form, campos);
    const msg = validar && validar(v); if (msg) { erro.textContent = msg; erro.hidden = false; return; }
    btn.disabled = true; const rot = btn.textContent; btn.innerHTML = '<span class="spinner sm"></span> Salvando…';
    try { await onSubmit(v); m.fechar(); toast('Salvo com sucesso.', 'ok'); }
    catch (err) { erro.textContent = err.message || 'Erro ao salvar.'; erro.hidden = false; btn.disabled = false; btn.textContent = rot; }
  });
  return m;
}

/* ---------- peças de apresentação ---------- */
export function badgeStatus(status, parcial = false) {
  const i = STATUS_INFO[status] || STATUS_INFO.sem_dados;
  return `<span class="badge ${i.classe}">${i.rotulo}</span>${parcial && status !== 'sem_dados' ? ' <span class="badge parcial" title="Média parcial — resultado não definitivo.">Parcial</span>' : ''}`;
}
export const corStatus = (s) => (STATUS_INFO[s] || STATUS_INFO.sem_dados).cor;
export function tendIcone(rotulo) {
  if (rotulo === 'positiva') return `<span class="tend up">${icone('up', 14)} Alta</span>`;
  if (rotulo === 'negativa') return `<span class="tend down">${icone('down', 14)} Queda</span>`;
  if (rotulo === 'estavel') return `<span class="tend flat">${icone('flat', 14)} Estável</span>`;
  return '<span class="tend flat">—</span>';
}
export function deltaHTML(d, casas = 2) {
  if (d === null || d === undefined || !Number.isFinite(d)) return '';
  if (Math.abs(d) < 0.005) return `<span class="tend flat">${icone('flat', 13)} 0,00 vs. período anterior</span>`;
  return `<span class="tend ${d > 0 ? 'up' : 'down'}">${icone(d > 0 ? 'up' : 'down', 13)} ${d > 0 ? '+' : ''}${fmt(d, casas)} vs. período anterior</span>`;
}
export const notaHTML = (v, regra, casas = 2) => {
  if (v === null || v === undefined || !Number.isFinite(Number(v))) return '<span class="nota-vazia">—</span>';
  return `<span class="${Number(v) < (regra?.media_aprovacao ?? 7) - 1e-9 ? 'nota-baixa' : 'nota-ok'}">${fmt(v, casas)}</span>`;
};
export function opcoesSelect(lista, sel, vazio) {
  return (vazio !== undefined ? `<option value="">${esc(vazio)}</option>` : '') + lista.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(sel) ? ' selected' : ''}>${esc(l)}</option>`).join('');
}
export const vazioHTML = (titulo, texto, acao = '') => `<div class="vazio"><h3>${esc(titulo)}</h3><p>${texto}</p>${acao}</div>`;
export function baixarArquivo(nome, conteudo, tipo = 'text/plain;charset=utf-8') {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
