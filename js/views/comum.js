/* Peças compartilhadas entre telas */
import { fmt, arred } from '../calc.js';
import { esc, opcoesSelect, icone } from '../ui.js';
import { criar, cores, escalaNota } from '../charts.js';
import { fmtData } from '../analysis.js';

export function topoPagina(titulo, sub, acoes = '') {
  return `<div class="pagina-topo"><div><h1>${esc(titulo)}</h1>${sub ? `<p>${sub}</p>` : ''}</div><div class="flex gap wrap ac">${acoes}</div></div>`;
}

/** Barra de filtros. `ids` define quais filtros aparecem. */
export function barraFiltros(c, f, ids = ['disc', 'periodo', 'situacao', 'tipo'], tipos = []) {
  const campos = {
    disc: ['Disciplina', opcoesSelect(c.mdsTodas.map((m) => [m.id, c.items.find((i) => i.md.id === m.id)?.disc.nome || '?']), f.disc, 'Todas')],
    periodo: ['Período', opcoesSelect(c.periodosTodos.map((p) => [p.id, p.nome]), f.periodo, 'Todos')],
    situacao: ['Situação acadêmica', opcoesSelect([['aprovada', 'Satisfatória'], ['atencao', 'Em atenção'], ['critica', 'Crítica'], ['sem_dados', 'Sem dados']], f.situacao, 'Todas')],
    tipo: ['Tipo de avaliação', opcoesSelect(tipos, f.tipo, 'Todos')],
  };
  return `<div class="filtros card" style="padding:.7rem .9rem">${ids.map((k) => `<div class="field"><label for="flt_${k}">${campos[k][0]}</label><select id="flt_${k}" data-filtro="${k}">${campos[k][1]}</select></div>`).join('')}<button class="btn fantasma sm" data-limpar-filtros>${icone('x', 14)} Limpar</button></div>`;
}
export function ligarFiltros(el, f, onChange) {
  el.querySelectorAll('[data-filtro]').forEach((s) => s.addEventListener('change', () => { f[s.dataset.filtro] = s.value; onChange(); }));
  el.querySelector('[data-limpar-filtros]')?.addEventListener('click', () => { Object.keys(f).forEach((k) => { f[k] = ''; }); onChange(); });
}

/**
 * Gráfico de evolução de UMA disciplina.
 * modo: 'avaliacao' | 'periodo' | 'mensal'
 */
export function graficoEvolucao(id, item, regra, modo = 'avaliacao') {
  const C = cores(); const r = item.r;
  let labels = []; let dados = []; let extra = []; let meta = [];
  if (modo === 'periodo') {
    r.periodos.forEach((p) => { labels.push(p.nome); dados.push(p.resultado); extra.push(p.parcial ? 'parcial' : ''); meta.push({ titulo: p.nome, linhas: [`Resultado: ${fmt(p.resultado)}`, p.recAplicada ? 'Com recuperação' : '', p.completo ? '' : 'Período incompleto (parcial)'] }); });
  } else if (modo === 'mensal') {
    const m = {};
    r.notasSeq.filter((n) => n.data && n.tipo !== 'recuperacao').forEach((n) => { const k = String(n.data).slice(0, 7); (m[k] = m[k] || []).push(n.nota); });
    Object.keys(m).sort().forEach((k) => { const v = m[k]; labels.push(`${k.slice(5)}/${k.slice(0, 4)}`); dados.push(v.reduce((a, b) => a + b, 0) / v.length); meta.push({ titulo: `Mês ${k.slice(5)}/${k.slice(0, 4)}`, linhas: [`Média do mês: ${fmt(v.reduce((a, b) => a + b, 0) / v.length)}`, `${v.length} avaliação(ões)`] }); });
  } else {
    r.notasSeq.filter((n) => n.tipo !== 'recuperacao').forEach((n) => { labels.push(`${n.nome}${n.periodo ? ` · ${n.periodo}º` : ''}`); dados.push(n.nota); meta.push({ titulo: n.nome, linhas: [`Data: ${n.data ? fmtData(n.data) : 'não informada'}`, `Nota: ${fmt(n.nota)}`, `Período: ${n.periodoNome || '—'}`] }); });
  }
  const ap = regra.media_aprovacao;
  const corPonto = dados.map((v) => (v === null ? C.muted : arred(v, regra) < ap ? C.danger : item.disc.cor || C.primaria));
  return criar(id, {
    type: 'line',
    data: { labels, datasets: [{ label: item.disc.nome, data: dados, borderColor: item.disc.cor || C.primaria, backgroundColor: `${item.disc.cor || '#6366f1'}33`, fill: true, tension: .3, spanGaps: true, pointRadius: 6, pointHoverRadius: 8, pointBackgroundColor: corPonto, pointBorderColor: corPonto }] },
    options: {
      scales: { ...escalaNota(regra.nota_maxima), x: { grid: { display: false }, ticks: { maxRotation: 50, autoSkip: false } } },
      plugins: { legend: { display: false }, refLine: { linhas: [{ valor: ap, rotulo: `Média ${fmt(ap, 1)}`, cor: C.yellow }] },
        tooltip: { callbacks: { title: (it) => meta[it[0].dataIndex]?.titulo || '', label: (it) => (meta[it.dataIndex]?.linhas || []).filter(Boolean) } } },
    },
  });
}

/** Texto curto de evolução (positiva/negativa) para a legenda do gráfico */
export function resumoEvolucao(d) {
  if (!d || !d.r.temDados) return '<span class="muted">Sem notas lançadas.</span>';
  const t = d.tend;
  const partes = [];
  if (t.rotulo === 'positiva') partes.push(`<span class="tend up">${icone('up', 14)} Evolução positiva (${t.delta !== null ? `${t.delta > 0 ? '+' : ''}${fmt(t.delta)}` : ''})</span>`);
  else if (t.rotulo === 'negativa') partes.push(`<span class="tend down">${icone('down', 14)} Evolução negativa (${fmt(t.delta)})</span>`);
  else if (t.rotulo === 'estavel') partes.push(`<span class="tend flat">${icone('flat', 14)} Estável</span>`);
  else partes.push('<span class="muted">Poucas notas para avaliar a tendência.</span>');
  return partes.join(' ');
}
export const periodoSelect = (c, sel) => opcoesSelect(c.periodosTodos.map((p) => [p.id, p.nome]), sel, 'Todos');
