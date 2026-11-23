/* =========================================================================
 * backup.js — exportação, validação e restauração (lógica pura, testável)
 * ========================================================================= */
export const FORMATO = 'acompanhamento-escolar-backup';
export const VERSAO = 1;
export const ORDEM = ['estudantes', 'series', 'anos_letivos', 'disciplinas', 'estudante_ano_letivo', 'regras_avaliacao', 'periodos_avaliativos',
  'matricula_disciplinas', 'avaliacoes', 'metas_academicas', 'planejamento_estudos', 'alertas', 'historico_academico'];

const FK = {
  estudante_ano_letivo: { estudante_id: 'estudantes', ano_letivo_id: 'anos_letivos', serie_id: 'series' },
  regras_avaliacao: { matricula_id: 'estudante_ano_letivo' },
  periodos_avaliativos: { matricula_id: 'estudante_ano_letivo' },
  matricula_disciplinas: { matricula_id: 'estudante_ano_letivo', disciplina_id: 'disciplinas' },
  avaliacoes: { matricula_disciplina_id: 'matricula_disciplinas', periodo_id: 'periodos_avaliativos' },
  metas_academicas: { matricula_id: 'estudante_ano_letivo', matricula_disciplina_id: 'matricula_disciplinas' },
  planejamento_estudos: { matricula_id: 'estudante_ano_letivo', matricula_disciplina_id: 'matricula_disciplinas' },
  alertas: { matricula_id: 'estudante_ano_letivo', matricula_disciplina_id: 'matricula_disciplinas' },
  historico_academico: { matricula_id: 'estudante_ano_letivo' },
};
const lc = (s) => String(s ?? '').trim().toLowerCase();
const NK = {
  series: (r) => lc(r.nome), anos_letivos: (r) => String(r.ano), disciplinas: (r) => lc(r.nome),
  estudante_ano_letivo: (r) => `${r.estudante_id}|${r.ano_letivo_id}`, regras_avaliacao: (r) => r.matricula_id,
  periodos_avaliativos: (r) => `${r.matricula_id}|${r.numero}`, matricula_disciplinas: (r) => `${r.matricula_id}|${r.disciplina_id}`,
  avaliacoes: (r) => `${r.matricula_disciplina_id}|${r.periodo_id}|${lc(r.nome)}`, historico_academico: (r) => r.matricula_id, alertas: (r) => r.chave,
};
const SEM_META = (r) => { const { owner_id, criado_em, atualizado_em, ...resto } = r; return resto; };

export function gerarBackup(t, meta = {}) {
  return {
    formato: FORMATO, versao: VERSAO, gerado_em: new Date().toISOString(), ...meta,
    configuracao: t.configuracao ? { tema: t.configuracao.tema, preferencias: t.configuracao.preferencias } : null,
    tabelas: Object.fromEntries(ORDEM.map((k) => [k, (t[k] || []).map(SEM_META)])),
  };
}

export function validarBackup(b) {
  const erros = [];
  if (!b || typeof b !== 'object') return ['O arquivo não é um JSON válido.'];
  if (b.formato !== FORMATO) erros.push('Este arquivo não é um backup deste sistema (formato desconhecido).');
  if (!Number.isFinite(b.versao) || b.versao > VERSAO) erros.push(`Versão de backup não suportada (${b.versao}).`);
  if (!b.tabelas || typeof b.tabelas !== 'object') { erros.push('Estrutura de tabelas ausente.'); return erros; }
  const ids = {};
  ORDEM.forEach((k) => {
    const rs = b.tabelas[k];
    if (rs === undefined) { erros.push(`Tabela ausente no backup: ${k}.`); return; }
    if (!Array.isArray(rs)) { erros.push(`Tabela inválida: ${k}.`); return; }
    ids[k] = new Set();
    rs.forEach((r, i) => { if (!r || typeof r.id !== 'string') erros.push(`${k}[${i}]: registro sem id.`); else ids[k].add(r.id); });
  });
  if (erros.length) return erros;
  Object.entries(FK).forEach(([tab, cols]) => {
    b.tabelas[tab].forEach((r) => Object.entries(cols).forEach(([c, ref]) => { if (r[c] && !ids[ref].has(r[c])) erros.push(`${tab}: referência inválida em ${c} (${r[c]}).`); }));
  });
  const periodos = Object.fromEntries(b.tabelas.periodos_avaliativos.map((p) => [p.id, p])); const mds = Object.fromEntries(b.tabelas.matricula_disciplinas.map((m) => [m.id, m]));
  b.tabelas.avaliacoes.forEach((a) => {
    if (a.nota !== null && a.nota !== undefined && (Number(a.nota) < 0 || Number(a.nota) > Number(a.valor_maximo))) erros.push(`Avaliação "${a.nome}": nota fora do intervalo permitido.`);
    if (periodos[a.periodo_id] && mds[a.matricula_disciplina_id] && periodos[a.periodo_id].matricula_id !== mds[a.matricula_disciplina_id].matricula_id) erros.push(`Avaliação "${a.nome}": período e disciplina de anos diferentes.`);
  });
  return erros.slice(0, 20);
}

