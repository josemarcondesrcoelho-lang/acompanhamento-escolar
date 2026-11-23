import { S, ctx, matriculas, rows, criar, editar, apagar, byId, importarPlano, selecionarMatricula, rotuloMatricula, recarregarSilencioso } from '../state.js';
import { fmt, arred, isNum, mergeRegra } from '../calc.js';
import { planejarNovoAno, SERIES_PADRAO } from '../estrutura.js';
import { esc, icone, formModal, confirmar, toast, badgeStatus, vazioHTML, notaHTML, opcoesSelect } from '../ui.js';
import { criar as criarGrafico, cores, escalaNota } from '../charts.js';
import { topoPagina } from './comum.js';
import * as db from '../db.js';
import { modalImportar } from './setup.js';

const RESULTADOS = [['aprovado', 'Aprovada'], ['recuperacao', 'Em recuperação final'], ['reprovado', 'Reprovada'], ['transferido', 'Transferida'], ['desistente', 'Desistente']];

export function render(el) {
  const ms = matriculas();
  const c = ctx();
  el.innerHTML = `${topoPagina('Histórico Escolar', 'Todos os anos letivos, sem perda de dados. Um ano nunca sobrescreve outro.', `<button class="btn" id="imp-bol">${icone('upload', 16)} Importar boletim (JSON)</button><button class="btn primario" id="avancar">${icone('mais', 16)} Avançar de ano / nova série</button>`)}
    ${!ms.length ? `<div class="card">${vazioHTML('Nenhum ano letivo cadastrado', 'Use o botão acima para criar o primeiro.')}</div>` : `
    <div class="tabela-wrap"><table><thead><tr><th>Ano letivo</th><th>Série</th><th>Situação</th><th class="num">Média geral</th><th>Desempenho</th><th>Resultado oficial</th><th></th></tr></thead><tbody>
    ${ms.map((m) => { const cx = ctx(m.mat.id); const g = cx.geral; const sel = m.mat.id === S.matId;
      return `<tr style="${sel ? 'background:var(--card2)' : ''}"><td><b>${m.ano.ano}</b> ${sel ? '<span class="badge info">selecionado</span>' : ''}</td><td>${esc(m.serie?.nome || '—')}</td><td><span class="badge ${m.mat.situacao === 'concluido' ? 'ok' : m.mat.situacao === 'planejado' ? 'muted' : 'info'}">${{ planejado: 'Planejado', em_andamento: 'Em andamento', concluido: 'Concluído' }[m.mat.situacao]}</span></td>
      <td class="num">${notaHTML(g.media, cx.regra)}${g.parcial && g.media !== null ? ' <span class="badge parcial">parcial</span>' : ''}</td><td class="small">${g.cont.aprovada} ok · ${g.cont.atencao} atenção · ${g.cont.critica} crítica(s)</td>
      <td>${m.mat.resultado_final ? `<b>${esc(RESULTADOS.find((r) => r[0] === m.mat.resultado_final)?.[1] || m.mat.resultado_final)}</b>` : '<span class="muted">— (aguardando resultado oficial)</span>'}</td>
      <td class="nowrap right">${sel ? '' : `<button class="btn sm" data-sel="${m.mat.id}">Abrir</button>`} ${m.mat.situacao === 'concluido' ? `<button class="btn sm" data-reabrir="${m.mat.id}">Reabrir</button>` : `<button class="btn sm" data-encerrar="${m.mat.id}">Encerrar ano</button>`}
      <button class="btn fantasma btn-ico" data-delm="${m.mat.id}" aria-label="Excluir ano">${icone('lixo', 15)}</button></td></tr>`; }).join('')}</tbody></table></div>
    <p class="xs muted" style="margin-top:.5rem">A situação "aprovada/reprovada" só é registrada quando você encerra o ano informando o resultado oficial da escola. Antes disso, o sistema mostra apenas desempenho e projeções.</p>
    ${ms.length >= 2 ? '<div id="comparativo" class="mt"></div>' : ''}
    ${c?.mat.dados_origem ? '<div id="conferencia" class="mt"></div>' : ''}`}`;

  el.querySelector('#avancar').addEventListener('click', () => formNovoAno(ms));
  el.querySelector('#imp-bol').addEventListener('click', () => modalImportar());
  el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => selecionarMatricula(b.dataset.sel)));
  el.querySelectorAll('[data-encerrar]').forEach((b) => b.addEventListener('click', () => encerrar(b.dataset.encerrar)));
  el.querySelectorAll('[data-reabrir]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmar({ titulo: 'Reabrir ano', msg: 'Reabrir este ano letivo? O resultado oficial e o resumo consolidado serão removidos (as notas permanecem).', rotulo: 'Reabrir' })) return;
    try { const h = rows('historico_academico').find((x) => x.matricula_id === b.dataset.reabrir); if (h) await db.remover('historico_academico', h.id); await editar('estudante_ano_letivo', b.dataset.reabrir, { situacao: 'em_andamento', resultado_final: null, encerrado_em: null }); await recarregarSilencioso(); toast('Ano reaberto.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
  }));
  el.querySelectorAll('[data-delm]').forEach((b) => b.addEventListener('click', async () => {
    const m = ms.find((x) => x.mat.id === b.dataset.delm); const cx = ctx(m.mat.id);
    if (!await confirmar({ titulo: 'Excluir ano letivo inteiro', msg: `Excluir <b>${m.ano.ano} — ${esc(m.serie?.nome || '')}</b>? Serão apagadas <b>${cx.items.reduce((s, i) => s + i.avalsAll.length, 0)}</b> avaliações, metas, plano de estudos e alertas deste ano. <b>Não há como desfazer.</b> Faça um backup antes.`, rotulo: 'Excluir definitivamente', perigo: true })) return;
    try { await apagar('estudante_ano_letivo', m.mat.id); toast('Ano excluído.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
  }));
  if (ms.length >= 2) comparativo(el.querySelector('#comparativo'), ms);
  if (c?.mat.dados_origem) conferencia(el.querySelector('#conferencia'), c);
}

function formNovoAno(ms) {
  const est = ms[ms.length - 1]?.est || rows('estudantes')[0];
  if (!est) { toast('Cadastre o estudante primeiro (Configurações).', 'erro'); return; }
  const ultimo = ms[ms.length - 1]; const proxAno = (ultimo?.ano.ano || new Date().getFullYear()) + 1;
  const serieAtual = ultimo?.serie?.nome; const idx = SERIES_PADRAO.indexOf(serieAtual); const proxSerie = idx >= 0 && idx < SERIES_PADRAO.length - 1 ? SERIES_PADRAO[idx + 1] : SERIES_PADRAO[0];
  formModal({ titulo: 'Novo ano letivo / série', valores: { ano: proxAno, serie: proxSerie, copiar: true, situacao: 'planejado' },
    campos: [
      { n: 'ano', rotulo: 'Ano letivo', tipo: 'number', req: true, min: 2000, max: 2100, step: 1 },
      { n: 'serie', rotulo: 'Série', tipo: 'select', opcoes: [...new Set([...SERIES_PADRAO, ...rows('series').map((s) => s.nome)])].map((s) => [s, s]) },
      { n: 'situacao', rotulo: 'Situação inicial', tipo: 'select', opcoes: [['planejado', 'Planejado'], ['em_andamento', 'Em andamento']] },
      { n: 'copiar', rotulo: `Copiar disciplinas e regras de ${ultimo ? ultimo.ano.ano : 'outro ano'} (sem notas)`, tipo: 'checkbox', full: true },
    ],
    onSubmit: async (v) => {
      const plano = planejarNovoAno({ estudantes: rows('estudantes'), series: rows('series'), anos_letivos: rows('anos_letivos'), estudante_ano_letivo: rows('estudante_ano_letivo'), regras_avaliacao: rows('regras_avaliacao'), matricula_disciplinas: rows('matricula_disciplinas') },
        { estudanteId: est.id, ano: v.ano, serieNome: v.serie, copiarDeMatriculaId: v.copiar && ultimo ? ultimo.mat.id : null, situacao: v.situacao });
      await importarPlano(plano);
      selecionarMatricula(plano.matriculaId);
    } });
}

function encerrar(matId) {
  const cx = ctx(matId); const m = byId('estudante_ano_letivo', matId);
  const parcial = cx.geral.parcial;
  formModal({ titulo: `Encerrar ${cx.ano.ano} — ${cx.serie?.nome || ''}`, salvar: 'Encerrar ano', valores: { resultado_final: 'aprovado' },
    extraTopo: `<div class="callout ${parcial ? 'aviso' : ''}" style="margin-bottom:.8rem">${parcial ? '<b>Atenção:</b> há períodos incompletos; a média atual é <b>parcial</b>. Só encerre quando houver o resultado oficial da escola.' : 'Todas as notas estão lançadas.'} Será gravado um resumo consolidado do ano (média geral ${fmt(cx.geral.media)}).</div>`,
    campos: [{ n: 'resultado_final', rotulo: 'Resultado oficial informado pela escola', tipo: 'select', req: true, opcoes: RESULTADOS }],
    onSubmit: async (v) => {
      const snap = { ano: cx.ano.ano, serie: cx.serie?.nome, gerado_em: new Date().toISOString(), media_geral: cx.geral.media, parcial,
        disciplinas: cx.items.map((i) => ({ nome: i.disc.nome, media: i.r.mediaFinal, status: i.r.status, pontos: i.r.pontos, periodos: i.r.periodos.map((p) => p.resultado) })) };
      const ex = rows('historico_academico').find((h) => h.matricula_id === matId);
      const linha = { matricula_id: matId, media_geral: cx.geral.media === null ? null : Number(cx.geral.media.toFixed(2)), resultado: v.resultado_final, snapshot: snap, fechado_em: new Date().toISOString() };
      if (ex) await editar('historico_academico', ex.id, linha); else await criar('historico_academico', linha);
      await editar('estudante_ano_letivo', matId, { situacao: 'concluido', resultado_final: v.resultado_final, encerrado_em: new Date().toISOString() });
    } });
}

/* ---------- comparativo entre anos ---------- */
function comparativo(box, ms) {
  const C = cores();
  const dados = ms.map((m) => ({ m, cx: ctx(m.mat.id) })).filter((x) => x.cx.items.some((i) => i.r.temDados));
  if (dados.length < 2) { box.innerHTML = '<div class="card"><h3>Comparação entre anos</h3><p class="muted">É necessário ter notas em pelo menos dois anos para comparar.</p></div>'; return; }
  const nomes = [...new Set(dados.flatMap((d) => d.cx.items.map((i) => i.disc.nome)))];
  const rotulos = dados.map((d) => `${d.m.ano.ano} · ${d.m.serie?.nome || ''}`);
  const cores12 = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#14b8a6', '#a855f7', '#0ea5e9', '#f97316', '#84cc16', '#06b6d4', '#eab308'];
  box.innerHTML = `<div class="card"><h3>Comparação entre anos letivos</h3><p class="xs muted">Médias parciais são marcadas; compare com cautela até o fechamento do ano.</p>
    <div class="grid g2"><div><h4>Média geral por ano</h4><div class="chart-box baixo"><canvas id="ch-h1"></canvas></div></div><div><h4>Evolução do percentual de aprovação e das dificuldades</h4><div class="chart-box baixo"><canvas id="ch-h2"></canvas></div></div></div>
    <h4 class="mt">Média por disciplina em cada ano</h4><div class="chart-box alto"><canvas id="ch-h3"></canvas></div>
    <div class="tabela-wrap mt"><table><thead><tr><th>Disciplina</th>${rotulos.map((r) => `<th class="num">${esc(r)}</th>`).join('')}<th class="num">Variação</th></tr></thead><tbody>${nomes.map((n) => { const vs = dados.map((d) => d.cx.items.find((i) => i.disc.nome === n)); const med = vs.map((v) => (v && v.r.temDados ? v.r.mediaFinal : null)); const val = med.filter((x) => x !== null);
      return `<tr><td>${esc(n)}</td>${med.map((x, i) => `<td class="num">${notaHTML(x, dados[i].cx.regra)}${vs[i]?.r.parcial && x !== null ? '<sup class="muted">p</sup>' : ''}</td>`).join('')}<td class="num">${val.length >= 2 ? `${val[val.length - 1] - val[0] >= 0 ? '+' : ''}${fmt(val[val.length - 1] - val[0])}` : '—'}</td></tr>`; }).join('')}</tbody></table></div></div>`;
  criarGrafico('ch-h1', { type: 'bar', data: { labels: rotulos, datasets: [{ data: dados.map((d) => (d.cx.geral.media === null ? null : Number(d.cx.geral.media.toFixed(2)))), backgroundColor: C.primaria, borderRadius: 6 }] }, options: { scales: { ...escalaNota(10), x: { grid: { display: false } } }, plugins: { legend: { display: false }, refLine: { linhas: [{ valor: 7, cor: C.yellow, rotulo: 'Média 7,0' }] } } } });
  criarGrafico('ch-h2', { type: 'bar', data: { labels: rotulos, datasets: [{ label: 'Satisfatórias', data: dados.map((d) => d.cx.geral.cont.aprovada), backgroundColor: C.ok }, { label: 'Em atenção', data: dados.map((d) => d.cx.geral.cont.atencao), backgroundColor: C.warn }, { label: 'Críticas', data: dados.map((d) => d.cx.geral.cont.critica), backgroundColor: C.danger }] }, options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } }, plugins: { legend: { position: 'bottom' } } } });
  criarGrafico('ch-h3', { type: 'line', data: { labels: rotulos, datasets: nomes.map((n, k) => ({ label: n, data: dados.map((d) => { const i = d.cx.items.find((x) => x.disc.nome === n); return i && i.r.temDados ? Number(i.r.mediaFinal.toFixed(2)) : null; }), borderColor: cores12[k % 12], backgroundColor: cores12[k % 12], tension: .25, pointRadius: 4 })) }, options: { scales: { ...escalaNota(10), x: { grid: { display: false } } }, plugins: { legend: { position: 'bottom' } } } });
}

