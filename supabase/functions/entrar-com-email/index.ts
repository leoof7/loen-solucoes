// ============================================================
// LOEN SOLUÇÕES — Função entrar-com-email (roda no servidor do Supabase)
//
// Deixa a pessoa entrar digitando o e-mail de verdade em vez do
// celular. O login do Supabase continua sendo o interno
// (c55...@celular.loen.invalid): esta função acha qual é, confere a
// senha e devolve a sessão para o app.
//
// Por que no servidor, e não no navegador: para achar o login interno
// a partir do e-mail, o navegador precisaria receber esse login — e ele
// contém o celular da pessoa. Qualquer um que soubesse um e-mail
// descobriria o celular do dono. Aqui o celular nunca sai do servidor.
//
// Erro de e-mail inexistente e de senha errada é o MESMO erro, para a
// função não servir para descobrir quem tem conta.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGENS = ['https://app.loenstudiocriativo.com.br', 'https://leoof7.github.io', 'http://localhost:5173'];

function cabecalhos(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ORIGENS.includes(origin) ? origin : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('{}', { status: 405, headers: h });

  const naoConfere = () => new Response(
    JSON.stringify({ erro: 'invalid login credentials' }), { status: 400, headers: h });

  let corpo: { email?: string; senha?: string };
  try { corpo = await req.json(); } catch { return new Response('{}', { status: 400, headers: h }); }

  const email = String(corpo.email || '').trim().toLowerCase();
  const senha = String(corpo.senha || '');
  if (!email.includes('@') || !senha) return naoConfere();

  const url = Deno.env.get('SUPABASE_URL')!;
  const opcoes = { auth: { persistSession: false, autoRefreshToken: false } };

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, opcoes);
  const { data: contas, error } = await admin.rpc('achar_conta', { p_login: null, p_email: email });
  if (error) {
    console.error('entrar-com-email: achar_conta', error.message);
    return new Response(JSON.stringify({ erro: 'falha no servidor' }), { status: 500, headers: h });
  }
  const conta = contas?.[0];
  if (!conta) return naoConfere();

  // Entra como a própria pessoa, com a chave pública — a senha é
  // conferida pelo Supabase, igual ao login pelo celular.
  const publico = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, opcoes);
  const { data, error: erroLogin } = await publico.auth.signInWithPassword({
    email: conta.login,
    password: senha,
  });

  if (erroLogin || !data.session) {
    if (erroLogin?.status === 429) {
      return new Response(JSON.stringify({ erro: 'rate limit' }), { status: 429, headers: h });
    }
    return naoConfere();
  }

  return new Response(JSON.stringify({
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  }), { headers: h });
});
