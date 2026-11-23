/* =========================================================================
 * state.js — estado da aplicação, derivação de dados e operações de escrita
 * ========================================================================= */
import * as db from './db.js';
import { mergeRegra, calcDisciplina, calcGeral } from './calc.js';
import { gerarAlertas, diagnosticoDisciplina, prioridadeEstudo } from './analysis.js';

export const S = {
  user: null, t: {}, carregado: false, ver: 0, matId: null, tema: 'dark', view: 'dashboard',
  filtros: { disc: '', periodo: '', situacao: '', tipo: '' }, prefs: {},
};
const ouvintes = new Set();
export const aoMudar = (fn) => { ouvintes.add(fn); return () => ouvintes.delete(fn); };
const cache = new Map();
let agendado = false;
export function bump(semRender = false) {
  S.ver++; cache.clear();
  if (semRender) return;
  if (!agendado) { agendado = true; queueMicrotask(() => { agendado = false; ouvintes.forEach((f) => f()); }); }
}
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch (_) { /* ignorar */ } },
};
export { ls };

export const irPara = (v) => { location.hash = `#${v}`; };
export const rows = (t) => S.t[t] || [];
export const byId = (t, id) => rows(t).find((r) => r.id === id);

/* ---------- carga ---------- */
export async function carregar() {
  const dados = await db.carregarTudo();
  S.t = dados;
  S.carregado = true;
  const cfg = dados.configuracao;
  if (cfg) { S.prefs = cfg.preferencias || {}; if (cfg.tema) S.tema = cfg.tema; }
  const guardada = ls.get('matId');
  const mats = matriculas();
  if (!mats.some((m) => m.mat.id === S.matId)) {
    S.matId = mats.some((m) => m.mat.id === guardada) ? guardada
      : (mats.find((m) => m.mat.situacao === 'em_andamento') || mats[mats.length - 1] || {}).mat?.id || null;
  }
  bump();
}
export function limpar() { S.t = {}; S.carregado = false; S.matId = null; bump(); }

/* ---------- consultas ---------- */
export function matriculas() {
  return rows('estudante_ano_letivo').map((mat) => ({
    mat, ano: byId('anos_letivos', mat.ano_letivo_id), serie: byId('series', mat.serie_id), est: byId('estudantes', mat.estudante_id),
  })).filter((m) => m.ano).sort((a, b) => a.ano.ano - b.ano.ano);
}
export const rotuloMatricula = (m) => `${m.ano.ano} — ${m.serie?.nome || '?'}${m.mat.situacao === 'planejado' ? ' (planejado)' : ''}`;
export function selecionarMatricula(id) { S.matId = id; ls.set('matId', id); S.filtros = { disc: '', periodo: '', situacao: '', tipo: '' }; bump(); }

/** Contexto calculado de uma matrícula (com filtros opcionais). TODA tela usa isto. */
export function ctx(matId = S.matId, f = {}) {
  const key = `${S.ver}|${matId}|${f.disc || ''}|${f.periodo || ''}|${f.situacao || ''}|${f.tipo || ''}`;
  if (cache.has(key)) return cache.get(key);
  const mat = byId('estudante_ano_letivo', matId);
  if (!mat) return null;
  const ano = byId('anos_letivos', mat.ano_letivo_id); const serie = byId('series', mat.serie_id); const est = byId('estudantes', mat.estudante_id);
  const regra = mergeRegra(rows('regras_avaliacao').find((r) => r.matricula_id === matId));
  const periodosTodos = rows('periodos_avaliativos').filter((p) => p.matricula_id === matId).sort((a, b) => a.numero - b.numero);
  const mdsTodas = rows('matricula_disciplinas').filter((x) => x.matricula_id === matId).sort((a, b) => a.ordem - b.ordem);
  const avPorMd = {};
  const idsMd = new Set(mdsTodas.map((m) => m.id));
  rows('avaliacoes').forEach((a) => { if (idsMd.has(a.matricula_disciplina_id)) (avPorMd[a.matricula_disciplina_id] = avPorMd[a.matricula_disciplina_id] || []).push(a); });
  const periodos = f.periodo ? periodosTodos.filter((p) => p.id === f.periodo) : periodosTodos;
  let items = mdsTodas.filter((md) => md.ativa !== false).map((md) => {
    const disc = byId('disciplinas', md.disciplina_id) || { nome: '?', sigla: '?', cor: '#888' };
    let avals = avPorMd[md.id] || [];
    const avalsAll = avals;
    if (f.tipo) avals = avals.filter((a) => a.tipo === f.tipo);
    if (f.periodo) avals = avals.filter((a) => a.periodo_id === f.periodo);
    const r = calcDisciplina(regra, periodos, avals, { provaFinal: md.prova_final });
    return { md, disc, avals, avalsAll, r };
  });
  if (f.disc) items = items.filter((i) => i.md.id === f.disc);
  if (f.situacao) items = items.filter((i) => i.r.status === f.situacao);
  const geral = calcGeral(regra, items.map((i) => i.r));
  const out = { mat, ano, serie, est, regra, periodos, periodosTodos, items, geral, mdsTodas };
  cache.set(key, out);
  return out;
}
export function diagnosticos(matId = S.matId) {
  const key = `D|${S.ver}|${matId}`;
  if (cache.has(key)) return cache.get(key);
  const c = ctx(matId); if (!c) return null;
  const diags = c.items.map((it) => diagnosticoDisciplina(c.regra, c.periodosTodos, it));
  const prios = Object.fromEntries(diags.map((d) => [d.md.id, prioridadeEstudo(c.regra, d)]));
  const out = { diags, prios };
  cache.set(key, out);
  return out;
}

