// =====================================================================
// CONFIGURAÇÃO DO SUPABASE — é aqui que você cola os dois valores.
//
// Onde encontrar: Supabase > seu projeto > Project Settings > API
//   • Project URL        -> SUPABASE_URL
//   • anon / public key  -> SUPABASE_ANON_KEY   (a chave "anon", NUNCA a "service_role")
//
// A chave anon pode ficar neste arquivo público porque os dados só são
// acessíveis após o login e são protegidos pelas regras RLS do banco.
// NUNCA coloque a chave "service_role" em nenhum arquivo do GitHub.
// =====================================================================
export const CONFIG = {
  SUPABASE_URL: 'https://mytaknwbwnfxmgywypar.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_F2KGilPfPoBDcVQzGImmMQ_qXQOf809',
};
