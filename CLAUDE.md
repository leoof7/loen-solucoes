# CLAUDE.md — Loen Soluções

Vale para este produto. O CLAUDE.md da Lesete (pasta acima) e o global do
Leandro continuam valendo — este aqui só acrescenta o que é do Loen Soluções.

## O que é o Loen Soluções

App para prestador de serviço autônomo tocar o próprio negócio pelo celular:
clientes, serviços feitos, dinheiro que entra e sai, e uma meta mensal.

Antes se chamava NARV / Kit Narv. Desde 28/09/2026 o nome é **Loen Soluções**
em tudo: tela, documento, repositório (`leoof7/loen-solucoes`) e login interno.

## Para quem é

Manicure, cabeleireiro, barbeiro, diarista, costureira, pedreiro, pintor,
eletricista, encanador, marceneiro, gesseiro, serralheiro, jardineiro,
motorista, mecânico, maquiador, esteticista, mestre de obras.

O que essas pessoas têm em comum e que decide quase tudo no produto:

- Trabalham sozinhas ou com uma equipe pequena
- **Não têm conta PJ.** A carteira delas é o caixa do negócio
- Vivem no celular, quase nunca num computador
- Não têm paciência nem tempo para preencher formulário longo
- Muitas anotam em caderno hoje. O app concorre com o caderno, não com um ERP

## Tom de voz

Português claro, do dia a dia. Nunca vocabulário de contador.

- "Dinheiro que entrou", não "receita"
- "Dinheiro que saiu", não "despesa operacional"
- "Quanto você quer receber por mês", não "pró-labore"
- "A receber", não "contas a receber"

O app **nunca julga**. Não existe "você gastou demais". Existe "você tirou
R$ 300 a mais do que entrou este mês". O mesmo fato, sem dedo na cara.
Comparação é sempre contra a meta que ela mesma definiu, nunca contra um
padrão de fora.

## Decisões de produto que já estão de pé

**Entra com celular e senha.** Por baixo o Supabase exige e-mail, então o
sistema fabrica um interno (`c55DDNNNNNNNNN@celular.loen.invalid`) que a
pessoa nunca vê e que nunca recebe mensagem — o final `.invalid` é reservado
para endereço que não existe. **Esse e-mail interno nunca muda de jeito.**

**E-mail de verdade é obrigatório e serve para recuperar a senha.** Fica em
`perfis.email_recuperacao`, nunca no login do Supabase. A recuperação é pelo
próprio app, com link enviado pelo Resend — sem WhatsApp. (Decidido em
28/09/2026, em construção.) O WhatsApp da equipe fica só no botão de suporte.

**Cadastro é uma tela só.** Serviços, preços e meta ficam para depois de
entrar. Menos de um minuto para criar a conta.

**Preço é cópia congelada.** O atendimento guarda `servico_nome` e `valor`
no momento em que foi registrado. Mudar o preço no catálogo não reescreve o
histórico.

**Dinheiro é só do dono.** Quem entra por convite de equipe não vê o
financeiro do negócio. A regra vive no banco (RLS); o app só evita pedir.

**Todo dinheiro que sai, sai do saldo.** Saída do negócio, saída pessoal e
retirada baixam o caixa igual — porque no mundo real o dinheiro saiu da
carteira dela nos três casos. O rótulo "pessoal" existe só para ela ver na
lista, não muda conta nenhuma. (Decidido em 30/08/2026. Ver ADR-004 no escopo.)

**A meta mensal mede o que ENTROU no mês.** "Entrou R$ 28 mil de R$ 50 mil".
Antes media só as retiradas, e a barra ficava parada mesmo com dinheiro
entrando — ninguém entendia. (Decidido em 29/09/2026. Ver ADR-012.)

**Visual é o da Loen.** Fundo cinza bem claro, tinta preta, destaques lima,
lilás, céu e laranja, fontes Montserrat Alternates e Hanken Grotesk — o
mesmo do site que apresenta o app. Nada de rosa. O Início segue o desenho
da página `loenstudiocriativo.com.br/solucoes`.

**Valor em dinheiro se digita só com números.** A vírgula e o ponto
aparecem sozinhos (5 → 0,05 → 5.000,00), como nos apps de banco. Só nos
campos marcados `data-reais`; quantidade e porcentagem ficam livres.

**Exemplo dentro de campo sai da profissão da pessoa**, da lista
`SERVICOS_SUGERIDOS` — nunca um exemplo de um ofício só.

## Como este produto foge do padrão da Lesete

O padrão da casa é Next.js na Vercel. **O Loen Soluções não usa.** São cinco arquivos
soltos — HTML, CSS e JavaScript puro — servidos pelo GitHub Pages, falando
direto com o Supabase pelo navegador.

Por quê: é um piloto que precisa estar na mão de gente de verdade rápido, e
não há passo de build para dar errado. Quando o produto crescer, isso vira o
limite — está registrado como ADR-001 no escopo.

**Consequência prática:** não existe `npm install`, não existe build, não
existe lint. Verificar significa abrir no navegador e usar. O ambiente do
Claude Code nesta máquina tem Node e navegador, então dá para testar de
verdade — não aceite "revisei o código" como prova de que funciona.

## Regras técnicas deste produto

- Todo texto que vem do banco passa por `escapar()` antes de virar HTML.
  Sem exceção — é a única defesa contra código injetado, já que tudo é
  montado com `innerHTML`.
- Data nunca sai de `toISOString()`. Isso é UTC e joga o Brasil para o dia
  seguinte depois das 21h. Sempre data local.
- Valor em dinheiro sempre passa por leitura que aceita **vírgula**. O
  teclado do celular brasileiro oferece vírgula, e `type="number"` devolve
  string vazia quando recebe uma.
- Nada de `alert`, `confirm` ou `prompt`. O app tem folhas (`.folha`) para
  isso. A única exceção aceita é a confirmação de apagar a conta, onde a
  caixa feia do navegador ajuda porque assusta.
- Toda soma de dinheiro considera **todos** os registros, nunca a página que
  está na tela.

## Ambientes

Hoje existe **um só** banco, `rtisqipntpnvlhetfoeb`, plano Free. Em 28/09/2026
o app **ainda não tem ninguém usando**: as contas são de teste e serão
apagadas antes de ir ao ar.

**Mudança de 17/09/2026: o banco saiu da conta do Leandro.** Foi transferido
para a conta `redenarv@gmail.com` (organização renomeada para "Loen Soluções" em 28/09/2026), com os
dados dentro — nada foi exportado nem apagado. Endereço e chaves não mudaram,
então o app continua funcionando igual. O Leandro deixou de ser dono: se o
acesso for retirado, ele fica sem o banco. O projeto está entregue e essa
consequência foi aceita por ele.

Cópias do banco de 30 e 31/08/2026 estão fora do PC, no pacote
`SENHAS E BACKUP (SQL)` do pen drive.

O plano Free **não tem backup automático**. Exportar antes de qualquer
mexida no banco é obrigatório, não recomendação.

Banco de homologação está planejado, será criado a partir do que estiver em
produção, e o Leandro avisa o dia.
