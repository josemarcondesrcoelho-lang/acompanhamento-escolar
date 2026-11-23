import { S, ctx, diagnosticos, rows, criar, editar, apagar, byId } from '../state.js';
import { fmt, arred, isNum } from '../calc.js';
import { ROTULO_PRIORIDADE, fmtData, diasAte } from '../analysis.js';
import { esc, icone, formModal, confirmar, toast, vazioHTML, notaHTML, opcoesSelect } from '../ui.js';
import { topoPagina } from './comum.js';

const V = { aba: 'prio' };
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const PRIO_OPC = Object.entries(ROTULO_PRIORIDADE);
const corPrio = { baixa: 'muted', moderada: 'yellow', alta: 'warn', urgente: 'danger' };

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', ''); return; }
  const dg = diagnosticos();
  el.innerHTML = `${topoPagina('Planejamento de Estudos e Metas', `${c.ano.ano} · ${esc(c.serie?.nome || '')}`)}
    <div class="tabs" role="tablist">${[['prio', 'Prioridades'], ['metas', 'Metas'], ['plano', 'Plano semanal'], ['rev', 'Revisões e histórico']].map(([k, l]) => `<button role="tab" data-aba="${k}" class="${V.aba === k ? 'ativo' : ''}">${l}</button>`).join('')}</div><div id="aba"></div>`;
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { V.aba = b.dataset.aba; render(el); }));
  ({ prio, metas, plano, rev }[V.aba])(el.querySelector('#aba'), c, dg);
}

function prio(area, c, dg) {
  const lista = [...dg.diags].sort((a, b) => dg.prios[b.md.id].score - dg.prios[a.md.id].score);
  area.innerHTML = `<div class="callout">A prioridade automática considera: média crítica ou abaixo da aprovação, queda recente, distância da meta, avaliação próxima e histórico de dificuldade. Você pode sobrescrever manualmente.</div>
  <div class="tabela-wrap mt"><table><thead><tr><th>Disciplina</th><th class="num">Média</th><th>Prioridade automática</th><th class="hide-m">Motivos</th><th>Prioridade definida</th></tr></thead><tbody>
  ${lista.map((d) => { const p = dg.prios[d.md.id]; return `<tr><td><span class="dot" style="--cor:${d.disc.cor}"></span> ${esc(d.disc.nome)}</td><td class="num">${notaHTML(d.r.mediaFinal, c.regra)}</td><td><span class="badge ${corPrio[p.nivelAuto]}">${esc(ROTULO_PRIORIDADE[p.nivelAuto])}</span> <span class="xs muted">(${p.score} pts)</span></td><td class="hide-m small t2">${esc(p.motivos.join('; ') || '—')}</td>
    <td><select data-pm="${d.md.id}" aria-label="Prioridade de ${esc(d.disc.nome)}"><option value="">Automática</option>${opcoesSelect(PRIO_OPC, d.md.prioridade_manual)}</select></td></tr>`; }).join('')}</tbody></table></div>`;
  area.querySelectorAll('[data-pm]').forEach((s) => s.addEventListener('change', async () => { try { await editar('matricula_disciplinas', s.dataset.pm, { prioridade_manual: s.value || null }); } catch (e) { toast(e.message, 'erro'); } }));
}

