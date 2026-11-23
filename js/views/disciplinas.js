import { S, ctx, rows, criar, editar, apagar, byId, importarPlano } from '../state.js';
import { fmt, isNum } from '../calc.js';
import { esc, icone, formModal, confirmar, toast, badgeStatus, vazioHTML, notaHTML } from '../ui.js';
import { planejarDisciplinaNaMatricula, corPadrao } from '../estrutura.js';
import { topoPagina } from './comum.js';
import { irPara } from '../state.js';

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', 'Crie um ano letivo em Configurações.'); return; }
  const todas = c.mdsTodas;
  const itemDe = (md) => c.items.find((i) => i.md.id === md.id);
  el.innerHTML = `
    ${topoPagina('Disciplinas', `${c.ano.ano} · ${esc(c.serie?.nome || '')} — as disciplinas são independentes por ano/série; o histórico de notas de cada ano permanece separado.`,
      `<button class="btn primario" id="nova-disc">${icone('mais', 16)} Nova disciplina</button>`)}
    ${!todas.length ? `<div class="card">${vazioHTML('Nenhuma disciplina neste ano', 'Adicione a primeira disciplina para começar a lançar notas.')}</div>` : `
    <div class="tabela-wrap"><table><thead><tr><th>Ordem</th><th>Disciplina</th><th class="hide-m">Professor</th><th class="num hide-m">C.H.</th><th class="num">Meta</th><th class="num">Média</th><th>Status</th><th>Ativa</th><th></th></tr></thead><tbody>
    ${todas.map((md, idx) => { const d = byId('disciplinas', md.disciplina_id); const it = itemDe(md);
      return `<tr style="${md.ativa === false ? 'opacity:.55' : ''}"><td class="nowrap"><button class="btn fantasma btn-ico" data-up="${md.id}" ${idx === 0 ? 'disabled' : ''} aria-label="Subir">${icone('cima', 15)}</button><button class="btn fantasma btn-ico" data-dn="${md.id}" ${idx === todas.length - 1 ? 'disabled' : ''} aria-label="Descer">${icone('baixo', 15)}</button></td>
      <td><span class="dot" style="--cor:${d.cor}"></span> <b>${esc(d.nome)}</b> <span class="xs muted">${esc(d.sigla || '')}</span></td><td class="hide-m">${esc(md.professor || '—')}</td><td class="num hide-m">${md.carga_horaria ?? '—'}</td>
      <td class="num">${isNum(md.meta_media) ? fmt(md.meta_media, 1) : '—'}</td><td class="num">${it ? notaHTML(it.r.mediaFinal, c.regra) : '—'}</td><td>${it ? badgeStatus(it.r.status, it.r.parcial) : '<span class="badge muted">Inativa</span>'}</td>
      <td><input type="checkbox" data-ativa="${md.id}" ${md.ativa !== false ? 'checked' : ''} aria-label="Ativa"></td>
      <td class="nowrap right"><button class="btn fantasma btn-ico" data-notas="${md.id}" title="Ver avaliações" aria-label="Ver avaliações">${icone('notas', 16)}</button><button class="btn fantasma btn-ico" data-ed="${md.id}" aria-label="Editar">${icone('edit', 16)}</button><button class="btn fantasma btn-ico" data-del="${md.id}" aria-label="Excluir">${icone('lixo', 16)}</button></td></tr>`; }).join('')}
    </tbody></table></div>
    <p class="xs muted" style="margin-top:.6rem">Disciplinas inativas deixam de entrar nas médias e gráficos, mas mantêm todas as notas.</p>`}`;

  el.querySelector('#nova-disc').addEventListener('click', () => formNova(c));
  el.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => formEditar(c, byId('matricula_disciplinas', b.dataset.ed))));
  el.querySelectorAll('[data-notas]').forEach((b) => b.addEventListener('click', () => { S.filtros.disc = b.dataset.notas; irPara('notas'); }));
  el.querySelectorAll('[data-ativa]').forEach((b) => b.addEventListener('change', async () => { try { await editar('matricula_disciplinas', b.dataset.ativa, { ativa: b.checked }); } catch (e) { b.checked = !b.checked; toast(e.message, 'erro'); } }));
  const mover = async (id, dir) => {
    const i = todas.findIndex((x) => x.id === id); const j = i + dir; if (j < 0 || j >= todas.length) return;
    const a = todas[i]; const b = todas[j];
    try { const oa = a.ordem; const ob = b.ordem === oa ? oa + dir : b.ordem; await editar('matricula_disciplinas', a.id, { ordem: ob }); await editar('matricula_disciplinas', b.id, { ordem: oa }); } catch (e) { toast(e.message, 'erro'); }
  };
  el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', () => mover(b.dataset.up, -1)));
  el.querySelectorAll('[data-dn]').forEach((b) => b.addEventListener('click', () => mover(b.dataset.dn, 1)));
  el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const md = byId('matricula_disciplinas', b.dataset.del); const d = byId('disciplinas', md.disciplina_id);
    const n = rows('avaliacoes').filter((a) => a.matricula_disciplina_id === md.id);
    const comNota = n.filter((a) => isNum(a.nota)).length;
    if (await confirmar({ titulo: 'Excluir disciplina do ano', msg: `Excluir <b>${esc(d.nome)}</b> de ${c.ano.ano}? Serão apagadas <b>${n.length}</b> avaliação(ões) (${comNota} com nota). Os outros anos não são afetados. <br><br>Dica: para apenas ocultar, desmarque "Ativa".`, rotulo: 'Excluir disciplina', perigo: true })) {
      try { await apagar('matricula_disciplinas', md.id); toast('Disciplina excluída do ano.', 'ok'); } catch (e) { toast(e.message, 'erro'); }
    }
  }));
}

