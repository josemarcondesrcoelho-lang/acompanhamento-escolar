import { S, ctx, diagnosticos, matriculas } from '../state.js';
import { fmt, arred, isNum, STATUS_INFO, ROTULO_PARCIAL, calcGeral } from '../calc.js';
import { ROTULO_TEND, ROTULO_RISCO, ROTULO_PRIORIDADE, rankings, centralInteligencia, fmtData } from '../analysis.js';
import { esc, icone, badgeStatus, tendIcone, notaHTML, vazioHTML, opcoesSelect } from '../ui.js';
import { criar, cores, escalaNota } from '../charts.js';
import { topoPagina, graficoEvolucao, resumoEvolucao } from './comum.js';

const V = { aba: 'central', disc: '', modo: 'avaliacao', grade: false, comp: null, ordem: 'media_desc' };
const ABAS = [['central', 'Central de Inteligência'], ['evolucao', 'Evolução por disciplina'], ['ranking', 'Ranking'], ['comparar', 'Comparar disciplinas'], ['diag', 'Diagnóstico'], ['pontos', 'Pontuação acumulada']];

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', 'Crie um ano letivo em Configurações.'); return; }
  const dg = diagnosticos();
  el.innerHTML = `${topoPagina('Análise de Desempenho', `${esc(c.est?.nome || '')} · ${c.ano.ano} · ${esc(c.serie?.nome || '')}${c.geral.parcial ? ' · <span class="badge parcial">Parcial</span>' : ''}`)}
    <div class="tabs" role="tablist">${ABAS.map(([k, l]) => `<button role="tab" data-aba="${k}" class="${V.aba === k ? 'ativo' : ''}">${l}</button>`).join('')}</div><div id="aba"></div>`;
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { V.aba = b.dataset.aba; render(el); }));
  const area = el.querySelector('#aba');
  if (!c.items.length) { area.innerHTML = `<div class="card">${vazioHTML('Sem disciplinas ativas', 'Cadastre disciplinas e notas.')}</div>`; return; }
  ({ central, evolucao, ranking, comparar, diag, pontos }[V.aba])(area, c, dg, () => render(el));
}

