-- ============================================================

-- LOEN SOLUÇÕES — Estrutura completa do banco (gerada da produção em 29/09/2026 10:45)

-- Cria um banco igual ao de produção, SEM dados. Rodar num projeto novo.

-- ============================================================

set check_function_bodies = off;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Sequências

create sequence if not exists public.eventos_id_seq;

-- Tabelas

create table public.atendimento_checklist (
  id uuid default gen_random_uuid() not null,
  atendimento_id uuid not null,
  texto text not null,
  marcado boolean default false not null,
  ordem smallint default 0 not null,
  constraint atendimento_checklist_pkey PRIMARY KEY (id)
);

create table public.atendimentos (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  cliente_id uuid not null,
  servico_id uuid,
  profissional_id uuid,
  criado_por uuid,
  tipo text not null,
  servico_nome text not null,
  valor numeric(12,2) not null,
  titulo text,
  descricao text,
  medida text,
  materiais text,
  materiais_por text,
  data date default CURRENT_DATE not null,
  prazo date,
  forma_pagamento text,
  situacao text default 'realizado'::text not null,
  observacao text,
  fotos text[] default '{}'::text[] not null,
  criado_em timestamp with time zone default now() not null,
  endereco text,
  referencia text,
  hora time without time zone,
  parcelas smallint,
  constraint atendimentos_materiais_por_check CHECK ((materiais_por = ANY (ARRAY['cliente'::text, 'prestador'::text]))),
  constraint atendimentos_parcelas_validas CHECK (((parcelas IS NULL) OR ((parcelas >= 1) AND (parcelas <= 48)))),
  constraint atendimentos_situacao_check CHECK ((situacao = ANY (ARRAY['agendado'::text, 'realizado'::text, 'pago'::text, 'pendente'::text]))),
  constraint atendimentos_tipo_check CHECK ((tipo = ANY (ARRAY['rapido'::text, 'detalhado'::text]))),
  constraint atendimentos_valor_check CHECK ((valor >= (0)::numeric)),
  constraint atendimentos_pkey PRIMARY KEY (id)
);

create table public.checklist_itens (
  id uuid default gen_random_uuid() not null,
  checklist_id uuid not null,
  texto text not null,
  ordem smallint default 0 not null,
  constraint checklist_itens_pkey PRIMARY KEY (id)
);

create table public.checklists (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid,
  nome text not null,
  tipo_atividade text,
  criado_em timestamp with time zone default now() not null,
  constraint checklists_pkey PRIMARY KEY (id)
);

create table public.clientes (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  nome text not null,
  telefone text,
  observacao text,
  arquivado boolean default false not null,
  criado_em timestamp with time zone default now() not null,
  empresa text,
  responsavel text,
  cnpj text,
  endereco text,
  email text,
  constraint clientes_pkey PRIMARY KEY (id)
);

create table public.convites (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  codigo text not null,
  nome text,
  papel text default 'profissional'::text not null,
  criado_por uuid,
  expira_em timestamp with time zone default (now() + '7 days'::interval) not null,
  usado_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  constraint convites_papel_check CHECK ((papel = ANY (ARRAY['dono'::text, 'profissional'::text]))),
  constraint convites_pkey PRIMARY KEY (id),
  constraint convites_codigo_key UNIQUE (codigo)
);

create table public.eventos (
  id bigint default nextval('eventos_id_seq'::regclass) not null,
  negocio_id uuid not null,
  perfil_id uuid,
  acao text not null,
  detalhe jsonb,
  criado_em timestamp with time zone default now() not null,
  constraint eventos_pkey PRIMARY KEY (id)
);

create table public.historico_precos (
  id uuid default gen_random_uuid() not null,
  servico_id uuid not null,
  preco numeric(12,2),
  vigente_desde timestamp with time zone default now() not null,
  constraint historico_precos_pkey PRIMARY KEY (id)
);

create table public.lancamentos (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  criado_por uuid,
  tipo text not null,
  valor numeric(12,2) not null,
  data date default CURRENT_DATE not null,
  categoria text,
  natureza text,
  cliente_id uuid,
  atendimento_id uuid,
  forma_pagamento text,
  observacao text,
  criado_em timestamp with time zone default now() not null,
  constraint despesa_precisa_natureza CHECK (((tipo <> 'despesa'::text) OR (natureza IS NOT NULL))),
  constraint entrada_sem_natureza CHECK (((tipo <> 'entrada'::text) OR (natureza IS NULL))),
  constraint lancamentos_natureza_check CHECK ((natureza = ANY (ARRAY['negocio'::text, 'pessoal'::text]))),
  constraint lancamentos_tipo_check CHECK ((tipo = ANY (ARRAY['entrada'::text, 'despesa'::text]))),
  constraint lancamentos_valor_check CHECK ((valor >= (0)::numeric)),
  constraint lancamentos_pkey PRIMARY KEY (id)
);

