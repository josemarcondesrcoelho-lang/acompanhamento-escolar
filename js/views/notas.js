import { S, ctx, rows, criar, editar, apagar, byId } from '../state.js';
import { fmt, TIPOS_AVALIACAO, STATUS_AVALIACAO, nomeTipo, nomeStatusAval, validarNota, isNum, temNota, ehRegular, ehRecuperacao, calcDisciplina } from '../calc.js';
import { esc, icone, formModal, confirmar, toast, notaHTML, badgeStatus, vazioHTML, opcoesSelect } from '../ui.js';
import { fmtData } from '../analysis.js';
import { topoPagina } from './comum.js';

const V = { modo: 'boletim', disc: '', periodo: '', tipo: '', status: '', busca: '' };

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', 'Crie um ano letivo em Configurações.'); return; }
  const idsMd = new Set(c.mdsTodas.map((m) => m.id));
  const avsTodas = rows('avaliacoes').filter((a) => idsMd.has(a.matricula_disciplina_id));
  const nomeDisc = (mdId) => c.items.find((i) => i.md.id === mdId)?.disc.nome || byId('disciplinas', byId('matricula_disciplinas', mdId)?.disciplina_id)?.nome || '?';
  const pNome = (id) => c.periodosTodos.find((p) => p.id === id)?.nome || '?';

  const filtradas = avsTodas.filter((a) => (!V.disc || a.matricula_disciplina_id === V.disc) && (!V.periodo || a.periodo_id === V.periodo)
    && (!V.tipo || a.tipo === V.tipo) && (!V.status || a.status === V.status || (V.status === 'nota_lancada' && temNota(a)))
    && (!V.busca || `${a.nome} ${nomeDisc(a.matricula_disciplina_id)}`.toLowerCase().includes(V.busca.toLowerCase())));

  el.innerHTML = `
    ${topoPagina('Notas e Avaliações', `${c.ano.ano} · ${esc(c.serie?.nome || '')} — ${avsTodas.filter(temNota).length} nota(s) lançada(s), ${avsTodas.filter((a) => !temNota(a) && a.status !== 'nao_realizada').length} pendente(s)`,
      `<button class="btn primario" id="nova-aval">${icone('mais', 16)} Nova avaliação</button>`)}
    <div class="card" style="padding:.7rem .9rem">
      <div class="filtros">
        <div class="field"><label for="n-disc">Disciplina</label><select id="n-disc">${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), V.disc, 'Todas')}</select></div>
        <div class="field"><label for="n-per">Período</label><select id="n-per">${opcoesSelect(c.periodosTodos.map((p) => [p.id, p.nome]), V.periodo, 'Todos')}</select></div>
        <div class="field"><label for="n-tipo">Tipo</label><select id="n-tipo">${opcoesSelect(TIPOS_AVALIACAO, V.tipo, 'Todos')}</select></div>
        <div class="field"><label for="n-st">Situação</label><select id="n-st">${opcoesSelect(STATUS_AVALIACAO, V.status, 'Todas')}</select></div>
        <div class="field"><label for="n-q">Buscar</label><input type="search" id="n-q" value="${esc(V.busca)}" placeholder="Nome da avaliação…"></div>
        <div class="seg" role="group" aria-label="Visualização"><button data-modo="boletim" class="${V.modo === 'boletim' ? 'ativo' : ''}" title="Grade no formato do boletim">${icone('grade', 15)} Boletim</button><button data-modo="tabela" class="${V.modo === 'tabela' ? 'ativo' : ''}">${icone('lista', 15)} Tabela</button><button data-modo="cards" class="${V.modo === 'cards' ? 'ativo' : ''}">${icone('cards', 15)} Cards</button></div>
      </div>
    </div>
    <div class="mt" id="area-notas"></div>`;

  const area = el.querySelector('#area-notas');
  if (V.modo === 'boletim') boletim(area, c); else if (V.modo === 'tabela') tabela(area, c, filtradas, nomeDisc, pNome); else cards(area, c, filtradas, nomeDisc, pNome);

  const re = () => render(el);
  el.querySelector('#nova-aval').addEventListener('click', () => formAvaliacao(c));
  [['n-disc', 'disc'], ['n-per', 'periodo'], ['n-tipo', 'tipo'], ['n-st', 'status']].forEach(([id, k]) => el.querySelector(`#${id}`).addEventListener('change', (e) => { V[k] = e.target.value; re(); }));
  el.querySelector('#n-q').addEventListener('input', (e) => { V.busca = e.target.value; clearTimeout(V.t); V.t = setTimeout(() => { re(); const q = el.querySelector('#n-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); });
  el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { V.modo = b.dataset.modo; re(); }));
}

/* ---------------- Grade estilo boletim (lançamento rápido) ---------------- */
function boletim(area, c) {
  const { regra } = c;
  let itens = c.items.filter((i) => !V.disc || i.md.id === V.disc);
  const pers = c.periodosTodos.filter((p) => !V.periodo || p.id === V.periodo);
  if (!itens.length) { area.innerHTML = `<div class="card">${vazioHTML('Nenhuma disciplina', 'Cadastre disciplinas na área "Disciplinas".')}</div>`; return; }
  // nº de colunas de nota por período = máximo entre as disciplinas (regulares)
  const nCols = {}; pers.forEach((p) => { nCols[p.id] = Math.max(regra.avaliacoes_por_periodo, ...itens.map((i) => i.avals.filter((a) => a.periodo_id === p.id && ehRegular(a)).length)); });
  const regs = (i, p) => i.avals.filter((a) => a.periodo_id === p.id && ehRegular(a)).sort((a, b) => a.ordem - b.ordem);
  const recDe = (i, p) => i.avals.find((a) => a.periodo_id === p.id && ehRecuperacao(a));
  const inp = (a) => `<input class="celula-nota" type="number" step="0.01" min="0" max="${a.valor_maximo}" inputmode="decimal" value="${isNum(a.nota) ? a.nota : ''}" data-av="${a.id}" aria-label="${esc(a.nome)}">`;
  const cab1 = pers.map((p) => `<th class="grupo" colspan="${nCols[p.id] + 2}">${esc(p.nome)}</th>`).join('');
  const cab2 = pers.map((p) => `${Array.from({ length: nCols[p.id] }, (_, k) => `<th class="num ${k === 0 ? 'sep' : ''}">${k + 1}ª</th>`).join('')}<th class="num">Rec.</th><th class="num">Result.</th>`).join('');
  area.innerHTML = `<div class="tabela-wrap"><table class="grade"><thead><tr><th rowspan="2">Disciplina</th>${cab1}<th rowspan="2" class="num sep">Média anual</th><th rowspan="2" class="num hide-m">Pontos</th><th rowspan="2">Status</th></tr><tr>${cab2}</tr></thead><tbody>
    ${itens.map((i) => `<tr data-md="${i.md.id}"><td class="nowrap"><span class="dot" style="--cor:${i.disc.cor}"></span> <b>${esc(i.disc.nome)}</b></td>
      ${pers.map((p) => { const rs = regs(i, p); const rc = recDe(i, p); const pr = i.r.periodos.find((x) => x.periodoId === p.id);
        return `${Array.from({ length: nCols[p.id] }, (_, k) => `<td class="${k === 0 ? 'sep' : ''}">${rs[k] ? inp(rs[k]) : `<button class="btn fantasma btn-ico" data-add="${i.md.id}|${p.id}" title="Adicionar avaliação" aria-label="Adicionar avaliação">${icone('mais', 14)}</button>`}</td>`).join('')}
        <td>${rc ? inp(rc) : `<button class="btn fantasma btn-ico" data-addrec="${i.md.id}|${p.id}" title="Lançar recuperação" aria-label="Lançar recuperação">${icone('mais', 14)}</button>`}</td>
        <td class="num calc" data-calc="res:${p.id}">${notaHTML(pr?.resultado, regra)}</td>`; }).join('')}
      <td class="num calc sep" data-calc="media">${notaHTML(i.r.mediaFinal, regra)}${i.r.parcial && i.r.temDados ? ' <span class="badge parcial" title="Média parcial — resultado não definitivo.">P</span>' : ''}</td>
      <td class="num hide-m" data-calc="pontos">${fmt(i.r.pontos, 1)}</td><td data-calc="status">${badgeStatus(i.r.status)}</td></tr>`).join('')}
    </tbody></table></div>
    <p class="xs muted" style="margin-top:.6rem">Digite a nota e pressione Enter ou saia do campo para salvar. Campo vazio = pendente (nunca vira zero). <b>P</b> = média parcial, resultado não definitivo. A recuperação só vale quando a média do período está abaixo de ${fmt(regra.media_aprovacao, 1)} (configurável).</p>`;

  area.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => { const [md, p] = b.dataset.add.split('|'); formAvaliacao(c, null, { matricula_disciplina_id: md, periodo_id: p }); }));
  area.querySelectorAll('[data-addrec]').forEach((b) => b.addEventListener('click', () => { const [md, p] = b.dataset.addrec.split('|'); const per = c.periodosTodos.find((x) => x.id === p); formAvaliacao(c, null, { matricula_disciplina_id: md, periodo_id: p, tipo: 'recuperacao', nome: `Recuperação ${per.nome}` }); }));
  area.querySelectorAll('input[data-av]').forEach((input) => {
    input.dataset.orig = input.value;
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const tr = input.closest('tr'); const next = tr.nextElementSibling?.querySelectorAll('input[data-av]')[[...tr.querySelectorAll('input[data-av]')].indexOf(input)]; input.blur(); next?.focus(); } });
    input.addEventListener('change', async () => {
      const a = byId('avaliacoes', input.dataset.av); const txt = input.value.trim().replace(',', '.');
      const valor = txt === '' ? null : Number(txt);
      const erro = validarNota(valor, a.valor_maximo);
      if (erro) { input.classList.add('invalido'); toast(erro, 'erro'); input.value = input.dataset.orig; return; }
      input.classList.remove('invalido');
      try {
        input.disabled = true;
        const patch = valor === null ? { nota: null, status: a.status === 'nao_realizada' ? 'nao_realizada' : 'pendente' } : { nota: valor, status: 'nota_lancada' };
        await editar('avaliacoes', a.id, patch, { semRender: true });
        input.dataset.orig = input.value;
        atualizarLinha(area, input.closest('tr'));
      } catch (e) { input.classList.add('invalido'); input.value = input.dataset.orig; toast(e.message, 'erro'); }
      finally { input.disabled = false; }
    });
  });
}
function atualizarLinha(area, tr) {
  const c = ctx(); const i = c.items.find((x) => x.md.id === tr.dataset.md); if (!i) return;
  const set = (k, html) => { const td = tr.querySelector(`[data-calc="${k}"]`); if (td) td.innerHTML = html; };
  c.periodosTodos.forEach((p) => { const pr = i.r.periodos.find((x) => x.periodoId === p.id); set(`res:${p.id}`, notaHTML(pr?.resultado, c.regra)); });
  set('media', `${notaHTML(i.r.mediaFinal, c.regra)}${i.r.parcial && i.r.temDados ? ' <span class="badge parcial" title="Média parcial — resultado não definitivo.">P</span>' : ''}`);
  set('pontos', fmt(i.r.pontos, 1)); set('status', badgeStatus(i.r.status));
}

