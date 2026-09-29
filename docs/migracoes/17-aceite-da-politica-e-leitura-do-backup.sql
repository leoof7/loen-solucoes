-- ============================================================
-- LOEN SOLUÇÕES — Migração 17 (29/09/2026)
--
-- 1. ACEITE DA POLÍTICA DE PRIVACIDADE DE VERDADE
--    Até aqui o banco gravava `aceite_privacidade_em = now()` em toda
--    conta nova, sem a pessoa ter visto política nenhuma. Agora:
--      - o app mostra a caixa "Li e aceito a Política de Privacidade";
--      - criar_conta e aceitar_convite RECUSAM criar a conta se não
--        vier a versão da política aceita;
--      - fica guardado QUAL versão ela aceitou (perfis.versao_privacidade),
--        para, quando o texto mudar, dar para saber quem aceitou o quê.
--
-- 2. O BACKUP CONSEGUE LER AS TABELAS
--    A chave secreta (papel service_role) não tinha permissão de
--    leitura nas tabelas — o backup daria "permission denied" mesmo
--    com a chave certa. Aqui ela ganha SÓ leitura (select). Essa chave
--    nunca sai do servidor nem do cofre do computador do Leandro.
--
-- Nada é apagado. As funções são recriadas com um parâmetro a mais.
--
-- Em PRODUÇÃO foi aplicada em duas partes: primeiro só o bloco
-- "Leitura para o backup" (17a, 29/09/2026), para o backup obrigatório
-- antes da mudança conseguir rodar; depois o resto.
-- Em HOMOLOGAÇÃO foi aplicada inteira e testada antes.
-- ============================================================

alter table public.perfis add column if not exists versao_privacidade text;

-- ---------- criar_conta ----------
drop function if exists public.criar_conta(text, text, text, text, boolean, text);

create function public.criar_conta(
  p_nome text, p_celular text,
  p_negocio_nome text default null, p_tipo_atividade text default null,
  p_tem_equipe boolean default false, p_email_recuperacao text default null,
  p_versao_privacidade text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_negocio uuid;
begin
  if auth.uid() is null then
    raise exception 'precisa estar logado';
  end if;
  if exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'esta conta já foi criada';
  end if;
  if coalesce(trim(p_versao_privacidade),'') = '' then
    raise exception 'é preciso aceitar a política de privacidade para criar a conta';
  end if;
  if coalesce(trim(p_nome),'') = '' or coalesce(trim(p_celular),'') = '' then
    raise exception 'nome e celular são obrigatórios';
  end if;
  if coalesce(trim(p_email_recuperacao),'') = '' then
    raise exception 'e-mail é obrigatório';
  end if;
  if exists (select 1 from public.perfis
             where lower(email_recuperacao) = lower(trim(p_email_recuperacao))) then
    raise exception 'e-mail já usado em outra conta';
  end if;

  insert into public.negocios (nome, tipo_atividade, tem_equipe)
  values (nullif(trim(p_negocio_nome),''), p_tipo_atividade, coalesce(p_tem_equipe,false))
  returning id into v_negocio;

  insert into public.perfis (id, negocio_id, nome, celular, papel,
                             email_recuperacao, aceite_privacidade_em, versao_privacidade)
  values (auth.uid(), v_negocio, trim(p_nome), trim(p_celular), 'dono',
          p_email_recuperacao, now(), left(trim(p_versao_privacidade), 20));

  return v_negocio;
end $$;

revoke all on function public.criar_conta(text,text,text,text,boolean,text,text) from public, anon, authenticated;
grant execute on function public.criar_conta(text,text,text,text,boolean,text,text) to authenticated, service_role;

-- ---------- aceitar_convite ----------
drop function if exists public.aceitar_convite(text, text, text, text);

create function public.aceitar_convite(
  p_codigo text, p_nome text, p_celular text,
  p_email_recuperacao text default null, p_versao_privacidade text default null)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare v_convite public.convites;
begin
  if auth.uid() is null then
    raise exception 'precisa estar logado';
  end if;
  if exists (select 1 from public.perfis where id = auth.uid()) then
    raise exception 'esta conta já faz parte de um negócio';
  end if;
  if coalesce(trim(p_versao_privacidade),'') = '' then
    raise exception 'é preciso aceitar a política de privacidade para criar a conta';
  end if;
  if coalesce(trim(p_email_recuperacao),'') = '' then
    raise exception 'e-mail é obrigatório';
  end if;
  if exists (select 1 from public.perfis
             where lower(email_recuperacao) = lower(trim(p_email_recuperacao))) then
    raise exception 'e-mail já usado em outra conta';
  end if;

  select * into v_convite
  from public.convites
  where codigo = upper(trim(p_codigo))
    and usado_em is null
    and expira_em > now()
  for update;

  if not found then
    raise exception 'convite inválido ou vencido';
  end if;

  insert into public.perfis (id, negocio_id, nome, celular, papel,
                             email_recuperacao, aceite_privacidade_em, versao_privacidade)
  values (auth.uid(), v_convite.negocio_id, trim(p_nome), trim(p_celular),
          v_convite.papel, p_email_recuperacao, now(), left(trim(p_versao_privacidade), 20));

  update public.convites set usado_em = now() where id = v_convite.id;

  return v_convite.negocio_id;
end $$;

revoke all on function public.aceitar_convite(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.aceitar_convite(text,text,text,text,text) to authenticated, service_role;

-- ---------- Leitura para o backup ----------
grant select on all tables in schema public to service_role;
-- E toda tabela criada daqui em diante já nasce legível para o backup.
alter default privileges for role postgres in schema public grant select on tables to service_role;