/* ---------- Metas ---------- */
function metas(area, c, dg) {
  const lista = rows('metas_academicas').filter((m) => m.matricula_id === c.mat.id).sort((a, b) => String(a.data_limite || '9').localeCompare(String(b.data_limite || '9')));
  const atual = (m) => {
    if (m.tipo === 'media_geral') return c.geral.media;
    const it = c.items.find((i) => i.md.id === m.matricula_disciplina_id); if (!it) return null;
    return m.tipo === 'media_disciplina' ? (it.r.temDados ? it.r.mediaFinal : null) : it.r.ultimaNota;
  };
  area.innerHTML = `<div class="flex jb ac wrap mb"><p class="muted mt0" style="margin:0">Defina metas de média por disciplina, de nota na próxima avaliação ou de média geral.</p><button class="btn primario" id="nova-meta">${icone('mais', 16)} Nova meta</button></div>
  ${lista.length ? `<div class="tabela-wrap"><table><thead><tr><th>Meta</th><th>Disciplina</th><th class="num">Meta</th><th class="num">Resultado atual</th><th class="num">Diferença</th><th style="min-width:120px">% atingido</th><th>Prazo</th><th>Status</th><th></th></tr></thead><tbody>
  ${lista.map((m) => { const a = atual(m); const pct = isNum(a) ? Math.min(100, (a / m.valor_meta) * 100) : 0; const dif = isNum(a) ? a - m.valor_meta : null; const nome = c.items.find((i) => i.md.id === m.matricula_disciplina_id)?.disc.nome || 'Geral';
    return `<tr><td>${esc(m.descricao || ({ media_disciplina: 'Média da disciplina', nota_proxima_avaliacao: 'Nota na próxima avaliação', media_geral: 'Média geral' }[m.tipo]))}</td><td>${esc(nome)}</td><td class="num">${fmt(m.valor_meta, 1)}</td><td class="num">${isNum(a) ? fmt(a) : '—'}</td><td class="num ${dif !== null && dif < 0 ? 'nota-baixa' : ''}">${dif === null ? '—' : `${dif >= 0 ? '+' : ''}${fmt(dif)}`}</td>
    <td><div class="progresso" style="--pcor:${pct >= 100 ? 'var(--ok)' : 'var(--primaria2)'}"><i style="width:${pct.toFixed(0)}%"></i></div><span class="xs muted">${fmt(pct, 0)}%</span></td><td>${fmtData(m.data_limite)}</td>
    <td><span class="badge ${m.status === 'atingida' ? 'ok' : m.status === 'cancelada' ? 'muted' : 'info'}">${{ ativa: 'Ativa', atingida: 'Atingida', cancelada: 'Cancelada' }[m.status]}</span></td>
    <td class="nowrap right">${m.status === 'ativa' ? `<button class="btn sm" data-ok="${m.id}">Atingida</button>` : ''}<button class="btn fantasma btn-ico" data-ed="${m.id}" aria-label="Editar">${icone('edit', 16)}</button><button class="btn fantasma btn-ico" data-del="${m.id}" aria-label="Excluir">${icone('lixo', 16)}</button></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="card">${vazioHTML('Nenhuma meta cadastrada', 'Crie uma meta para acompanhar o progresso.')}</div>`}`;
  area.querySelector('#nova-meta').addEventListener('click', () => formMeta(c));
  area.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => formMeta(c, byId('metas_academicas', b.dataset.ed))));
  area.querySelectorAll('[data-ok]').forEach((b) => b.addEventListener('click', async () => { try { await editar('metas_academicas', b.dataset.ok, { status: 'atingida' }); } catch (e) { toast(e.message, 'erro'); } }));
  area.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (await confirmar({ titulo: 'Excluir meta', msg: 'Excluir esta meta?', rotulo: 'Excluir', perigo: true })) { try { await apagar('metas_academicas', b.dataset.del); } catch (e) { toast(e.message, 'erro'); } } }));
}
function formMeta(c, m = null) {
  formModal({ titulo: m ? 'Editar meta' : 'Nova meta', valores: m || { tipo: 'media_disciplina', status: 'ativa', valor_meta: c.regra.media_aprovacao },
    campos: [
      { n: 'tipo', rotulo: 'Tipo de meta', tipo: 'select', opcoes: [['media_disciplina', 'Média da disciplina'], ['nota_proxima_avaliacao', 'Nota na próxima avaliação'], ['media_geral', 'Média geral']] },
      { n: 'matricula_disciplina_id', rotulo: 'Disciplina', tipo: 'select', opcoes: [['', '— (meta geral)'], ...c.items.map((i) => [i.md.id, i.disc.nome])] },
      { n: 'valor_meta', rotulo: 'Valor da meta', tipo: 'number', req: true, min: 0, max: c.regra.nota_maxima, step: 0.1 }, { n: 'data_limite', rotulo: 'Prazo', tipo: 'date' },
      { n: 'descricao', rotulo: 'Descrição', full: true }, { n: 'status', rotulo: 'Status', tipo: 'select', opcoes: [['ativa', 'Ativa'], ['atingida', 'Atingida'], ['cancelada', 'Cancelada']] },
    ],
    validar: (v) => (v.tipo !== 'media_geral' && !v.matricula_disciplina_id ? 'Escolha a disciplina da meta.' : null),
    onSubmit: async (v) => { const row = { ...v, matricula_id: c.mat.id, matricula_disciplina_id: v.tipo === 'media_geral' ? null : v.matricula_disciplina_id }; if (m) await editar('metas_academicas', m.id, row); else await criar('metas_academicas', row); } });
}

/* ---------- Plano semanal ---------- */
function tarefasDoAno(c) { return rows('planejamento_estudos').filter((t) => t.matricula_id === c.mat.id); }
function cartaoTarefa(t, c) {
  const d = c.items.find((i) => i.md.id === t.matricula_disciplina_id)?.disc;
  const atras = t.data_revisao && !t.concluida && diasAte(t.data_revisao) < 0;
  return `<div class="prio" style="${t.concluida ? 'opacity:.6' : ''}"><input type="checkbox" data-done="${t.id}" ${t.concluida ? 'checked' : ''} aria-label="Concluída" style="margin-top:.2rem"><div class="grow"><div style="font-weight:650;${t.concluida ? 'text-decoration:line-through' : ''}">${esc(t.titulo)}</div>
    <div class="xs muted">${d ? `<span class="dot" style="--cor:${d.cor}"></span> ${esc(d.nome)} · ` : ''}<span class="badge ${corPrio[t.prioridade]}">${esc(ROTULO_PRIORIDADE[t.prioridade])}</span>${t.data_revisao ? ` · revisão ${fmtData(t.data_revisao)}${atras ? ' <span class="badge danger">atrasada</span>' : ''}` : ''}</div>${t.conteudo ? `<div class="small t2">${esc(t.conteudo)}</div>` : ''}</div>
    <div class="nowrap"><button class="btn fantasma btn-ico" data-ed="${t.id}" aria-label="Editar">${icone('edit', 15)}</button><button class="btn fantasma btn-ico" data-del="${t.id}" aria-label="Excluir">${icone('lixo', 15)}</button></div></div>`;
}
function ligarTarefas(area, c) {
  area.querySelectorAll('[data-done]').forEach((b) => b.addEventListener('change', async () => { try { await editar('planejamento_estudos', b.dataset.done, { concluida: b.checked, concluida_em: b.checked ? new Date().toISOString() : null }); } catch (e) { b.checked = !b.checked; toast(e.message, 'erro'); } }));
  area.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => formTarefa(c, byId('planejamento_estudos', b.dataset.ed))));
  area.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { if (await confirmar({ titulo: 'Excluir tarefa', msg: 'Excluir esta tarefa de estudo?', rotulo: 'Excluir', perigo: true })) { try { await apagar('planejamento_estudos', b.dataset.del); } catch (e) { toast(e.message, 'erro'); } } }));
}
function plano(area, c) {
  const ts = tarefasDoAno(c).filter((t) => !t.concluida || true);
  const grupos = [1, 2, 3, 4, 5, 6, 0].map((d) => [d, ts.filter((t) => t.dia_semana === d)]);
  const sem = ts.filter((t) => t.dia_semana === null || t.dia_semana === undefined);
  area.innerHTML = `<div class="flex jb ac wrap mb"><p class="muted" style="margin:0">Organize os estudos da semana por dia.</p><button class="btn primario" id="nova-t">${icone('mais', 16)} Nova tarefa</button></div>
    ${ts.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${grupos.filter(([, l]) => l.length).map(([d, l]) => `<div class="card"><h3>${DIAS[d]}</h3><div class="flex" style="flex-direction:column;gap:.5rem">${l.map((t) => cartaoTarefa(t, c)).join('')}</div></div>`).join('')}${sem.length ? `<div class="card"><h3>Sem dia definido</h3><div class="flex" style="flex-direction:column;gap:.5rem">${sem.map((t) => cartaoTarefa(t, c)).join('')}</div></div>` : ''}</div>` : `<div class="card">${vazioHTML('Nenhuma tarefa de estudo', 'Crie tarefas para as disciplinas que precisam de reforço.')}</div>`}`;
  area.querySelector('#nova-t').addEventListener('click', () => formTarefa(c));
  ligarTarefas(area, c);
}
function rev(area, c) {
  const ts = tarefasDoAno(c);
  const pend = ts.filter((t) => !t.concluida).sort((a, b) => String(a.data_revisao || '9999').localeCompare(String(b.data_revisao || '9999')));
  const feitas = ts.filter((t) => t.concluida).sort((a, b) => String(b.concluida_em).localeCompare(String(a.concluida_em)));
  area.innerHTML = `<div class="grid g2"><div class="card"><h3>Revisões pendentes (${pend.length})</h3><div class="flex" style="flex-direction:column;gap:.5rem">${pend.map((t) => cartaoTarefa(t, c)).join('') || '<p class="muted">Nada pendente.</p>'}</div></div>
    <div class="card"><h3>Histórico de tarefas concluídas (${feitas.length})</h3><div class="flex" style="flex-direction:column;gap:.5rem">${feitas.map((t) => `${cartaoTarefa(t, c)}<div class="xs muted" style="margin:-.3rem 0 .2rem .4rem">Concluída em ${fmtData(t.concluida_em)}</div>`).join('') || '<p class="muted">Nenhuma tarefa concluída ainda.</p>'}</div></div></div>`;
  ligarTarefas(area, c);
}
function formTarefa(c, t = null) {
  const dg = diagnosticos();
  formModal({ titulo: t ? 'Editar tarefa' : 'Nova tarefa de estudo', valores: t || { prioridade: 'moderada' },
    campos: [
      { n: 'titulo', rotulo: 'Tarefa', req: true, full: true, max: 120 },
      { n: 'matricula_disciplina_id', rotulo: 'Disciplina', tipo: 'select', opcoes: [['', '— (geral)'], ...c.items.map((i) => [i.md.id, i.disc.nome])] },
      { n: 'prioridade', rotulo: 'Prioridade', tipo: 'select', opcoes: PRIO_OPC },
      { n: 'dia_semana', rotulo: 'Dia da semana', tipo: 'select', opcoes: [['', '— sem dia —'], ...[1, 2, 3, 4, 5, 6, 0].map((d) => [d, DIAS[d]])] },
      { n: 'data_revisao', rotulo: 'Data de revisão', tipo: 'date' },
      { n: 'conteudo', rotulo: 'Conteúdo a revisar', tipo: 'textarea', full: true }, { n: 'observacoes', rotulo: 'Observações', tipo: 'textarea', full: true },
    ],
    onSubmit: async (v) => {
      const row = { ...v, matricula_id: c.mat.id, matricula_disciplina_id: v.matricula_disciplina_id || null, dia_semana: v.dia_semana === null || v.dia_semana === '' ? null : Number(v.dia_semana) };
      if (t) await editar('planejamento_estudos', t.id, row); else await criar('planejamento_estudos', row);
    } });
}
