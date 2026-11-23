import { S, ctx, rows, criar, editar, apagar, byId, matriculas, salvarPrefs, carregar, recarregarSilencioso, bump, ls } from '../state.js';
import { fmt, mergeRegra, REGRA_PADRAO, isNum } from '../calc.js';
import { gerarBackup, validarBackup, planejarRestauracao, csvNotas, csvDisciplinas, ORDEM } from '../backup.js';
import { esc, icone, formModal, confirmar, modal, toast, vazioHTML, baixarArquivo, opcoesSelect } from '../ui.js';
import { topoPagina } from './comum.js';
import * as db from '../db.js';
import { nomePeriodo, uid } from '../estrutura.js';
import { fmtData } from '../analysis.js';

const V = { aba: 'estudante' };
const ABAS = [['estudante', 'Estudante e ano'], ['regras', 'Regras de avaliação'], ['periodos', 'Períodos'], ['status', 'Status e alertas'], ['aparencia', 'Aparência'], ['backup', 'Backup e restauração'], ['sistema', 'Sistema e segurança']];

export function render(el) {
  const c = ctx();
  el.innerHTML = `${topoPagina('Configurações', 'Todas as alterações são salvas no Supabase.')}
    <div class="tabs" role="tablist">${ABAS.map(([k, l]) => `<button role="tab" data-aba="${k}" class="${V.aba === k ? 'ativo' : ''}">${l}</button>`).join('')}</div><div id="aba"></div>`;
  el.querySelectorAll('[data-aba]').forEach((b) => b.addEventListener('click', () => { V.aba = b.dataset.aba; render(el); }));
  const area = el.querySelector('#aba');
  const semAno = ['regras', 'periodos', 'status'].includes(V.aba) && !c;
  if (semAno) { area.innerHTML = `<div class="card">${vazioHTML('Crie um ano letivo primeiro', 'Use "Estudante e ano" ou o Histórico.')}</div>`; return; }
  ({ estudante, regras, periodos, status, aparencia, backup, sistema }[V.aba])(area, c);
}

/* ---------- Estudante ---------- */
function estudante(area, c) {
  const est = c?.est || rows('estudantes')[0];
  if (!est) { area.innerHTML = `<div class="card">${vazioHTML('Nenhum estudante cadastrado', 'Cadastre o estudante para começar.', '<button class="btn primario" id="novo-est">Cadastrar estudante</button>')}</div>`; area.querySelector('#novo-est').addEventListener('click', () => formEst(null)); return; }
  area.innerHTML = `<div class="card"><div class="card-topo"><h3>Identificação</h3><button class="btn" id="ed-est">${icone('edit', 16)} Editar</button></div>
    <div class="grid g2" style="gap:.4rem 1.5rem"><div><span class="muted">Nome:</span> <b>${esc(est.nome)}</b></div><div><span class="muted">Número:</span> ${esc(est.numero || '—')}</div><div><span class="muted">Escola:</span> ${esc(est.escola || '—')}</div><div><span class="muted">Curso:</span> ${esc(est.curso || '—')}</div><div><span class="muted">Turma:</span> ${esc(est.turma || '—')}</div></div></div>
    ${c ? `<div class="card mt"><div class="card-topo"><h3>Ano letivo selecionado</h3><button class="btn" id="ed-mat">${icone('edit', 16)} Editar</button></div><p><b>${c.ano.ano}</b> · ${esc(c.serie?.nome || '')} · Turma ${esc(c.mat.turma || '—')} · Emissão do boletim: ${fmtData(c.mat.emissao)}</p><p class="xs muted">Para criar outro ano/série, use <b>Histórico Escolar → Avançar de ano</b>.</p></div>` : ''}`;
  area.querySelector('#ed-est').addEventListener('click', () => formEst(est));
  area.querySelector('#ed-mat')?.addEventListener('click', () => formModal({ titulo: 'Editar ano letivo', valores: { turma: c.mat.turma, emissao: c.mat.emissao, serie_id: c.mat.serie_id, situacao: c.mat.situacao }, campos: [
    { n: 'serie_id', rotulo: 'Série', tipo: 'select', opcoes: rows('series').sort((a, b) => a.ordem - b.ordem).map((s) => [s.id, s.nome]) }, { n: 'turma', rotulo: 'Turma' }, { n: 'emissao', rotulo: 'Data de emissão do boletim', tipo: 'date' },
    { n: 'situacao', rotulo: 'Situação do ano', tipo: 'select', opcoes: [['planejado', 'Planejado'], ['em_andamento', 'Em andamento'], ['concluido', 'Concluído']] }], onSubmit: (v) => editar('estudante_ano_letivo', c.mat.id, v) }));
}
function formEst(e) {
  formModal({ titulo: e ? 'Editar estudante' : 'Cadastrar estudante', valores: e || {}, campos: [{ n: 'nome', rotulo: 'Nome completo', req: true, full: true }, { n: 'numero', rotulo: 'Número na turma' }, { n: 'turma', rotulo: 'Turma' }, { n: 'escola', rotulo: 'Escola', full: true }, { n: 'curso', rotulo: 'Curso', full: true }, { n: 'observacoes', rotulo: 'Observações', tipo: 'textarea', full: true }],
    onSubmit: async (v) => { if (e) await editar('estudantes', e.id, v); else await criar('estudantes', v); } });
}

