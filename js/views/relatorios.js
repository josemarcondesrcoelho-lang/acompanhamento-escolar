import { S, ctx, diagnosticos, rows, matriculas, alertasAtivos } from '../state.js';
import { fmt, arred, isNum, simularDisciplina, notaNecessaria, nomeTipo, ROTULO_PARCIAL } from '../calc.js';
import { ROTULO_TEND, ROTULO_RISCO, ROTULO_PRIORIDADE, centralInteligencia, fmtData, NIVEIS_ALERTA } from '../analysis.js';
import { esc, icone, toast, vazioHTML, opcoesSelect, baixarArquivo } from '../ui.js';
import { criar, cores, escalaNota, destruirTodos } from '../charts.js';
import { topoPagina, graficoEvolucao } from './comum.js';

const TIPOS = [
  ['geral', '1. Relatório geral de desempenho'], ['disciplina', '2. Relatório individual por disciplina'], ['criticas', '3. Relatório de disciplinas críticas'],
  ['mensal', '4. Relatório de evolução mensal'], ['comparativo', '5. Relatório comparativo (períodos e anos)'], ['metas', '6. Relatório de metas'],
  ['projecao', '7. Relatório de projeção de aprovação'], ['anual', '8. Relatório histórico anual'],
];
const V = { tipo: 'geral', disc: '', gerado: false };
let atual = null;

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', ''); return; }
  if (!c.items.some((i) => i.md.id === V.disc)) V.disc = c.items[0]?.md.id || '';
  el.innerHTML = `${topoPagina('Relatórios', 'Relatórios profissionais para acompanhamento familiar. Exporte em PDF (pelo botão Imprimir → Salvar como PDF), Excel ou CSV.')}
    <div class="card rel-controles"><div class="filtros">
      <div class="field" style="max-width:360px"><label for="rp-tipo">Relatório</label><select id="rp-tipo">${opcoesSelect(TIPOS, V.tipo)}</select></div>
      <div class="field" id="rp-disc-box" ${V.tipo === 'disciplina' ? '' : 'hidden'}><label for="rp-disc">Disciplina</label><select id="rp-disc">${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), V.disc)}</select></div>
      <button class="btn primario" id="rp-gerar">${icone('relatorio', 16)} Gerar relatório</button>
      <button class="btn" id="rp-print" disabled>${icone('print', 16)} Imprimir / PDF</button><button class="btn" id="rp-xlsx" disabled>${icone('download', 16)} Excel</button><button class="btn" id="rp-csv" disabled>${icone('download', 16)} CSV</button></div></div>
    <div class="relatorio-area mt" id="rp-area">${V.gerado ? '' : '<div class="card">' + vazioHTML('Escolha o relatório e clique em "Gerar relatório"', 'A pré-visualização aparece aqui.') + '</div>'}</div>`;
  const $ = (s) => el.querySelector(s);
  $('#rp-tipo').addEventListener('change', (e) => { V.tipo = e.target.value; $('#rp-disc-box').hidden = V.tipo !== 'disciplina'; });
  $('#rp-disc').addEventListener('change', (e) => { V.disc = e.target.value; });
  const gerar = () => {
    destruirTodos();
    const c2 = ctx(); const dg = diagnosticos();
    atual = montar(V.tipo, c2, dg);
    $('#rp-area').innerHTML = html(atual, c2);
    atual.graficos.forEach((g) => g.build(g.id));
    ['#rp-print', '#rp-xlsx', '#rp-csv'].forEach((s) => { $(s).disabled = false; }); V.gerado = true;
  };
  $('#rp-gerar').addEventListener('click', gerar);
  $('#rp-print').addEventListener('click', () => {
    const t = document.title; document.title = `${atual.titulo} — ${c.est?.nome || ''} ${c.ano.ano}`.slice(0, 120);
    document.body.classList.add('imprimindo-relatorio');
    const fim = () => { document.body.classList.remove('imprimindo-relatorio'); document.title = t; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim); setTimeout(() => window.print(), 150);
  });
  $('#rp-xlsx').addEventListener('click', () => exportarXlsx());
  $('#rp-csv').addEventListener('click', () => exportarCsv());
  if (V.gerado) gerar();
}