/* ---------- escrita (sempre via banco; só atualiza a tela após sucesso) ---------- */
function substituir(tabela, row) {
  const arr = S.t[tabela] || (S.t[tabela] = []);
  const i = arr.findIndex((r) => r.id === row.id);
  if (i >= 0) arr[i] = row; else arr.push(row);
}
export async function criar(tabela, row, opt) {
  const [novo] = await db.inserir(tabela, row, opt); substituir(tabela, novo); bump(); agendarAlertas(); return novo;
}
export async function editar(tabela, id, patch, opt) {
  const novo = await db.atualizar(tabela, id, patch, opt); substituir(tabela, novo); bump(opt && opt.semRender); agendarAlertas(); return novo;
}
export async function apagar(tabela, id) {
  await db.remover(tabela, id);
  await recarregarSilencioso(); agendarAlertas();
}
export async function importarPlano(plano, onProg) {
  const feito = await db.inserirPlano(plano, onProg);
  Object.entries(feito).forEach(([t, rs]) => rs.forEach((r) => substituir(t, r)));
  bump(); agendarAlertas();
}
export async function recarregarSilencioso() {
  const dados = await db.carregarTudo(); S.t = dados;
  if (!matriculas().some((m) => m.mat.id === S.matId)) S.matId = matriculas().slice(-1)[0]?.mat.id || null;
  bump();
}

/* ---------- configuração do usuário (tema, preferências) ---------- */
export async function salvarPrefs(patch) {
  if (patch.tema) { S.tema = patch.tema; ls.set('tema', patch.tema); document.documentElement.dataset.tema = patch.tema; }
  S.prefs = { ...S.prefs, ...(patch.prefs || {}) };
  const uid = await db.usuarioId();
  await db.salvarConfiguracao({ owner_id: uid, tema: S.tema, preferencias: S.prefs });
  bump();
}

/* ---------- alertas persistidos (mantêm lido/resolvido; histórico) ---------- */
let timerAlertas = null; let rodando = false;
export function agendarAlertas() { clearTimeout(timerAlertas); timerAlertas = setTimeout(sincronizarAlertas, 400); }
export async function sincronizarAlertas() {
  if (rodando || !S.matId || !S.carregado) return;
  const c = ctx(S.matId); if (!c || !c.items.length) return;
  rodando = true;
  try {
    const metas = rows('metas_academicas').filter((m) => m.matricula_id === S.matId);
    const calc = gerarAlertas(c.regra, c.periodosTodos, c.items, c.geral, metas, new Date(), c.mat);
    const atuais = rows('alertas').filter((a) => a.matricula_id === S.matId);
    const porChave = new Map(atuais.map((a) => [a.chave, a]));
    const chavesCalc = new Set(calc.map((a) => a.chave));
    const novos = []; const alteracoes = [];
    calc.forEach((a) => {
      const ex = porChave.get(a.chave);
      const { disciplina, ...linha } = a;
      if (!ex) { novos.push({ ...linha, lido: false, resolvido: false }); return; }
      if (ex.resolvido && ex.resolvido_auto) alteracoes.push([ex.id, { resolvido: false, resolvido_auto: false, resolvido_em: null, lido: false, nivel: a.nivel, titulo: a.titulo, descricao: a.descricao, recomendacao: a.recomendacao }]);
      else if (ex.nivel !== a.nivel || ex.descricao !== a.descricao || ex.titulo !== a.titulo) alteracoes.push([ex.id, { nivel: a.nivel, titulo: a.titulo, descricao: a.descricao, recomendacao: a.recomendacao }]);
    });
    atuais.forEach((ex) => { if (!ex.resolvido && !chavesCalc.has(ex.chave)) alteracoes.push([ex.id, { resolvido: true, resolvido_auto: true, resolvido_em: new Date().toISOString() }]); });
    if (novos.length) { const ins = await db.inserir('alertas', novos, { silencioso: true }); ins.forEach((r) => substituir('alertas', r)); }
    for (const [id, patch] of alteracoes) { const r = await db.atualizar('alertas', id, patch, { silencioso: true }); substituir('alertas', r); }
    if (novos.length || alteracoes.length) bump();
  } catch (e) { console.warn('Falha ao sincronizar alertas:', e.message); } finally { rodando = false; }
}
export const alertasAtivos = (matId = S.matId) => rows('alertas').filter((a) => a.matricula_id === matId && !a.resolvido);