/* ---------- Regras ---------- */
function regras(area, c) {
  const reg = rows('regras_avaliacao').find((r) => r.matricula_id === c.mat.id);
  const r = mergeRegra(reg);
  const campos = [
    { n: 'nota_maxima', rotulo: 'Nota máxima por avaliação', tipo: 'number', req: true, min: 1, step: 0.5 },
    { n: 'media_aprovacao', rotulo: 'Média mínima de aprovação', tipo: 'number', req: true, min: 0, step: 0.1 },
    { n: 'pontos_aprovacao', rotulo: 'Pontuação anual necessária (regra de pontos)', tipo: 'number', req: true, min: 0, step: 1, dica: 'Regra própria de soma acumulada; NÃO é equivalente automático à média.' },
    { n: 'criterio_aprovacao', rotulo: 'Critério de aprovação', tipo: 'select', opcoes: [['media_anual', 'Média anual'], ['pontos', 'Pontuação acumulada'], ['ambos', 'Média anual E pontuação']] },
    { n: 'avaliacoes_por_periodo', rotulo: 'Nº esperado de notas por período', tipo: 'number', req: true, min: 1, max: 20, step: 1 },
    { n: 'periodos_por_semestre', rotulo: 'Períodos por semestre', tipo: 'number', req: true, min: 1, max: 6, step: 1 },
    { n: 'formula', rotulo: 'Fórmula da média anual', tipo: 'select', opcoes: [['media_periodos', 'Média ponderada dos resultados dos períodos'], ['media_notas', 'Média ponderada de todas as notas']] },
    { n: 'recuperacao', rotulo: 'Regra de recuperação', tipo: 'select', opcoes: [['substitui_se_maior', 'Substitui o resultado se for maior'], ['substitui', 'Substitui sempre'], ['media', 'Média entre resultado e recuperação'], ['nenhuma', 'Não usar recuperação']] },
    { n: 'recuperacao_somente_abaixo', rotulo: 'Recuperação só vale se a média do período estiver abaixo da aprovação', tipo: 'checkbox', full: true },
    { n: 'substitutiva', rotulo: 'Avaliação substitutiva troca a menor nota do período (se maior)', tipo: 'checkbox', full: true },
    { n: 'prova_final', rotulo: 'Prova final (anual)', tipo: 'select', opcoes: [['media', 'Média entre média anual e prova final'], ['substitui_se_maior', 'Substitui se maior'], ['nenhuma', 'Não usar']] },
    { n: 'media_minima_prova_final', rotulo: 'Média mínima para ter direito à prova final', tipo: 'number', min: 0, step: 0.1, dica: 'Abaixo disso a projeção indica reprovação. Ajuste conforme o regimento da escola.' },
    { n: 'arredondamento', rotulo: 'Arredondamento', tipo: 'select', opcoes: [['meio_acima', 'Meio para cima (padrão)'], ['truncar', 'Truncar']] },
    { n: 'casas', rotulo: 'Casas decimais', tipo: 'number', min: 0, max: 4, step: 1 },
  ];
  area.innerHTML = `<div class="card"><div class="card-topo"><h3>Regras de avaliação — ${c.ano.ano}</h3><button class="btn primario" id="ed-reg">${icone('edit', 16)} Editar regras</button></div>
    <div class="tabela-wrap" style="border:none"><table><tbody>${campos.map((f) => `<tr><td class="muted">${esc(f.rotulo)}</td><td><b>${esc(f.tipo === 'select' ? (f.opcoes.find((o) => o[0] === r[f.n])?.[1] ?? r[f.n]) : f.tipo === 'checkbox' ? (r[f.n] ? 'Sim' : 'Não') : r[f.n])}</b></td></tr>`).join('')}</tbody></table></div>
    <div class="callout aviso mt">Alterar regras recalcula imediatamente médias, status, alertas e projeções deste ano. Notas lançadas nunca são modificadas.</div></div>`;
  area.querySelector('#ed-reg').addEventListener('click', () => formModal({ titulo: 'Editar regras de avaliação', campos, valores: r, largura: 760,
    validar: (v) => (v.media_aprovacao > v.nota_maxima ? 'A média de aprovação não pode ser maior que a nota máxima.' : v.casas < 0 ? 'Casas decimais inválidas.' : null),
    onSubmit: async (v) => {
      const patch = { ...v };
      const ls0 = r.limites_status;
      if (Math.abs(ls0.aprovada - r.media_aprovacao) < 1e-9 && v.media_aprovacao !== r.media_aprovacao) patch.limites_status = { ...ls0, aprovada: v.media_aprovacao };
      if (reg) await editar('regras_avaliacao', reg.id, patch); else await criar('regras_avaliacao', { ...REGRA_PADRAO, ...patch, matricula_id: c.mat.id });
    } }));
}