create table public.negocios (
  id uuid default gen_random_uuid() not null,
  nome text,
  tipo_atividade text,
  tem_equipe boolean default false not null,
  prolabore_valor numeric(12,2),
  prolabore_dia smallint,
  criado_em timestamp with time zone default now() not null,
  logo_caminho text,
  cnpj text,
  site text,
  instagram text,
  endereco text,
  email text,
  constraint negocios_prolabore_dia_check CHECK (((prolabore_dia >= 1) AND (prolabore_dia <= 31))),
  constraint negocios_prolabore_valor_check CHECK (((prolabore_valor IS NULL) OR (prolabore_valor >= (0)::numeric))),
  constraint negocios_pkey PRIMARY KEY (id)
);

create table public.orcamento_itens (
  id uuid default gen_random_uuid() not null,
  orcamento_id uuid not null,
  tipo text not null,
  descricao text,
  quantidade numeric(12,2) default 1 not null,
  valor_unitario numeric(12,2) default 0 not null,
  ordem smallint default 0 not null,
  constraint orcamento_itens_tipo_check CHECK ((tipo = ANY (ARRAY['material'::text, 'trabalho'::text, 'deslocamento'::text, 'outro'::text, 'margem'::text]))),
  constraint orcamento_itens_pkey PRIMARY KEY (id)
);

create table public.orcamentos (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  cliente_id uuid not null,
  atendimento_id uuid,
  criado_por uuid,
  origem text default 'rapido'::text not null,
  titulo text,
  descricao text,
  valor numeric(12,2) not null,
  prazo text,
  validade date,
  status text default 'rascunho'::text not null,
  criado_em timestamp with time zone default now() not null,
  endereco text,
  referencia text,
  enviado_em timestamp with time zone,
  token_publico text,
  respondido_em timestamp with time zone,
  resposta_cliente text,
  forma_pagamento text,
  parcelas smallint,
  constraint orcamentos_origem_check CHECK ((origem = ANY (ARRAY['rapido'::text, 'calculadora'::text]))),
  constraint orcamentos_parcelas_validas CHECK (((parcelas IS NULL) OR ((parcelas >= 1) AND (parcelas <= 48)))),
  constraint orcamentos_status_check CHECK ((status = ANY (ARRAY['rascunho'::text, 'enviado'::text, 'pensando'::text, 'aprovado'::text, 'recusado'::text, 'vencido'::text]))),
  constraint orcamentos_valor_check CHECK ((valor >= (0)::numeric)),
  constraint orcamentos_pkey PRIMARY KEY (id)
);

create table public.perfis (
  id uuid not null,
  negocio_id uuid not null,
  nome text not null,
  celular text not null,
  papel text default 'dono'::text not null,
  ativo boolean default true not null,
  aceite_privacidade_em timestamp with time zone,
  criado_em timestamp with time zone default now() not null,
  email_recuperacao text,
  foto_caminho text,
  constraint perfis_papel_check CHECK ((papel = ANY (ARRAY['dono'::text, 'profissional'::text]))),
  constraint perfis_pkey PRIMARY KEY (id)
);

create table public.recuperacoes (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  criado_em timestamp with time zone default now() not null,
  constraint recuperacoes_pkey PRIMARY KEY (id)
);

create table public.retiradas (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  tipo text not null,
  valor numeric(12,2) not null,
  data date default CURRENT_DATE not null,
  observacao text,
  criado_em timestamp with time zone default now() not null,
  constraint retiradas_tipo_check CHECK ((tipo = ANY (ARRAY['prolabore'::text, 'extra'::text]))),
  constraint retiradas_valor_check CHECK ((valor >= (0)::numeric)),
  constraint retiradas_pkey PRIMARY KEY (id)
);

create table public.servicos_catalogo (
  id uuid default gen_random_uuid() not null,
  negocio_id uuid not null,
  nome text not null,
  preco_atual numeric(12,2),
  ativo boolean default true not null,
  atualizado_em timestamp with time zone default now() not null,
  criado_em timestamp with time zone default now() not null,
  constraint servicos_catalogo_preco_atual_check CHECK (((preco_atual IS NULL) OR (preco_atual >= (0)::numeric))),
  constraint servicos_catalogo_pkey PRIMARY KEY (id)
);

-- Donos das sequências

alter sequence public.eventos_id_seq owned by public.eventos.id;

-- Ligações entre tabelas