/* ---------- conferência com o boletim original ---------- */
function conferencia(box, c) {
  const o = c.mat.dados_origem; const regra = c.regra;
  const linhas = c.items.map((i) => { const og = o.disciplinas?.[i.disc.nome]; if (!og) return null;
    const bim = [0, 1, 2, 3].map((k) => ({ b: og.resultado_bim?.[k], s: i.r.periodos[k]?.resultado }));
    return { i, og, bim, sem1: { b: og.res_sem?.[0], s: i.r.semestres[0]?.resultado } }; }).filter(Boolean);
  const cel = (b, s) => { if (!isNum(b)) return '<td class="num muted">—</td>'; const sv = isNum(s) ? arred(s, regra) : null; const ok = sv !== null && Math.abs(sv - b) <= 0.0101; return `<td class="num ${ok ? '' : 'nota-baixa'}" title="Boletim: ${fmt(b)} · Sistema: ${sv === null ? '—' : fmt(sv)}">${fmt(b)}${ok ? '' : ` ≠ ${sv === null ? '—' : fmt(sv)}`}</td>`; };
  box.innerHTML = `<div class="card"><h3>Conferência com o boletim original (${fmtD(o.emissao)})</h3>
    <p class="small t2">Os valores originais do boletim foram preservados. A tabela mostra o resultado do boletim e, quando diferente, o que o sistema calcula (tolerância de ±0,01 por arredondamento).</p>
    <div class="tabela-wrap"><table><thead><tr><th>Disciplina</th><th class="num">Res. 1º bim</th><th class="num">Res. 2º bim</th><th class="num">Res. 3º bim</th><th class="num">RES 1º sem</th></tr></thead><tbody>
    ${linhas.map((l) => `<tr><td>${esc(l.i.disc.nome)}</td>${[0, 1, 2].map((k) => cel(l.bim[k].b, l.bim[k].s)).join('')}${cel(l.sem1.b, l.sem1.s)}</tr>`).join('')}</tbody></table></div>
    ${(o.observacoes_transcricao || []).length ? `<h4 class="mt">Observações da transcrição</h4><ul class="small t2">${o.observacoes_transcricao.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`;
}
const fmtD = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