/* ---------- Períodos ---------- */
function periodos(area, c) {
  const ps = c.periodosTodos;
  area.innerHTML = `<div class="flex jb ac wrap mb"><p class="muted" style="margin:0">Nome, datas, semestre e peso de cada ${esc(c.regra.tipo_periodo)}.</p><button class="btn primario" id="add-per">${icone('mais', 16)} Adicionar período</button></div>
    <div class="tabela-wrap"><table><thead><tr><th>#</th><th>Nome</th><th>Semestre</th><th>Início</th><th>Fim</th><th class="num">Peso</th><th class="num">Avaliações</th><th></th></tr></thead><tbody>
    ${ps.map((p) => `<tr><td>${p.numero}</td><td>${esc(p.nome)}</td><td>${p.semestre ?? '—'}</td><td>${fmtData(p.data_inicio)}</td><td>${fmtData(p.data_fim)}</td><td class="num">${fmt(p.peso, 1)}</td><td class="num">${rows('avaliacoes').filter((a) => a.periodo_id === p.id).length}</td>
    <td class="nowrap right"><button class="btn fantasma btn-ico" data-ed="${p.id}" aria-label="Editar">${icone('edit', 16)}</button><button class="btn fantasma btn-ico" data-del="${p.id}" aria-label="Excluir">${icone('lixo', 16)}</button></td></tr>`).join('')}</tbody></table></div>
    <p class="xs muted mt0" style="margin-top:.6rem">As datas dos períodos (opcionais) validam a data das avaliações lançadas.</p>`;
  const sincQtd = async () => { const reg = rows('regras_avaliacao').find((r) => r.matricula_id === c.mat.id); const n = rows('periodos_avaliativos').filter((p) => p.matricula_id === c.mat.id).length; if (reg && reg.qtd_periodos !== n) await editar('regras_avaliacao', reg.id, { qtd_periodos: n, pesos_periodos: rows('periodos_avaliativos').filter((p) => p.matricula_id === c.mat.id).sort((a, b) => a.numero - b.numero).map((p) => Number(p.peso)) }, { silencioso: true }); };
  area.querySelector('#add-per').addEventListener('click', () => {
    const n = (ps[ps.length - 1]?.numero || 0) + 1;
    formModal({ titulo: 'Novo período', valores: { nome: nomePeriodo(n, c.regra.tipo_periodo), semestre: Math.ceil(n / (c.regra.periodos_por_semestre || 2)), peso: 1 }, campos: [{ n: 'nome', rotulo: 'Nome', req: true }, { n: 'semestre', rotulo: 'Semestre', tipo: 'number', min: 1, step: 1 }, { n: 'data_inicio', rotulo: 'Início', tipo: 'date' }, { n: 'data_fim', rotulo: 'Fim', tipo: 'date' }, { n: 'peso', rotulo: 'Peso', tipo: 'number', req: true, min: 0.01, step: 0.1 }],
      extraTopo: '<div class="callout" style="margin-bottom:.8rem">Serão criadas avaliações pendentes para cada disciplina ativa conforme o nº esperado de notas por período.</div>',
      onSubmit: async (v) => {
        const per = await criar('periodos_avaliativos', { ...v, matricula_id: c.mat.id, numero: n });
        const novas = []; c.mdsTodas.forEach((md) => { for (let k = 0; k < c.regra.avaliacoes_por_periodo; k++) novas.push({ id: uid(), matricula_disciplina_id: md.id, periodo_id: per.id, nome: `${(n - 1) * c.regra.avaliacoes_por_periodo + k + 1}ª nota`, tipo: 'outro', valor_maximo: c.regra.nota_maxima, peso: 1, nota: null, status: 'pendente', ordem: k + 1 }); });
        if (novas.length) { const ins = await db.inserir('avaliacoes', novas); S.t.avaliacoes.push(...ins); bump(); }
        await sincQtd();
      } });
  });
  area.querySelectorAll('[data-ed]').forEach((b) => b.addEventListener('click', () => { const p = byId('periodos_avaliativos', b.dataset.ed);
    formModal({ titulo: `Editar ${p.nome}`, valores: p, campos: [{ n: 'nome', rotulo: 'Nome', req: true }, { n: 'semestre', rotulo: 'Semestre', tipo: 'number', min: 1, step: 1 }, { n: 'data_inicio', rotulo: 'Início', tipo: 'date' }, { n: 'data_fim', rotulo: 'Fim', tipo: 'date' }, { n: 'peso', rotulo: 'Peso', tipo: 'number', req: true, min: 0.01, step: 0.1 }],
      validar: (v) => (v.data_inicio && v.data_fim && v.data_fim < v.data_inicio ? 'A data final não pode ser anterior à inicial.' : null),
      onSubmit: async (v) => { await editar('periodos_avaliativos', p.id, v); await sincQtd(); } }); }));
  area.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => { const p = byId('periodos_avaliativos', b.dataset.del); const n = rows('avaliacoes').filter((a) => a.periodo_id === p.id); const comNota = n.filter((a) => isNum(a.nota)).length;
    if (await confirmar({ titulo: 'Excluir período', msg: `Excluir <b>${esc(p.nome)}</b>? Serão apagadas <b>${n.length}</b> avaliação(ões) (${comNota} com nota). Esta ação não pode ser desfeita.`, rotulo: 'Excluir período', perigo: true })) { try { await apagar('periodos_avaliativos', p.id); await sincQtd(); toast('Período excluído.', 'ok'); } catch (e) { toast(e.message, 'erro'); } } }));
}