alter table public.atendimento_checklist add constraint atendimento_checklist_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE CASCADE;
alter table public.atendimentos add constraint atendimentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
alter table public.atendimentos add constraint atendimentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.atendimentos add constraint atendimentos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.atendimentos add constraint atendimentos_profissional_id_fkey FOREIGN KEY (profissional_id) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.atendimentos add constraint atendimentos_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES servicos_catalogo(id) ON DELETE SET NULL;
alter table public.checklist_itens add constraint checklist_itens_checklist_id_fkey FOREIGN KEY (checklist_id) REFERENCES checklists(id) ON DELETE CASCADE;
alter table public.checklists add constraint checklists_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.clientes add constraint clientes_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.convites add constraint convites_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.convites add constraint convites_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.eventos add constraint eventos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.eventos add constraint eventos_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.historico_precos add constraint historico_precos_servico_id_fkey FOREIGN KEY (servico_id) REFERENCES servicos_catalogo(id) ON DELETE CASCADE;
alter table public.lancamentos add constraint lancamentos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE SET NULL;
alter table public.lancamentos add constraint lancamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
alter table public.lancamentos add constraint lancamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.lancamentos add constraint lancamentos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.orcamento_itens add constraint orcamento_itens_orcamento_id_fkey FOREIGN KEY (orcamento_id) REFERENCES orcamentos(id) ON DELETE CASCADE;
alter table public.orcamentos add constraint orcamentos_atendimento_id_fkey FOREIGN KEY (atendimento_id) REFERENCES atendimentos(id) ON DELETE SET NULL;
alter table public.orcamentos add constraint orcamentos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
alter table public.orcamentos add constraint orcamentos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES perfis(id) ON DELETE SET NULL;
alter table public.orcamentos add constraint orcamentos_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.perfis add constraint perfis_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.perfis add constraint perfis_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.recuperacoes add constraint recuperacoes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.retiradas add constraint retiradas_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;
alter table public.servicos_catalogo add constraint servicos_catalogo_negocio_id_fkey FOREIGN KEY (negocio_id) REFERENCES negocios(id) ON DELETE CASCADE;

-- Índices

CREATE UNIQUE INDEX perfis_email_recuperacao_unico ON public.perfis USING btree (lower(email_recuperacao)) WHERE (email_recuperacao IS NOT NULL);
CREATE INDEX orcamentos_cliente_id_idx ON public.orcamentos USING btree (cliente_id);
CREATE INDEX historico_precos_servico_id_vigente_desde_idx ON public.historico_precos USING btree (servico_id, vigente_desde DESC);
CREATE INDEX clientes_empresa_idx ON public.clientes USING btree (negocio_id, empresa) WHERE (empresa IS NOT NULL);
CREATE INDEX atendimentos_cliente_id_data_idx ON public.atendimentos USING btree (cliente_id, data DESC);
CREATE INDEX convites_negocio_id_idx ON public.convites USING btree (negocio_id);
CREATE INDEX perfis_negocio_id_idx ON public.perfis USING btree (negocio_id);
CREATE INDEX clientes_negocio_id_nome_idx ON public.clientes USING btree (negocio_id, nome);
CREATE INDEX eventos_negocio_idx ON public.eventos USING btree (negocio_id, criado_em DESC);
CREATE INDEX servicos_catalogo_negocio_id_idx ON public.servicos_catalogo USING btree (negocio_id);
CREATE INDEX convites_codigo_idx ON public.convites USING btree (codigo);
CREATE INDEX atendimentos_negocio_id_data_idx ON public.atendimentos USING btree (negocio_id, data DESC);
CREATE INDEX atendimentos_profissional_id_idx ON public.atendimentos USING btree (profissional_id);
CREATE INDEX atendimentos_agenda_idx ON public.atendimentos USING btree (negocio_id, data, hora);
CREATE INDEX eventos_acao_idx ON public.eventos USING btree (acao, criado_em DESC);
CREATE INDEX retiradas_negocio_id_data_idx ON public.retiradas USING btree (negocio_id, data DESC);
CREATE INDEX orcamento_itens_orcamento_id_idx ON public.orcamento_itens USING btree (orcamento_id);
CREATE INDEX checklists_negocio_id_idx ON public.checklists USING btree (negocio_id);
CREATE INDEX checklist_itens_checklist_id_idx ON public.checklist_itens USING btree (checklist_id);
CREATE INDEX recuperacoes_user_quando ON public.recuperacoes USING btree (user_id, criado_em DESC);
CREATE UNIQUE INDEX orcamentos_token_publico_idx ON public.orcamentos USING btree (token_publico) WHERE (token_publico IS NOT NULL);
CREATE INDEX atendimento_checklist_atendimento_id_idx ON public.atendimento_checklist USING btree (atendimento_id);
CREATE INDEX orcamentos_negocio_id_status_idx ON public.orcamentos USING btree (negocio_id, status);
CREATE INDEX lancamentos_negocio_id_data_idx ON public.lancamentos USING btree (negocio_id, data DESC);

