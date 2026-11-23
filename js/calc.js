/* =========================================================================
 * calc.js — MOTOR ÚNICO DE CÁLCULO (puro, sem DOM, sem rede)
 * Dashboard, tabelas, relatórios e simulador usam EXCLUSIVAMENTE estas funções.
 * Precisão interna total; arredondamento apenas na apresentação (como o boletim).
 * ========================================================================= */

export const TIPOS_AVALIACAO = [
  ['prova', 'Prova'], ['trabalho', 'Trabalho'], ['atividade', 'Atividade'],
  ['seminario', 'Seminário'], ['pesquisa', 'Pesquisa'], ['participacao', 'Participação'],
  ['simulado', 'Simulado'], ['recuperacao', 'Recuperação'],
  ['complementar', 'Avaliação complementar'], ['substitutiva', 'Avaliação substitutiva'],
  ['outro', 'Outros'],
];
export const STATUS_AVALIACAO = [
  ['pendente', 'Pendente'], ['realizada', 'Realizada'], ['nota_lancada', 'Nota lançada'],
  ['nao_realizada', 'Não realizada'], ['em_recuperacao', 'Em recuperação'], ['substitutiva', 'Substitutiva'],
];
export const nomeTipo = (k) => (TIPOS_AVALIACAO.find((t) => t[0] === k) || [k, k])[1];
export const nomeStatusAval = (k) => (STATUS_AVALIACAO.find((t) => t[0] === k) || [k, k])[1];

export const REGRA_PADRAO = {
  nota_maxima: 10,
  media_aprovacao: 7,
  pontos_aprovacao: 56,          // regra de pontuação acumulada (independente da média)
  qtd_periodos: 4,
  tipo_periodo: 'bimestre',
  avaliacoes_por_periodo: 2,     // nº esperado de notas regulares por período
  pesos_periodos: [1, 1, 1, 1],
  periodos_por_semestre: 2,
  formula: 'media_periodos',     // 'media_periodos' | 'media_notas'
  recuperacao: 'substitui_se_maior', // 'substitui_se_maior' | 'substitui' | 'media' | 'nenhuma'
  recuperacao_somente_abaixo: true,  // REC só vale se a média do período estiver abaixo da aprovação
  substitutiva: true,            // substitutiva troca a menor nota regular se for maior
  prova_final: 'media',          // 'media' | 'substitui_se_maior' | 'nenhuma'
  media_minima_prova_final: 5,   // abaixo disso => reprovação projetada (ajustar ao regimento)
  arredondamento: 'meio_acima',  // 'meio_acima' | 'truncar'
  casas: 2,
  criterio_aprovacao: 'media_anual', // 'media_anual' | 'pontos' | 'ambos'
  limites_status: { aprovada: 7, atencao: 5 },
};

export const mergeRegra = (r) => ({
  ...REGRA_PADRAO, ...(r || {}),
  limites_status: { ...REGRA_PADRAO.limites_status, ...((r && r.limites_status) || {}) },
});

/* ---------- utilitários numéricos ---------- */
export const isNum = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
export const num = (v) => (isNum(v) ? Number(v) : null);

export function arred(x, regra) {
  if (!isNum(x)) return null;
  const c = (regra && regra.casas) ?? 2;
  const f = 10 ** c;
  if (regra && regra.arredondamento === 'truncar') return Math.trunc(Number(x) * f + 1e-9) / f;
  return Math.round(Number(x) * f + 1e-9) / f; // meio para cima, com tolerância de ponto flutuante
}
export function fmt(x, casas = 2) {
  if (!isNum(x)) return '—';
  return Number(x).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}