/* ---------- Status e alertas ---------- */
function status(area, c) {
  const reg = rows('regras_avaliacao').find((r) => r.matricula_id === c.mat.id); const l = c.regra.limites_status;
  area.innerHTML = `<div class="card"><h3>Classificação de status por média</h3><p class="small t2">Define quando a disciplina é considerada satisfatória, em atenção ou crítica (desempenho atual — não é o resultado oficial de aprovação).</p>
    <form id="f-status" class="form-grid" style="max-width:560px"><div class="field"><label for="l-ap">Satisfatória a partir de (média ≥)</label><input type="number" id="l-ap" step="0.1" min="0" max="${c.regra.nota_maxima}" value="${l.aprovada}"></div>
    <div class="field"><label for="l-at">Em atenção a partir de (média ≥)</label><input type="number" id="l-at" step="0.1" min="0" max="${c.regra.nota_maxima}" value="${l.atencao}"></div>
    <div class="full"><table style="max-width:420px"><tbody><tr><td><span class="badge ok">Satisfatória</span></td><td>média ≥ <b id="t1">${fmt(l.aprovada, 1)}</b></td></tr><tr><td><span class="badge warn">Em atenção</span></td><td>entre <b id="t2">${fmt(l.atencao, 1)}</b> e menos que <b id="t3">${fmt(l.aprovada, 1)}</b></td></tr><tr><td><span class="badge danger">Crítica</span></td><td>abaixo de <b id="t4">${fmt(l.atencao, 1)}</b></td></tr></tbody></table></div>
    <div class="full form-erro" id="l-erro" hidden></div><div class="full"><button class="btn primario" type="submit">Salvar limites</button></div></form></div>
    <div class="card mt"><h3>Limites dos alertas (fixos)</h3><ul class="small t2"><li>Nota baixa: abaixo da média de aprovação no período mais recente.</li><li>Queda consecutiva: 2 ou mais notas seguidas em queda.</li><li>Avaliação próxima: até 7 dias da data; vencida: data passada sem nota.</li><li>Poucas notas: menos de 2 notas lançadas na disciplina.</li></ul></div>`;
  area.querySelector('#f-status').addEventListener('submit', async (e) => {
    e.preventDefault(); const ap = Number(area.querySelector('#l-ap').value); const at = Number(area.querySelector('#l-at').value); const er = area.querySelector('#l-erro');
    if (!(at < ap) || ap > c.regra.nota_maxima || at < 0) { er.textContent = 'O limite de atenção deve ser menor que o de satisfatória, dentro de 0 e a nota máxima.'; er.hidden = false; return; }
    er.hidden = true;
    try { const patch = { limites_status: { aprovada: ap, atencao: at } }; if (reg) await editar('regras_avaliacao', reg.id, patch); else await criar('regras_avaliacao', { ...REGRA_PADRAO, ...patch, matricula_id: c.mat.id }); toast('Limites salvos.', 'ok'); } catch (x) { er.textContent = x.message; er.hidden = false; }
  });
}

