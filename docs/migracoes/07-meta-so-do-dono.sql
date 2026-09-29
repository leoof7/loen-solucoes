-- ============================================================
-- LOEN SOLUÇÕES — migração 07
-- A meta mensal passa a ser visível só para o dono
--
-- O PROBLEMA (bug 16, encontrado em 31/08/2026)
--
-- A regra do produto é "dinheiro é só do dono". Conferimos que a
-- equipe NÃO vê lançamentos, NÃO vê retiradas, NÃO consegue lançar
-- dinheiro e NÃO consegue alterar a meta.
--
-- Mas ela LÊ `negocios.prolabore_valor` — ou seja, a funcionária vê
-- quanto a patroa quer ganhar por mês.
--
-- POR QUE A RLS SOZINHA NÃO RESOLVE
--
-- A RLS do Postgres filtra LINHAS, não COLUNAS. A equipe precisa ler
-- a linha do negócio (para saber o nome e o tipo de atividade), e a
-- meta vem junto no mesmo `select *`.
--
-- A SOLUÇÃO
--
-- Tirar a permissão de leitura dessas duas colunas de todo mundo, e
-- devolver a meta por uma função que só responde ao dono.
--
-- SEGURANÇA: só mexe em permissão. Não apaga, não altera e não move
-- nenhum dado. Rodar duas vezes por engano não causa problema.
-- ============================================================

-- 1. Ninguém mais lê estas duas colunas direto da tabela.
revoke select (prolabore_valor, prolabore_dia)
  on public.negocios from authenticated, anon;

-- 2. O dono lê a própria meta por aqui.
--
-- SECURITY DEFINER: a função roda com o dono do banco, por isso
-- enxerga as colunas que acabamos de revogar. A checagem de quem
-- pode ver está DENTRO dela — só devolve linha se quem chamou for
-- o dono daquele negócio.
create or replace function public.minha_meta()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
           'prolabore_valor', n.prolabore_valor,
           'prolabore_dia',   n.prolabore_dia
         )
    from public.negocios n
    join public.perfis   p on p.negocio_id = n.id
   where p.id = auth.uid()
     and p.papel = 'dono';
$$;

grant execute on function public.minha_meta() to authenticated;

-- 3. E o dono salva a meta por aqui.
--
-- O update direto na tabela já era bloqueado pela RLS para quem não
-- é dono (conferido em 31/08). Esta função existe para o app ter um
-- caminho só, e para a regra ficar escrita num lugar visível.
create or replace function public.salvar_minha_meta(
  p_valor numeric,
  p_dia   integer
)
returns json
language plpgsql
security definer
set search_path = public
as $$
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
$$;

grant execute on function public.salvar_minha_meta(numeric, integer) to authenticated;


-- ------------------------------------------------------------
-- CONFERÊNCIA
--
-- 1) Deve devolver a sua meta (você é dono):
--      select public.minha_meta();
--
-- 2) Deve dar ERRO de permissão na coluna — é o resultado esperado:
--      select prolabore_valor from public.negocios;
--
-- 3) Deve continuar funcionando, sem as colunas de meta:
--      select id, nome, tipo_atividade, tem_equipe, logo_caminho
--        from public.negocios;
-- ------------------------------------------------------------