/* ---------- montagem ---------- */
const nomeP = (c) => c.periodosTodos.map((p) => p.nome);
function kpis(itens) { return { t: 'kpis', itens }; }
function tabela(titulo, cab, linhas, notaCols = []) { return { t: 'tabela', titulo, cab, linhas, notaCols }; }
function texto(titulo, itens) { return { t: 'texto', titulo, itens }; }
let seq = 0;
function grafico(titulo, build) { const id = `rg-${++seq}`; return { t: 'grafico', titulo, id, build }; }

function montar(tipo, c, dg) {
  const { regra, geral } = c; const C = cores(); const ap = regra.media_aprovacao;
  const secoes = []; let titulo = TIPOS.find((t) => t[0] === tipo)[1].replace(/^\d+\.\s*/, '');
  const ci = centralInteligencia(regra, dg.diags, geral, dg.prios);
  const statusTxt = (s) => ({ aprovada: 'Satisfatória', atencao: 'Em atenção', critica: 'Crítica', sem_dados: 'Sem dados' }[s]);
  const conclusao = () => texto('Conclusão analítica', [ci.resumo, ci.tendGeral, ...(geral.parcial ? [ROTULO_PARCIAL + ' As conclusões podem mudar conforme novas notas forem lançadas.'] : [])]);
  const recomendacoes = () => texto('Recomendações', ci.plano.length ? ci.plano.map((p) => `Prioridade ${p.ordem} — ${p.nome}: ${p.acoes.slice(0, 3).join(' ')}`) : ['Nenhuma disciplina exige ação prioritária com os dados atuais. Manter a rotina de estudos e acompanhar as próximas avaliações.']);

  if (tipo === 'geral') {
    secoes.push(kpis([['Média geral', fmt(geral.media) + (geral.parcial ? ' (parcial)' : '')], ['Disciplinas', geral.total], ['Satisfatórias', geral.cont.aprovada], ['Em atenção', geral.cont.atencao], ['Críticas', geral.cont.critica], ['Avaliações lançadas', geral.lancadas], ['Pendentes', geral.pendentes]]));
    secoes.push(tabela('Disciplinas e notas', ['Disciplina', ...nomeP(c), 'Média', 'Situação', 'Pontos'], c.items.map((i) => [i.disc.nome, ...i.r.periodos.map((p) => p.resultado), i.r.mediaFinal, statusTxt(i.r.status) + (i.r.parcial && i.r.temDados ? ' (parcial)' : ''), i.r.pontos]), [1, 2, 3, 4, 5].slice(0, c.periodosTodos.length + 1)));
    secoes.push(grafico('Média por disciplina', (id) => criar(id, { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: [{ data: c.items.map((i) => (i.r.temDados ? arred(i.r.mediaFinal, regra) : null)), backgroundColor: c.items.map((i) => ({ aprovada: C.ok, atencao: C.warn, critica: C.danger, sem_dados: C.muted }[i.r.status])) }] }, options: { indexAxis: 'y', scales: { x: { min: 0, max: regra.nota_maxima } }, plugins: { legend: { display: false }, refLine: { linhas: [{ eixo: 'x', valor: ap, cor: C.yellow, rotulo: `Média ${fmt(ap, 1)}` }] } } } })));
    const al = alertasAtivos(); secoes.push(texto('Alertas ativos', al.length ? al.map((a) => `[${NIVEIS_ALERTA[a.nivel].rotulo}] ${a.titulo} — ${a.descricao}`) : ['Nenhum alerta ativo.']));
    secoes.push(tabela('Evolução da média geral', ['Período', 'Média geral'], geral.evolucao.map((e, k) => [c.periodosTodos[k]?.nome, e.media])));
    secoes.push(recomendacoes(), conclusao());
  } else if (tipo === 'disciplina') {
    const it = c.items.find((i) => i.md.id === V.disc) || c.items[0]; const d = dg.diags.find((x) => x.md.id === it.md.id); const r = it.r;
    titulo = `Relatório individual — ${it.disc.nome}`;
    secoes.push(kpis([['Média', fmt(r.mediaFinal) + (r.parcial && r.temDados ? ' (parcial)' : '')], ['Meta de aprovação', fmt(ap, 1)], ['Meta pessoal', isNum(it.md.meta_media) ? fmt(it.md.meta_media, 1) : '—'], ['Situação', statusTxt(r.status)], ['Pontos', `${fmt(r.pontos, 1)} / ${fmt(regra.pontos_aprovacao, 0)}`], ['Tendência', ROTULO_TEND[d.tend.rotulo]], ['Risco', ROTULO_RISCO[d.risco]]]));
    secoes.push(tabela('Histórico de notas', ['Período', 'Avaliação', 'Tipo', 'Data', 'Nota', 'Máx.'], it.avals.filter((a) => isNum(a.nota)).sort((a, b) => (c.periodosTodos.find((p) => p.id === a.periodo_id)?.numero - c.periodosTodos.find((p) => p.id === b.periodo_id)?.numero) || a.ordem - b.ordem).map((a) => [c.periodosTodos.find((p) => p.id === a.periodo_id)?.nome, a.nome, nomeTipo(a.tipo), a.data_avaliacao ? fmtData(a.data_avaliacao) : '—', Number(a.nota), Number(a.valor_maximo)]), [4]));
    secoes.push(tabela('Resultado por período', ['Período', 'Resultado', 'Situação do período'], r.periodos.map((p) => [p.nome, p.resultado, !p.temDados ? 'Sem notas' : p.completo ? (p.recAplicada ? 'Completo (com recuperação)' : 'Completo') : 'Parcial']), [1]));
    secoes.push(grafico('Evolução das notas', (id) => graficoEvolucao(id, it, regra, 'avaliacao')));
    secoes.push(texto('Pontos fortes', [...(d.tend.consistente ? ['Desempenho consistente, com notas acima da meta.'] : []), ...(d.tend.rotulo === 'positiva' ? ['Evolução positiva nas últimas avaliações.'] : []), ...(r.temDados && r.status === 'aprovada' ? [`Média ${fmt(r.mediaFinal)} acima da aprovação.`] : []), ...(d.tend.recuperouAposBaixa ? ['Recuperação após nota baixa.'] : [])].filter(Boolean).concat(r.temDados ? [] : ['Sem dados.'])));
    { const at = [...d.baixas.map((b) => `Nota abaixo da média: ${b.nome} (${fmt(b.nota)})`), ...(d.tend.rotulo === 'negativa' ? ['Queda nas últimas avaliações.'] : []), ...(d.tend.oscilacao ? ['Oscilação significativa entre as notas.'] : [])]; secoes.push(texto('Pontos de atenção', at.length ? at : ['Nenhum ponto de atenção relevante.'])); }
    secoes.push(texto('Diagnóstico e recomendação', [...d.frases, `Recomendação: ${d.recomendacao}`]));
  } else if (tipo === 'criticas') {
    const lista = dg.diags.filter((d) => d.r.temDados && (d.r.status !== 'aprovada' || ['alto', 'critico'].includes(d.risco) || ['alta', 'urgente'].includes(dg.prios[d.md.id].nivel)));
    secoes.push(kpis([['Disciplinas críticas', geral.cont.critica], ['Em atenção', geral.cont.atencao], ['Listadas neste relatório', lista.length]]));
    secoes.push(lista.length ? tabela('Disciplinas que demandam atenção', ['Disciplina', 'Média', 'Situação', 'Risco', 'Prioridade', 'Tendência'], lista.map((d) => [d.disc.nome, d.r.mediaFinal, statusTxt(d.r.status), ROTULO_RISCO[d.risco], ROTULO_PRIORIDADE[dg.prios[d.md.id].nivel], ROTULO_TEND[d.tend.rotulo]]), [1]) : texto('Disciplinas que demandam atenção', ['Nenhuma disciplina está em situação crítica, em atenção ou com risco alto nos dados lançados.']));
    lista.forEach((d) => secoes.push(texto(d.disc.nome, [...d.frases, `Recomendação: ${d.recomendacao}`])));
    secoes.push(recomendacoes(), conclusao());
  } else if (tipo === 'mensal') {
    const temData = c.items.some((i) => i.r.notasSeq.some((n) => n.data));
    secoes.push(grafico('Evolução da média geral por período', (id) => criar(id, { type: 'line', data: { labels: nomeP(c), datasets: [{ data: geral.evolucao.map((e) => (e.media === null ? null : arred(e.media, regra))), borderColor: C.primaria, tension: .3, pointRadius: 5 }] }, options: { scales: escalaNota(regra.nota_maxima), plugins: { legend: { display: false }, refLine: { linhas: [{ valor: ap, cor: C.yellow, rotulo: `Média ${fmt(ap, 1)}` }] } } } })));
    if (temData) {
      const meses = [...new Set(c.items.flatMap((i) => i.r.notasSeq.filter((n) => n.data).map((n) => String(n.data).slice(0, 7))))].sort();
      secoes.push(tabela('Média mensal por disciplina', ['Disciplina', ...meses.map((m) => `${m.slice(5)}/${m.slice(0, 4)}`)], c.items.map((i) => [i.disc.nome, ...meses.map((m) => { const v = i.r.notasSeq.filter((n) => n.data && String(n.data).startsWith(m) && n.tipo !== 'recuperacao').map((n) => n.nota); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; })]), meses.map((_, k) => k + 1)));
    } else secoes.push(texto('Visão mensal', ['As avaliações ainda não possuem datas cadastradas. Abaixo, a evolução por avaliação (ordem cronológica de lançamento). Informe as datas para obter a visão mensal.']));
    const maxN = Math.max(0, ...c.items.map((i) => i.r.notasSeq.filter((n) => n.tipo !== 'recuperacao').length));
    secoes.push(tabela('Notas em sequência (por avaliação)', ['Disciplina', ...Array.from({ length: maxN }, (_, k) => `${k + 1}ª`), 'Variação'], c.items.map((i) => { const v = i.r.notasSeq.filter((n) => n.tipo !== 'recuperacao').map((n) => n.nota); return [i.disc.nome, ...Array.from({ length: maxN }, (_, k) => (v[k] ?? null)), v.length >= 2 ? v[v.length - 1] - v[0] : null]; }), Array.from({ length: maxN }, (_, k) => k + 1)));
    secoes.push(conclusao());
  } else if (tipo === 'comparativo') {
    secoes.push(tabela(`Comparativo entre períodos — ${c.ano.ano}`, ['Disciplina', ...nomeP(c), ...c.items[0]?.r.semestres.map((s) => `${s.numero}º semestre`) || [], 'Média anual'], c.items.map((i) => [i.disc.nome, ...i.r.periodos.map((p) => p.resultado), ...i.r.semestres.map((s) => s.resultado), i.r.mediaFinal]), Array.from({ length: c.periodosTodos.length + (c.items[0]?.r.semestres.length || 0) + 1 }, (_, k) => k + 1)));
    secoes.push(grafico('Resultado por período', (id) => criar(id, { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: c.periodosTodos.map((p, k) => ({ label: p.nome, data: c.items.map((i) => (i.r.periodos[k].resultado === null ? null : arred(i.r.periodos[k].resultado, regra))), backgroundColor: ['#6366f1', '#14b8a6', '#f59e0b', '#ec4899', '#0ea5e9', '#84cc16'][k % 6] })) }, options: { scales: escalaNota(regra.nota_maxima), plugins: { legend: { position: 'bottom' }, refLine: { linhas: [{ valor: ap, cor: C.yellow }] } } } })));
    const ms = matriculas().map((m) => ({ m, cx: ctx(m.mat.id) })).filter((x) => x.cx.geral.media !== null);
    if (ms.length >= 2) secoes.push(tabela('Comparativo entre anos letivos', ['Ano', 'Série', 'Média geral', 'Satisfatórias', 'Em atenção', 'Críticas', 'Parcial?'], ms.map(({ m, cx }) => [m.ano.ano, m.serie?.nome, cx.geral.media, cx.geral.cont.aprovada, cx.geral.cont.atencao, cx.geral.cont.critica, cx.geral.parcial ? 'Sim' : 'Não']), [2]));
    else secoes.push(texto('Comparativo entre anos', ['Ainda há apenas um ano com notas; a comparação histórica ficará disponível quando houver outro ano.']));
    secoes.push(conclusao());
  } else if (tipo === 'metas') {
    const ms = rows('metas_academicas').filter((m) => m.matricula_id === c.mat.id);
    const cur = (m) => (m.tipo === 'media_geral' ? geral.media : (() => { const it = c.items.find((i) => i.md.id === m.matricula_disciplina_id); return !it ? null : m.tipo === 'media_disciplina' ? it.r.mediaFinal : it.r.ultimaNota; })());
    secoes.push(ms.length ? tabela('Metas', ['Meta', 'Disciplina', 'Valor da meta', 'Resultado atual', 'Diferença', '% atingido', 'Status'], ms.map((m) => { const a = cur(m); return [m.descricao || m.tipo, c.items.find((i) => i.md.id === m.matricula_disciplina_id)?.disc.nome || 'Geral', Number(m.valor_meta), a, isNum(a) ? a - m.valor_meta : null, isNum(a) ? Math.min(100, (a / m.valor_meta) * 100) : null, { ativa: 'Ativa', atingida: 'Atingida', cancelada: 'Cancelada' }[m.status]]; }), []) : texto('Metas', ['Nenhuma meta cadastrada para este ano.']));
    const mp = c.items.filter((i) => isNum(i.md.meta_media)); if (mp.length) secoes.push(tabela('Metas de média por disciplina', ['Disciplina', 'Meta', 'Média atual', 'Diferença', '% atingido'], mp.map((i) => [i.disc.nome, Number(i.md.meta_media), i.r.mediaFinal, i.r.temDados ? i.r.mediaFinal - i.md.meta_media : null, i.r.temDados ? Math.min(100, (i.r.mediaFinal / i.md.meta_media) * 100) : null])));
    secoes.push(conclusao());
  } else if (tipo === 'projecao') {
    const sc = (i, n) => simularDisciplina(regra, c.periodosTodos, i.avals, n, { extra: { provaFinal: i.md.prova_final } }).mediaFinal;
    secoes.push(tabela('Notas necessárias e cenários', ['Disciplina', 'Média atual', 'Situação da aprovação', `Nota necessária p/ ${fmt(ap, 1)}`, 'Cenário pessimista', 'Cenário realista', 'Cenário otimista'], c.items.map((i) => {
      const n = notaNecessaria(regra, c.periodosTodos, i.avals, ap, { extra: { provaFinal: i.md.prova_final } });
      const v = i.r.notasSeq.filter((x) => x.tipo !== 'recuperacao').map((x) => x.nota);
      return [i.disc.nome, i.r.mediaFinal, { encerrada: n.atingida ? 'Encerrada — atingiu' : 'Encerrada — não atingiu', garantida: 'Garantida', alcancavel: 'Alcançável', inviavel: 'Inviável' }[n.estado], n.estado === 'alcancavel' ? n.nota : null, v.length ? sc(i, Math.min(...v)) : null, v.length ? sc(i, v.reduce((a, b) => a + b, 0) / v.length) : null, v.length ? sc(i, Math.max(...v)) : null];
    }), [1, 3, 4, 5, 6]));
    secoes.push(texto('Como ler', ['"Nota necessária" é a menor nota, igual em todas as avaliações restantes, que leva a média anual à aprovação. Cenários: pessimista = menor nota já obtida; realista = média das notas já obtidas; otimista = maior nota já obtida. São projeções — não resultados oficiais.', ...(geral.parcial ? [ROTULO_PARCIAL] : [])]));
    secoes.push(conclusao());
  } else if (tipo === 'anual') {
    titulo = `Histórico anual ${c.ano.ano} — ${c.serie?.nome || ''}`;
    secoes.push(kpis([['Ano letivo', c.ano.ano], ['Série', c.serie?.nome || '—'], ['Média geral', fmt(geral.media) + (geral.parcial ? ' (parcial)' : '')], ['Resultado oficial', c.mat.resultado_final ? ({ aprovado: 'Aprovada', recuperacao: 'Recuperação final', reprovado: 'Reprovada', transferido: 'Transferida', desistente: 'Desistente' }[c.mat.resultado_final]) : 'Não informado'], ['Situação do ano', { planejado: 'Planejado', em_andamento: 'Em andamento', concluido: 'Concluído' }[c.mat.situacao]]]));
    secoes.push(tabela('Consolidado do ano', ['Disciplina', ...nomeP(c), ...c.items[0]?.r.semestres.map((s) => `${s.numero}º sem.`) || [], 'Média anual', 'Situação', 'Pontos'], c.items.map((i) => [i.disc.nome, ...i.r.periodos.map((p) => p.resultado), ...i.r.semestres.map((s) => s.resultado), i.r.mediaFinal, statusTxt(i.r.status) + (i.r.parcial && i.r.temDados ? ' (parcial)' : ''), i.r.pontos]), Array.from({ length: c.periodosTodos.length + (c.items[0]?.r.semestres.length || 0) + 1 }, (_, k) => k + 1)));
    secoes.push(grafico('Média por disciplina', (id) => criar(id, { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: [{ data: c.items.map((i) => (i.r.temDados ? arred(i.r.mediaFinal, regra) : null)), backgroundColor: C.primaria }] }, options: { scales: escalaNota(regra.nota_maxima), plugins: { legend: { display: false }, refLine: { linhas: [{ valor: ap, cor: C.yellow }] } } } })));
    secoes.push(conclusao());
  }
  return { tipo, titulo, secoes, graficos: secoes.filter((s) => s.t === 'grafico'), c };
}

