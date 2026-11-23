import { S, rows, criar, importarPlano, selecionarMatricula, irPara } from '../state.js';
import { planejarImportacao, planejarNovoAno, SERIES_PADRAO } from '../estrutura.js';
import { esc, icone, formModal, modal, toast } from '../ui.js';
import { isNum } from '../calc.js';

export function render(el) {
  el.innerHTML = `<div style="max-width:900px;margin:2rem auto"><div class="pagina-topo"><div><h1>Bem-vindo(a)!</h1><p>Vamos criar o primeiro ano letivo. Escolha como começar.</p></div></div>
    <div class="grid g2">
      <section class="card"><h3>${icone('upload', 18)} Importar o boletim transcrito</h3><p class="small t2">Use o arquivo <code>boletim_2026.json</code> (gerado a partir da imagem do boletim). Você poderá revisar e corrigir qualquer nota depois.</p>
        <input type="file" id="su-file" accept="application/json,.json"><div id="su-prev" class="mt"></div></section>
      <section class="card"><h3>${icone('mais', 18)} Começar do zero</h3><p class="small t2">Cadastre a estudante e o ano letivo e lance as disciplinas e notas manualmente.</p><button class="btn primario" id="su-manual">Cadastrar estudante e ano</button></section>
    </div></div>`;
  ligarArquivo(el.querySelector('#su-file'), el.querySelector('#su-prev'));
  el.querySelector('#su-manual').addEventListener('click', formManual);
}

export function modalImportar() {
  const m = modal({ titulo: 'Importar boletim (JSON)', largura: 620, corpo: '<input type="file" id="mi-file" accept="application/json,.json"><div id="mi-prev" class="mt"></div>', botoes: [{ rotulo: 'Fechar', acao: (x) => x.fechar() }] });
  ligarArquivo(m.el.querySelector('#mi-file'), m.el.querySelector('#mi-prev'), () => m.fechar());
}

function ligarArquivo(input, prev, aoConcluir) {
  input.addEventListener('change', async () => {
    const f = input.files[0]; if (!f) return;
    let json; try { json = JSON.parse(await f.text()); } catch { prev.innerHTML = '<div class="form-erro">Arquivo inválido: não foi possível ler o JSON.</div>'; return; }
    let plano; try { plano = planejarImportacao(json, S.t); } catch (e) { prev.innerHTML = `<div class="form-erro">${esc(e.message)}</div>`; return; }
    const notas = plano.tabelas.avaliacoes.filter((a) => isNum(a.nota)).length; const pend = plano.tabelas.avaliacoes.length - notas;
    prev.innerHTML = `<div class="callout"><b>${esc(json.estudante)}</b> · ${json.ano_letivo} · ${esc(json.serie)}${json.turma ? ` · Turma ${esc(json.turma)}` : ''}<br>${json.disciplinas.length} disciplinas · <b>${notas}</b> notas · ${pend} avaliações pendentes (em branco no boletim)
      ${(json.observacoes_transcricao || []).length ? `<ul class="small t2" style="margin:.5rem 0 0">${json.observacoes_transcricao.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>
      <button class="btn primario mt" id="su-go">Importar agora</button><div class="form-erro" hidden></div>`;
    prev.querySelector('#su-go').addEventListener('click', async (ev) => {
      const b = ev.target; b.disabled = true; b.innerHTML = '<span class="spinner sm"></span> Importando…';
      try { await importarPlano(plano); selecionarMatricula(plano.matriculaId); toast('Boletim importado. Revise os dados se necessário.', 'ok'); aoConcluir && aoConcluir(); irPara('dashboard'); }
      catch (e) { b.disabled = false; b.textContent = 'Importar agora'; const er = prev.querySelector('.form-erro'); er.textContent = e.message; er.hidden = false; }
    });
  });
}

function formManual() {
  formModal({ titulo: 'Cadastrar estudante e ano letivo', valores: { ano: new Date().getFullYear(), serie: '6º ano' }, campos: [
    { n: 'nome', rotulo: 'Nome da estudante', req: true, full: true }, { n: 'escola', rotulo: 'Escola', full: true }, { n: 'numero', rotulo: 'Número na turma' }, { n: 'turma', rotulo: 'Turma' },
    { n: 'ano', rotulo: 'Ano letivo', tipo: 'number', req: true, min: 2000, max: 2100, step: 1 }, { n: 'serie', rotulo: 'Série', tipo: 'select', opcoes: SERIES_PADRAO.map((s) => [s, s]) }],
    onSubmit: async (v) => {
      const est = await criar('estudantes', { nome: v.nome, escola: v.escola, numero: v.numero, turma: v.turma });
      const plano = planejarNovoAno(S.t, { estudanteId: est.id, ano: v.ano, serieNome: v.serie, situacao: 'em_andamento' });
      plano.tabelas.estudante_ano_letivo[0].turma = v.turma;
      await importarPlano(plano); selecionarMatricula(plano.matriculaId); irPara('disciplinas');
    } });
}
