import { S, ctx, rows, editar, byId, sincronizarAlertas } from '../state.js';
import { NIVEIS_ALERTA, ordemNivel, fmtData } from '../analysis.js';
import { esc, icone, toast, vazioHTML, opcoesSelect } from '../ui.js';
import { topoPagina } from './comum.js';

const V = { estado: 'ativos', nivel: '', disc: '' };
const TIPOS = { nota_baixa: 'Nota baixa', media_abaixo: 'Média abaixo', disciplina_critica: 'Disciplina crítica', queda_consecutiva: 'Queda consecutiva', media_geral_declinio: 'Média geral em declínio', avaliacao_sem_nota: 'Avaliação sem nota', avaliacao_proxima: 'Avaliação próxima', avaliacao_vencida: 'Avaliação vencida', poucas_notas: 'Poucas notas', risco_pontuacao: 'Risco de pontuação', necessidade_recuperacao: 'Necessidade de recuperação', meta_nao_atingida: 'Meta não atingida', recuperacao_positiva: 'Recuperação', melhora: 'Melhora' };

export function render(el) {
  const c = ctx();
  if (!c) { el.innerHTML = vazioHTML('Sem ano letivo', ''); return; }
  const todos = rows('alertas').filter((a) => a.matricula_id === S.matId);
  const nomeDisc = (id) => (id ? c.items.find((i) => i.md.id === id)?.disc.nome || '' : '');
  let lista = todos.filter((a) => (V.estado === 'ativos' ? !a.resolvido : V.estado === 'naolidos' ? !a.resolvido && !a.lido : V.estado === 'resolvidos' ? a.resolvido : true)
    && (!V.nivel || a.nivel === V.nivel) && (!V.disc || a.matricula_disciplina_id === V.disc));
  lista.sort((a, b) => (a.resolvido - b.resolvido) || ordemNivel(a.nivel) - ordemNivel(b.nivel) || String(b.data_alerta).localeCompare(String(a.data_alerta)));
  const ativos = todos.filter((a) => !a.resolvido);
  const cont = Object.fromEntries(Object.keys(NIVEIS_ALERTA).map((n) => [n, ativos.filter((a) => a.nivel === n).length]));

  el.innerHTML = `${topoPagina('Alertas', `${ativos.length} ativo(s) · ${ativos.filter((a) => !a.lido).length} não lido(s) — atualizados automaticamente quando as notas mudam`,
    `<button class="btn" id="a-lidos">${icone('check', 16)} Marcar todos como lidos</button><button class="btn" id="a-recalc">${icone('refresh', 16)} Recalcular</button>`)}
    <div class="flex wrap gap">${Object.entries(NIVEIS_ALERTA).map(([k, v]) => `<span class="badge muted" style="border-left:4px solid ${v.cor}">${v.rotulo}: <b>${cont[k]}</b></span>`).join('')}</div>
    <div class="card mt" style="padding:.7rem .9rem"><div class="filtros">
      <div class="field"><label for="al-e">Mostrar</label><select id="al-e">${opcoesSelect([['ativos', 'Ativos'], ['naolidos', 'Não lidos'], ['resolvidos', 'Resolvidos'], ['todos', 'Histórico completo']], V.estado)}</select></div>
      <div class="field"><label for="al-n">Nível</label><select id="al-n">${opcoesSelect(Object.entries(NIVEIS_ALERTA).map(([k, v]) => [k, v.rotulo]), V.nivel, 'Todos')}</select></div>
      <div class="field"><label for="al-d">Disciplina</label><select id="al-d">${opcoesSelect(c.items.map((i) => [i.md.id, i.disc.nome]), V.disc, 'Todas')}</select></div></div></div>
    <div class="lista-alertas mt">${lista.length ? lista.map((a) => `<div class="alerta ${a.resolvido ? 'resolvido' : ''} ${a.lido ? '' : 'nao-lido'}" style="--acor:${NIVEIS_ALERTA[a.nivel]?.cor}">
      <div class="a-corpo"><div class="a-titulo">${esc(a.titulo)}</div><div class="small t2">${esc(a.descricao || '')}</div>${a.recomendacao ? `<div class="a-rec"><b>Recomendação:</b> ${esc(a.recomendacao)}</div>` : ''}
      <div class="a-meta"><span>${fmtData(a.data_alerta)}</span><span class="badge muted">${NIVEIS_ALERTA[a.nivel]?.rotulo}</span><span>${esc(TIPOS[a.tipo] || a.tipo)}</span>${nomeDisc(a.matricula_disciplina_id) ? `<span>${esc(nomeDisc(a.matricula_disciplina_id))}</span>` : ''}${a.resolvido ? `<span class="badge ok">Resolvido${a.resolvido_auto ? ' automaticamente' : ''}${a.resolvido_em ? ` em ${fmtData(a.resolvido_em)}` : ''}</span>` : ''}</div></div>
      <div class="a-acoes"><button class="btn sm" data-lido="${a.id}">${a.lido ? 'Marcar não lido' : 'Marcar lido'}</button><button class="btn sm ${a.resolvido ? '' : 'primario'}" data-res="${a.id}">${a.resolvido ? 'Reabrir' : 'Resolver'}</button></div></div>`).join('') : vazioHTML('Nenhum alerta neste filtro', 'Os alertas surgem automaticamente conforme as notas são lançadas.')}</div>`;

  const re = () => render(el);
  [['al-e', 'estado'], ['al-n', 'nivel'], ['al-d', 'disc']].forEach(([id, k]) => el.querySelector(`#${id}`).addEventListener('change', (e) => { V[k] = e.target.value; re(); }));
  const seguro = async (fn) => { try { await fn(); } catch (e) { toast(e.message, 'erro'); } };
  el.querySelectorAll('[data-lido]').forEach((b) => b.addEventListener('click', () => seguro(() => editar('alertas', b.dataset.lido, { lido: !byId('alertas', b.dataset.lido).lido }))));
  el.querySelectorAll('[data-res]').forEach((b) => b.addEventListener('click', () => seguro(() => { const a = byId('alertas', b.dataset.res); return editar('alertas', a.id, a.resolvido ? { resolvido: false, resolvido_auto: false, resolvido_em: null } : { resolvido: true, resolvido_auto: false, resolvido_em: new Date().toISOString(), lido: true }); })));
  el.querySelector('#a-lidos').addEventListener('click', () => seguro(async () => { for (const a of ativos.filter((x) => !x.lido)) await editar('alertas', a.id, { lido: true }, { semRender: true }); toast('Alertas marcados como lidos.', 'ok'); re(); }));
  el.querySelector('#a-recalc').addEventListener('click', () => seguro(async () => { await sincronizarAlertas(); toast('Alertas recalculados.', 'ok'); }));
}