/* ---------- renderização ---------- */
function celula(v, isNota, regra) {
  if (v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v))) return '<td class="num">—</td>';
  if (typeof v === 'number') return `<td class="num ${isNota && v < regra.media_aprovacao - 1e-9 ? 'nota-baixa' : ''}">${fmt(v)}</td>`;
  return `<td>${esc(v)}</td>`;
}
function html(rel, c) {
  const regra = c.regra;
  const cab = `<div class="rel-cab"><div><h1>${esc(rel.titulo)}</h1><div class="muted">Acompanhamento Escolar</div></div><div class="small" style="text-align:right"><b>${esc(c.est?.nome || '')}</b>${c.est?.numero ? ` · Nº ${esc(c.est.numero)}` : ''}<br>${esc(c.est?.escola || '')}<br>${c.ano.ano} · ${esc(c.serie?.nome || '')}${c.mat.turma ? ` · Turma ${esc(c.mat.turma)}` : ''}<br>Gerado em ${new Date().toLocaleString('pt-BR')}</div></div>`;
  const corpo = rel.secoes.map((s) => {
    if (s.t === 'kpis') return `<div class="rel-kpis">${s.itens.map(([r, v]) => `<div class="rel-kpi"><b>${esc(v)}</b><span>${esc(r)}</span></div>`).join('')}</div>`;
    if (s.t === 'tabela') return `<h2>${esc(s.titulo)}</h2><div class="tabela-wrap"><table><thead><tr>${s.cab.map((h, k) => `<th class="${k > 0 ? 'num' : ''}">${esc(h)}</th>`).join('')}</tr></thead><tbody>${s.linhas.map((l) => `<tr>${l.map((v, k) => celula(v, s.notaCols.includes(k), regra)).join('')}</tr>`).join('')}</tbody></table></div>`;
    if (s.t === 'texto') return `<h2>${esc(s.titulo)}</h2><ul>${s.itens.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    if (s.t === 'grafico') return `<h2>${esc(s.titulo)}</h2><div class="chart-box"><canvas id="${s.id}"></canvas></div>`;
    return '';
  }).join('');
  return `<article class="relatorio">${cab}${c.geral.parcial ? `<p><span class="badge parcial">${ROTULO_PARCIAL}</span></p>` : ''}${corpo}<p class="xs muted" style="margin-top:1.4rem">Relatório gerado automaticamente a partir dos dados lançados. Projeções e recomendações são apoio à decisão, não resultados oficiais.</p></article>`;
}

/* ---------- exportação ---------- */
const nomeArq = () => `${atual.titulo}_${atual.c.ano.ano}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 80);
function tabelasExport() {
  const out = []; const c = atual.c;
  const cabecalho = [[atual.titulo], ['Estudante', c.est?.nome || ''], ['Ano letivo', c.ano.ano], ['Série', c.serie?.nome || ''], ['Gerado em', new Date().toLocaleString('pt-BR')]];
  atual.secoes.forEach((s) => {
    if (s.t === 'kpis') out.push({ nome: 'Indicadores', linhas: [['Indicador', 'Valor'], ...s.itens] });
    if (s.t === 'tabela') out.push({ nome: s.titulo, linhas: [s.cab, ...s.linhas.map((l) => l.map((v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v ?? '')))] });
    if (s.t === 'texto') out.push({ nome: s.titulo, linhas: [[s.titulo], ...s.itens.map((x) => [x])] });
  });
  return { cabecalho, tabelas: out };
}
function exportarXlsx() {
  if (typeof XLSX === 'undefined') { toast('Biblioteca de Excel não carregada.', 'erro'); return; }
  const { cabecalho, tabelas } = tabelasExport(); const wb = XLSX.utils.book_new();
  const usados = new Set();
  const nomeAba = (n) => { let b = n.replace(/[\\/?*[\]:]/g, ' ').slice(0, 28) || 'Aba'; let k = 1; let x = b; while (usados.has(x)) x = `${b.slice(0, 25)}_${++k}`; usados.add(x); return x; };
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([...cabecalho, [], ...(tabelas.find((t) => t.nome === 'Indicadores')?.linhas || [])]), nomeAba('Resumo'));
  tabelas.filter((t) => t.nome !== 'Indicadores').forEach((t) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(t.linhas), nomeAba(t.nome)));
  XLSX.writeFile(wb, `${nomeArq()}.xlsx`); toast('Arquivo Excel gerado.', 'ok');
}
function exportarCsv() {
  const { cabecalho, tabelas } = tabelasExport();
  const cel = (v) => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const bloco = (l) => l.map((r) => r.map(cel).join(';')).join('\r\n');
  const txt = [bloco(cabecalho), ...tabelas.map((t) => `\r\n${cel(t.nome)}\r\n${bloco(t.linhas)}`)].join('\r\n');
  baixarArquivo(`${nomeArq()}.csv`, `﻿${txt}`, 'text/csv;charset=utf-8'); toast('Arquivo CSV gerado.', 'ok');
}