/* ---------- Central de Inteligência Acadêmica ---------- */
function central(area, c, dg) {
  const { regra, geral } = c;
  const ci = centralInteligencia(regra, dg.diags, geral, dg.prios);
  const dmap = Object.fromEntries(dg.diags.map((d) => [d.md.id, d]));
  // perguntas-chave
  const com = dg.diags.filter((d) => d.r.temDados);
  const ordenadas = [...com].sort((a, b) => b.r.mediaFinal - a.r.mediaFinal);
  const abaixo = com.filter((d) => d.r.status !== 'aprovada');
  const risco = com.filter((d) => ['alto', 'critico'].includes(d.risco));
  const exigentes = com.filter((d) => d.nec && d.nec.estado === 'alcancavel').sort((a, b) => b.nec.nota - a.nec.nota).slice(0, 3);
  const prio = [...com].sort((a, b) => dg.prios[b.md.id].score - dg.prios[a.md.id].score)[0];
  const ev = geral.evolucao.filter((e) => e.media !== null);
  const anterior = matriculas().filter((m) => m.ano.ano < c.ano.ano && m.est?.id === c.est?.id).slice(-1)[0];
  let cmpAno = 'Não há ano anterior cadastrado para comparação.';
  if (anterior) { const ca = ctx(anterior.mat.id); if (ca && ca.geral.media !== null && geral.media !== null) { const d = geral.media - ca.geral.media; cmpAno = `Média geral ${fmt(geral.media)} em ${c.ano.ano} contra ${fmt(ca.geral.media)} em ${ca.ano.ano} (${d >= 0 ? '+' : ''}${fmt(d)}).`; } }
  const qa = [
    ['Como está o desempenho escolar geral?', ci.resumo],
    ['Quais disciplinas apresentam melhor desempenho?', ordenadas.slice(0, 3).map((d) => `${esc(d.disc.nome)} (${fmt(d.r.mediaFinal)})`).join(', ') || '—'],
    ['Quais disciplinas estão mais fracas?', [...ordenadas].reverse().slice(0, 3).map((d) => `${esc(d.disc.nome)} (${fmt(d.r.mediaFinal)})`).join(', ') || '—'],
    ['Em quais disciplinas existe risco de reprovação?', risco.length ? risco.map((d) => `${esc(d.disc.nome)} (risco ${ROTULO_RISCO[d.risco].toLowerCase()})`).join(', ') : 'Nenhuma disciplina com risco alto ou crítico nos dados lançados. O resultado do ano ainda não é definitivo enquanto houver períodos incompletos.'],
    ['Quanto falta para atingir a média de aprovação?', abaixo.length ? abaixo.map((d) => `${esc(d.disc.nome)}: faltam ${fmt(regra.media_aprovacao - d.r.mediaFinal)} ponto(s) de média`).join('; ') : `Nenhuma disciplina está abaixo de ${fmt(regra.media_aprovacao, 1)} (média parcial).`],
    ['A estudante está melhorando ou piorando?', ci.tendGeral],
    ['Quais disciplinas precisam de intervenção imediata?', ci.plano.filter((p) => ['alta', 'urgente'].includes(p.nivel)).map((p) => esc(p.nome)).join(', ') || 'Nenhuma disciplina exige intervenção imediata com os dados atuais.'],
    ['Qual disciplina merece prioridade de estudo?', prio ? `${esc(prio.disc.nome)} — ${esc(ROTULO_PRIORIDADE[dg.prios[prio.md.id].nivel].toLowerCase())} (${esc(dg.prios[prio.md.id].motivos.join('; ') || 'sem alertas relevantes')}).` : '—'],
    ['Qual nota será necessária nas próximas avaliações?', exigentes.length ? `Para fechar com média ${fmt(regra.media_aprovacao, 1)}: ${exigentes.map((d) => `${esc(d.disc.nome)} ≥ ${fmt(d.nec.nota)}`).join('; ')} (as demais já têm folga${geral.parcial ? ' — valor mínimo, constante, nas avaliações restantes' : ''}).` : (com.some((d) => d.nec?.estado === 'garantida') ? 'Em várias disciplinas a aprovação já está garantida pelas notas atuais.' : 'Sem avaliações restantes a simular.')],
    ['Como está a evolução em relação aos anos anteriores?', cmpAno],
  ];
  area.innerHTML = `
    <div class="card"><h3>Diagnóstico geral</h3><p>${esc(ci.resumo)}</p><p class="small t2">${esc(ci.tendGeral)}</p>${geral.parcial ? `<p class="xs"><span class="badge parcial">${ROTULO_PARCIAL}</span></p>` : ''}
      <div class="flex gap wrap"><span class="badge ok">${geral.cont.aprovada} satisfatória(s)</span><span class="badge warn">${geral.cont.atencao} em atenção</span><span class="badge danger">${geral.cont.critica} crítica(s)</span><span class="badge muted">${geral.cont.sem_dados} sem dados</span></div></div>
    <div class="grid g2 mt">
      <div class="card"><h3>${icone('estrela', 16)} Principais pontos fortes</h3>${ci.fortes.length ? ci.fortes.map((d) => `<p style="margin-bottom:.45rem"><span class="dot" style="--cor:${d.disc.cor}"></span> <b>${esc(d.disc.nome)}</b> — média ${fmt(d.r.mediaFinal)}${d.tend.consistente ? ', desempenho consistente' : ''}${d.tend.rotulo === 'positiva' ? ', em evolução' : ''}.</p>`).join('') : '<p class="muted">Sem dados suficientes.</p>'}</div>
      <div class="card"><h3>${icone('alerta', 16)} Principais pontos de atenção</h3>${ci.fracos.length ? ci.fracos.map(({ d, motivos }) => `<p style="margin-bottom:.45rem"><span class="dot" style="--cor:${d.disc.cor}"></span> <b>${esc(d.disc.nome)}</b> — média ${fmt(d.r.mediaFinal)}${motivos.length ? `: ${esc(motivos.join(', '))}` : ''}.</p>`).join('') : '<p class="muted">Nenhum ponto fraco relevante identificado nos dados atuais.</p>'}</div>
    </div>
    <div class="card mt"><h3>Plano de ação sugerido</h3>${ci.plano.length ? `<div class="flex" style="flex-direction:column;gap:.7rem">${ci.plano.map((p) => `<div class="prio"><div class="n">${p.ordem}</div><div><b>PRIORIDADE ${p.ordem} — ${esc(p.nome.toUpperCase())}</b> <span class="badge ${p.nivel === 'urgente' ? 'danger' : p.nivel === 'alta' ? 'warn' : 'yellow'}">${esc(ROTULO_PRIORIDADE[p.nivel])}</span><div class="small t2">Motivo: ${esc(p.motivo)}</div><ul class="small" style="margin:.35rem 0 0;padding-left:1.1rem">${p.acoes.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div></div>`).join('')}</div>`
      : '<p class="muted">Nenhuma disciplina exige ação prioritária com os dados lançados. Manter a rotina de estudos e acompanhar as próximas avaliações.</p>'}
      <p class="xs muted" style="margin-top:.7rem">As recomendações são geradas por regras sobre os dados reais e são proporcionais à situação; não são previsões de resultado.</p></div>
    <div class="card mt"><h3>Respostas rápidas</h3><div class="flex" style="flex-direction:column;gap:.55rem">${qa.map(([q, a], i) => `<div><div class="small" style="font-weight:700">${i + 1}. ${q}</div><div class="small t2">${a}</div></div>`).join('')}</div></div>`;
}