export const media = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
export function desvioPadrao(arr) {
  if (arr.length < 2) return 0;
  const m = media(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

/* ---------- avaliação ---------- */
export const temNota = (a) => isNum(a.nota) && a.status !== 'nao_realizada';
export const ehRecuperacao = (a) => a.tipo === 'recuperacao';
export const ehSubstitutiva = (a) => a.tipo === 'substitutiva';
export const ehRegular = (a) => !ehRecuperacao(a) && !ehSubstitutiva(a);
export function notaNorm(a, regra) {
  const vm = isNum(a.valor_maximo) && Number(a.valor_maximo) > 0 ? Number(a.valor_maximo) : regra.nota_maxima;
  return (Number(a.nota) / vm) * regra.nota_maxima;
}
const pesoAv = (a) => (isNum(a.peso) && Number(a.peso) > 0 ? Number(a.peso) : 1);

/* ---------- validação ---------- */
export function validarNota(valor, valorMaximo) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (!isNum(valor)) return 'Nota inválida.';
  if (Number(valor) < 0) return 'A nota não pode ser negativa.';
  const vm = isNum(valorMaximo) ? Number(valorMaximo) : 10;
  if (Number(valor) > vm) return `A nota não pode ser maior que o valor máximo (${fmt(vm)}).`;
  return null;
}

/* ---------- período ---------- */
/**
 * Resultado de um período (bimestre).
 * - média ponderada das notas regulares lançadas
 * - substitutiva troca a menor nota regular se maior
 * - recuperação conforme regra (padrão: substitui se maior e só se média < aprovação)
 * `completo` = nº de notas regulares lançadas >= esperado e nenhuma pendente.
 */
export function calcPeriodo(regraIn, periodo, avals) {
  const regra = mergeRegra(regraIn);
  const regulares = avals.filter(ehRegular);
  const lanc = regulares.filter(temNota).map((a) => ({ a, n: notaNorm(a, regra), p: pesoAv(a) }));
  const pendentes = regulares.filter((a) => !temNota(a) && a.status !== 'nao_realizada');
  const naoReal = regulares.filter((a) => a.status === 'nao_realizada').length;

  let substituida = null;
  if (regra.substitutiva) {
    const sub = avals.filter(ehSubstitutiva).filter(temNota).map((a) => notaNorm(a, regra));
    if (sub.length && lanc.length) {
      const melhorSub = Math.max(...sub);
      let idx = 0;
      lanc.forEach((x, i) => { if (x.n < lanc[idx].n) idx = i; });
      if (melhorSub > lanc[idx].n) {
        substituida = { de: lanc[idx].n, por: melhorSub };
        lanc[idx] = { ...lanc[idx], n: melhorSub };
      }
    }
  }
  const somaP = lanc.reduce((s, x) => s + x.p, 0);
  const mediaBruta = somaP > 0 ? lanc.reduce((s, x) => s + x.n * x.p, 0) / somaP : null;

  const recs = avals.filter(ehRecuperacao).filter(temNota).map((a) => notaNorm(a, regra));
  const rec = recs.length ? Math.max(...recs) : null;
  let resultado = mediaBruta;
  let recAplicada = false;
  if (mediaBruta !== null && rec !== null && regra.recuperacao !== 'nenhuma') {
    const elegivel = !regra.recuperacao_somente_abaixo || mediaBruta < regra.media_aprovacao - 1e-9;
    if (elegivel) {
      let novo = mediaBruta;
      if (regra.recuperacao === 'substitui_se_maior') novo = Math.max(mediaBruta, rec);
      else if (regra.recuperacao === 'substitui') novo = rec;
      else if (regra.recuperacao === 'media') novo = (mediaBruta + rec) / 2;
      recAplicada = novo !== mediaBruta;
      resultado = novo;
    }
  }
  const esperado = Math.max(regra.avaliacoes_por_periodo, regulares.filter((a) => a.status !== 'nao_realizada').length);
  const completo = lanc.length >= esperado && pendentes.length === 0 && lanc.length > 0;
  return {
    numero: periodo.numero, periodoId: periodo.id, nome: periodo.nome,
    media: mediaBruta, rec, recAplicada, resultado, substituida,
    qtdLancadas: lanc.length, qtdPendentes: pendentes.length, qtdNaoRealizadas: naoReal,
    esperado, completo, temDados: lanc.length > 0,
    pontos: resultado !== null ? resultado * lanc.length : 0, // pontos equivalentes obtidos
    pontosMax: esperado * regra.nota_maxima,
  };
}

/* ---------- disciplina (no ano) ---------- */
export function ordenarAvaliacoes(avals, periodosPorId) {
  return [...avals].sort((a, b) => {
    const pa = periodosPorId[a.periodo_id]?.numero ?? 0;
    const pb = periodosPorId[b.periodo_id]?.numero ?? 0;
    if (pa !== pb) return pa - pb;
    if (a.data_avaliacao && b.data_avaliacao && a.data_avaliacao !== b.data_avaliacao) return a.data_avaliacao < b.data_avaliacao ? -1 : 1;
    return (a.ordem ?? 0) - (b.ordem ?? 0);
  });
}

/**
 * Cálculo completo de uma disciplina.
 * periodos: períodos da matrícula (ordenados); avals: avaliações da disciplina (já filtradas, se houver filtro).
 */
export function calcDisciplina(regraIn, periodos, avals, extra = {}) {
  const regra = mergeRegra(regraIn);
  const pPorId = Object.fromEntries(periodos.map((p) => [p.id, p]));
  const porPeriodo = periodos.map((p) => calcPeriodo(regra, p, avals.filter((a) => a.periodo_id === p.id)));
  const comDados = porPeriodo.filter((p) => p.resultado !== null);
  const pesoDe = (p) => {
    const per = pPorId[p.periodoId];
    const w = per && isNum(per.peso) ? Number(per.peso) : 1;
    return w > 0 ? w : 1;
  };

  let mediaAnual = null;
  if (regra.formula === 'media_notas') {
    const todas = avals.filter(ehRegular).filter(temNota);
    const sp = todas.reduce((s, a) => s + pesoAv(a), 0);
    mediaAnual = sp > 0 ? todas.reduce((s, a) => s + notaNorm(a, regra) * pesoAv(a), 0) / sp : null;
  } else if (comDados.length) {
    const w = comDados.reduce((s, p) => s + pesoDe(p), 0);
    mediaAnual = comDados.reduce((s, p) => s + p.resultado * pesoDe(p), 0) / w;
  }

  // Semestres
  const pps = regra.periodos_por_semestre || 2;
  const semestres = [];
  for (let i = 0; i < porPeriodo.length; i += pps) {
    const grupo = porPeriodo.slice(i, i + pps).filter((p) => p.resultado !== null);
    semestres.push({
      numero: i / pps + 1,
      resultado: grupo.length ? media(grupo.map((p) => p.resultado)) : null,
      completo: porPeriodo.slice(i, i + pps).every((p) => p.completo),
    });
  }

  const parcial = porPeriodo.length === 0 || porPeriodo.some((p) => !p.completo);
  const lancadas = ordenarAvaliacoes(avals.filter(temNota), pPorId);
  const notasSeq = lancadas.map((a) => ({
    id: a.id, nome: a.nome, data: a.data_avaliacao, tipo: a.tipo, periodo: pPorId[a.periodo_id]?.numero,
    periodoNome: pPorId[a.periodo_id]?.nome, nota: notaNorm(a, regra), bruta: Number(a.nota), max: a.valor_maximo,
  }));
  const valores = notasSeq.filter((n) => n.tipo !== 'recuperacao').map((n) => n.nota);

  // Prova final (anual)
  let mediaFinal = mediaAnual;
  const pf = num(extra.provaFinal);
  if (mediaAnual !== null && pf !== null && regra.prova_final !== 'nenhuma' && mediaAnual < regra.media_aprovacao - 1e-9) {
    mediaFinal = regra.prova_final === 'media' ? (mediaAnual + pf) / 2 : Math.max(mediaAnual, pf);
  }

  const pontos = porPeriodo.reduce((s, p) => s + p.pontos, 0);
  const pontosMax = Math.max(porPeriodo.reduce((s, p) => s + p.pontosMax, 0), regra.qtd_periodos * regra.avaliacoes_por_periodo * regra.nota_maxima);
  const totalLanc = porPeriodo.reduce((s, p) => s + p.qtdLancadas, 0);
  const totalEsperado = Math.max(regra.qtd_periodos * regra.avaliacoes_por_periodo, porPeriodo.reduce((s, p) => s + p.esperado, 0));
  const restantePossivel = Math.max(0, totalEsperado - totalLanc) * regra.nota_maxima;
  const pontosRestantes = Math.max(0, regra.pontos_aprovacao - pontos);

  const out = {
    periodos: porPeriodo, semestres,
    media: mediaAnual, mediaFinal,
    mediaArr: arred(mediaFinal, regra),
    parcial,
    pontos, pontosMax, pontosNecessarios: regra.pontos_aprovacao, pontosRestantes,
    pontosAlcancavel: pontos + restantePossivel >= regra.pontos_aprovacao - 1e-9,
    pctPontos: regra.pontos_aprovacao > 0 ? Math.min(100, (pontos / regra.pontos_aprovacao) * 100) : 0,
    qtdLancadas: totalLanc,
    qtdPendentes: porPeriodo.reduce((s, p) => s + p.qtdPendentes, 0),
    notasSeq,
    ultimaNota: valores.length ? valores[valores.length - 1] : null,
    maior: valores.length ? Math.max(...valores) : null,
    menor: valores.length ? Math.min(...valores) : null,
    desvio: desvioPadrao(valores),
    mediaNotas: media(valores),
    temDados: totalLanc > 0,
  };
  out.status = classificar(out.mediaFinal, regra, out.temDados);
  return out;
}

export function classificar(mediaVal, regraIn, temDados = true) {
  const regra = mergeRegra(regraIn);
  if (!temDados || !isNum(mediaVal)) return 'sem_dados';
  const m = arred(mediaVal, regra);
  if (m >= regra.limites_status.aprovada - 1e-9) return 'aprovada';
  if (m >= regra.limites_status.atencao - 1e-9) return 'atencao';
  return 'critica';
}
export const STATUS_INFO = {
  aprovada: { rotulo: 'Satisfatória', cor: 'var(--ok)', classe: 'ok' },
  atencao: { rotulo: 'Em atenção', cor: 'var(--warn)', classe: 'warn' },
  critica: { rotulo: 'Crítica', cor: 'var(--danger)', classe: 'danger' },
  sem_dados: { rotulo: 'Sem dados', cor: 'var(--muted)', classe: 'muted' },
};

/* ---------- visão geral ---------- */
export function calcGeral(regraIn, resultadosDisc) {
  const regra = mergeRegra(regraIn);
  const com = resultadosDisc.filter((r) => r.media !== null && r.temDados);
  const m = com.length ? media(com.map((r) => r.mediaFinal ?? r.media)) : null;
  const cont = { aprovada: 0, atencao: 0, critica: 0, sem_dados: 0 };
  resultadosDisc.forEach((r) => { cont[r.status] += 1; });
  // evolução da média geral por período
  const nPer = Math.max(0, ...resultadosDisc.map((r) => r.periodos.length));
  const evolucao = [];
  for (let i = 0; i < nPer; i++) {
    const vals = resultadosDisc.map((r) => r.periodos[i]).filter((p) => p && p.resultado !== null).map((p) => p.resultado);
    evolucao.push({ idx: i, media: vals.length ? media(vals) : null, n: vals.length });
  }
  const pontos = resultadosDisc.reduce((s, r) => s + r.pontos, 0);
  const pontosNec = resultadosDisc.length * regra.pontos_aprovacao;
  return {
    media: m, mediaArr: arred(m, regra), cont, total: resultadosDisc.length, evolucao,
    parcial: resultadosDisc.some((r) => r.parcial),
    pontos, pontosNec, pontosRestantes: Math.max(0, pontosNec - pontos),
    pctDesempenho: m !== null ? (m / regra.nota_maxima) * 100 : null,
    lancadas: resultadosDisc.reduce((s, r) => s + r.qtdLancadas, 0),
    pendentes: resultadosDisc.reduce((s, r) => s + r.qtdPendentes, 0),
  };
}

/* ---------- simulação / projeção ---------- */
/** Gera avaliações virtuais para completar os períodos até o nº esperado. */
export function completarComVirtuais(regraIn, periodos, avals, nota, opts = {}) {
  const regra = mergeRegra(regraIn);
  const out = [];
  const mapa = opts.mapa || {}; // id -> nota hipotética
  avals.forEach((a) => {
    if (!temNota(a) && a.status !== 'nao_realizada' && ehRegular(a)) {
      const v = mapa[a.id] !== undefined && mapa[a.id] !== '' ? mapa[a.id] : nota;
      out.push({ ...a, nota: v, status: 'nota_lancada', _simulada: true });
    } else if (mapa[a.id] !== undefined && mapa[a.id] !== '' && !temNota(a)) {
      out.push({ ...a, nota: mapa[a.id], status: 'nota_lancada', _simulada: true });
    } else out.push(a);
  });
  periodos.forEach((p) => {
    const regs = out.filter((a) => a.periodo_id === p.id && ehRegular(a) && a.status !== 'nao_realizada');
    const falta = Math.max(0, regra.avaliacoes_por_periodo - regs.length) + (opts.extraPorPeriodo || 0);
    for (let i = 0; i < falta; i++) {
      out.push({ id: `virt-${p.id}-${i}`, periodo_id: p.id, nome: `Hipotética ${i + 1}`, tipo: 'prova', nota, valor_maximo: regra.nota_maxima, peso: 1, status: 'nota_lancada', ordem: 99 + i, _simulada: true, _virtual: true });
    }
  });
  return out;
}

export function simularDisciplina(regra, periodos, avals, nota, opts = {}) {
  const lista = completarComVirtuais(regra, periodos, avals, nota, opts);
  return calcDisciplina(regra, periodos, lista, opts.extra || {});
}

/** Nota constante mínima, nas avaliações restantes, para atingir `alvo` na média anual. */
export function notaNecessaria(regraIn, periodos, avals, alvo, opts = {}) {
  const regra = mergeRegra(regraIn);
  const alvoV = isNum(alvo) ? Number(alvo) : regra.media_aprovacao;
  const atual = calcDisciplina(regra, periodos, avals, opts.extra || {});
  const todosCompletos = atual.periodos.length > 0 && atual.periodos.every((p) => p.completo);
  if (todosCompletos) {
    const ok = arred(atual.mediaFinal, regra) >= alvoV - 1e-9;
    return { estado: 'encerrada', atingida: ok, nota: null, mediaAtual: atual.mediaFinal };
  }
  const f = (x) => arred(simularDisciplina(regra, periodos, avals, x, opts).mediaFinal, regra);
  const max = regra.nota_maxima;
  if (f(max) < alvoV - 1e-9) return { estado: 'inviavel', nota: null, melhorCaso: f(max), mediaAtual: atual.mediaFinal };
  if (f(0) >= alvoV - 1e-9) return { estado: 'garantida', nota: 0, mediaAtual: atual.mediaFinal };
  let lo = 0; let hi = max;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (f(mid) >= alvoV - 1e-9) hi = mid; else lo = mid; }
  let n = Math.ceil(hi * 100 - 1e-9) / 100;
  while (n < max && f(n) < alvoV - 1e-9) n = Math.round((n + 0.01) * 100) / 100;
  return { estado: 'alcancavel', nota: Math.min(n, max), mediaAtual: atual.mediaFinal };
}

