/* =========================================================================
 * app.js — inicialização, autenticação, navegação e renderização
 * ========================================================================= */
import * as db from './db.js';
import { S, ls, carregar, limpar, aoMudar, ctx, matriculas, rotuloMatricula, selecionarMatricula, alertasAtivos, agendarAlertas, recarregarSilencioso, irPara } from './state.js';
import { destruirTodos } from './charts.js';
import { esc, icone, $, $$, toast } from './ui.js';
import { ROTULO_PARCIAL as PARCIAL } from './calc.js';
import { aplicarCores } from './views/configuracoes.js';

const NAV = [
  ['dashboard', 'Dashboard', 'dashboard'], ['notas', 'Notas e Avaliações', 'notas'], ['disciplinas', 'Disciplinas', 'livro'], ['analise', 'Análise de Desempenho', 'analise'],
  ['alertas', 'Alertas', 'alerta'], ['simulador', 'Simulador de Notas', 'simulador'], ['planejamento', 'Planejamento de Estudos', 'plano'], ['historico', 'Histórico Escolar', 'historico'],
  ['relatorios', 'Relatórios', 'relatorio'], ['config', 'Configurações', 'config'],
];
const VIEWS = {
  dashboard: () => import('./views/dashboard.js'), notas: () => import('./views/notas.js'), disciplinas: () => import('./views/disciplinas.js'), analise: () => import('./views/analise.js'),
  alertas: () => import('./views/alertas.js'), simulador: () => import('./views/simulador.js'), planejamento: () => import('./views/planejamento.js'), historico: () => import('./views/historico.js'),
  relatorios: () => import('./views/relatorios.js'), config: () => import('./views/configuracoes.js'), setup: () => import('./views/setup.js'),
};
export { irPara };

const el = { boot: $('#boot'), login: $('#tela-login'), app: $('#app'), side: $('#sidebar'), fundo: $('#sidebar-fundo'), top: $('#topbar'), cont: $('#conteudo'), faixa: $('#faixa-parcial') };
let viewAtual = null; let ultimoCarregamento = 0; let renderizando = false;

/* ---------- tema ---------- */
function aplicarTema(t) { document.documentElement.dataset.tema = t; const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = t === 'light' ? '#f3f5fb' : '#0b1020'; }
S.tema = ls.get('tema') || (matchMedia && matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
aplicarTema(S.tema);

/* ---------- telas de estado ---------- */
function mostrar(qual) { el.boot.hidden = qual !== 'boot'; el.login.hidden = qual !== 'login'; el.app.hidden = qual !== 'app'; }

function telaConfigurar() {
  mostrar('login');
  el.login.innerHTML = `<div class="card"><div class="marca"><div class="logo">${icone('cap', 22)}</div><div>Acompanhamento Escolar</div></div><h2>Configuração necessária</h2>
    <p class="t2">Falta informar a URL e a chave <b>anon</b> do seu projeto Supabase.</p><ol class="small t2"><li>Abra o arquivo <code>js/config.js</code>.</li><li>Cole a <b>Project URL</b> e a chave <b>anon public</b> (Supabase → Project Settings → API).</li><li>Salve, envie ao GitHub e recarregue esta página.</li></ol>
    <p class="xs muted">Passo a passo completo em <code>docs/GUIA_SUPABASE.md</code>. Nunca use a chave <code>service_role</code>.</p></div>`;
}
function telaLogin(msg = '') {
  mostrar('login');
  el.login.innerHTML = `<div class="card"><div class="marca"><div class="logo">${icone('cap', 22)}</div><div>Acompanhamento Escolar<small>Acesso privado</small></div></div>
    <form id="f-login" novalidate><div class="field"><label for="lg-email">E-mail</label><input type="email" id="lg-email" autocomplete="username" required></div>
    <div class="field" style="margin-top:.8rem"><label for="lg-senha">Senha</label><input type="password" id="lg-senha" autocomplete="current-password" required></div>
    <div class="form-erro" id="lg-erro" ${msg ? '' : 'hidden'}>${esc(msg)}</div>
    <button class="btn primario" style="width:100%;margin-top:1rem" type="submit" id="lg-go">Entrar</button></form>
    <p class="xs muted" style="margin-top:1rem">${icone('cadeado', 12)} Os dados da estudante ficam protegidos por login e regras de segurança do banco.</p></div>`;
  $('#lg-email').focus();
  $('#f-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const em = $('#lg-email').value.trim(); const se = $('#lg-senha').value; const er = $('#lg-erro'); const b = $('#lg-go');
    if (!em || !se) { er.textContent = 'Informe e-mail e senha.'; er.hidden = false; return; }
    b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Entrando…'; er.hidden = true;
    try { await db.entrar(em, se); } catch (x) { er.textContent = x.message; er.hidden = false; b.disabled = false; b.textContent = 'Entrar'; }
  });
}

