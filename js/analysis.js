/* =========================================================================
 * analysis.js — diagnósticos, tendências, alertas, prioridades e textos
 * Tudo baseado em regras sobre dados reais (usa calc.js). Sem previsões como certeza.
 * ========================================================================= */
import { arred, fmt, isNum, media, desvioPadrao, notaNecessaria, nomeTipo, STATUS_INFO } from './calc.js';

export const LIM = {
  melhoraDelta: 0.5, melhoraSig: 1.0, quedaDelta: -0.5, deterioracao: -1.0,
  oscilacaoDesvio: 1.2, oscilacaoAmplitude: 3.0, slope: 0.25, quedaMin: 0.2,
  diasProxima: 7, poucasNotas: 2,
};

/* ---------- tendência de uma série de notas (ordem cronológica) ---------- */
export function tendencia(vals, aprovacao = 7) {
  const n = vals.length;
  const t = {
    n, rotulo: 'insuficiente', slope: 0, delta: null, quedaConsecutiva: 0, desvio: desvioPadrao(vals),
    amplitude: n ? Math.max(...vals) - Math.min(...vals) : 0, oscilacao: false, melhoraSignificativa: false,
    deterioracao: false, recuperouAposBaixa: false, consistente: false,
  };
  if (n < 2) return t;
  // regressão linear simples
  const xs = vals.map((_, i) => i); const mx = media(xs); const my = media(vals);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  t.slope = den ? xs.reduce((s, x, i) => s + (x - mx) * (vals[i] - my), 0) / den : 0;
  for (let i = n - 1; i > 0; i--) { if (vals[i] < vals[i - 1] - LIM.quedaMin) t.quedaConsecutiva++; else break; }
  if (n >= 4) {
    const ult = media(vals.slice(-2)); const ant = media(vals.slice(-4, -2));
    t.delta = ult - ant;
  } else if (n >= 2) {
    t.delta = vals[n - 1] - vals[n - 2];
  }
  if (n >= 3) {
    if (t.delta >= LIM.melhoraDelta || t.slope >= LIM.slope) t.rotulo = 'positiva';
    else if (t.delta <= LIM.quedaDelta || t.slope <= -LIM.slope) t.rotulo = 'negativa';
    else t.rotulo = 'estavel';
  }
  t.melhoraSignificativa = t.delta !== null && t.delta >= LIM.melhoraSig;
  t.deterioracao = t.delta !== null && t.delta <= LIM.deterioracao;
  t.oscilacao = n >= 3 && (t.desvio >= LIM.oscilacaoDesvio || t.amplitude >= LIM.oscilacaoAmplitude);
  for (let i = 0; i < n - 1; i++) if (vals[i] < aprovacao && vals[i + 1] >= aprovacao + 1) t.recuperouAposBaixa = true;
  t.consistente = n >= 3 && t.desvio < 0.8 && vals.every((v) => v >= aprovacao);
  return t;
}
export const ROTULO_TEND = { positiva: 'Tendência positiva', negativa: 'Tendência de queda', estavel: 'Estável', insuficiente: 'Dados insuficientes' };