/* ---------- Aparência ---------- */
function aparencia(area) {
  const cores = S.prefs.cores || {};
  const campo = (k, rot, pad) => `<div class="field"><label for="cor-${k}">${rot}</label><input type="color" id="cor-${k}" data-cor="${k}" value="${cores[k] || pad}"></div>`;
  area.innerHTML = `<div class="card"><h3>Tema</h3><div class="seg"><button data-tema="dark" class="${S.tema === 'dark' ? 'ativo' : ''}">${icone('lua', 15)} Escuro</button><button data-tema="light" class="${S.tema === 'light' ? 'ativo' : ''}">${icone('sol', 15)} Claro</button></div></div>
    <div class="card mt"><h3>Cores de status</h3><div class="grid g4">${campo('ok', 'Satisfatória (verde)', '#22c55e')}${campo('warn', 'Risco moderado (laranja)', '#f97316')}${campo('danger', 'Crítica (vermelho)', '#ef4444')}${campo('info', 'Informação (azul)', '#38bdf8')}</div>
    <div class="flex gap mt"><button class="btn primario" id="salvar-cores">Salvar cores</button><button class="btn" id="reset-cores">Restaurar padrão</button></div></div>
    <div class="card mt"><h3>Gráficos</h3><div class="field" style="max-width:320px"><label for="p-evo">Visão padrão da evolução por disciplina</label><select id="p-evo">${opcoesSelect([['avaliacao', 'Por avaliação'], ['periodo', 'Por período'], ['mensal', 'Mensal']], S.prefs.visaoEvolucao || 'avaliacao')}</select></div></div>`;
  area.querySelectorAll('[data-tema]').forEach((b) => b.addEventListener('click', async () => { try { await salvarPrefs({ tema: b.dataset.tema }); } catch (e) { toast(e.message, 'erro'); } }));
  area.querySelector('#salvar-cores').addEventListener('click', async () => { const novas = {}; area.querySelectorAll('[data-cor]').forEach((i) => { novas[i.dataset.cor] = i.value; }); try { await salvarPrefs({ prefs: { cores: novas } }); aplicarCores(); toast('Cores salvas.', 'ok'); } catch (e) { toast(e.message, 'erro'); } });
  area.querySelector('#reset-cores').addEventListener('click', async () => { try { await salvarPrefs({ prefs: { cores: null } }); aplicarCores(); toast('Cores restauradas.', 'ok'); } catch (e) { toast(e.message, 'erro'); } });
  area.querySelector('#p-evo').addEventListener('change', async (e) => { try { await salvarPrefs({ prefs: { visaoEvolucao: e.target.value } }); toast('Preferência salva.', 'ok'); } catch (x) { toast(x.message, 'erro'); } });
}
export function aplicarCores() {
  const cs = S.prefs.cores; const r = document.documentElement.style;
  ['ok', 'warn', 'danger', 'info'].forEach((k) => { if (cs && cs[k]) r.setProperty(`--${k}`, cs[k]); else r.removeProperty(`--${k}`); });
}

