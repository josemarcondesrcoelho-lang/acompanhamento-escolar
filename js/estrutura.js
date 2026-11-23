/* =========================================================================
 * estrutura.js — monta (sem tocar na rede) as linhas a inserir para:
 *  - importar o boletim transcrito (JSON)
 *  - criar um novo ano letivo / série (avançar de ano)
 * Retorna { tabelas: {nome: [linhas]}, resumo } na ordem correta de dependência.
 * ========================================================================= */
import { REGRA_PADRAO } from './calc.js';

export const uid = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));

export const SERIES_PADRAO = ['6º ano', '7º ano', '8º ano', '9º ano'];
const norm = (s) => String(s || '').trim().toLowerCase();
export const nomePeriodo = (n, tipo = 'bimestre') => `${n}º ${tipo === 'trimestre' ? 'Trimestre' : tipo === 'semestre' ? 'Semestre' : 'Bimestre'}`;
const CORES = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#a855f7', '#0ea5e9', '#f97316', '#84cc16', '#06b6d4', '#eab308'];
export const corPadrao = (i) => CORES[i % CORES.length];

function garantir(t, tabela, achar, criar, novos) {
  const ex = (t[tabela] || []).find(achar) || novos[tabela].find(achar);
  if (ex) return ex;
  const row = criar(); novos[tabela].push(row); return row;
}
function vazio() {
  return { estudantes: [], series: [], anos_letivos: [], estudante_ano_letivo: [], disciplinas: [], matricula_disciplinas: [],
    regras_avaliacao: [], periodos_avaliativos: [], avaliacoes: [] };
}

/** Cria períodos + regra para uma matrícula. */
function periodosERegra(mat, regraBase, novos) {
  const r = { ...REGRA_PADRAO, ...(regraBase || {}) };
  delete r.id; delete r.owner_id; delete r.matricula_id; delete r.criado_em; delete r.atualizado_em;
  novos.regras_avaliacao.push({ id: uid(), matricula_id: mat.id, nome: 'Regra padrão', ...r });
  const pers = [];
  for (let n = 1; n <= r.qtd_periodos; n++) {
    const p = { id: uid(), matricula_id: mat.id, numero: n, nome: nomePeriodo(n, r.tipo_periodo), semestre: Math.ceil(n / (r.periodos_por_semestre || 2)), peso: (r.pesos_periodos || [])[n - 1] ?? 1 };
    novos.periodos_avaliativos.push(p); pers.push(p);
  }
  return pers;
}
function avaliacoesVazias(md, pers, regra, notas = [], recs = []) {
  const out = [];
  const porP = regra.avaliacoes_por_periodo;
  pers.forEach((p, pi) => {
    for (let k = 0; k < porP; k++) {
      const idx = pi * porP + k; const nota = notas[idx];
      const temNota = nota !== undefined && nota !== null;
      out.push({ id: uid(), matricula_disciplina_id: md.id, periodo_id: p.id, nome: `${idx + 1}ª nota`, tipo: 'outro', valor_maximo: regra.nota_maxima, peso: 1, nota: temNota ? nota : null, status: temNota ? 'nota_lancada' : 'pendente', ordem: k + 1 });
    }
    const rec = recs[pi];
    if (rec !== undefined && rec !== null) out.push({ id: uid(), matricula_disciplina_id: md.id, periodo_id: p.id, nome: `Recuperação ${p.nome}`, tipo: 'recuperacao', valor_maximo: regra.nota_maxima, peso: 1, nota: rec, status: 'nota_lancada', ordem: 90 });
  });
  return out;
}

/** Importação do boletim transcrito (JSON). */
export function planejarImportacao(json, t = {}) {
  if (!json || json.tipo !== 'boletim_escolar' || !Array.isArray(json.disciplinas)) throw new Error('Arquivo inválido: não é um boletim_escolar no formato esperado.');
  const novos = vazio();
  const est = garantir(t, 'estudantes', (e) => norm(e.nome) === norm(json.estudante), () => ({ id: uid(), nome: json.estudante, numero: json.numero || null, turma: json.turma || null, escola: json.escola || null, curso: json.curso || null }), novos);
  SERIES_PADRAO.forEach((nome, i) => garantir(t, 'series', (s) => norm(s.nome) === norm(nome), () => ({ id: uid(), nome, ordem: 6 + i }), novos));
  const serie = garantir(t, 'series', (s) => norm(s.nome) === norm(json.serie), () => ({ id: uid(), nome: json.serie, ordem: parseInt(json.serie, 10) || 99 }), novos);
  const ano = garantir(t, 'anos_letivos', (a) => a.ano === json.ano_letivo, () => ({ id: uid(), ano: json.ano_letivo }), novos);
  const todas = [...(t.estudante_ano_letivo || [])];
  if (todas.some((m) => m.estudante_id === est.id && m.ano_letivo_id === ano.id)) throw new Error(`Já existe matrícula de ${est.nome} em ${json.ano_letivo}. Para evitar duplicidade, a importação foi bloqueada.`);
  const mat = { id: uid(), estudante_id: est.id, ano_letivo_id: ano.id, serie_id: serie.id, situacao: 'em_andamento', turma: json.turma || null, emissao: json.emissao || null,
    dados_origem: { fonte: json.fonte, escola: json.escola, curso: json.curso, emissao: json.emissao, observacoes_transcricao: json.observacoes_transcricao || [], disciplinas: Object.fromEntries(json.disciplinas.map((d) => [d.nome, d.original || {}])) } };
  novos.estudante_ano_letivo.push(mat);
  const pers = periodosERegra(mat, {}, novos);
  const regra = { ...REGRA_PADRAO };
  json.disciplinas.forEach((d, i) => {
    const disc = garantir(t, 'disciplinas', (x) => norm(x.nome) === norm(d.nome), () => ({ id: uid(), nome: d.nome, sigla: d.sigla || d.nome.slice(0, 3).toUpperCase(), cor: d.cor || corPadrao(i) }), novos);
    const md = { id: uid(), matricula_id: mat.id, disciplina_id: disc.id, ordem: i + 1, ativa: true };
    novos.matricula_disciplinas.push(md);
    novos.avaliacoes.push(...avaliacoesVazias(md, pers, regra, d.notas || [], d.recuperacoes || []));
  });
  return montar(novos, `${json.disciplinas.length} disciplinas, ${novos.avaliacoes.length} avaliações`);
}