/* ---------------- Tabela ---------------- */
function tabela(area, c, lista, nomeDisc, pNome) {
  if (!lista.length) { area.innerHTML = `<div class="card">${vazioHTML('Nenhuma avaliação encontrada', 'Ajuste os filtros ou cadastre uma nova avaliação.')}</div>`; return; }
  const ordenada = [...lista].sort((a, b) => (c.periodosTodos.find((p) => p.id === a.periodo_id)?.numero - c.periodosTodos.find((p) => p.id === b.periodo_id)?.numero) || nomeDisc(a.matricula_disciplina_id).localeCompare(nomeDisc(b.matricula_disciplina_id)) || a.ordem - b.ordem);
  area.innerHTML = `<div class="tabela-wrap"><table><thead><tr><th>Disciplina</th><th>Período</th><th>Avaliação</th><th class="hide-m">Tipo</th><th class="hide-m">Data</th><th class="num">Nota</th><th class="num hide-m">Máx.</th><th class="num hide-m">Peso</th><th>Situação</th><th></th></tr></thead><tbody>
    ${ordenada.map((a) => `<tr><td>${esc(nomeDisc(a.matricula_disciplina_id))}</td><td>${esc(pNome(a.periodo_id))}</td><td>${esc(a.nome)}</td><td class="hide-m">${esc(nomeTipo(a.tipo))}</td><td class="hide-m">${fmtData(a.data_avaliacao)}</td><td class="num">${notaHTML(a.nota, c.regra)}</td><td class="num hide-m">${fmt(a.valor_maximo, 1)}</td><td class="num hide-m">${fmt(a.peso, 1)}</td><td>${statusAval(a)}</td>
    <td class="nowrap right"><button class="btn fantasma btn-ico" data-ed="${a.id}" aria-label="Editar">${icone('edit', 16)}</button><button class="btn fantasma btn-ico" data-del="${a.id}" aria-label="Excluir">${icone('lixo', 16)}</button></td></tr>`).join('')}
  </tbody></table></div><p class="xs muted mt0" style="margin-top:.5rem">${lista.length} avaliação(ões).</p>`;
  ligarAcoes(area, c);
}
const statusAval = (a) => `<span class="badge ${temNota(a) ? 'ok' : a.status === 'nao_realizada' ? 'danger' : 'muted'}">${esc(temNota(a) && a.status === 'pendente' ? 'Nota lançada' : nomeStatusAval(a.status))}</span>`;