/* ---------- Backup ---------- */
function backup(area, c) {
  area.innerHTML = `<div class="grid g2"><div class="card"><h3>${icone('download', 18)} Exportar</h3><p class="small t2">O backup em JSON preserva todos os relacionamentos (anos, séries, disciplinas, avaliações, metas, plano, alertas e histórico). Guarde-o em local seguro: contém dados da estudante.</p>
    <div class="flex wrap gap"><button class="btn primario" id="b-json">Dados completos (JSON)</button><button class="btn" id="b-hist">Histórico acadêmico (JSON)</button><button class="btn" id="b-notas">Notas (CSV)</button><button class="btn" id="b-disc">Disciplinas (CSV)</button><button class="btn" id="b-cfg">Configurações (JSON)</button></div></div>
    <div class="card"><h3>${icone('upload', 18)} Restaurar</h3><p class="small t2">Escolha um arquivo de backup (JSON). Antes de gravar, o sistema valida a estrutura, mostra quantos registros serão criados/atualizados e pede confirmação. Registros já existentes são <b>atualizados</b>, não duplicados.</p>
    <input type="file" id="b-file" accept="application/json,.json"><div id="b-res" class="mt"></div></div></div>
    <p class="xs muted mt0" style="margin-top:.8rem">O backup local não substitui a persistência no Supabase; é uma cópia de segurança adicional.</p>`;
  const tudo = () => gerarBackup(S.t, { origem: location.origin });
  const dia = new Date().toISOString().slice(0, 10);
  const nomeBase = `acompanhamento-escolar_${dia}`;
  area.querySelector('#b-json').addEventListener('click', () => { baixarArquivo(`${nomeBase}_completo.json`, JSON.stringify(tudo(), null, 2), 'application/json'); toast('Backup gerado.', 'ok'); });
  area.querySelector('#b-hist').addEventListener('click', () => { const b = tudo(); const t = b.tabelas; baixarArquivo(`${nomeBase}_historico.json`, JSON.stringify({ ...b, tabelas: { ...t } }, null, 2), 'application/json'); toast('Histórico exportado.', 'ok'); });
  area.querySelector('#b-notas').addEventListener('click', () => { baixarArquivo(`${nomeBase}_notas.csv`, csvNotas(S.t), 'text/csv;charset=utf-8'); toast('CSV de notas gerado.', 'ok'); });
  area.querySelector('#b-disc').addEventListener('click', () => { baixarArquivo(`${nomeBase}_disciplinas.csv`, csvDisciplinas(S.t), 'text/csv;charset=utf-8'); toast('CSV de disciplinas gerado.', 'ok'); });
  area.querySelector('#b-cfg').addEventListener('click', () => { baixarArquivo(`${nomeBase}_configuracoes.json`, JSON.stringify({ configuracao: tudo().configuracao, regras_avaliacao: tudo().tabelas.regras_avaliacao, periodos_avaliativos: tudo().tabelas.periodos_avaliativos }, null, 2), 'application/json'); toast('Configurações exportadas.', 'ok'); });
  area.querySelector('#b-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; const res = area.querySelector('#b-res'); if (!f) return;
    let b; try { b = JSON.parse(await f.text()); } catch { res.innerHTML = '<div class="form-erro">Arquivo inválido: não foi possível ler o JSON.</div>'; return; }
    const erros = validarBackup(b);
    if (erros.length) { res.innerHTML = `<div class="form-erro"><b>Backup rejeitado (nada foi alterado):</b><ul>${erros.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`; return; }
    const plano = planejarRestauracao(b, S.t); const total = ORDEM.reduce((s, k) => s + plano.stats[k].total, 0); const novos = ORDEM.reduce((s, k) => s + plano.stats[k].novos, 0);
    res.innerHTML = `<div class="callout aviso"><b>Backup válido</b> (gerado em ${new Date(b.gerado_em).toLocaleString('pt-BR')}). ${total} registro(s): <b>${novos}</b> novo(s) e <b>${total - novos}</b> já existente(s) (serão atualizados).<div class="tabela-wrap mt"><table><thead><tr><th>Tabela</th><th class="num">Novos</th><th class="num">Atualizar</th></tr></thead><tbody>${ORDEM.filter((k) => plano.stats[k].total).map((k) => `<tr><td>${k}</td><td class="num">${plano.stats[k].novos}</td><td class="num">${plano.stats[k].atualizados}</td></tr>`).join('')}</tbody></table></div><button class="btn perigo mt" id="b-restaurar">Restaurar agora</button></div>`;
    res.querySelector('#b-restaurar').addEventListener('click', async (ev) => {
      if (!await confirmar({ titulo: 'Confirmar restauração', msg: `Restaurar <b>${total}</b> registro(s)? Registros existentes com o mesmo identificador serão <b>sobrescritos</b> pelos valores do backup. Recomenda-se exportar um backup atual antes.`, rotulo: 'Restaurar', perigo: true })) return;
      const btn = ev.target; btn.disabled = true; btn.innerHTML = '<span class="spinner sm"></span> Restaurando…';
      try {
        for (const tab of plano.ordem) { const rs = plano.linhas[tab]; for (let i = 0; i < rs.length; i += 200) await db.upsert(tab, rs.slice(i, i + 200), 'id'); }
        await carregar(); toast(`Restauração concluída: ${total} registro(s).`, 'ok'); res.innerHTML = `<div class="callout ok">Restauração concluída com sucesso (${total} registros).</div>`;
      } catch (err) { btn.disabled = false; btn.textContent = 'Restaurar agora'; res.insertAdjacentHTML('beforeend', `<div class="form-erro">Falha na restauração: ${esc(err.message)}. Os dados já gravados permanecem; repita a operação após corrigir o problema (não há duplicidade ao repetir).</div>`); }
    });
  });
}