-- Comentários

comment on table public.eventos is 'O que acontece no app, para medir o uso. Nunca guarda o que a pessoa escreveu.';

-- Funções

CREATE OR REPLACE FUNCTION private.cuidar_email_recuperacao()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  new.email_recuperacao := nullif(lower(trim(new.email_recuperacao)), '');

  if new.email_recuperacao is not null
     and new.email_recuperacao !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'e-mail inválido' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
     and new.email_recuperacao is distinct from old.email_recuperacao
     and auth.uid() is distinct from new.id
     and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'só a própria pessoa pode trocar o e-mail dela' using errcode = '42501';
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.marcar_atualizacao_preco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.preco_atual is distinct from old.preco_atual then
    new.atualizado_em := now();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION private.meu_negocio_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select negocio_id from public.perfis where id = auth.uid() and ativo $function$
;

CREATE OR REPLACE FUNCTION private.registrar_historico_preco()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' or new.preco_atual is distinct from old.preco_atual then
    insert into public.historico_precos (servico_id, preco) values (new.id, new.preco_atual);
  end if;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION private.sou_dono()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$ select coalesce(
  (select papel = 'dono' from public.perfis where id = auth.uid() and ativo), false) $function$
;

CREATE OR REPLACE FUNCTION public.aceitar_convite(p_codigo text, p_nome text, p_celular text, p_email_recuperacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.achar_conta(p_login text, p_email text)
 RETURNS TABLE(user_id uuid, login text, email_recuperacao text, nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select u.id, u.email::text, p.email_recuperacao, p.nome
  from auth.users u
  join public.perfis p on p.id = u.id
  where (p_login is not null and u.email = lower(trim(p_login)))
     or (p_email is not null and lower(p.email_recuperacao) = lower(trim(p_email)))
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION public.apagar_minha_conta()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_negocio uuid;
begin
  v_negocio := private.meu_negocio_id();

  if private.sou_dono() and v_negocio is not null then
    delete from public.negocios where id = v_negocio;   -- leva tudo junto
  end if;

  delete from auth.users where id = auth.uid();
end $function$
;

CREATE OR REPLACE FUNCTION public.criar_conta(p_nome text, p_celular text, p_negocio_nome text DEFAULT NULL::text, p_tipo_atividade text DEFAULT NULL::text, p_tem_equipe boolean DEFAULT false, p_email_recuperacao text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.criar_convite(p_nome text DEFAULT NULL::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_codigo text; v_negocio uuid;
begin
  v_negocio := private.meu_negocio_id();
  if v_negocio is null or not private.sou_dono() then
    raise exception 'só o dono pode convidar';
  end if;

  v_codigo := upper(substr(replace(gen_random_uuid()::text,'-',''), 1, 8));

  insert into public.convites (negocio_id, codigo, nome, criado_por)
  values (v_negocio, v_codigo, nullif(trim(p_nome),''), auth.uid());

  return v_codigo;
end $function$
;

CREATE OR REPLACE FUNCTION public.exportar_meus_dados()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_negocio uuid;
begin
  v_negocio := private.meu_negocio_id();
  if v_negocio is null or not private.sou_dono() then
    raise exception 'só o dono pode exportar os dados do negócio';
  end if;

  return jsonb_build_object(
    'exportado_em', now(),
    'negocio',      (select to_jsonb(n) from public.negocios n where n.id = v_negocio),
    'equipe',       (select coalesce(jsonb_agg(to_jsonb(p)),'[]') from public.perfis p where p.negocio_id = v_negocio),
    'clientes',     (select coalesce(jsonb_agg(to_jsonb(c)),'[]') from public.clientes c where c.negocio_id = v_negocio),
    'catalogo',     (select coalesce(jsonb_agg(to_jsonb(s)),'[]') from public.servicos_catalogo s where s.negocio_id = v_negocio),
    'atendimentos', (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.atendimentos a where a.negocio_id = v_negocio),
    'orcamentos',   (select coalesce(jsonb_agg(to_jsonb(o)),'[]') from public.orcamentos o where o.negocio_id = v_negocio),
    'lancamentos',  (select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.lancamentos l where l.negocio_id = v_negocio),
    'retiradas',    (select coalesce(jsonb_agg(to_jsonb(r)),'[]') from public.retiradas r where r.negocio_id = v_negocio)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.gerar_link_orcamento(p_orcamento uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_token   text;
  v_negocio uuid;
  v_alfabeto text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  i int;
begin
  select o.negocio_id into v_negocio
    from public.orcamentos o
    join public.perfis p on p.negocio_id = o.negocio_id
   where o.id = p_orcamento
     and p.id = auth.uid();

  if v_negocio is null then
    raise exception 'Orçamento não encontrado.';
  end if;

  -- Já tem link? Devolve o mesmo, para não invalidar o que ela já mandou.
  select token_publico into v_token from public.orcamentos where id = p_orcamento;
  if v_token is not null then return v_token; end if;

  v_token := '';
  for i in 1..16 loop
    v_token := v_token || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
  end loop;

  update public.orcamentos set token_publico = v_token where id = p_orcamento;
  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.listar_atendimentos(p_limite integer DEFAULT 200)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
           'id',              a.id,
           'negocio_id',      a.negocio_id,
           'cliente_id',      a.cliente_id,
           'servico_id',      a.servico_id,
           'profissional_id', a.profissional_id,
           'criado_por',      a.criado_por,
           'tipo',            a.tipo,
           'servico_nome',    a.servico_nome,
           'titulo',          a.titulo,
           'descricao',       a.descricao,
           'data',            a.data,
           'hora',            a.hora,
           'endereco',        a.endereco,
           'referencia',      a.referencia,
           'forma_pagamento', a.forma_pagamento,
           'parcelas',        a.parcelas,
           'situacao',        a.situacao,
           'observacao',      a.observacao,
           'criado_em',       a.criado_em,
           'clientes',        json_build_object('nome', c.nome),
           'valor',           case when eu.papel = 'dono' then a.valor else null end,
           'pode_ver_valor',  (eu.papel = 'dono')
         )
    from public.atendimentos a
    join public.perfis eu on eu.id = auth.uid()
    left join public.clientes c on c.id = a.cliente_id
   where a.negocio_id = eu.negocio_id
   order by a.data desc, a.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.listar_orcamentos(p_limite integer DEFAULT 200)
 RETURNS SETOF json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
           'id',               o.id,
           'negocio_id',       o.negocio_id,
           'cliente_id',       o.cliente_id,
           'atendimento_id',   o.atendimento_id,
           'origem',           o.origem,
           'titulo',           o.titulo,
           'descricao',        o.descricao,
           'prazo',            o.prazo,
           'validade',         o.validade,
           'status',           o.status,
           'enviado_em',       o.enviado_em,
           'endereco',         o.endereco,
           'referencia',       o.referencia,
           'criado_em',        o.criado_em,
           'forma_pagamento',  o.forma_pagamento,
           'parcelas',         o.parcelas,
           'resposta_cliente', o.resposta_cliente,
           'respondido_em',    o.respondido_em,
           'valor',            case when eu.papel = 'dono' then o.valor else null end,
           'pode_ver_valor',   (eu.papel = 'dono')
         )
    from public.orcamentos o
    join public.perfis eu on eu.id = auth.uid()
   where o.negocio_id = eu.negocio_id
   order by o.criado_em desc
   limit greatest(1, least(coalesce(p_limite, 200), 500));
$function$
;

CREATE OR REPLACE FUNCTION public.meus_totais()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
           when not exists (
             select 1 from public.perfis
              where id = auth.uid() and papel = 'dono'
           ) then null
           else json_build_object(
             'a_receber', coalesce((
               select sum(a.valor) from public.atendimentos a
                where a.negocio_id = (select negocio_id from public.perfis where id = auth.uid())
                  and a.situacao in ('realizado', 'pendente')), 0)
           )
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.minha_meta()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
           'prolabore_valor', n.prolabore_valor,
           'prolabore_dia',   n.prolabore_dia
         )
    from public.negocios n
    join public.perfis   p on p.negocio_id = n.id
   where p.id = auth.uid()
     and p.papel = 'dono';
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_evento(p_acao text, p_detalhe jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio uuid;
begin
  if p_acao is null or length(p_acao) > 40 then return; end if;

  select negocio_id into v_negocio from public.perfis where id = auth.uid();
  if v_negocio is null then return; end if;

  insert into public.eventos (negocio_id, perfil_id, acao, detalhe)
  values (v_negocio, auth.uid(), p_acao, p_detalhe);
exception
  -- Medição nunca pode derrubar o app. Se falhar, falha calada.
  when others then return;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.responder_orcamento(p_token text, p_resposta text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o public.orcamentos%rowtype;
begin
  if p_resposta not in ('aprovado', 'recusado') then
    raise exception 'Resposta inválida.';
  end if;

  select * into o from public.orcamentos
   where token_publico = p_token and length(coalesce(p_token, '')) = 16;

  if o.id is null then
    raise exception 'Orçamento não encontrado.';
  end if;

  if o.respondido_em is not null then
    return json_build_object('ja_respondido', true, 'resposta', o.resposta_cliente);
  end if;

  if o.validade is not null and o.validade < current_date then
    raise exception 'Este orçamento venceu em %.', to_char(o.validade, 'DD/MM/YYYY');
  end if;

  update public.orcamentos
     set status           = p_resposta,
         resposta_cliente = p_resposta,
         respondido_em    = now()
   where id = o.id;

  return json_build_object('ok', true, 'resposta', p_resposta);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.salvar_minha_meta(p_valor numeric, p_dia integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_negocio uuid;
begin
  select p.negocio_id into v_negocio
    from public.perfis p
   where p.id = auth.uid()
     and p.papel = 'dono';

  if v_negocio is null then
    raise exception 'Só o dono do negócio pode definir a meta.';
  end if;

  if p_dia is not null and (p_dia < 1 or p_dia > 31) then
    raise exception 'O dia da retirada precisa estar entre 1 e 31.';
  end if;

  if p_valor is not null and p_valor < 0 then
    raise exception 'A meta não pode ser negativa.';
  end if;

  update public.negocios
     set prolabore_valor = p_valor,
         prolabore_dia   = p_dia
   where id = v_negocio;

  return json_build_object('prolabore_valor', p_valor, 'prolabore_dia', p_dia);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.ver_orcamento_publico(p_token text)
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
           'titulo',        o.titulo,
           'descricao',     o.descricao,
           'valor',         o.valor,
           'prazo',         o.prazo,
           'validade',      o.validade,
           'status',        o.status,
           'criado_em',     o.criado_em,
           'respondido_em', o.respondido_em,
           'endereco',      o.endereco,
           'forma_pagamento', o.forma_pagamento,
           'parcelas',      o.parcelas,
           'vencido',       (o.validade is not null and o.validade < current_date),
           'negocio',       json_build_object(
                              'nome',      coalesce(n.nome, n.tipo_atividade),
                              'atividade', n.tipo_atividade,
                              'cnpj',      n.cnpj,
                              'site',      n.site,
                              'instagram', n.instagram
                            ),
           'cliente',       json_build_object('nome', c.nome),
           'itens',         coalesce((
                              select json_agg(json_build_object(
                                       'descricao',  i.descricao,
                                       'quantidade', i.quantidade
                                     ) order by i.ordem)
                                from public.orcamento_itens i
                               where i.orcamento_id = o.id
                                 and i.tipo <> 'margem'
                            ), '[]'::json)
         )
    from public.orcamentos o
    join public.negocios n on n.id = o.negocio_id
    left join public.clientes c on c.id = o.cliente_id
   where o.token_publico = p_token
     and p_token is not null
     and length(p_token) = 16;
$function$
;

-- Gatilhos

CREATE TRIGGER perfis_email_recuperacao BEFORE INSERT OR UPDATE OF email_recuperacao ON public.perfis FOR EACH ROW EXECUTE FUNCTION private.cuidar_email_recuperacao();
CREATE TRIGGER trg_historico_preco AFTER INSERT OR UPDATE ON public.servicos_catalogo FOR EACH ROW EXECUTE FUNCTION private.registrar_historico_preco();
CREATE TRIGGER trg_marcar_preco BEFORE UPDATE ON public.servicos_catalogo FOR EACH ROW EXECUTE FUNCTION private.marcar_atualizacao_preco();

-- Travas de segurança (RLS)

alter table public.atendimento_checklist enable row level security;
alter table public.atendimentos enable row level security;
alter table public.checklist_itens enable row level security;
alter table public.checklists enable row level security;
alter table public.clientes enable row level security;
alter table public.convites enable row level security;
alter table public.eventos enable row level security;
alter table public.historico_precos enable row level security;
alter table public.lancamentos enable row level security;
alter table public.negocios enable row level security;
alter table public.orcamento_itens enable row level security;
alter table public.orcamentos enable row level security;
alter table public.perfis enable row level security;
alter table public.recuperacoes enable row level security;
alter table public.retiradas enable row level security;
alter table public.servicos_catalogo enable row level security;

-- Regras de acesso

create policy atchk_tudo on public.atendimento_checklist as permissive for all to authenticated using ((atendimento_id IN ( SELECT atendimentos.id
   FROM atendimentos
  WHERE (atendimentos.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))))) with check ((atendimento_id IN ( SELECT atendimentos.id
   FROM atendimentos
  WHERE (atendimentos.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)))));
create policy at_alterar on public.atendimentos as permissive for update to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND (( SELECT private.sou_dono() AS sou_dono) OR (profissional_id = ( SELECT auth.uid() AS uid))))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy at_apagar on public.atendimentos as permissive for delete to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy at_criar on public.atendimentos as permissive for insert to authenticated with check (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND (( SELECT private.sou_dono() AS sou_dono) OR (profissional_id = ( SELECT auth.uid() AS uid)))));
create policy at_ler on public.atendimentos as permissive for select to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy chki_escrever on public.checklist_itens as permissive for all to authenticated using ((checklist_id IN ( SELECT checklists.id
   FROM checklists
  WHERE (checklists.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))))) with check ((checklist_id IN ( SELECT checklists.id
   FROM checklists
  WHERE (checklists.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)))));