/* ---------- estrutura (menu e topo) ---------- */
function desenharCasca() {
  el.side.innerHTML = `<div class="marca"><div class="logo">${icone('cap', 22)}</div><div>Acompanhamento<br>Escolar<small>Gestão e inteligência de desempenho</small></div></div>
    <nav class="nav" aria-label="Seções">${NAV.map(([k, r, i]) => `<a href="#${k}" data-nav="${k}">${icone(i, 19)}<span>${r}</span>${k === 'alertas' ? '<span class="contador" id="cont-alertas" hidden></span>' : ''}</a>`).join('')}</nav>
    <div class="sidebar-rodape"><span id="rodape-usuario"></span></div>`;
  el.top.innerHTML = `<button class="btn fantasma btn-ico menu-btn" id="btn-menu" aria-label="Abrir menu">${icone('menu', 22)}</button>
    <select id="sel-matricula" aria-label="Ano letivo e série"></select><div class="grow"></div>
    <span class="sync" id="sync" role="status" aria-live="polite"><i></i><span class="rot">Pronto</span></span>
    <button class="btn fantasma btn-ico" id="btn-sync" title="Sincronizar agora" aria-label="Sincronizar agora">${icone('refresh', 18)}</button>
    <button class="btn fantasma btn-ico" id="btn-tema" title="Alternar tema" aria-label="Alternar tema"></button>
    <button class="btn fantasma btn-ico" id="btn-sair" title="Sair" aria-label="Sair">${icone('sair', 18)}</button>`;
  $('#btn-menu').addEventListener('click', () => alternarMenu(true));
  el.fundo.addEventListener('click', () => alternarMenu(false));
  $$('[data-nav]', el.side).forEach((a) => a.addEventListener('click', () => alternarMenu(false)));
  $('#sel-matricula').addEventListener('change', (e) => selecionarMatricula(e.target.value));
  $('#btn-sync').addEventListener('click', async () => { try { await carregar(); toast('Dados sincronizados.', 'ok'); } catch (e) { toast(e.message, 'erro'); } });
  $('#btn-tema').addEventListener('click', async () => { const t = S.tema === 'dark' ? 'light' : 'dark'; try { const { salvarPrefs } = await import('./state.js'); await salvarPrefs({ tema: t }); } catch (e) { aplicarTema(t); S.tema = t; toast(`Tema alterado, mas não foi salvo na conta: ${e.message}`, 'aviso'); } atualizarTopo(); });
  $('#btn-sair').addEventListener('click', sair);
}
function alternarMenu(a) { el.side.classList.toggle('aberta', a); el.fundo.classList.toggle('aberta', a); }
function atualizarTopo() {
  const sel = $('#sel-matricula'); if (!sel) return;
  const ms = matriculas();
  sel.innerHTML = ms.length ? ms.map((m) => `<option value="${m.mat.id}"${m.mat.id === S.matId ? ' selected' : ''}>${esc(m.est?.nome || '')} · ${esc(rotuloMatricula(m))}</option>`).join('') : '<option>Nenhum ano letivo</option>';
  sel.disabled = !ms.length;
  $('#btn-tema').innerHTML = icone(S.tema === 'dark' ? 'sol' : 'lua', 18);
  $('#rodape-usuario').textContent = S.user?.email || '';
  const n = S.carregado ? alertasAtivos().filter((a) => !a.lido).length : 0; const cA = $('#cont-alertas'); if (cA) { cA.hidden = !n; cA.textContent = n; }
  $$('[data-nav]', el.side).forEach((a) => { a.classList.toggle('ativo', a.dataset.nav === viewAtual); if (a.dataset.nav === viewAtual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const c = S.carregado && S.matId ? ctx() : null;
  const mostrarParcial = c && c.mat.situacao !== 'concluido' && c.geral.parcial && c.geral.media !== null && !['relatorios', 'historico', 'config'].includes(viewAtual);
  el.faixa.hidden = !mostrarParcial; if (mostrarParcial) el.faixa.textContent = `${PARCIAL} Há períodos ainda incompletos neste ano letivo.`;
}
function atualizarSync(s) {
  const p = $('#sync'); if (!p) return;
  const rot = s.estado === 'salvando' && s.pendentes > 1 ? `Alterações pendentes (${s.pendentes})` : db.ROTULO_SYNC[s.estado] || s.estado;
  p.className = `sync ${s.estado}`; p.querySelector('.rot').textContent = rot; p.title = s.erro || (s.quando ? `Última sincronização: ${s.quando.toLocaleTimeString('pt-BR')}` : '');
}

/* ---------- renderização ---------- */
function rota() { const h = (location.hash || '#dashboard').slice(1); return VIEWS[h] && h !== 'setup' ? h : 'dashboard'; }
async function renderView(navegou = false) {
  if (!S.carregado || renderizando) return;
  renderizando = true;
  try {
    const semAno = matriculas().length === 0;
    const nome = semAno && rota() !== 'config' ? 'setup' : rota();
    if (nome !== viewAtual) navegou = true;
    viewAtual = nome;
    const mod = await VIEWS[nome]();
    const y = window.scrollY;
    destruirTodos();
    atualizarTopo();
    el.cont.innerHTML = '';
    mod.render(el.cont);
    if (navegou) { window.scrollTo(0, 0); el.cont.focus({ preventScroll: true }); document.title = `${(NAV.find((n) => n[0] === nome) || [0, 'Início'])[1]} · Acompanhamento Escolar`; } else window.scrollTo(0, y);
  } catch (e) {
    console.error(e);
    el.cont.innerHTML = `<div class="card"><h3>Não foi possível exibir esta tela</h3><p class="form-erro">${esc(e.message)}</p><button class="btn" onclick="location.reload()">Recarregar</button></div>`;
  } finally { renderizando = false; }
}

/* ---------- sessão ---------- */
async function entrarNoApp(sessao) {
  S.user = sessao.user;
  mostrar('boot');
  try { await carregar(); } catch (e) { telaLogin(`Não foi possível carregar os dados: ${e.message}`); return; }
  aplicarTema(S.tema); aplicarCores();
  ultimoCarregamento = Date.now();
  mostrar('app'); desenharCasca(); atualizarSync({ ...db.sync });
  await renderView(true);
  agendarAlertas();
}
async function sair() { try { await db.sair(); } catch (_) { /* ignorar */ } }

async function iniciar() {
  if (!db.configurado()) { telaConfigurar(); return; }
  if (typeof window.supabase === 'undefined') { el.boot.innerHTML = '<p class="form-erro">Biblioteca do Supabase não carregada.</p>'; return; }
  db.aoMudarAuth((evento, sessao) => {
    if (evento === 'SIGNED_OUT') { limpar(); S.user = null; viewAtual = null; telaLogin(); }
    else if (evento === 'SIGNED_IN' && sessao && (!S.user || S.user.id !== sessao.user.id)) entrarNoApp(sessao);
  });
  db.onSync(atualizarSync);
  aoMudar(() => renderView(false));
  window.addEventListener('hashchange', () => renderView(true));
  document.addEventListener('sair', sair);
  window.addEventListener('online', async () => { if (S.carregado) { try { await recarregarSilencioso(); toast('Conexão restabelecida — dados sincronizados.', 'ok'); } catch (e) { toast(e.message, 'erro'); } } });
  window.addEventListener('offline', () => { atualizarSync({ estado: 'offline', pendentes: 0, erro: 'Sem conexão' }); toast('Sem conexão. Alterações não serão salvas até a conexão voltar.', 'aviso'); });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible' && S.carregado && db.sync.pendentes === 0 && Date.now() - ultimoCarregamento > 60000 && !document.querySelector('.modal-fundo')) {
      try { await recarregarSilencioso(); ultimoCarregamento = Date.now(); } catch (_) { /* silencioso */ }
    }
  });
  window.addEventListener('beforeunload', (e) => { if (db.sync.pendentes > 0) { e.preventDefault(); e.returnValue = ''; } });
  const sessao = await db.sessao();
  if (sessao) await entrarNoApp(sessao); else telaLogin();
}
iniciar().catch((e) => { console.error(e); el.boot.innerHTML = `<p class="form-erro">Erro ao iniciar: ${esc(e.message)}</p>`; });