/* ---------- risco acadêmico ---------- */
export function riscoDisciplina(regra, r, tend, nec) {
  if (!r.temDados) return 'indefinido';
  if (r.status === 'critica') return 'critico';
  if (nec && nec.estado === 'inviavel') return 'critico';
  if (r.status === 'atencao') return tend.rotulo === 'negativa' || (nec && nec.estado === 'alcancavel' && nec.nota > 8.5) ? 'alto' : 'moderado';
  if (tend.rotulo === 'negativa' || tend.deterioracao || tend.quedaConsecutiva >= 2) return 'moderado';
  if (isNum(r.ultimaNota) && r.ultimaNota < regra.media_aprovacao) return 'moderado';
  return 'baixo';
}
export const ROTULO_RISCO = { indefinido: 'Indefinido', baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto', critico: 'Crítico' };

/* ---------- diagnóstico completo de uma disciplina ---------- */
export function diagnosticoDisciplina(regra, periodos, item, hoje = new Date()) {
  const { md, disc, avals, r } = item;
  const vals = r.notasSeq.filter((n) => n.tipo !== 'recuperacao').map((n) => n.nota);
  const tend = tendencia(vals, regra.media_aprovacao);
  const nec = r.temDados ? notaNecessaria(regra, periodos, avals, regra.media_aprovacao, { extra: { provaFinal: md.prova_final } }) : null;
  const risco = riscoDisciplina(regra, r, tend, nec);
  const meta = isNum(md.meta_media) ? Number(md.meta_media) : null;
  const baixas = r.notasSeq.filter((n) => n.tipo !== 'recuperacao' && arred(n.nota, regra) < regra.media_aprovacao);
  const recAplicadas = r.periodos.filter((p) => p.recAplicada);
  const nome = disc.nome;
  const frases = [];
  const M = fmt(r.mediaFinal);

  if (!r.temDados) {
    frases.push(`${nome} ainda não possui notas lançadas — não há dados suficientes para uma conclusão segura.`);
  } else {
    const dif = r.mediaFinal - regra.media_aprovacao;
    const parc = r.parcial ? ' (média parcial, resultado não definitivo)' : '';
    if (r.status === 'aprovada') frases.push(`${nome} apresenta média ${M}${parc}, ${fmt(Math.abs(dif))} ponto(s) acima da média de aprovação (${fmt(regra.media_aprovacao, 1)}).`);
    else frases.push(`${nome} apresenta média ${M}${parc}, ${fmt(Math.abs(dif))} ponto(s) abaixo da média de aprovação (${fmt(regra.media_aprovacao, 1)}).`);
    if (tend.rotulo === 'positiva') frases.push(`Há evolução positiva nas últimas avaliações (variação de ${fmt(tend.delta)} ponto(s) entre as duas últimas e as duas anteriores).`);
    else if (tend.rotulo === 'negativa') frases.push(`As últimas avaliações mostram queda em relação às anteriores (variação de ${fmt(tend.delta)} ponto(s)). Vale acompanhar a próxima nota.`);
    else if (tend.rotulo === 'estavel') frases.push('O desempenho está estável ao longo das avaliações.');
    if (tend.quedaConsecutiva >= 2) frases.push(`Foram registradas ${tend.quedaConsecutiva} quedas consecutivas nas últimas notas.`);
    if (tend.oscilacao) frases.push(`Há oscilação significativa entre as notas (amplitude de ${fmt(tend.amplitude)} pontos); convém identificar quais conteúdos geram maior dificuldade.`);
    if (tend.recuperouAposBaixa) frases.push('Houve recuperação do desempenho após nota baixa.');
    if (recAplicadas.length) frases.push(`Recuperação aplicada em: ${recAplicadas.map((p) => p.nome).join(', ')}.`);
    if (tend.consistente) frases.push('Desempenho consistente: notas acima da meta com pouca variação.');
    if (baixas.length) frases.push(`Notas abaixo de ${fmt(regra.media_aprovacao, 1)}: ${baixas.map((b) => `${b.nome} (${fmt(b.nota)})`).join('; ')}.`);
    if (nec) {
      if (nec.estado === 'alcancavel') frases.push(`Para fechar o ano com média ${fmt(regra.media_aprovacao, 1)}, a nota média necessária nas avaliações restantes é ${fmt(nec.nota)}.`);
      else if (nec.estado === 'garantida') frases.push(`Com as notas atuais, a média ${fmt(regra.media_aprovacao, 1)} já fica garantida, independentemente das avaliações restantes.`);
      else if (nec.estado === 'inviavel') frases.push('Mesmo com nota máxima nas avaliações restantes, a média de aprovação não seria alcançada — situação que exige ação prioritária e consulta às regras de recuperação da escola.');
    }
  }
  if (meta !== null && r.temDados) {
    frases.push(arred(r.mediaFinal, regra) >= meta ? `Meta de média ${fmt(meta, 1)} atingida.` : `Meta de média ${fmt(meta, 1)} ainda não atingida (faltam ${fmt(meta - r.mediaFinal)}).`);
  }

  // recomendação proporcional
  let recomendacao;
  if (!r.temDados) recomendacao = 'Lançar as notas assim que forem divulgadas.';
  else if (risco === 'critico') recomendacao = 'Prioridade máxima: revisar os conteúdos das avaliações com menor nota, fazer exercícios complementares, definir meta para a próxima avaliação e conversar com o professor sobre recuperação.';
  else if (risco === 'alto') recomendacao = 'Reforçar os conteúdos das últimas avaliações, estabelecer meta de nota para a próxima prova e reavaliar após novo lançamento.';
  else if (risco === 'moderado') recomendacao = 'Acompanhar de perto a próxima avaliação e manter a rotina de revisão dos conteúdos mais recentes.';
  else recomendacao = 'Manter a rotina de estudos atual; continuar acompanhando as próximas notas.';

  return { md, disc, r, tend, nec, risco, meta, baixas, frases, recomendacao, avals };
}

/* ---------- prioridade de estudo ---------- */
export function prioridadeEstudo(regra, diag, hoje = new Date()) {
  const { r, tend, md, nec } = diag;
  let s = 0; const motivos = [];
  if (!r.temDados) return { score: 0, nivel: 'baixa', motivos: ['Sem dados suficientes'], nivelAuto: 'baixa', manual: md.prioridade_manual || null };
  if (r.status === 'critica') { s += 40; motivos.push('média em situação crítica'); }
  else if (r.status === 'atencao') { s += 25; motivos.push('média abaixo da aprovação'); }
  const alvo = isNum(md.meta_media) ? Number(md.meta_media) : regra.media_aprovacao;
  if (r.mediaFinal < alvo) { const g = Math.min(3, alvo - r.mediaFinal); s += g * 8; motivos.push(`${fmt(alvo - r.mediaFinal)} ponto(s) abaixo da meta`); }
  if (tend.rotulo === 'negativa') { s += 15; motivos.push('queda recente de notas'); }
  if (tend.quedaConsecutiva >= 2) { s += 10; motivos.push('quedas consecutivas'); }
  if (tend.oscilacao) { s += 5; motivos.push('grande oscilação'); }
  if (isNum(r.ultimaNota) && arred(r.ultimaNota, regra) < regra.media_aprovacao) { s += 10; motivos.push('última nota abaixo da média'); }
  const dificuldade = r.periodos.some((p) => p.resultado !== null && (p.media ?? 99) < regra.media_aprovacao);
  if (dificuldade) { s += 8; motivos.push('histórico de dificuldade no ano'); }
  const prox = (diag.avals || []).filter((a) => a.data_avaliacao && !isNum(a.nota) && a.status !== 'nao_realizada').map((a) => diasAte(a.data_avaliacao, hoje)).filter((d) => d >= 0 && d <= 14);
  if (prox.length) { s += 10; motivos.push('avaliação próxima'); }
  if (nec && nec.estado === 'inviavel') { s += 25; motivos.push('aprovação matematicamente inviável'); }
  const nivelAuto = s >= 50 ? 'urgente' : s >= 30 ? 'alta' : s >= 15 ? 'moderada' : 'baixa';
  return { score: Math.round(s), nivel: md.prioridade_manual || nivelAuto, nivelAuto, manual: md.prioridade_manual || null, motivos };
}
export const ROTULO_PRIORIDADE = { baixa: 'Prioridade baixa', moderada: 'Prioridade moderada', alta: 'Prioridade alta', urgente: 'Prioridade urgente' };

export function diasAte(dataIso, hoje = new Date()) {
  const d = new Date(`${String(dataIso).slice(0, 10)}T00:00:00`);
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((d - h) / 86400000);
}

/* ---------- alertas ---------- */
export const NIVEIS_ALERTA = {
  informativo: { rotulo: 'Informativo', cor: 'var(--info)' }, atencao: { rotulo: 'Atenção', cor: 'var(--yellow)' },
  importante: { rotulo: 'Importante', cor: 'var(--warn)' }, critico: { rotulo: 'Crítico', cor: 'var(--danger)' },
  positivo: { rotulo: 'Positivo', cor: 'var(--ok)' },
};
const ORDEM_NIVEL = { critico: 0, importante: 1, atencao: 2, informativo: 3, positivo: 4 };
export const ordemNivel = (n) => ORDEM_NIVEL[n] ?? 9;

/** Calcula o conjunto atual de alertas (determinístico, com chave estável). */
export function gerarAlertas(regra, periodos, itens, geral, metas = [], hoje = new Date(), mat = null) {
  const out = [];
  const add = (a) => out.push({ matricula_id: mat?.id || null, ...a });
  const ap = regra.media_aprovacao;
  const diags = itens.map((it) => diagnosticoDisciplina(regra, periodos, it, hoje));
  const periodoAtual = (() => { // último período com alguma nota lançada
    let n = null; itens.forEach((it) => it.r.periodos.forEach((p) => { if (p.temDados && (n === null || p.numero > n)) n = p.numero; })); return n;
  })();

  diags.forEach((d) => {
    const { md, disc, r, tend, nec } = d;
    const base = { matricula_disciplina_id: md.id, disciplina: disc.nome };
    if (!r.temDados) {
      add({ ...base, chave: `sem_notas:${md.id}`, tipo: 'poucas_notas', nivel: 'informativo', titulo: `${disc.nome}: sem notas`, descricao: 'Nenhuma nota lançada nesta disciplina.', recomendacao: 'Lance as notas quando disponíveis.' });
      return;
    }
    // notas baixas no período mais recente
    r.notasSeq.filter((n) => n.tipo !== 'recuperacao' && n.periodo === periodoAtual && arred(n.nota, regra) < ap).forEach((n) => {
      add({ ...base, chave: `nota_baixa:${n.id}`, tipo: 'nota_baixa', nivel: n.nota < regra.limites_status.atencao ? 'importante' : 'atencao', titulo: `${disc.nome}: nota abaixo de ${fmt(ap, 1)}`, descricao: `${n.nome} (${n.periodoNome}): ${fmt(n.nota)}.`, recomendacao: 'Revisar os conteúdos dessa avaliação e conversar com o professor sobre dúvidas.' });
    });
    if (r.status === 'atencao' || r.status === 'critica') {
      add({ ...base, chave: `${r.status === 'critica' ? 'critica' : 'media_abaixo'}:${md.id}`, tipo: r.status === 'critica' ? 'disciplina_critica' : 'media_abaixo', nivel: r.status === 'critica' ? 'critico' : 'importante', titulo: `${disc.nome}: ${r.status === 'critica' ? 'situação crítica' : 'média abaixo da aprovação'}`, descricao: `Média ${fmt(r.mediaFinal)}${r.parcial ? ' (parcial)' : ''} contra meta de aprovação ${fmt(ap, 1)}.`, recomendacao: d.recomendacao });
    }
    if (tend.quedaConsecutiva >= 2) {
      const ult = r.notasSeq[r.notasSeq.length - 1];
      add({ ...base, chave: `queda:${md.id}:${ult?.id}`, tipo: 'queda_consecutiva', nivel: tend.quedaConsecutiva >= 3 ? 'importante' : 'atencao', titulo: `${disc.nome}: queda consecutiva`, descricao: `${tend.quedaConsecutiva} quedas seguidas nas últimas notas.`, recomendacao: 'Identificar o que mudou (conteúdo, rotina de estudo) e reforçar a revisão.' });
    }
    if (nec && nec.estado === 'inviavel') add({ ...base, chave: `inviavel:${md.id}`, tipo: 'risco_pontuacao', nivel: 'critico', titulo: `${disc.nome}: aprovação inviável pelas regras atuais`, descricao: 'Mesmo com nota máxima nas avaliações restantes, a média de aprovação não é alcançada.', recomendacao: 'Verificar com a escola as regras de recuperação e priorizar esta disciplina.' });
    if (nec && nec.estado === 'alcancavel' && nec.nota > 8.5) add({ ...base, chave: `exigente:${md.id}`, tipo: 'risco_pontuacao', nivel: 'importante', titulo: `${disc.nome}: nota alta necessária`, descricao: `Será preciso média ${fmt(nec.nota)} nas avaliações restantes para atingir ${fmt(ap, 1)}.`, recomendacao: 'Planejar estudos com antecedência para as próximas avaliações.' });
    const perCompl = r.periodos.filter((p) => p.completo && p.resultado !== null && arred(p.resultado, regra) < ap);
    perCompl.forEach((p) => add({ ...base, chave: `recuperacao:${md.id}:${p.numero}`, tipo: 'necessidade_recuperacao', nivel: 'importante', titulo: `${disc.nome}: ${p.nome} abaixo da média`, descricao: `Resultado ${fmt(p.resultado)} no ${p.nome}.`, recomendacao: 'Verificar a possibilidade de recuperação e reforçar os conteúdos do período.' }));
    r.periodos.filter((p) => p.recAplicada).forEach((p) => add({ ...base, chave: `rec_ok:${md.id}:${p.numero}`, tipo: 'recuperacao_positiva', nivel: 'positivo', titulo: `${disc.nome}: recuperação bem-sucedida`, descricao: `Média do ${p.nome} era ${fmt(p.media)}; após recuperação o resultado ficou em ${fmt(p.resultado)}.`, recomendacao: 'Manter a revisão dos conteúdos para evitar nova queda.' }));
    if (tend.melhoraSignificativa && tend.n >= 4) add({ ...base, chave: `melhora:${md.id}:${r.notasSeq[r.notasSeq.length - 1]?.id}`, tipo: 'melhora', nivel: 'positivo', titulo: `${disc.nome}: melhora significativa`, descricao: `Variação de +${fmt(tend.delta)} ponto(s) nas últimas notas.`, recomendacao: 'Reconhecer o progresso e manter a estratégia de estudo.' });
    if (r.qtdLancadas < LIM.poucasNotas) add({ ...base, chave: `poucas_notas:${md.id}`, tipo: 'poucas_notas', nivel: 'informativo', titulo: `${disc.nome}: poucas notas registradas`, descricao: `Apenas ${r.qtdLancadas} nota(s) lançada(s); a análise ainda é pouco segura.`, recomendacao: 'Aguardar novas notas antes de tirar conclusões.' });
    // metas de média
    if (isNum(md.meta_media) && arred(r.mediaFinal, regra) < Number(md.meta_media) && r.qtdLancadas >= LIM.poucasNotas) {
      add({ ...base, chave: `meta_media:${md.id}`, tipo: 'meta_nao_atingida', nivel: 'atencao', titulo: `${disc.nome}: meta de média não atingida`, descricao: `Meta ${fmt(md.meta_media, 1)}; média atual ${fmt(r.mediaFinal)}.`, recomendacao: 'Definir meta de nota para a próxima avaliação.' });
    }
    // datas de avaliações
    d.avals.filter((a) => a.data_avaliacao && !isNum(a.nota) && a.status !== 'nao_realizada').forEach((a) => {
      const dd = diasAte(a.data_avaliacao, hoje);
      if (dd < 0) add({ ...base, chave: `aval_vencida:${a.id}`, tipo: 'avaliacao_vencida', nivel: 'importante', titulo: `${disc.nome}: avaliação sem nota após a data`, descricao: `${a.nome} estava marcada para ${fmtData(a.data_avaliacao)} e não tem nota registrada.`, recomendacao: 'Lançar a nota ou marcar como não realizada.' });
      else if (dd <= LIM.diasProxima) add({ ...base, chave: `aval_proxima:${a.id}`, tipo: 'avaliacao_proxima', nivel: dd <= 2 ? 'atencao' : 'informativo', titulo: `${disc.nome}: avaliação ${dd === 0 ? 'hoje' : `em ${dd} dia(s)`}`, descricao: `${a.nome} — ${fmtData(a.data_avaliacao)}.`, recomendacao: 'Revisar o conteúdo antes da data.' });
    });
  });

  // pendentes sem data, agregadas por período
  const pend = {};
  itens.forEach((it) => it.avals.filter((a) => !isNum(a.nota) && a.status !== 'nao_realizada' && !a.data_avaliacao && a.tipo !== 'recuperacao').forEach((a) => {
    const p = periodos.find((x) => x.id === a.periodo_id); if (!p) return; pend[p.numero] = pend[p.numero] || { p, n: 0 }; pend[p.numero].n++;
  }));
  Object.values(pend).forEach(({ p, n }) => add({ matricula_disciplina_id: null, chave: `pendentes:${mat?.id}:${p.numero}`, tipo: 'avaliacao_sem_nota', nivel: 'informativo', titulo: `${p.nome}: ${n} avaliação(ões) sem nota`, descricao: `Há ${n} avaliação(ões) aguardando lançamento no ${p.nome}.`, recomendacao: 'Lançar as notas quando forem divulgadas.' }));

  // média geral em declínio
  const ev = (geral?.evolucao || []).filter((e) => e.media !== null);
  if (ev.length >= 3 && ev[ev.length - 1].media < ev[ev.length - 2].media && ev[ev.length - 2].media < ev[ev.length - 3].media) {
    add({ matricula_disciplina_id: null, chave: `geral_declinio:${mat?.id}:${ev.length}`, tipo: 'media_geral_declinio', nivel: 'atencao', titulo: 'Média geral em declínio', descricao: `A média geral caiu em ${ev.length - 1} períodos consecutivos (${ev.map((e) => fmt(e.media)).join(' → ')}).`, recomendacao: 'Verificar quais disciplinas puxaram a queda e ajustar o plano de estudos.' });
  }
  // metas cadastradas
  metas.filter((m) => m.status === 'ativa' && m.data_limite && diasAte(m.data_limite, hoje) < 0).forEach((m) => add({ matricula_disciplina_id: m.matricula_disciplina_id, chave: `meta_vencida:${m.id}`, tipo: 'meta_nao_atingida', nivel: 'atencao', titulo: 'Meta com prazo vencido', descricao: m.descricao || `Meta ${fmt(m.valor_meta, 1)} (prazo ${fmtData(m.data_limite)})`, recomendacao: 'Atualizar o status da meta.' }));
  return out.sort((a, b) => ordemNivel(a.nivel) - ordemNivel(b.nivel));
}

export function fmtData(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`;
}

/* ---------- rankings ---------- */
export function rankings(diags) {
  const com = diags.filter((d) => d.r.temDados);
  const porMedia = [...com].sort((a, b) => b.r.mediaFinal - a.r.mediaFinal);
  const evo = com.filter((d) => d.tend.n >= 3 && d.tend.delta !== null).sort((a, b) => b.tend.delta - a.tend.delta);
  return { porMedia, mais_evoluiram: evo.filter((d) => d.tend.delta > 0).slice(0, 5), mais_regrediram: [...evo].reverse().filter((d) => d.tend.delta < 0).slice(0, 5) };
}

/* ---------- central de inteligência ---------- */
export function centralInteligencia(regra, diags, geral, prios) {
  const com = diags.filter((d) => d.r.temDados);
  const fortes = [...com].filter((d) => d.r.status === 'aprovada')
    .sort((a, b) => (b.r.mediaFinal - b.r.desvio * 0.5) - (a.r.mediaFinal - a.r.desvio * 0.5)).slice(0, 4);
  const fracos = [...com].map((d) => ({ d, p: prios[d.md.id] })).sort((a, b) => b.p.score - a.p.score || a.d.r.mediaFinal - b.d.r.mediaFinal)
    .filter((x) => x.p.score >= 15 || x.d.r.status !== 'aprovada').map((x) => x.d).slice(0, 4);
  const motivosFraco = (d) => {
    const m = [];
    if (d.r.status !== 'aprovada') m.push('média abaixo da aprovação');
    if (d.r.ultimaNota !== null && arred(d.r.ultimaNota, regra) < regra.media_aprovacao) m.push('última nota baixa');
    if (d.tend.oscilacao) m.push('grande oscilação');
    if (d.tend.rotulo === 'negativa') m.push('queda de desempenho');
    if (d.tend.quedaConsecutiva >= 2) m.push('quedas consecutivas');
    if (d.baixas.length >= 2) m.push('dificuldade persistente');
    return m;
  };
  const plano = com.map((d) => ({ d, p: prios[d.md.id] })).filter((x) => x.p.score >= 15)
    .sort((a, b) => b.p.score - a.p.score).slice(0, 5).map((x, i) => ({
      ordem: i + 1, nome: x.d.disc.nome, nivel: x.p.nivel, motivo: x.p.motivos.join('; '),
      acoes: acoesPara(x.d, regra),
    }));
  const tend = geral.evolucao.filter((e) => e.media !== null);
  let tendGeral = 'Dados insuficientes para definir tendência geral.';
  if (tend.length >= 2) {
    const d = tend[tend.length - 1].media - tend[tend.length - 2].media;
    tendGeral = d > 0.15 ? `Média geral em alta (+${fmt(d)} em relação ao período anterior).` : d < -0.15 ? `Média geral em queda (${fmt(d)} em relação ao período anterior).` : 'Média geral estável em relação ao período anterior.';
  }
  const resumo = !com.length ? 'Ainda não há notas suficientes para um diagnóstico.' :
    `Média geral ${fmt(geral.media)}${geral.parcial ? ' (parcial — resultado não definitivo)' : ''}: ${geral.cont.aprovada} disciplina(s) satisfatória(s), ${geral.cont.atencao} em atenção e ${geral.cont.critica} crítica(s).`;
  return { resumo, tendGeral, fortes, fracos: fracos.map((d) => ({ d, motivos: motivosFraco(d) })), plano };
}

function acoesPara(d, regra) {
  const a = [];
  if (d.baixas.length) a.push(`Revisar os conteúdos de: ${d.baixas.slice(0, 3).map((b) => b.nome).join(', ')}.`);
  else a.push('Revisar os conteúdos das últimas avaliações.');
  if (d.tend.oscilacao) a.push('Identificar quais conteúdos geram maior dificuldade e reforçá-los.');
  if (d.risco === 'critico' || d.risco === 'alto') a.push('Realizar exercícios complementares e conversar com o professor.');
  if (d.nec && d.nec.estado === 'alcancavel') a.push(`Definir meta de ${fmt(d.nec.nota)} (ou mais) nas próximas avaliações.`);
  else a.push('Estabelecer meta para a próxima avaliação.');
  a.push('Reavaliar o desempenho após o novo lançamento de notas.');
  return a;
}

/* ---------- pesos/comparações entre períodos equivalentes ---------- */
export function seriePorPeriodo(r) {
  return r.periodos.map((p) => (p.resultado !== null ? p.resultado : null));
}