/* ---------- Sistema ---------- */
function sistema(area) {
  area.innerHTML = `<div class="grid g2"><div class="card"><h3>${icone('cadeado', 18)} Conta e segurança</h3><p><span class="muted">Usuário:</span> <b>${esc(S.user?.email || '—')}</b></p>
    <ul class="small t2"><li>Os dados só aparecem após o login e são protegidos por Row Level Security no Supabase.</li><li>Após criar seu usuário, desative novos cadastros (Auth → Providers → Email → "Allow new users to sign up").</li><li>Nunca publique a chave <code>service_role</code>.</li></ul>
    <div class="flex gap wrap"><button class="btn" id="sys-sync">${icone('refresh', 16)} Sincronizar agora</button><button class="btn perigo" id="sys-sair">${icone('sair', 16)} Sair</button></div></div>
    <div class="card"><h3>Auditoria de notas</h3><p class="small t2">Toda criação, alteração e exclusão de avaliações/notas é registrada no banco (valor anterior e novo). Nenhuma nota é alterada silenciosamente.</p><button class="btn" id="sys-audit">Ver últimas alterações</button></div></div>
    <p class="xs muted mt">Acompanhamento Escolar · interface estática (GitHub Pages) + Supabase · Chart.js, SheetJS e supabase-js incluídos localmente em <code>libs/</code>.</p>`;
  area.querySelector('#sys-sync').addEventListener('click', async () => { try { await carregar(); toast('Dados sincronizados.', 'ok'); } catch (e) { toast(e.message, 'erro'); } });
  area.querySelector('#sys-sair').addEventListener('click', () => document.dispatchEvent(new CustomEvent('sair')));
  area.querySelector('#sys-audit').addEventListener('click', async () => {
    try {
      const { data, error } = await db.cliente().from('registros_auditoria').select('*').eq('tabela', 'avaliacoes').order('criado_em', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      const desc = (r) => { const d = r.dados_depois || r.dados_antes || {}; const a = r.dados_antes || {}; return r.acao === 'UPDATE' ? `nota ${a.nota ?? '—'} → ${d.nota ?? '—'} · status ${a.status} → ${d.status}` : r.acao === 'INSERT' ? `nota ${d.nota ?? '—'}` : `nota ${a.nota ?? '—'}`; };
      modal({ titulo: 'Últimas alterações em avaliações', largura: 820, corpo: data.length ? `<div class="tabela-wrap"><table><thead><tr><th>Quando</th><th>Ação</th><th>Avaliação</th><th>Detalhe</th></tr></thead><tbody>${data.map((r) => `<tr><td class="nowrap">${new Date(r.criado_em).toLocaleString('pt-BR')}</td><td>${r.acao}</td><td>${esc((r.dados_depois || r.dados_antes || {}).nome || '')}</td><td class="small">${esc(desc(r))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Nenhum registro.</p>', botoes: [{ rotulo: 'Fechar', acao: (m) => m.fechar() }] });
    } catch (e) { toast(`Não foi possível ler a auditoria: ${e.message}`, 'erro'); }
  });
}
