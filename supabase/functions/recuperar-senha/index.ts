// ============================================================
// LOEN SOLUÇÕES — Função recuperar-senha (roda no servidor do Supabase)
//
// Recebe o celular OU o e-mail de quem esqueceu a senha, acha a conta,
// gera um link de recuperação e manda pelo Resend para o e-mail DE
// VERDADE da pessoa (perfis.email_recuperacao).
//
// Por que não usar o "esqueci a senha" pronto do Supabase: ele manda
// para o e-mail do login, que aqui é interno e não existe
// (c55...@celular.loen.invalid). Ninguém receberia.
//
// A resposta é SEMPRE a mesma, exista a conta ou não. Assim esta
// função não serve para descobrir quem tem conta no app.
//
// Segredos (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY  chave do Resend, só com permissão de envio
//   REMETENTE       ex.: Loen Soluções <nao-responda@seudominio.com.br>
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY o Supabase já fornece.
// ============================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

// Precisa ser igual ao CONFIG.DOMINIO_CELULAR do config.js.
const DOMINIO_CELULAR = 'celular.loen.invalid';

// Endereços do app para onde o link pode levar. Qualquer outro é
// recusado — senão alguém poderia usar nosso e-mail para mandar a
// pessoa para um site falso.
const APPS_PERMITIDOS = [
  'https://app.loenstudiocriativo.com.br/',
  'https://leoof7.github.io/loen-solucoes/',
  'http://localhost:5173/',
];

// Quantos links por conta, por hora.
const LIMITE_POR_HORA = 3;

// Só o próprio app, aberto num desses endereços, pode chamar pelo navegador.
const ORIGENS = APPS_PERMITIDOS.map(a => new URL(a).origin);

function cabecalhos(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ORIGENS.includes(origin) ? origin : ORIGENS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function escapar(t: string) {
  return t.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function corpoDoEmail(nome: string, link: string) {
  const primeiro = escapar((nome || '').trim().split(/\s+/)[0] || '');
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#F6F1EC;font-family:Arial,Helvetica,sans-serif;color:#1B2230">
  <div style="max-width:480px;margin:0 auto;padding:32px 20px">
    <p style="font-size:20px;font-weight:bold;color:#14357F;margin:0 0 24px">Loen Soluções</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 12px">Oi${primeiro ? ', ' + primeiro : ''}!</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 24px">Recebemos um pedido para criar uma senha nova na sua conta. Toque no botão abaixo:</p>
    <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#14357F;color:#fff;text-decoration:none;font-weight:bold;padding:14px 24px;border-radius:10px">Criar senha nova</a></p>
    <p style="font-size:14px;line-height:1.5;color:#5A6472;margin:0 0 8px">O link vale por 1 hora e só funciona uma vez.</p>
    <p style="font-size:14px;line-height:1.5;color:#5A6472;margin:0">Não foi você que pediu? Pode ignorar este e-mail. Sua senha continua a mesma.</p>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  const h = cabecalhos(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: h });
  if (req.method !== 'POST') return new Response('{}', { status: 405, headers: h });

  // Resposta única para todo caso "normal" — ver o topo do arquivo.
  const pronto = () => new Response(JSON.stringify({ ok: true }), { headers: h });

  let corpo: { celular?: string; email?: string; app?: string };
  try { corpo = await req.json(); } catch { return new Response('{}', { status: 400, headers: h }); }

  const app = APPS_PERMITIDOS.find(a => a === corpo.app);
  if (!app) return new Response(JSON.stringify({ erro: 'app não permitido' }), { status: 400, headers: h });

  const celular = String(corpo.celular || '').replace(/\D/g, '');
  const email = String(corpo.email || '').trim().toLowerCase();
  if (!/^55\d{10,11}$/.test(celular) && !email.includes('@')) {
    return new Response(JSON.stringify({ erro: 'informe celular ou e-mail' }), { status: 400, headers: h });
  }

  const RESEND = Deno.env.get('RESEND_API_KEY');
  const REMETENTE = Deno.env.get('REMETENTE');
  if (!RESEND || !REMETENTE) {
    console.error('recuperar-senha: faltam os segredos RESEND_API_KEY ou REMETENTE');
    return new Response(JSON.stringify({ erro: 'envio não configurado' }), { status: 500, headers: h });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: contas, error: erroConta } = await admin.rpc('achar_conta', {
    p_login: celular ? `c${celular}@${DOMINIO_CELULAR}` : null,
    p_email: celular ? null : email,
  });
  if (erroConta) {
    console.error('recuperar-senha: achar_conta', erroConta.message);
    return new Response(JSON.stringify({ erro: 'falha no servidor' }), { status: 500, headers: h });
  }

  const conta = contas?.[0];
  if (!conta?.email_recuperacao) return pronto();

  // Trava contra abuso: no máximo LIMITE_POR_HORA links por conta.
  const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await admin.from('recuperacoes')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', conta.user_id)
    .gte('criado_em', umaHoraAtras);
  if ((count ?? 0) >= LIMITE_POR_HORA) return pronto();

  const { data: gerado, error: erroLink } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: conta.login,
  });
  if (erroLink || !gerado?.properties?.hashed_token) {
    // Responde igual aos outros casos: um erro diferente aqui entregaria
    // que a conta existe. O problema fica registrado no log do servidor.
    console.error('recuperar-senha: generateLink', erroLink?.message);
    return pronto();
  }

  // O link leva direto ao app, que troca o código por uma sessão
  // (verifyOtp) e abre a tela de senha nova.
  const link = `${app}?recuperar=${encodeURIComponent(gerado.properties.hashed_token)}`;

  const envio = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: REMETENTE,
      to: [conta.email_recuperacao],
      subject: 'Crie uma senha nova — Loen Soluções',
      html: corpoDoEmail(conta.nome, link),
    }),
  });
  if (!envio.ok) {
    // Mesmo motivo: resposta igual, erro só no log.
    console.error('recuperar-senha: Resend', envio.status, await envio.text());
    return pronto();
  }

  await admin.from('recuperacoes').insert({ user_id: conta.user_id });
  return pronto();
});