/* ---------------- Cards agrupados ---------------- */
function cards(area, c, lista, nomeDisc, pNome) {
  if (!lista.length) { area.innerHTML = `<div class="card">${vazioHTML('Nenhuma avaliação encontrada', 'Ajuste os filtros.')}</div>`; return; }
  const porMd = {}; lista.forEach((a) => { (porMd[a.matricula_disciplina_id] = porMd[a.matricula_disciplina_id] || []).push(a); });
  area.innerHTML = `<div class="grid g-auto" style="grid-template-columns:repeat(auto-fill,minmax(310px,1fr))">${c.items.filter((i) => porMd[i.md.id]).map((i) => {
    const r = i.r;
    return `<div class="card"><div class="card-topo"><h3><span class="dot" style="--cor:${i.disc.cor}"></span> ${esc(i.disc.nome)}</h3>${badgeStatus(r.status, r.parcial)}</div>
      <div class="small muted" style="margin-bottom:.5rem">Média ${notaHTML(r.mediaFinal, c.regra)} · ${r.qtdLancadas} lançada(s) · ${r.qtdPendentes} pendente(s)</div>
      ${c.periodosTodos.map((p) => { const av = porMd[i.md.id].filter((a) => a.periodo_id === p.id).sort((a, b) => a.ordem - b.ordem); if (!av.length) return ''; const pr = r.periodos.find((x) => x.periodoId === p.id);
        return `<div style="margin-bottom:.55rem"><div class="xs muted" style="font-weight:700">${esc(p.nome)} — resultado ${notaHTML(pr?.resultado, c.regra)}${pr && !pr.completo && pr.temDados ? ' (parcial)' : ''}</div><div class="flex wrap" style="gap:.35rem;margin-top:.25rem">${av.map((a) => `<button class="btn sm" data-ed="${a.id}" title="${esc(a.nome)} — ${esc(nomeTipo(a.tipo))}">${esc(a.nome)}: ${notaHTML(a.nota, c.regra)}</button>`).join('')}</div></div>`; }).join('')}
    </div>`; }).join('')}</div>`;
  ligarAcoes(area, c);
}
function ligarAcoes(area, c) {
  area.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => formAvaliacao(c, byId('avaliacoes', b.dataset.ed))));
  area.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const a = byId('avaliacoes', b.dataset.del);
    if (await confirmar({ titulo: 'Excluir avaliação', msg: `Excluir <b>${esc(a.nome)}</b>${isNum(a.nota) ? ` (nota ${fmt(a.nota)})` : ''}? Esta ação não pode ser desfeita (fica registrada na auditoria).`, rotulo: 'Excluir', perigo: true })) {
      try { await apagar('avaliacoes', a.id); toast('Avaliação excluída.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
    }
  }));
}