/* ---------- Evolução por disciplina ---------- */
function evolucao(area, c, dg, re) {
  const dmap = Object.fromEntries(dg.diags.map((d) => [d.md.id, d]));
  if (!V.disc || !c.items.some((i) => i.md.id === V.disc)) V.disc = c.items[0].md.id;
  area.innerHTML = `<div class="card" style="padding:.7rem .9rem"><div class="filtros">
    <div class="field"><label for="e-disc">Disciplina</label><select id="e-disc" ${V.grade ? 'disabled' : ''}>${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), V.disc)}</select></div>
    <div class="field"><label for="e-modo">Visão</label><select id="e-modo"><option value="avaliacao">Por avaliação</option><option value="periodo">Por ${esc(c.regra.tipo_periodo)} (comparar períodos)</option><option value="mensal">Mensal (requer datas)</option></select></div>
    <div class="seg"><button data-g="0" class="${V.grade ? '' : 'ativo'}">Individual</button><button data-g="1" class="${V.grade ? 'ativo' : ''}">Todas as disciplinas</button></div></div></div>
    <div id="evo-area" class="mt"></div>`;
  area.querySelector('#e-modo').value = V.modo;
  const ea = area.querySelector('#evo-area');
  if (!V.grade) {
    const it = c.items.find((i) => i.md.id === V.disc); const d = dmap[it.md.id];
    ea.innerHTML = `<div class="card"><div class="card-topo"><h3><span class="dot" style="--cor:${it.disc.cor}"></span> ${esc(it.disc.nome)}</h3>${badgeStatus(it.r.status, it.r.parcial)}</div><div class="chart-box alto"><canvas id="ch-e1" aria-label="Evolução de ${esc(it.disc.nome)}"></canvas></div>
      <div class="flex gap wrap ac" style="margin-top:.6rem">${resumoEvolucao(d)}<span class="small muted">Pontos vermelhos = nota abaixo de ${fmt(c.regra.media_aprovacao, 1)}.</span></div>${V.modo === 'mensal' && !it.r.notasSeq.some((n) => n.data) ? '<div class="callout aviso" style="margin-top:.6rem">Nenhuma avaliação desta disciplina tem data cadastrada, por isso a visão mensal está vazia. Informe a data ao editar as avaliações ou use "Por avaliação".</div>' : ''}</div>`;
    graficoEvolucao('ch-e1', it, c.regra, V.modo);
  } else {
    ea.innerHTML = `<div class="grid g3">${c.items.map((it) => `<div class="card"><div class="card-topo"><h4><span class="dot" style="--cor:${it.disc.cor}"></span> ${esc(it.disc.nome)}</h4>${tendIcone(dmap[it.md.id].tend.rotulo)}</div><div class="chart-box baixo"><canvas id="ch-g-${it.md.id}"></canvas></div></div>`).join('')}</div>`;
    c.items.forEach((it) => graficoEvolucao(`ch-g-${it.md.id}`, it, c.regra, V.modo));
  }
  area.querySelector('#e-disc').addEventListener('change', (e) => { V.disc = e.target.value; re(); });
  area.querySelector('#e-modo').addEventListener('change', (e) => { V.modo = e.target.value; re(); });
  area.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => { V.grade = b.dataset.g === '1'; re(); }));
}

