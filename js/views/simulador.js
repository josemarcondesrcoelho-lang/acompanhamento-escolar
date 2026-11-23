import { S, ctx } from '../state.js';
import { fmt, arred, isNum, ehRegular, temNota, simularDisciplina, notaNecessaria, calcDisciplina, resultadoProjetado, ROTULO_PARCIAL } from '../calc.js';
import { esc, icone, badgeStatus, notaHTML, vazioHTML, opcoesSelect } from '../ui.js';
import { criar, cores, escalaNota } from '../charts.js';
import { topoPagina } from './comum.js';

const V = { disc: '', nota: 8, mapa: {}, extra: 0 };

export function render(el) {
  const c = ctx();
  if (!c || !c.items.length) { el.innerHTML = vazioHTML('Sem disciplinas', 'Cadastre disciplinas e notas para simular.'); return; }
  const { regra } = c; const C = cores();
  if (!c.items.some((i) => i.md.id === V.disc)) { V.disc = c.items[0].md.id; V.mapa = {}; }
  const it = c.items.find((i) => i.md.id === V.disc);
  const pendentes = it.avals.filter((a) => ehRegular(a) && !temNota(a) && a.status !== 'nao_realizada').sort((a, b) => (c.periodosTodos.find((p) => p.id === a.periodo_id)?.numero - c.periodosTodos.find((p) => p.id === b.periodo_id)?.numero) || a.ordem - b.ordem);
  const opts = { mapa: V.mapa, extraPorPeriodo: V.extra, extra: { provaFinal: it.md.prova_final } };
  const sim = simularDisciplina(regra, c.periodosTodos, it.avals, V.nota, opts);
  const nec = notaNecessaria(regra, c.periodosTodos, it.avals, regra.media_aprovacao, { extra: { provaFinal: it.md.prova_final } });
  const notas = it.r.notasSeq.filter((n) => n.tipo !== 'recuperacao').map((n) => n.nota);
  const cen = { pess: notas.length ? Math.min(...notas) : 0, real: notas.length ? notas.reduce((a, b) => a + b, 0) / notas.length : regra.media_aprovacao, otim: notas.length ? Math.max(...notas) : regra.nota_maxima };
  const sc = (n) => simularDisciplina(regra, c.periodosTodos, it.avals, n, { extra: { provaFinal: it.md.prova_final } });
  const alvo = regra.media_aprovacao;
  const faltaMedia = sim.mediaFinal === null ? null : alvo - sim.mediaFinal;
  const proj = resultadoProjetado(regra, sim);

  let frase;
  if (nec.estado === 'encerrada') frase = `Todas as notas do ano estão lançadas. Média final ${fmt(it.r.mediaFinal)} — ${nec.atingida ? 'atinge' : 'não atinge'} a média ${fmt(alvo, 1)}.`;
  else if (nec.estado === 'garantida') frase = `Com as notas atuais, a média ${fmt(alvo, 1)} já está matematicamente garantida em ${esc(it.disc.nome)}, mesmo que as avaliações restantes tenham nota 0.`;
  else if (nec.estado === 'inviavel') frase = `Mesmo com nota máxima (${fmt(regra.nota_maxima, 0)}) nas avaliações restantes, a média ${fmt(alvo, 1)} não seria atingida (melhor caso: ${fmt(nec.melhorCaso)}). Consulte as regras de recuperação da escola.`;
  else frase = `Para atingir média ${fmt(alvo, 1)} em ${esc(it.disc.nome)}, será necessário obter pelo menos <b>${fmt(nec.nota)}</b> em cada uma das avaliações restantes.`;

  const tabelaTodas = c.items.map((i) => ({ i, n: notaNecessaria(regra, c.periodosTodos, i.avals, alvo, { extra: { provaFinal: i.md.prova_final } }) }));

  el.innerHTML = `${topoPagina('Simulador de Notas', 'Simule notas futuras e veja o impacto imediato. Nada é salvo: são apenas hipóteses.')}
  <div class="grid g2">
    <section class="card"><h3>Parâmetros</h3>
      <div class="form-grid">
        <div class="field full"><label for="s-disc">Disciplina</label><select id="s-disc">${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), V.disc)}</select></div>
        <div class="field"><label for="s-nota">Nota hipotética padrão</label><input type="number" id="s-nota" min="0" max="${regra.nota_maxima}" step="0.1" value="${V.nota}"></div>
        <div class="field"><label for="s-extra">Avaliações hipotéticas extras por período</label><input type="number" id="s-extra" min="0" max="5" step="1" value="${V.extra}"></div>
      </div>
      <div class="flex wrap gap" style="margin-top:.7rem"><span class="small muted">Cenários:</span>
        <button class="btn sm" data-cen="${cen.pess}">Pessimista (${fmt(cen.pess)})</button><button class="btn sm" data-cen="${cen.real}">Realista (${fmt(cen.real)})</button><button class="btn sm" data-cen="${cen.otim}">Otimista (${fmt(cen.otim)})</button></div>
      <p class="xs muted">Pessimista = menor nota já obtida; realista = média das notas já obtidas; otimista = maior nota já obtida.</p>
      <h4 style="margin-top:.9rem">Avaliações pendentes (nota individual opcional)</h4>
      ${pendentes.length ? `<div class="form-grid">${pendentes.map((a) => `<div class="field"><label for="s-a-${a.id}">${esc(a.nome)} · ${esc(c.periodosTodos.find((p) => p.id === a.periodo_id)?.nome || '')}</label><input type="number" id="s-a-${a.id}" data-av="${a.id}" min="0" max="${a.valor_maximo}" step="0.1" placeholder="${fmt(V.nota, 1)}" value="${V.mapa[a.id] ?? ''}"></div>`).join('')}</div>` : '<p class="muted small">Não há avaliações pendentes cadastradas; períodos incompletos são completados com avaliações hipotéticas.</p>'}
    </section>
    <section class="card"><h3>Resultado projetado — ${esc(it.disc.nome)}</h3>
      <div class="kpis" style="grid-template-columns:repeat(2,1fr)">
        <div class="kpi"><div class="k-topo"><span>Média atual</span></div><div class="k-valor">${notaHTML(it.r.mediaFinal, regra)}</div><div class="k-desc">${it.r.parcial ? 'parcial' : 'final'}</div></div>
        <div class="kpi" style="--kcor:var(--primaria2)"><div class="k-topo"><span>Média projetada</span></div><div class="k-valor">${notaHTML(sim.mediaFinal, regra)}</div><div class="k-desc">${badgeStatus(sim.status)}</div></div>
        <div class="kpi" style="--kcor:var(--info)"><div class="k-topo"><span>Pontos projetados</span></div><div class="k-valor">${fmt(sim.pontos, 1)} <small>/ ${fmt(regra.pontos_aprovacao, 0)}</small></div><div class="k-desc">${sim.pontos >= regra.pontos_aprovacao ? 'meta de pontos atingida' : `faltam ${fmt(sim.pontosRestantes, 1)}`}</div></div>
        <div class="kpi" style="--kcor:var(--yellow)"><div class="k-topo"><span>Falta p/ média ${fmt(alvo, 1)}</span></div><div class="k-valor">${faltaMedia === null ? '—' : faltaMedia <= 0 ? 'Atingida' : fmt(faltaMedia)}</div><div class="k-desc">na média projetada</div></div>
      </div>
      <div class="callout ${nec.estado === 'inviavel' ? 'erro' : nec.estado === 'alcancavel' ? 'aviso' : 'ok'}" style="margin-top:.8rem">${frase}</div>
      <p class="small mt0" style="margin-top:.6rem"><b>Leitura:</b> ${esc(proj.texto)}. <span class="muted">Projeção, não resultado oficial.</span></p>
      <p class="xs muted"><b>Fórmula usada:</b> resultado do ${esc(regra.tipo_periodo)} = média ${regra.formula === 'media_notas' ? '(ponderada, todas as notas)' : 'ponderada das notas'}${regra.recuperacao !== 'nenhuma' ? `; recuperação: ${{ substitui_se_maior: 'substitui se maior', substitui: 'substitui', media: 'média com a nota' }[regra.recuperacao]}${regra.recuperacao_somente_abaixo ? ` (só se média < ${fmt(alvo, 1)})` : ''}` : ''}; média anual = média ponderada dos ${regra.qtd_periodos} períodos (pesos ${(c.periodosTodos.map((p) => fmt(p.peso, 1))).join(' / ')}); pontos = Σ resultado × nº de notas. Arredondamento ${regra.arredondamento === 'truncar' ? 'por truncamento' : 'meio para cima'}, ${regra.casas} casas.</p>
      ${it.r.parcial ? `<p class="xs"><span class="badge parcial">${ROTULO_PARCIAL}</span></p>` : ''}
    </section>
  </div>
  <section class="card mt"><div class="card-topo"><h3>Média final projetada × nota nas avaliações restantes</h3></div><div class="chart-box"><canvas id="ch-sim" aria-label="Curva de projeção"></canvas></div></section>
  <section class="card mt"><h3>Nota necessária por disciplina (para média ${fmt(alvo, 1)})</h3><div class="tabela-wrap"><table><thead><tr><th>Disciplina</th><th class="num">Média atual</th><th>Situação</th><th class="num">Nota necessária nas restantes</th></tr></thead><tbody>
  ${tabelaTodas.map(({ i, n }) => `<tr><td><span class="dot" style="--cor:${i.disc.cor}"></span> ${esc(i.disc.nome)}</td><td class="num">${notaHTML(i.r.mediaFinal, regra)}</td><td>${{ encerrada: n.atingida ? '<span class="badge ok">Encerrada — atingiu</span>' : '<span class="badge danger">Encerrada — não atingiu</span>', garantida: '<span class="badge ok">Garantida</span>', alcancavel: '<span class="badge info">Alcançável</span>', inviavel: '<span class="badge danger">Inviável</span>' }[n.estado]}</td><td class="num">${n.estado === 'alcancavel' ? `<b>${fmt(n.nota)}</b>` : n.estado === 'garantida' ? 'qualquer nota' : '—'}</td></tr>`).join('')}</tbody></table></div></section>`;

  const re = () => render(el);
  el.querySelector('#s-disc').addEventListener('change', (e) => { V.disc = e.target.value; V.mapa = {}; re(); });
  el.querySelector('#s-nota').addEventListener('change', (e) => { V.nota = Math.min(regra.nota_maxima, Math.max(0, Number(e.target.value) || 0)); re(); });
  el.querySelector('#s-extra').addEventListener('change', (e) => { V.extra = Math.min(5, Math.max(0, parseInt(e.target.value, 10) || 0)); re(); });
  el.querySelectorAll('[data-cen]').forEach((b) => b.addEventListener('click', () => { V.nota = Number(Number(b.dataset.cen).toFixed(2)); V.mapa = {}; re(); }));
  el.querySelectorAll('input[data-av]').forEach((b) => b.addEventListener('change', () => { const n = b.value === '' ? undefined : Math.min(Number(b.max), Math.max(0, Number(b.value))); if (n === undefined) delete V.mapa[b.dataset.av]; else V.mapa[b.dataset.av] = n; re(); }));

  const xs = []; for (let n = 0; n <= regra.nota_maxima; n += 0.5) xs.push(n);
  criar('ch-sim', { type: 'line', data: { labels: xs.map((x) => fmt(x, 1)), datasets: [{ label: 'Média final projetada', data: xs.map((x) => { const m = arred(sc(x).mediaFinal, regra); return m; }), borderColor: C.primaria, backgroundColor: `${C.primaria}33`, fill: true, tension: .2, pointRadius: 2 }] },
    options: { scales: { ...escalaNota(regra.nota_maxima), x: { title: { display: true, text: 'Nota em cada avaliação restante' }, grid: { display: false } } }, plugins: { legend: { display: false }, refLine: { linhas: [{ valor: alvo, cor: C.yellow, rotulo: `Média ${fmt(alvo, 1)}` }] } } } });
}
