import { S, ctx, diagnosticos, alertasAtivos, irPara } from '../state.js';
import { fmt, arred, STATUS_INFO, TIPOS_AVALIACAO, ROTULO_PARCIAL } from '../calc.js';
import { esc, icone, badgeStatus, tendIcone, deltaHTML, notaHTML, vazioHTML, opcoesSelect } from '../ui.js';
import { criar, cores, escalaNota } from '../charts.js';
import { NIVEIS_ALERTA, rankings, ordemNivel } from '../analysis.js';
import { topoPagina, barraFiltros, ligarFiltros, graficoEvolucao, resumoEvolucao } from './comum.js';

let discEvo = ''; let modoEvo = null;

export function render(el) {
  if (modoEvo === null) modoEvo = S.prefs.visaoEvolucao || 'avaliacao';
  const cAll = ctx();
  if (!cAll) { el.innerHTML = vazioHTML('Nenhum ano letivo selecionado', 'Cadastre ou importe um ano letivo em Configurações.'); return; }
  const f = S.filtros; const c = ctx(S.matId, f); const { regra, geral } = c;
  const dg = diagnosticos();
  const diagMap = Object.fromEntries(dg.diags.map((d) => [d.md.id, d]));
  const C = cores();
  const com = c.items.filter((i) => i.r.temDados);
  const melhor = [...com].sort((a, b) => b.r.mediaFinal - a.r.mediaFinal)[0];
  const pior = [...com].sort((a, b) => a.r.mediaFinal - b.r.mediaFinal)[0];
  const ev = geral.evolucao.filter((e) => e.media !== null);
  const deltaGeral = ev.length >= 2 ? ev[ev.length - 1].media - ev[ev.length - 2].media : null;
  const parcial = geral.parcial;
  const k = (ico, rot, val, desc, cor, extra = '') => `<div class="kpi" style="--kcor:${cor}"><div class="k-topo"><span>${rot}</span><span class="k-ico">${icone(ico, 18)}</span></div><div class="k-valor">${val}</div>${extra ? `<div>${extra}</div>` : ''}<div class="k-desc">${desc}</div></div>`;
  const corMedia = geral.media === null ? 'var(--muted)' : geral.mediaArr >= regra.limites_status.aprovada ? 'var(--ok)' : geral.mediaArr >= regra.limites_status.atencao ? 'var(--warn)' : 'var(--danger)';

  const alertas = alertasAtivos().sort((a, b) => ordemNivel(a.nivel) - ordemNivel(b.nivel));
  const rk = rankings(dg.diags);

  el.innerHTML = `
    ${topoPagina('Dashboard', `${esc(c.est?.nome || '')} · ${c.ano.ano} · ${esc(c.serie?.nome || '')}${c.mat.situacao === 'concluido' ? ' · <span class="badge info">Ano encerrado</span>' : ''}`,
      `<button class="btn" data-ir="notas">${icone('mais', 16)} Lançar nota</button>`)}
    ${barraFiltros(cAll, f, ['disc', 'periodo', 'situacao', 'tipo'], TIPOS_AVALIACAO)}
    ${!c.items.length ? `<div class="card mt">${vazioHTML('Nenhuma disciplina para os filtros selecionados', 'Altere ou limpe os filtros.')}</div>` : `
    <div class="kpis mt">
      ${k('media', 'Média geral atual', geral.media === null ? '—' : fmt(geral.media), parcial ? `<span class="badge parcial">Parcial</span> resultado não definitivo` : 'Resultado do ano', corMedia, deltaHTML(deltaGeral))}
      ${k('livro', 'Total de disciplinas', geral.total, 'Ativas neste ano', 'var(--primaria2)')}
      ${k('check2', 'Disciplinas satisfatórias', geral.cont.aprovada, `Média ≥ ${fmt(regra.limites_status.aprovada, 1)}`, 'var(--ok)')}
      ${k('alerta', 'Em atenção', geral.cont.atencao, `Média de ${fmt(regra.limites_status.atencao, 1)} a ${fmt(regra.limites_status.aprovada - 0.01)}`, 'var(--warn)')}
      ${k('raio', 'Situação crítica', geral.cont.critica, `Média abaixo de ${fmt(regra.limites_status.atencao, 1)}`, 'var(--danger)')}
      ${k('alvo', 'Pontuação acumulada', `${fmt(geral.pontos, 1)} <small>/ ${fmt(geral.pontosNec, 0)}</small>`, `${fmt(regra.pontos_aprovacao, 0)} pontos por disciplina (regra anual)`, 'var(--info)')}
      ${k('lista', 'Pontuação restante', fmt(geral.pontosRestantes, 1), 'Para atingir a pontuação em todas as disciplinas', 'var(--yellow)')}
      ${k('cap', 'Desempenho geral', geral.pctDesempenho === null ? '—' : `${fmt(geral.pctDesempenho, 1)}<small>%</small>`, `Média ÷ nota máxima (${fmt(regra.nota_maxima, 0)})`, corMedia, deltaHTML(deltaGeral === null ? null : (deltaGeral / regra.nota_maxima) * 100, 1).replace('vs. período anterior', 'p.p.'))}
      ${k('estrela', 'Melhor disciplina', melhor ? esc(melhor.disc.nome) : '—', melhor ? `Média ${fmt(melhor.r.mediaFinal)}` : 'Sem dados', 'var(--ok)')}
      ${k('down', 'Menor desempenho', pior ? esc(pior.disc.nome) : '—', pior ? `Média ${fmt(pior.r.mediaFinal)}` : 'Sem dados', pior && pior.r.status !== 'aprovada' ? 'var(--warn)' : 'var(--muted)')}
      ${k('check', 'Avaliações lançadas', geral.lancadas, 'Notas registradas', 'var(--primaria2)')}
      ${k('plano', 'Avaliações pendentes', geral.pendentes, 'Aguardando nota', 'var(--muted)')}
    </div>

    <div class="grid g2 mt">
      <section class="card"><div class="card-topo"><h3>Média por disciplina</h3><span class="xs muted">Linha tracejada = média ${fmt(regra.media_aprovacao, 1)}</span></div><div class="chart-box alto"><canvas id="ch-media" aria-label="Média por disciplina"></canvas></div></section>
      <section class="card"><div class="card-topo"><h3>Central de alertas</h3><button class="btn sm fantasma" data-ir="alertas">Ver todos (${alertas.length})</button></div>
        ${alertas.length ? `<div class="lista-alertas">${alertas.slice(0, 5).map((a) => `<div class="alerta" style="--acor:${NIVEIS_ALERTA[a.nivel].cor}"><div class="a-corpo"><div class="a-titulo">${esc(a.titulo)}</div><div class="small t2">${esc(a.descricao)}</div></div><span class="badge muted">${NIVEIS_ALERTA[a.nivel].rotulo}</span></div>`).join('')}</div>` : vazioHTML('Nenhum alerta ativo', 'Tudo em ordem com os dados lançados.')}
      </section>
    </div>

    <div class="grid g3 mt">
      <section class="card"><h3>Distribuição de status</h3><div class="chart-box baixo"><canvas id="ch-status" aria-label="Distribuição de status"></canvas></div></section>
      <section class="card"><h3>Evolução da média geral</h3><div class="chart-box baixo"><canvas id="ch-geral" aria-label="Evolução da média geral"></canvas></div></section>
      <section class="card"><h3>Ranking de desempenho</h3>
        <div class="tabela-wrap" style="border:none"><table><tbody>${rk.porMedia.map((d, i) => `<tr><td class="muted">${i + 1}º</td><td><span class="dot" style="--cor:${d.disc.cor}"></span> ${esc(d.disc.nome)}</td><td class="num">${notaHTML(d.r.mediaFinal, regra)}</td></tr>`).join('') || '<tr><td class="muted">Sem dados</td></tr>'}</tbody></table></div>
        ${rk.mais_evoluiram.length ? `<p class="small mt0" style="margin-top:.7rem"><b>Mais evoluíram:</b> ${rk.mais_evoluiram.slice(0, 3).map((d) => `${esc(d.disc.nome)} (+${fmt(d.tend.delta)})`).join(', ')}</p>` : ''}
        ${rk.mais_regrediram.length ? `<p class="small"><b>Mais regrediram:</b> ${rk.mais_regrediram.slice(0, 3).map((d) => `${esc(d.disc.nome)} (${fmt(d.tend.delta)})`).join(', ')}</p>` : ''}
      </section>
    </div>

    <div class="grid g2 mt">
      <section class="card"><div class="card-topo"><h3>Evolução por disciplina</h3>
        <div class="flex gap wrap"><select id="evo-disc" aria-label="Disciplina">${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), discEvo || c.items[0]?.md.id)}</select>
        <select id="evo-modo" aria-label="Visão"><option value="avaliacao"${modoEvo === 'avaliacao' ? ' selected' : ''}>Por avaliação</option><option value="periodo"${modoEvo === 'periodo' ? ' selected' : ''}>Por ${esc(regra.tipo_periodo)}</option><option value="mensal"${modoEvo === 'mensal' ? ' selected' : ''}>Mensal</option></select></div></div>
        <div class="chart-box"><canvas id="ch-evo" aria-label="Evolução por disciplina"></canvas></div><div id="evo-resumo" class="small mt0" style="margin-top:.5rem"></div></section>
      <section class="card"><div class="card-topo"><h3>Pontuação acumulada por disciplina</h3><span class="xs muted">Meta anual: ${fmt(regra.pontos_aprovacao, 0)} pontos</span></div><div class="chart-box"><canvas id="ch-pontos" aria-label="Pontuação acumulada"></canvas></div></section>
    </div>

    <section class="card mt"><h3>Resumo por disciplina</h3>
      <div class="tabela-wrap"><table><thead><tr><th>Disciplina</th><th class="num">Média</th><th>Status</th><th class="num hide-m">Últ. nota</th><th class="num hide-m">Pontos</th><th class="hide-m">Tendência</th><th class="hide-m">Risco</th></tr></thead><tbody>
      ${c.items.map((i) => { const d = diagMap[i.md.id]; return `<tr><td><span class="dot" style="--cor:${i.disc.cor}"></span> ${esc(i.disc.nome)}</td><td class="num">${notaHTML(i.r.mediaFinal, regra)}</td><td>${badgeStatus(i.r.status, i.r.parcial)}</td><td class="num hide-m">${notaHTML(i.r.ultimaNota, regra)}</td><td class="num hide-m">${fmt(i.r.pontos, 1)}</td><td class="hide-m">${d ? tendIcone(d.tend.rotulo) : ''}</td><td class="hide-m">${d ? esc(d.risco) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>
      ${parcial ? `<p class="xs muted" style="margin-top:.6rem">${ROTULO_PARCIAL} Há períodos ainda incompletos; as médias e pontos mudam conforme novas notas forem lançadas.</p>` : ''}
    </section>`}`;

  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.ir)));
  ligarFiltros(el, f, () => render(el));
  if (!c.items.length) return;

  // Gráficos
  criar('ch-media', { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: [{ data: c.items.map((i) => (i.r.temDados ? arred(i.r.mediaFinal, regra) : null)), backgroundColor: c.items.map((i) => ({ aprovada: C.ok, atencao: C.warn, critica: C.danger, sem_dados: C.muted }[i.r.status])), borderRadius: 6 }] },
    options: { indexAxis: 'y', scales: { x: { min: 0, max: regra.nota_maxima, grid: { color: C.grid } }, y: { grid: { display: false } } }, plugins: { legend: { display: false }, refLine: { linhas: [{ eixo: 'x', valor: regra.media_aprovacao, cor: C.yellow, rotulo: `Média ${fmt(regra.media_aprovacao, 1)}` }] }, tooltip: { callbacks: { label: (it) => `Média: ${fmt(it.raw)}${c.items[it.dataIndex].r.parcial ? ' (parcial)' : ''}` } } } } });
  const ordem = ['aprovada', 'atencao', 'critica', 'sem_dados'];
  criar('ch-status', { type: 'doughnut', data: { labels: ordem.map((s) => STATUS_INFO[s].rotulo), datasets: [{ data: ordem.map((s) => geral.cont[s]), backgroundColor: [C.ok, C.warn, C.danger, C.muted], borderColor: C.card, borderWidth: 3 }] }, options: { cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
  criar('ch-geral', { type: 'line', data: { labels: c.periodos.map((p) => p.nome), datasets: [{ label: 'Média geral', data: geral.evolucao.map((e) => (e.media === null ? null : arred(e.media, regra))), borderColor: C.primaria, backgroundColor: `${C.primaria}33`, fill: true, tension: .3, pointRadius: 5 }] },
    options: { scales: { ...escalaNota(regra.nota_maxima), x: { grid: { display: false } } }, plugins: { legend: { display: false }, refLine: { linhas: [{ valor: regra.media_aprovacao, cor: C.yellow, rotulo: `Média ${fmt(regra.media_aprovacao, 1)}` }] } } } });
  criar('ch-pontos', { type: 'bar', data: { labels: c.items.map((i) => i.disc.nome), datasets: [
    { label: 'Pontos acumulados', data: c.items.map((i) => Number(i.r.pontos.toFixed(2))), backgroundColor: C.primaria, borderRadius: 4 },
    { label: `Restantes p/ ${fmt(regra.pontos_aprovacao, 0)}`, data: c.items.map((i) => Number(i.r.pontosRestantes.toFixed(2))), backgroundColor: C.muted + '88', borderRadius: 4 }] },
    options: { indexAxis: 'y', scales: { x: { stacked: true, grid: { color: C.grid } }, y: { stacked: true, grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } } });
  const desenharEvo = () => {
    const sel = el.querySelector('#evo-disc').value; discEvo = sel; modoEvo = el.querySelector('#evo-modo').value;
    const item = c.items.find((i) => i.md.id === sel) || c.items[0];
    graficoEvolucao('ch-evo', item, regra, modoEvo);
    el.querySelector('#evo-resumo').innerHTML = resumoEvolucao(diagMap[item.md.id]);
  };
  el.querySelector('#evo-disc').addEventListener('change', desenharEvo);
  el.querySelector('#evo-modo').addEventListener('change', desenharEvo);
  desenharEvo();
}
