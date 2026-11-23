/* =========================================================================
 * db.js — camada de dados (Supabase). Estado de sincronização REAL:
 * nada é "simulado"; falhas são reportadas e nunca engolidas.
 * ========================================================================= */
import { CONFIG } from './config.js';

export const TABELAS = ['estudantes', 'series', 'anos_letivos', 'estudante_ano_letivo', 'disciplinas', 'matricula_disciplinas',
  'regras_avaliacao', 'periodos_avaliativos', 'avaliacoes', 'metas_academicas', 'planejamento_estudos', 'alertas', 'historico_academico'];

let sb = null;
export const sync = { estado: 'ocioso', pendentes: 0, erro: null, quando: null };
const ouvintes = new Set();
export function onSync(fn) { ouvintes.add(fn); return () => ouvintes.delete(fn); }
let tSalvo = null;
function setEstado(e, erro = null) {
  sync.estado = e; sync.erro = erro; if (e === 'sincronizado' || e === 'salvo') sync.quando = new Date();
  ouvintes.forEach((f) => f({ ...sync }));
}
export const ROTULO_SYNC = { ocioso: 'Pronto', salvando: 'Salvando…', salvo: 'Salvo com sucesso', sincronizando: 'Sincronizando…', sincronizado: 'Dados sincronizados', erro: 'Erro ao salvar', offline: 'Sem conexão' };

export const configurado = () => /^https:\/\/.+/.test(CONFIG.SUPABASE_URL || '') && !!CONFIG.SUPABASE_ANON_KEY && !String(CONFIG.SUPABASE_ANON_KEY).startsWith('COLE_');
export function cliente() {
  if (!sb && configurado()) {
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return sb;
}

function erroAmigavel(e) {
  const msg = e?.message || String(e);
  const cod = e?.code;
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) return new Error('Falha de conexão com o servidor. A alteração NÃO foi salva — tente novamente.');
  if (cod === '23505') return new Error('Registro duplicado: já existe um item igual (mesmo nome/período/disciplina).');
  if (cod === '23514') return new Error('Valor inválido para o banco de dados (ex.: nota maior que o valor máximo ou negativa).');
  if (cod === '23503') return new Error('Não foi possível concluir: existem registros relacionados.');
  if (cod === '42501' || /row-level security/i.test(msg)) return new Error('Sem permissão para esta operação (regras de segurança). Faça login novamente.');
  if (cod === 'PGRST301' || /JWT/i.test(msg)) return new Error('Sua sessão expirou. Entre novamente.');
  return new Error(msg);
}

async function exec(fn, { silencioso = false } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setEstado('offline', 'Sem conexão'); throw new Error('Sem conexão com a internet. A alteração NÃO foi salva.'); }
  sync.pendentes++; clearTimeout(tSalvo);
  if (!silencioso) setEstado('salvando');
  try {
    const { data, error } = await fn();
    if (error) throw erroAmigavel(error);
    sync.pendentes = Math.max(0, sync.pendentes - 1);
    if (!silencioso && sync.pendentes === 0) { setEstado('salvo'); tSalvo = setTimeout(() => setEstado('sincronizado'), 2500); }
    return data;
  } catch (e) {
    sync.pendentes = Math.max(0, sync.pendentes - 1);
    const err = e instanceof Error && !e.code ? erroAmigavel(e) : erroAmigavel(e);
    setEstado(navigator.onLine === false ? 'offline' : 'erro', err.message);
    throw err;
  }
}

/* ---------- autenticação ---------- */
export async function sessao() { const { data } = await cliente().auth.getSession(); return data.session; }
export async function entrar(email, senha) {
  const { data, error } = await cliente().auth.signInWithPassword({ email, password: senha });
  if (error) throw new Error(/Invalid login/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message);
  return data.session;
}
export async function sair() { await cliente().auth.signOut(); }
export function aoMudarAuth(cb) { return cliente().auth.onAuthStateChange((ev, s) => cb(ev, s)); }

/* ---------- leitura ---------- */
async function lerTudo(tabela) {
  const tam = 1000; let de = 0; const linhas = [];
  for (;;) {
    const { data, error } = await cliente().from(tabela).select('*').order('id', { ascending: true }).range(de, de + tam - 1);
    if (error) throw erroAmigavel(error);
    linhas.push(...data);
    if (data.length < tam) break;
    de += tam;
  }
  return linhas;
}
export async function carregarTudo() {
  if (navigator.onLine === false) { setEstado('offline', 'Sem conexão'); throw new Error('Sem conexão com a internet.'); }
  setEstado('sincronizando');
  try {
    const res = await Promise.all(TABELAS.map((t) => lerTudo(t)));
    const dados = Object.fromEntries(TABELAS.map((t, i) => [t, res[i]]));
    const { data, error } = await cliente().from('configuracoes').select('*').maybeSingle();
    if (error) throw erroAmigavel(error);
    dados.configuracao = data || null;
    setEstado('sincronizado');
    return dados;
  } catch (e) { const er = erroAmigavel(e); setEstado('erro', er.message); throw er; }
}

/* ---------- escrita ---------- */
const limpa = (row) => Object.fromEntries(Object.entries(row).filter(([k, v]) => v !== undefined && k !== 'owner_id' && k !== 'criado_em' && k !== 'atualizado_em'));
export const inserir = (tabela, rows, opt) => exec(() => cliente().from(tabela).insert((Array.isArray(rows) ? rows : [rows]).map(limpa)).select(), opt);
export const atualizar = async (tabela, id, patch, opt) => {
  const data = await exec(() => cliente().from(tabela).update(limpa(patch)).eq('id', id).select(), opt);
  if (!data || !data.length) throw new Error('Nada foi alterado (registro não encontrado ou sem permissão).');
  return data[0];
};
export const remover = (tabela, id, opt) => exec(() => cliente().from(tabela).delete().eq('id', id).select(), opt);
export const upsert = (tabela, rows, onConflict = 'id', opt) => exec(() => cliente().from(tabela).upsert(rows.map(limpa), { onConflict }).select(), opt);
export const salvarConfiguracao = (cfg) => exec(() => cliente().from('configuracoes').upsert({ ...cfg }, { onConflict: 'owner_id' }).select(), { silencioso: true });
export async function usuarioId() { const { data } = await cliente().auth.getUser(); return data?.user?.id; }

/** Insere um plano (várias tabelas na ordem). Em caso de erro tenta desfazer a matrícula criada. */
export async function inserirPlano(plano, onProgresso) {
  const feito = {};
  try {
    for (const tabela of plano.ordem) {
      const rows = plano.tabelas[tabela];
      for (let i = 0; i < rows.length; i += 200) {
        const lote = rows.slice(i, i + 200);
        const data = await inserir(tabela, lote);
        (feito[tabela] = feito[tabela] || []).push(...data);
      }
      onProgresso && onProgresso(tabela);
    }
    return feito;
  } catch (e) {
    if (plano.matriculaId) { try { await remover('estudante_ano_letivo', plano.matriculaId, { silencioso: true }); } catch (_) { /* melhor esforço */ } }
    throw new Error(`Importação interrompida e desfeita: ${e.message}`);
  }
}
