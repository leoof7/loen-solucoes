-- ============================================================
-- LOEN SOLUÇÕES — migração 10
-- Log de eventos, para saber se o piloto está sendo usado
--
-- POR QUE
--
-- Hoje não há nenhuma medição. No fim do piloto, o Leandro dependeria
-- do que cada participante lembrasse de contar.
--
-- O QUE REGISTRA — pouco e certo, de propósito:
--   entrou · criou_cliente · registrou_servico · marcou_pago ·
--   criou_orcamento · usou_calculadora · mandou_orcamento ·
--   orcamento_virou_servico · cliente_respondeu · gerou_relatorio
--
-- O QUE NÃO REGISTRA: nada que a pessoa escreveu. Sem nome de cliente,
-- sem valor, sem texto. Só o QUE aconteceu e QUANDO. Isso basta para
-- responder "ela está usando?" sem virar vigilância.
--
-- SEGURANÇA: tabela nova com RLS ligada. Cada um só escreve o próprio
-- evento e só lê os eventos do próprio negócio.
-- ============================================================

create table if not exists public.eventos (
  id          bigserial primary key,
  negocio_id  uuid not null references public.negocios(id) on delete cascade,
  perfil_id   uuid references public.perfis(id) on delete set null,
  acao        text not null,
  detalhe     jsonb,
  criado_em   timestamptz not null default now()
);

comment on table public.eventos is
  'O que acontece no app, para medir o uso. Nunca guarda o que a pessoa escreveu.';

create index if not exists eventos_negocio_idx on public.eventos (negocio_id, criado_em desc);
create index if not exists eventos_acao_idx    on public.eventos (acao, criado_em desc);

alter table public.eventos enable row level security;

-- Cada um escreve só o próprio evento, no próprio negócio.
drop policy if exists eventos_inserir on public.eventos;
create policy eventos_inserir on public.eventos
  for insert to authenticated
  with check (
    perfil_id = auth.uid()
    and negocio_id = (select negocio_id from public.perfis where id = auth.uid())
  );

-- Ler: só os eventos do próprio negócio.
drop policy if exists eventos_ler on public.eventos;
create policy eventos_ler on public.eventos
  for select to authenticated
  using (negocio_id = (select negocio_id from public.perfis where id = auth.uid()));

-- Ninguém altera nem apaga evento. Log que se edita não serve para nada.

-- Registrar é uma função para o app não precisar saber de negocio_id,
-- e para um evento com nome errado não virar lixo na tabela.
create or replace function public.registrar_evento(p_acao text, p_detalhe jsonb default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.registrar_evento(text, jsonb) to authenticated;


-- ------------------------------------------------------------
-- AS CONSULTAS QUE RESPONDEM "O PILOTO ESTÁ ANDANDO?"
-- Rode no SQL Editor quando quiser olhar.
-- ------------------------------------------------------------

-- 1) Quem está usando, e quem parou.
--    Quem estiver com "dias_parado" acima de 14, é para quem ligar.
--
-- select n.nome, n.tipo_atividade,
--        count(distinct date(e.criado_em)) as dias_que_usou,
--        max(e.criado_em)::date            as ultimo_dia,
--        current_date - max(e.criado_em)::date as dias_parado
--   from public.negocios n
--   left join public.eventos e on e.negocio_id = n.id
--  group by 1, 2
--  order by dias_parado nulls first;

-- 2) O que as pessoas mais fazem no app.
--
-- select acao, count(*) as vezes, count(distinct negocio_id) as pessoas
--   from public.eventos
--  group by 1 order by vezes desc;

-- 3) Onde elas param.
--    Quem entrou e nunca registrou serviço não achou o caminho.
--
-- select n.nome,
--        bool_or(e.acao = 'registrou_servico')  as ja_registrou_servico,
--        bool_or(e.acao = 'criou_orcamento')    as ja_fez_orcamento,
--        bool_or(e.acao = 'usou_calculadora')   as ja_usou_calculadora
--   from public.negocios n
--   left join public.eventos e on e.negocio_id = n.id
--  group by 1 order by 1;

-- 4) Sem depender do log: quem registrou serviço e quando foi a última vez.
--    Funciona mesmo para o período anterior a esta migração.
--
-- select n.nome, n.tipo_atividade,
--        count(a.id) as servicos, max(a.criado_em)::date as ultimo_registro
--   from public.negocios n
--   left join public.atendimentos a on a.negocio_id = n.id
--  group by 1, 2 order by ultimo_registro desc nulls last;