/* ---------------- Formulário de avaliação ---------------- */
export function formAvaliacao(c, a = null, pre = {}) {
  const v = a || { tipo: 'prova', valor_maximo: c.regra.nota_maxima, peso: 1, status: 'pendente', ...pre };
  const campos = [
    { n: 'matricula_disciplina_id', rotulo: 'Disciplina', tipo: 'select', req: true, opcoes: c.items.map((i) => [i.md.id, i.disc.nome]) },
    { n: 'periodo_id', rotulo: 'Período', tipo: 'select', req: true, opcoes: c.periodosTodos.map((p) => [p.id, p.nome]) },
    { n: 'nome', rotulo: 'Nome da avaliação', req: true, full: true, max: 80 },
    { n: 'tipo', rotulo: 'Tipo', tipo: 'select', opcoes: TIPOS_AVALIACAO },
    { n: 'data_avaliacao', rotulo: 'Data da avaliação', tipo: 'date' },
    { n: 'nota', rotulo: 'Nota obtida', tipo: 'number', step: 0.01, min: 0, dica: 'Deixe em branco se ainda não houver nota.' },
    { n: 'valor_maximo', rotulo: 'Valor máximo', tipo: 'number', step: 0.01, min: 0.01, req: true },
    { n: 'peso', rotulo: 'Peso', tipo: 'number', step: 0.01, min: 0.01, req: true },
    { n: 'status', rotulo: 'Situação', tipo: 'select', opcoes: STATUS_AVALIACAO },
    { n: 'observacoes', rotulo: 'Observações', tipo: 'textarea', full: true },
  ];
  formModal({
    titulo: a ? 'Editar avaliação' : 'Nova avaliação', campos, valores: v, largura: 700,
    validar: (x) => {
      const e = validarNota(x.nota, x.valor_maximo); if (e) return e;
      if (x.status === 'nota_lancada' && x.nota === null) return 'Situação "Nota lançada" exige informar a nota.';
      const dup = rows('avaliacoes').find((o) => o.id !== a?.id && o.matricula_disciplina_id === x.matricula_disciplina_id && o.periodo_id === x.periodo_id && o.nome.trim().toLowerCase() === x.nome.trim().toLowerCase());
      if (dup) return 'Já existe uma avaliação com este nome nesta disciplina e período.';
      return null;
    },
    onSubmit: async (x) => {
      if (x.nota !== null && ['pendente', 'realizada'].includes(x.status)) x.status = 'nota_lancada';
      if (x.nota === null && x.status === 'nota_lancada') x.status = 'pendente';
      if (x.tipo === 'recuperacao' && x.nota !== null) x.status = 'nota_lancada';
      const per = c.periodosTodos.find((p) => p.id === x.periodo_id);
      if (per && x.data_avaliacao && per.data_inicio && x.data_avaliacao < per.data_inicio) throw new Error('A data está antes do início do período selecionado.');
      if (per && x.data_avaliacao && per.data_fim && x.data_avaliacao > per.data_fim) throw new Error('A data está depois do fim do período selecionado.');
      if (a) await editar('avaliacoes', a.id, x);
      else { x.ordem = rows('avaliacoes').filter((o) => o.matricula_disciplina_id === x.matricula_disciplina_id && o.periodo_id === x.periodo_id).length + 1; await criar('avaliacoes', x); }
    },
  });
}