/** Planeja a restauração sem tocar na rede: remapeia ids por chave natural para evitar duplicidade. */
export function planejarRestauracao(b, existente) {
  const mapas = {}; const stats = {}; const linhas = {};
  ORDEM.forEach((tab) => {
    mapas[tab] = {}; const ex = existente[tab] || [];
    const porChave = new Map(); const porId = new Map(ex.map((r) => [r.id, r]));
    if (NK[tab]) ex.forEach((r) => porChave.set(String(NK[tab](r)), r));
    let novos = 0; let atualizados = 0; const saida = []; const vistos = new Map();
    (b.tabelas[tab] || []).forEach((orig) => {
      const r = { ...orig };
      Object.entries(FK[tab] || {}).forEach(([col, ref]) => { if (r[col] && mapas[ref][r[col]]) r[col] = mapas[ref][r[col]]; });
      let alvo = porId.get(r.id);
      if (!alvo && NK[tab]) { alvo = porChave.get(String(NK[tab](r))); if (alvo) { mapas[tab][orig.id] = alvo.id; r.id = alvo.id; } }
      const chaveSaida = NK[tab] ? String(NK[tab](r)) : r.id;
      if (vistos.has(chaveSaida)) { mapas[tab][orig.id] = vistos.get(chaveSaida); return; } // duplicata dentro do próprio backup
      vistos.set(chaveSaida, r.id);
      if (alvo) atualizados++; else novos++;
      saida.push(r);
    });
    stats[tab] = { total: saida.length, novos, atualizados }; linhas[tab] = saida;
  });
  return { ordem: ORDEM.filter((k) => linhas[k].length), linhas, stats };
}

/* ---------- CSVs ---------- */
export function csv(linhas) {
  const cel = (v) => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return `﻿${linhas.map((l) => l.map(cel).join(';')).join('\r\n')}`;
}
export function csvNotas(t) {
  const byId = (tab) => Object.fromEntries((t[tab] || []).map((r) => [r.id, r]));
  const mats = byId('estudante_ano_letivo'); const anos = byId('anos_letivos'); const series = byId('series'); const discs = byId('disciplinas'); const mds = byId('matricula_disciplinas'); const pers = byId('periodos_avaliativos');
  const cab = ['ano_letivo', 'serie', 'disciplina', 'periodo', 'avaliacao', 'tipo', 'data', 'nota', 'valor_maximo', 'peso', 'situacao'];
  const linhas = (t.avaliacoes || []).map((a) => { const md = mds[a.matricula_disciplina_id]; const m = md && mats[md.matricula_id]; return [m && anos[m.ano_letivo_id]?.ano, m && series[m.serie_id]?.nome, md && discs[md.disciplina_id]?.nome, pers[a.periodo_id]?.nome, a.nome, a.tipo, a.data_avaliacao || '', a.nota === null ? '' : Number(a.nota), Number(a.valor_maximo), Number(a.peso), a.status]; });
  return csv([cab, ...linhas]);
}
export function csvDisciplinas(t) {
  const byId = (tab) => Object.fromEntries((t[tab] || []).map((r) => [r.id, r]));
  const mats = byId('estudante_ano_letivo'); const anos = byId('anos_letivos'); const series = byId('series'); const discs = byId('disciplinas');
  const cab = ['ano_letivo', 'serie', 'disciplina', 'sigla', 'professor', 'carga_horaria', 'meta_media', 'ativa', 'ordem'];
  return csv([cab, ...(t.matricula_disciplinas || []).map((md) => { const m = mats[md.matricula_id]; const d = discs[md.disciplina_id]; return [anos[m?.ano_letivo_id]?.ano, series[m?.serie_id]?.nome, d?.nome, d?.sigla, md.professor || '', md.carga_horaria ?? '', md.meta_media ?? '', md.ativa ? 'sim' : 'não', md.ordem]; })]);
}
