-- ============================================================
-- LOEN SOLUÇÕES — migração 14
-- E-mail obrigatório e recuperação de senha pelo próprio app
--
-- Não apaga nada. Só acrescenta regra, uma tabela e uma função.
-- Backup feito antes: backups/loen_2026-09-28.json
-- ============================================================
--
-- POR QUE ISTO EXISTE
--
-- O login continua sendo o celular, com um e-mail interno fabricado
-- que ninguém recebe. A partir de agora todo mundo informa um e-mail
-- DE VERDADE, guardado em perfis.email_recuperacao. É para esse
-- endereço que a função recuperar-senha manda o link.
--
-- Como o e-mail passa a ser a chave para recuperar a conta, três
-- cuidados viram regra do banco, e não do app:
--
--   1. Um e-mail só pode estar em UMA conta. Senão, "esqueci minha
--      senha" com esse e-mail não saberia de qual conta se trata.
--   2. Só a PRÓPRIA pessoa troca o próprio e-mail. A política
--      perf_dono_gerencia deixa o dono editar o perfil da equipe —
--      sem esta trava, o dono poria o e-mail dele no perfil de um
--      funcionário, pediria o link e entraria na conta do outro.
--   3. O e-mail é guardado sempre em minúsculas e sem espaço, e
--      precisa ter cara de e-mail.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Normaliza, valida e protege o e-mail de recuperação
-- ------------------------------------------------------------

create or replace function private.cuidar_email_recuperacao()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.email_recuperacao := nullif(lower(trim(new.email_recuperacao)), '');

  if new.email_recuperacao is not null
     and new.email_recuperacao !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;

  -- Troca de e-mail feita por outra pessoa (o dono, por exemplo).
  -- O servidor (service_role) pode, porque não passa pelo app.
  if tg_op = 'UPDATE'
     and new.email_recuperacao is distinct from old.email_recuperacao
     and auth.uid() is distinct from new.id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'só a própria pessoa pode trocar o e-mail dela' using errcode = '42501';
  end if;

  return new;
end $$;

drop trigger if exists perfis_email_recuperacao on public.perfis;
create trigger perfis_email_recuperacao
  before insert or update of email_recuperacao on public.perfis
  for each row execute function private.cuidar_email_recuperacao();

-- Um e-mail, uma conta.
create unique index if not exists perfis_email_recuperacao_unico
  on public.perfis (lower(email_recuperacao))
  where email_recuperacao is not null;


-- ------------------------------------------------------------
-- 2. Criar conta e aceitar convite passam a exigir e-mail
-- ------------------------------------------------------------

create or replace function public.criar_conta(
  p_nome text, p_celular text,
  p_negocio_nome text default null, p_tipo_atividade text default null,
  p_tem_equipe boolean default false, p_email_recuperacao text default null)
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
                             email_recuperacao, aceite_privacidade_em)
  values (auth.uid(), v_negocio, trim(p_nome), trim(p_celular), 'dono',
          p_email_recuperacao, now());

  return v_negocio;
end $$;

create or replace function public.aceitar_convite(
  p_codigo text, p_nome text, p_celular text, p_email_recuperacao text default null)
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
                             email_recuperacao, aceite_privacidade_em)
  values (auth.uid(), v_convite.negocio_id, trim(p_nome), trim(p_celular),
          v_convite.papel, p_email_recuperacao, now());

  update public.convites set usado_em = now() where id = v_convite.id;

  return v_convite.negocio_id;
end $$;


-- ------------------------------------------------------------
-- 3. Pedidos de recuperação — serve de trava contra abuso
--
-- Cada link enviado vira uma linha. A função recuperar-senha conta
-- quantos saíram na última hora e para de mandar depois de 3, para
-- ninguém encher a caixa de e-mail de outra pessoa.
-- Só o servidor lê e escreve: RLS ligada e nenhuma política.
-- ------------------------------------------------------------

create table if not exists public.recuperacoes (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

alter table public.recuperacoes enable row level security;
revoke all on public.recuperacoes from anon, authenticated;

create index if not exists recuperacoes_user_quando
  on public.recuperacoes (user_id, criado_em desc);


-- ------------------------------------------------------------
-- 4. Quem é a conta — só para o servidor
--
-- Recebe o login interno (vindo do celular) OU o e-mail de verdade e
-- devolve a conta e o e-mail de recuperação. Ninguém de fora chama:
-- nem anônimo, nem logado. Só a service_role, dentro das funções
-- recuperar-senha e entrar-com-email.
-- ------------------------------------------------------------

create or replace function public.achar_conta(p_login text, p_email text)
returns table (user_id uuid, login text, email_recuperacao text, nome text)
language sql
stable
security definer
set search_path to ''
as $$
  select u.id, u.email::text, p.email_recuperacao, p.nome
  from auth.users u
  join public.perfis p on p.id = u.id
  where (p_login is not null and u.email = lower(trim(p_login)))
     or (p_email is not null and lower(p.email_recuperacao) = lower(trim(p_email)))
  limit 1
$$;

revoke all on function public.achar_conta(text, text) from public, anon, authenticated;
grant execute on function public.achar_conta(text, text) to service_role;