/* ---------- Ranking ---------- */
function ranking(area, c, dg, re) {
  const rk = rankings(dg.diags); const { regra } = c;
  let lista = [...dg.diags].filter((d) => d.r.temDados);
  const ord = { media_desc: (a, b) => b.r.mediaFinal - a.r.mediaFinal, media_asc: (a, b) => a.r.mediaFinal - b.r.mediaFinal, evo_desc: (a, b) => (b.tend.delta ?? -99) - (a.tend.delta ?? -99), evo_asc: (a, b) => (a.tend.delta ?? 99) - (b.tend.delta ?? 99) }[V.ordem];
  lista.sort(ord);
  const n = rk.porMedia.length; const topo = rk.porMedia.slice(0, Math.min(3, n)); const base = rk.porMedia.slice(Math.max(3, n - 3));
  const meio = rk.porMedia.slice(topo.length, n - base.length);
  const bloco = (t, l, cor) => `<div class="card"><h4>${t}</h4>${l.length ? l.map((d) => `<div class="flex jb" style="padding:.2rem 0"><span><span class="dot" style="--cor:${d.disc.cor}"></span> ${esc(d.disc.nome)}</span><b>${fmt(d.r.mediaFinal)}</b></div>`).join('') : '<span class="muted small">—</span>'}</div>`;
  area.innerHTML = `<div class="grid g3">${bloco('Melhores médias', topo)}${bloco('Médias intermediárias', meio)}${bloco('Menores médias', base)}</div>
    <div class="grid g2 mt"><div class="card"><h4>Disciplinas que mais evoluíram</h4>${rk.mais_evoluiram.length ? rk.mais_evoluiram.map((d) => `<div class="flex jb" style="padding:.2rem 0"><span>${esc(d.disc.nome)}</span><span class="tend up">+${fmt(d.tend.delta)}</span></div>`).join('') : '<span class="muted small">Nenhuma evolução relevante (requer ao menos 3 notas).</span>'}</div>
    <div class="card"><h4>Disciplinas que mais regrediram</h4>${rk.mais_regrediram.length ? rk.mais_regrediram.map((d) => `<div class="flex jb" style="padding:.2rem 0"><span>${esc(d.disc.nome)}</span><span class="tend down">${fmt(d.tend.delta)}</span></div>`).join('') : '<span class="muted small">Nenhuma queda relevante.</span>'}</div></div>
    <div class="card mt"><div class="card-topo"><h3>Ranking completo</h3><div class="field" style="min-width:200px"><label for="r-ord" class="sr">Ordenar</label><select id="r-ord"><option value="media_desc">Maior média</option><option value="media_asc">Menor média</option><option value="evo_desc">Maior evolução</option><option value="evo_asc">Maior queda</option></select></div></div>
    <div class="tabela-wrap"><table><thead><tr><th>#</th><th>Disciplina</th><th class="num">Média</th><th class="num">Variação recente</th><th>Tendência</th><th>Status</th></tr></thead><tbody>${lista.map((d, i) => `<tr><td>${i + 1}</td><td><span class="dot" style="--cor:${d.disc.cor}"></span> ${esc(d.disc.nome)}</td><td class="num">${notaHTML(d.r.mediaFinal, regra)}</td><td class="num">${d.tend.delta === null ? '—' : `${d.tend.delta > 0 ? '+' : ''}${fmt(d.tend.delta)}`}</td><td>${tendIcone(d.tend.rotulo)}</td><td>${badgeStatus(d.r.status, d.r.parcial)}</td></tr>`).join('')}</tbody></table></div></div>`;
  area.querySelector('#r-ord').value = V.ordem;
  area.querySelector('#r-ord').addEventListener('change', (e) => { V.ordem = e.target.value; re(); });
}