create policy chki_ler on public.checklist_itens as permissive for select to authenticated using ((checklist_id IN ( SELECT checklists.id
   FROM checklists
  WHERE ((checklists.negocio_id IS NULL) OR (checklists.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))))));
create policy chk_alterar on public.checklists as permissive for update to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy chk_apagar on public.checklists as permissive for delete to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy chk_criar on public.checklists as permissive for insert to authenticated with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy chk_ler on public.checklists as permissive for select to authenticated using (((negocio_id IS NULL) OR (negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))));
create policy cli_alterar on public.clientes as permissive for update to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy cli_apagar on public.clientes as permissive for delete to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy cli_criar on public.clientes as permissive for insert to authenticated with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy cli_ler on public.clientes as permissive for select to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy conv_dono on public.convites as permissive for all to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy eventos_inserir on public.eventos as permissive for insert to authenticated with check (((perfil_id = auth.uid()) AND (negocio_id = ( SELECT perfis.negocio_id
   FROM perfis
  WHERE (perfis.id = auth.uid())))));
create policy eventos_ler on public.eventos as permissive for select to authenticated using ((negocio_id = ( SELECT perfis.negocio_id
   FROM perfis
  WHERE (perfis.id = auth.uid()))));
create policy hist_ler on public.historico_precos as permissive for select to authenticated using ((servico_id IN ( SELECT servicos_catalogo.id
   FROM servicos_catalogo
  WHERE (servicos_catalogo.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)))));