/** Pontos: quanto falta e se ainda é possível alcançar a pontuação anual. */
export function situacaoPontos(r) {
  return {
    acumulados: r.pontos, necessarios: r.pontosNecessarios, restantes: r.pontosRestantes,
    pct: r.pctPontos, alcancavel: r.pontosAlcancavel,
  };
}

/** Resultado PROJETADO (nunca oficial). */
export function resultadoProjetado(regraIn, r) {
  const regra = mergeRegra(regraIn);
  if (!r.temDados) return { codigo: 'sem_dados', texto: 'Sem dados suficientes' };
  const okMedia = arred(r.mediaFinal, regra) >= regra.media_aprovacao - 1e-9;
  const okPontos = r.pontos >= regra.pontos_aprovacao - 1e-9;
  let ok;
  if (regra.criterio_aprovacao === 'pontos') ok = okPontos;
  else if (regra.criterio_aprovacao === 'ambos') ok = okMedia && okPontos;
  else ok = okMedia;
  if (r.parcial) {
    return ok ? { codigo: 'em_curso_ok', texto: 'Em curso — acima da meta (parcial)' }
      : { codigo: 'em_curso_risco', texto: 'Em curso — abaixo da meta (parcial)' };
  }
  if (ok) return { codigo: 'aprovada_proj', texto: 'Aprovação projetada' };
  const m = arred(r.mediaFinal, regra);
  if (m >= regra.media_minima_prova_final - 1e-9) return { codigo: 'recuperacao_proj', texto: 'Recuperação final projetada' };
  return { codigo: 'reprovacao_proj', texto: 'Reprovação projetada (aguardar resultado oficial)' };
}

export const ROTULO_PARCIAL = 'MÉDIA PARCIAL — RESULTADO NÃO DEFINITIVO.';