/* ---------- Comparar disciplinas ---------- */
function comparar(area, c, dg, re) {
  const { regra } = c; const C = cores();
  if (!V.comp) V.comp = c.items.slice(0, 2).map((i) => i.md.id);
  V.comp = V.comp.filter((id) => c.items.some((i) => i.md.id === id));
  const sel = c.items.filter((i) => V.comp.includes(i.md.id));
  area.innerHTML = `<div class="card"><h3>Escolha duas ou mais disciplinas</h3><div class="flex wrap" style="gap:.5rem">${c.items.map((i) => `<label class="check badge ${V.comp.includes(i.md.id) ? 'info' : 'muted'}" style="cursor:pointer;padding:.3rem .7rem"><input type="checkbox" data-cmp="${i.md.id}" ${V.comp.includes(i.md.id) ? 'checked' : ''}> ${esc(i.disc.nome)}</label>`).join('')}</div>
    <p class="xs muted" style="margin-top:.5rem">A comparação usa o resultado de cada ${esc(regra.tipo_periodo)} (períodos equivalentes), evitando distorção quando as disciplinas têm quantidades diferentes de avaliações.</p></div>
    ${sel.length < 2 ? '<div class="callout aviso mt">Selecione pelo menos duas disciplinas.</div>' : `
    <div class="card mt"><div class="chart-box alto"><canvas id="ch-cmp" aria-label="Comparação entre disciplinas"></canvas></div></div>
    <div class="tabela-wrap mt"><table><thead><tr><th>Disciplina</th><th class="num">Média</th>${c.periodosTodos.map((p) => `<th class="num">${esc(p.nome)}</th>`).join('')}<th class="num">Maior</th><th class="num">Menor</th><th class="num">Nº notas</th><th class="num">Desvio</th></tr></thead><tbody>${sel.map((i) => `<tr><td><span class="dot" style="--cor:${i.disc.cor}"></span> ${esc(i.disc.nome)}</td><td class="num">${notaHTML(i.r.mediaFinal, regra)}</td>${i.r.periodos.map((p) => `<td class="num">${notaHTML(p.resultado, regra)}</td>`).join('')}<td class="num">${fmt(i.r.maior)}</td><td class="num">${fmt(i.r.menor)}</td><td class="num">${i.r.qtdLancadas}</td><td class="num">${fmt(i.r.desvio)}</td></tr>`).join('')}</tbody></table></div>`}`;
  area.querySelectorAll('[data-cmp]').forEach((b) => b.addEventListener('change', () => { V.comp = b.checked ? [...V.comp, b.dataset.cmp] : V.comp.filter((x) => x !== b.dataset.cmp); re(); }));
  if (sel.length >= 2) criar('ch-cmp', { type: 'line', data: { labels: c.periodosTodos.map((p) => p.nome), datasets: sel.map((i) => ({ label: i.disc.nome, data: i.r.periodos.map((p) => (p.resultado === null ? null : arred(p.resultado, regra))), borderColor: i.disc.cor, backgroundColor: i.disc.cor, tension: .3, pointRadius: 5, spanGaps: false })) },
    options: { scales: { ...escalaNota(regra.nota_maxima), x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' }, refLine: { linhas: [{ valor: regra.media_aprovacao, cor: C.yellow, rotulo: `Média ${fmt(regra.media_aprovacao, 1)}` }] } } } });
}

/* ---------- Diagnóstico por disciplina ---------- */
function diag(area, c, dg) {
  const { regra } = c;
  area.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">${dg.diags.map((d) => { const r = d.r; const ult = r.notasSeq.slice(-3);
    return `<div class="card diag-card" style="--dcor:${STATUS_INFO[r.status].cor}"><div class="card-topo"><h3><span class="dot" style="--cor:${d.disc.cor}"></span> ${esc(d.disc.nome)}</h3>${badgeStatus(r.status, r.parcial)}</div>
      <div class="grid g2" style="gap:.4rem .8rem;font-size:.85rem">
        <div><span class="muted">Média atual:</span> <b>${fmt(r.mediaFinal)}</b></div><div><span class="muted">Média de aprovação:</span> <b>${fmt(regra.media_aprovacao, 1)}</b></div>
        <div><span class="muted">Diferença p/ meta:</span> <b class="${r.temDados && r.mediaFinal < regra.media_aprovacao ? 'nota-baixa' : ''}">${r.temDados ? `${r.mediaFinal - regra.media_aprovacao >= 0 ? '+' : ''}${fmt(r.mediaFinal - regra.media_aprovacao)}` : '—'}</b></div><div><span class="muted">Nº de notas:</span> <b>${r.qtdLancadas}</b></div>
        <div><span class="muted">Maior / menor:</span> <b>${fmt(r.maior)} / ${fmt(r.menor)}</b></div><div><span class="muted">Variabilidade (σ):</span> <b>${fmt(r.desvio)}</b></div>
        <div><span class="muted">Tendência:</span> ${tendIcone(d.tend.rotulo)}</div><div><span class="muted">Risco:</span> <b>${esc(ROTULO_RISCO[d.risco])}</b></div></div>
      <div class="small" style="margin-top:.5rem"><span class="muted">Últimas notas:</span> ${ult.length ? ult.map((n) => `${esc(n.nome)} ${notaHTML(n.nota, regra)}`).join(' · ') : '—'}</div>
      <ul class="small">${d.frases.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>
      <div class="callout" style="margin-top:.5rem"><b>Recomendação:</b> ${esc(d.recomendacao)}</div></div>`; }).join('')}</div>`;
}

/* ---------- Pontuação acumulada ---------- */
function pontos(area, c, dg) {
  const { regra } = c; const C = cores();
  const proj = (r) => (r.qtdLancadas > 0 ? (r.pontos / r.qtdLancadas) * Math.max(regra.qtd_periodos * regra.avaliacoes_por_periodo, r.qtdLancadas) : null);
  area.innerHTML = `<div class="callout aviso">A pontuação anual de referência (${fmt(regra.pontos_aprovacao, 0)} pontos) é uma regra própria de soma acumulada e <b>não substitui</b> a média ${fmt(regra.media_aprovacao, 1)}. Critério de aprovação configurado: <b>${{ media_anual: 'média anual', pontos: 'pontuação acumulada', ambos: 'média anual e pontuação' }[regra.criterio_aprovacao]}</b>. Pontos = soma dos resultados dos períodos × nº de avaliações por período (${regra.avaliacoes_por_periodo}).</div>
    <div class="card mt"><div class="chart-box alto"><canvas id="ch-pt" aria-label="Pontuação acumulada"></canvas></div></div>
    <div class="tabela-wrap mt"><table><thead><tr><th>Disciplina</th><th class="num">Pontos atuais</th><th class="num">Necessários</th><th class="num">Restantes</th><th style="min-width:130px">% alcançado</th><th class="num hide-m">Projeção*</th><th>Situação</th></tr></thead><tbody>
    ${c.items.map((i) => { const r = i.r; const p = proj(r); return `<tr><td><span class="dot" style="--cor:${i.disc.cor}"></span> ${esc(i.disc.nome)}</td><td class="num">${fmt(r.pontos, 1)}</td><td class="num">${fmt(r.pontosNecessarios, 0)}</td><td class="num">${fmt(r.pontosRestantes, 1)}</td><td><div class="progresso" style="--pcor:${r.pctPontos >= 100 ? 'var(--ok)' : 'var(--primaria2)'}"><i style="width:${r.pctPontos.toFixed(0)}%"></i></div><span class="xs muted">${fmt(r.pctPontos, 1)}%</span></td><td class="num hide-m">${p === null ? '—' : fmt(p, 1)}</td><td>${r.pontos >= r.pontosNecessarios ? '<span class="badge ok">Meta de pontos atingida</span>' : r.pontosAlcancavel ? '<span class="badge info">Alcançável</span>' : '<span class="badge danger">Inalcançável</span>'}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="xs muted" style="margin-top:.5rem">*Projeção: se as notas restantes repetirem a média das notas já lançadas. É uma estimativa, não um resultado.</p>`;
  criar('ch-pt', { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: [{ label: 'Pontos acumulados', data: c.items.map((i) => Number(i.r.pontos.toFixed(2))), backgroundColor: C.primaria, borderRadius: 4 }, { label: 'Restantes', data: c.items.map((i) => Number(i.r.pontosRestantes.toFixed(2))), backgroundColor: C.muted + '88', borderRadius: 4 }] },
    options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, grid: { color: C.grid } } }, plugins: { legend: { position: 'bottom' }, refLine: { linhas: [{ valor: regra.pontos_aprovacao, cor: C.yellow, rotulo: `${fmt(regra.pontos_aprovacao, 0)} pontos` }] } } } });
}