create policy lanc_dono on public.lancamentos as permissive for all to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy neg_alterar on public.negocios as permissive for update to authenticated using (((id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check ((id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy neg_ler on public.negocios as permissive for select to authenticated using ((id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy orci_tudo on public.orcamento_itens as permissive for all to authenticated using ((orcamento_id IN ( SELECT orcamentos.id
   FROM orcamentos
  WHERE (orcamentos.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))))) with check ((orcamento_id IN ( SELECT orcamentos.id
   FROM orcamentos
  WHERE (orcamentos.negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)))));
create policy orc_alterar on public.orcamentos as permissive for update to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy orc_apagar on public.orcamentos as permissive for delete to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy orc_criar on public.orcamentos as permissive for insert to authenticated with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy orc_ler on public.orcamentos as permissive for select to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy perf_dono_gerencia on public.perfis as permissive for update to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy perf_editar_proprio on public.perfis as permissive for update to authenticated using ((id = ( SELECT auth.uid() AS uid))) with check (((id = ( SELECT auth.uid() AS uid)) AND (negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id))));
create policy perf_ler on public.perfis as permissive for select to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy ret_dono on public.retiradas as permissive for all to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy cat_dono on public.servicos_catalogo as permissive for insert to authenticated with check (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy cat_dono_del on public.servicos_catalogo as permissive for delete to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono)));
create policy cat_dono_upd on public.servicos_catalogo as permissive for update to authenticated using (((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)) AND ( SELECT private.sou_dono() AS sou_dono))) with check ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy cat_ler on public.servicos_catalogo as permissive for select to authenticated using ((negocio_id = ( SELECT private.meu_negocio_id() AS meu_negocio_id)));
create policy fotos_apagar on storage.objects as permissive for delete to authenticated using (((bucket_id = 'fotos-servicos'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy fotos_enviar on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'fotos-servicos'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy fotos_ler on storage.objects as permissive for select to authenticated using (((bucket_id = 'fotos-servicos'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy imagens_apagar on storage.objects as permissive for delete to authenticated using (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy imagens_enviar on storage.objects as permissive for insert to authenticated with check (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy imagens_ler on storage.objects as permissive for select to authenticated using (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));
create policy imagens_trocar on storage.objects as permissive for update to authenticated using (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text))) with check (((bucket_id = 'imagens'::text) AND ((storage.foldername(name))[1] = (( SELECT private.meu_negocio_id() AS meu_negocio_id))::text)));

-- Permissões das tabelas

revoke all on table public.atendimento_checklist from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.atendimento_checklist to authenticated;
revoke all on table public.atendimentos from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.atendimentos to authenticated;
revoke all on table public.checklist_itens from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.checklist_itens to authenticated;
revoke all on table public.checklists from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.checklists to authenticated;
revoke all on table public.clientes from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.clientes to authenticated;
revoke all on table public.convites from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.convites to authenticated;
revoke all on table public.eventos from anon, authenticated;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.eventos to anon;
grant MAINTAIN, REFERENCES, TRIGGER, TRUNCATE on table public.eventos to authenticated;
revoke all on table public.historico_precos from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.historico_precos to authenticated;
revoke all on table public.lancamentos from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.lancamentos to authenticated;
revoke all on table public.negocios from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, TRIGGER, TRUNCATE, UPDATE on table public.negocios to authenticated;
revoke all on table public.orcamento_itens from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orcamento_itens to authenticated;
revoke all on table public.orcamentos from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.orcamentos to authenticated;
revoke all on table public.perfis from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.perfis to authenticated;
revoke all on table public.recuperacoes from anon, authenticated;
revoke all on table public.retiradas from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.retiradas to authenticated;
revoke all on table public.servicos_catalogo from anon, authenticated;
grant DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on table public.servicos_catalogo to authenticated;

-- Permissões das funções

revoke all on function aceitar_convite(text,text,text,text) from public, anon, authenticated;
grant execute on function aceitar_convite(text,text,text,text) to authenticated;
grant execute on function aceitar_convite(text,text,text,text) to service_role;
revoke all on function achar_conta(text,text) from public, anon, authenticated;
grant execute on function achar_conta(text,text) to service_role;
revoke all on function apagar_minha_conta() from public, anon, authenticated;
grant execute on function apagar_minha_conta() to authenticated;
grant execute on function apagar_minha_conta() to service_role;
revoke all on function criar_conta(text,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function criar_conta(text,text,text,text,boolean,text) to authenticated;
grant execute on function criar_conta(text,text,text,text,boolean,text) to service_role;
revoke all on function criar_convite(text) from public, anon, authenticated;
grant execute on function criar_convite(text) to authenticated;
grant execute on function criar_convite(text) to service_role;
revoke all on function exportar_meus_dados() from public, anon, authenticated;
grant execute on function exportar_meus_dados() to authenticated;
grant execute on function exportar_meus_dados() to service_role;
revoke all on function gerar_link_orcamento(uuid) from public, anon, authenticated;
grant execute on function gerar_link_orcamento(uuid) to authenticated;
revoke all on function listar_atendimentos(integer) from public, anon, authenticated;
grant execute on function listar_atendimentos(integer) to authenticated;
revoke all on function listar_orcamentos(integer) from public, anon, authenticated;
grant execute on function listar_orcamentos(integer) to authenticated;
revoke all on function private.meu_negocio_id() from public, anon, authenticated;
grant execute on function private.meu_negocio_id() to authenticated;
grant execute on function private.meu_negocio_id() to public;
revoke all on function meus_totais() from public, anon, authenticated;
grant execute on function meus_totais() to authenticated;
revoke all on function minha_meta() from public, anon, authenticated;
grant execute on function minha_meta() to authenticated;
revoke all on function registrar_evento(text,jsonb) from public, anon, authenticated;
grant execute on function registrar_evento(text,jsonb) to authenticated;
revoke all on function responder_orcamento(text,text) from public, anon, authenticated;
grant execute on function responder_orcamento(text,text) to anon;
grant execute on function responder_orcamento(text,text) to authenticated;
revoke all on function rls_auto_enable() from public, anon, authenticated;
revoke all on function salvar_minha_meta(numeric,integer) from public, anon, authenticated;
grant execute on function salvar_minha_meta(numeric,integer) to authenticated;
revoke all on function private.sou_dono() from public, anon, authenticated;
grant execute on function private.sou_dono() to authenticated;
grant execute on function private.sou_dono() to public;
revoke all on function ver_orcamento_publico(text) from public, anon, authenticated;
grant execute on function ver_orcamento_publico(text) to anon;
grant execute on function ver_orcamento_publico(text) to authenticated;

-- Pastas de arquivos

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('fotos-servicos', 'fotos-servicos', false, 10485760, '{image/jpeg,image/png,image/webp,image/heic}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('imagens', 'imagens', false, 5242880, '{image/jpeg,image/png,image/webp,image/heic}') on conflict (id) do nothing;

-- Liga a trava de segurança sozinha em toda tabela nova
do $e$ begin
  if not exists (select 1 from pg_event_trigger where evtname = 'ensure_rls') then
    create event trigger ensure_rls on ddl_command_end execute function public.rls_auto_enable();
  end if;
end $e$;