function formNova(c) {
  const jaNoAno = new Set(c.mdsTodas.map((m) => m.disciplina_id));
  const catalogo = rows('disciplinas').filter((d) => !jaNoAno.has(d.id)).sort((a, b) => a.nome.localeCompare(b.nome));
  const campos = [
    ...(catalogo.length ? [{ n: 'existente', rotulo: 'Usar disciplina já cadastrada (opcional)', tipo: 'select', full: true, opcoes: [['', '— cadastrar uma nova —'], ...catalogo.map((d) => [d.id, d.nome])], dica: 'Disciplinas usadas em outros anos podem ser reaproveitadas; as notas ficam separadas por ano.' }] : []),
    { n: 'nome', rotulo: 'Nome da disciplina', max: 60 }, { n: 'sigla', rotulo: 'Sigla', max: 6 },
    { n: 'cor', rotulo: 'Cor de identificação', tipo: 'color' }, { n: 'professor', rotulo: 'Professor (opcional)' },
    { n: 'carga_horaria', rotulo: 'Carga horária (opcional)', tipo: 'number', min: 0, step: 1 }, { n: 'meta_media', rotulo: 'Meta de média (opcional)', tipo: 'number', min: 0, max: c.regra.nota_maxima, step: 0.1 },
  ];
  formModal({ titulo: 'Nova disciplina', campos, valores: { cor: corPadrao(rows('disciplinas').length) },
    validar: (v) => (!v.existente && !v.nome ? 'Informe o nome da disciplina ou escolha uma já cadastrada.' : null),
    onSubmit: async (v) => {
      const plano = planejarDisciplinaNaMatricula({ disciplinas: rows('disciplinas'), matricula_disciplinas: rows('matricula_disciplinas'), regras_avaliacao: rows('regras_avaliacao'), periodos_avaliativos: rows('periodos_avaliativos') },
        { matriculaId: c.mat.id, disciplinaId: v.existente || null, nome: v.nome, sigla: v.sigla, cor: v.cor });
      const md = plano.tabelas.matricula_disciplinas[0];
      md.professor = v.professor; md.carga_horaria = v.carga_horaria; md.meta_media = v.meta_media;
      if (plano.tabelas.disciplinas && v.cor) plano.tabelas.disciplinas[0].cor = v.cor;
      plano.matriculaId = null; // não desfazer a matrícula inteira em caso de falha
      await importarPlano(plano);
    } });
}

function formEditar(c, md) {
  const d = byId('disciplinas', md.disciplina_id);
  const campos = [
    { n: 'nome', rotulo: 'Nome', req: true, max: 60, dica: 'O nome vale para todos os anos em que a disciplina é usada.' }, { n: 'sigla', rotulo: 'Sigla', max: 6 },
    { n: 'cor', rotulo: 'Cor', tipo: 'color' }, { n: 'professor', rotulo: 'Professor' },
    { n: 'carga_horaria', rotulo: 'Carga horária', tipo: 'number', min: 0, step: 1 }, { n: 'meta_media', rotulo: 'Meta de média', tipo: 'number', min: 0, max: c.regra.nota_maxima, step: 0.1 },
    { n: 'prova_final', rotulo: 'Prova final (anual)', tipo: 'number', min: 0, step: 0.01, dica: 'Só é usada se a média anual ficar abaixo da aprovação (regra em Configurações).' },
    { n: 'ativa', rotulo: 'Disciplina ativa neste ano', tipo: 'checkbox' },
    { n: 'descricao', rotulo: 'Descrição', tipo: 'textarea', full: true }, { n: 'observacoes', rotulo: 'Observações do ano', tipo: 'textarea', full: true },
  ];
  formModal({ titulo: `Editar — ${d.nome}`, campos, valores: { ...d, ...md, ativa: md.ativa !== false },
    onSubmit: async (v) => {
      const outro = rows('disciplinas').find((x) => x.id !== d.id && x.nome.toLowerCase() === v.nome.toLowerCase());
      if (outro) throw new Error('Já existe outra disciplina com este nome.');
      await editar('disciplinas', d.id, { nome: v.nome, sigla: v.sigla, cor: v.cor, descricao: v.descricao });
      await editar('matricula_disciplinas', md.id, { professor: v.professor, carga_horaria: v.carga_horaria, meta_media: v.meta_media, prova_final: v.prova_final, ativa: v.ativa, observacoes: v.observacoes });
    } });
}