/** Matrícula nova (ano/série) — opcionalmente copiando disciplinas e regra de outra matrícula. */
export function planejarNovoAno(t, { estudanteId, ano, serieNome, copiarDeMatriculaId = null, situacao = 'em_andamento' }) {
  const novos = vazio();
  const anoRow = garantir(t, 'anos_letivos', (a) => a.ano === Number(ano), () => ({ id: uid(), ano: Number(ano) }), novos);
  const serie = garantir(t, 'series', (s) => norm(s.nome) === norm(serieNome), () => ({ id: uid(), nome: serieNome, ordem: parseInt(serieNome, 10) || 99 }), novos);
  if ((t.estudante_ano_letivo || []).some((m) => m.estudante_id === estudanteId && m.ano_letivo_id === anoRow.id)) throw new Error(`Já existe matrícula para ${ano}.`);
  const mat = { id: uid(), estudante_id: estudanteId, ano_letivo_id: anoRow.id, serie_id: serie.id, situacao, turma: null, emissao: null, dados_origem: null };
  novos.estudante_ano_letivo.push(mat);
  const regraOrig = copiarDeMatriculaId ? (t.regras_avaliacao || []).find((r) => r.matricula_id === copiarDeMatriculaId) : null;
  const pers = periodosERegra(mat, regraOrig, novos);
  const regra = { ...REGRA_PADRAO, ...(regraOrig || {}) };
  if (copiarDeMatriculaId) {
    (t.matricula_disciplinas || []).filter((x) => x.matricula_id === copiarDeMatriculaId && x.ativa !== false).sort((a, b) => a.ordem - b.ordem).forEach((o, i) => {
      const md = { id: uid(), matricula_id: mat.id, disciplina_id: o.disciplina_id, ordem: i + 1, ativa: true, professor: null, carga_horaria: o.carga_horaria ?? null, meta_media: o.meta_media ?? null };
      novos.matricula_disciplinas.push(md);
      novos.avaliacoes.push(...avaliacoesVazias(md, pers, regra));
    });
  }
  return montar(novos, `${novos.matricula_disciplinas.length} disciplinas copiadas (sem notas)`);
}

/** Adiciona uma disciplina a uma matrícula, com as avaliações esperadas em branco (pendentes). */
export function planejarDisciplinaNaMatricula(t, { matriculaId, disciplinaId, nome, sigla, cor }) {
  const novos = vazio();
  const disc = disciplinaId ? (t.disciplinas || []).find((d) => d.id === disciplinaId)
    : garantir(t, 'disciplinas', (x) => norm(x.nome) === norm(nome), () => ({ id: uid(), nome, sigla: sigla || nome.slice(0, 3).toUpperCase(), cor: cor || corPadrao((t.disciplinas || []).length) }), novos);
  if ((t.matricula_disciplinas || []).some((x) => x.matricula_id === matriculaId && x.disciplina_id === disc.id)) throw new Error('Esta disciplina já existe neste ano/série.');
  const ordem = (t.matricula_disciplinas || []).filter((x) => x.matricula_id === matriculaId).length + 1;
  const md = { id: uid(), matricula_id: matriculaId, disciplina_id: disc.id, ordem, ativa: true };
  novos.matricula_disciplinas.push(md);
  const regra = { ...REGRA_PADRAO, ...((t.regras_avaliacao || []).find((r) => r.matricula_id === matriculaId) || {}) };
  const pers = (t.periodos_avaliativos || []).filter((p) => p.matricula_id === matriculaId).sort((a, b) => a.numero - b.numero);
  novos.avaliacoes.push(...avaliacoesVazias(md, pers, regra));
  return montar(novos, '');
}

const ORDEM = ['estudantes', 'series', 'anos_letivos', 'disciplinas', 'estudante_ano_letivo', 'regras_avaliacao', 'periodos_avaliativos', 'matricula_disciplinas', 'avaliacoes'];
function montar(novos, resumo) {
  return { tabelas: Object.fromEntries(ORDEM.filter((k) => novos[k].length).map((k) => [k, novos[k]])), ordem: ORDEM.filter((k) => novos[k].length), resumo, matriculaId: novos.estudante_ano_letivo[0]?.id };
}
