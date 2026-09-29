# Loen Soluções — Escopo

Antes se chamava NARV. Trocado em 28/09/2026.

Última atualização: 08/09/2026

Este documento é a fonte da verdade sobre o que o Loen Soluções é e o que ele não é.
Ideia nova não entra no meio de uma sessão — vira item de "Próxima fase"
aqui, e é discutida depois.

---

## Em andamento — decidido em 28/09/2026

O app passa a se chamar **Loen Soluções**. Nada do nome antigo em lugar
nenhum — tela, documento, repositório, pasta ou login interno. O papagaio
saiu da tela de entrada; o logo da Loen vem depois.

O app ainda não tem ninguém usando: as contas que existem são de teste e
serão apagadas antes de ir ao ar.

A recuperação de senha **saiu do congelado** e vira autosserviço por
e-mail, sem WhatsApp. Ordem, uma tarefa por vez:

1. ~~Trocar o nome visível e tirar o papagaio~~ — feito em 28/09
2. ~~E-mail obrigatório para todo mundo (cadastro, convite e contas antigas)~~ — feito em 28/09
3. ~~"Esqueci minha senha": função no servidor que manda o link pelo Resend
   para o e-mail de verdade, e tela de nova senha~~ — feito em 28/09 (ADR-011)
4. ~~Entrar com celular **ou** e-mail~~ — feito em 28/09
5. Ligar o app em `app.loenstudiocriativo.com.br` e apontar os botões de
   `loenstudiocriativo.com.br/solucoes` para ele

O WhatsApp (31) 97158-9587 fica só no botão de suporte ("Achei um problema
no app").

Também trocados, porque ninguém usa o app ainda e não haverá momento
melhor: o domínio interno do login (agora `celular.loen.invalid`, ver
ADR-010), o repositório (`leoof7/loen-solucoes`) e a pasta no PC. As
contas de teste antigas, com o domínio velho, deixam de entrar.

---

## Como chegamos até aqui

Reconstruído a partir do histórico do repositório, porque a conversa em que
o produto foi desenhado aconteceu no claude.ai e não foi preservada.

| Quando | O que entrou |
|---|---|
| 28/08 20:41 | Primeiro esqueleto: `index.html`, `estilo.css`, `config.js`, `app.js`. Cadastro e login. |
| 30/08 13:59 | Login por celular no lugar de e-mail (`app.js`, +53 linhas). |
| 30/08 14:24 | O app inteiro depois de entrar: `painel.js` com 1.001 linhas, cinco abas, folhas. |
| 30/08 14:28 | Ajustes de CSS. |
| 30/08 (local) | Cinco correções feitas mas **ainda não publicadas** no GitHub. |

Onde está publicado: `leoof7.github.io` (GitHub Pages, a partir do
repositório `leoof7/loen-solucoes`, público).

---

## O que está pronto e funcionando

**Entrada**
Login com celular e senha. Criar conta em uma tela. Entrar na equipe com
código de convite. Entrar também pelo e-mail. Recuperação de senha pelo
próprio app, com link no e-mail (ADR-011).

**Início**
Tutorial de três passos que some sozinho quando as tarefas são feitas. Saldo
do negócio, entradas e saídas do mês, barra da meta, total a receber,
próximos serviços agendados.

**Serviços**
Registrar serviço com cliente, item do catálogo ou avulso, valor, data,
situação (pago / a receber / agendado), forma de pagamento e endereço.
Serviço pago pode virar entrada no financeiro. Tocar num serviço marca como
pago.

**Clientes**
Cadastro com telefone, observação e — opcional — dados de empresa para o PDF
do orçamento. Busca por nome, empresa ou telefone. Perfil com total gasto,
número de atendimentos, serviço mais feito, histórico e botão de WhatsApp.
Botão "Repetir serviço".

**Financeiro** (só o dono vê)
Entradas e saídas, resumo do mês, meta mensal, registro de retirada, últimos
lançamentos.

**Catálogo**
Serviços sugeridos por tipo de atividade (18 profissões cobertas). Edição de
preços em lote. Cadastro de serviço avulso.

**Conta**
Foto de perfil ou logo do negócio. Sair. Apagar a conta com dupla
confirmação.

---

## Bloco entregue em 30-31/08/2026

Tudo abaixo foi escrito **e testado no navegador**, contra o banco real.

1. **Dinheiro** — vírgula decimal, valor zero bloqueado, saldo somado sobre
   todos os registros, saída pessoal e retirada unificadas (ADR-004).
2. **Fuso horário** — `dataLocal()` no lugar de `toISOString()`.
3. **Editar e apagar serviço** — folha própria, com confirmação.
4. **Agenda** — dois modos (lista por dia e calendário do mês), dentro da
   aba Serviços. Ver ADR-006.
5. **Convite de equipe** — Ajustes › Minha equipe, com geração de código.
6. **Interface** — `alert` e `confirm` trocados pelas folhas do app.

**Falta rodar no banco:** migração `05` (dados de empresa do cliente) e `06`
(hora do atendimento). O app detecta sozinho se a `06` já rodou e esconde o
campo de hora enquanto não rodar, em vez de quebrar.

### Ainda pendente do bloco

- Categoria da saída virar lista escolhida (pré-requisito do gráfico)
- `try/catch` geral e `ocupado()` corrigido
- Erro silencioso ao salvar preços
- Campo morto `#c-outra-atividade`
- Confirmação de senha no cadastro
- Validação de data

---

## Bugs conhecidos

Encontrados e comprovados em 30/08/2026, testando o app em navegador.

### Ainda abertos

| # | O quê | Gravidade |
|---|---|---|
| 16 | **A equipe vê a meta do dono.** O profissional não vê lançamentos nem retiradas (conferido), mas lê `negocios.prolabore_valor` — ou seja, quanto o dono quer ganhar por mês. Fere a regra "dinheiro é só do dono". Corrige na RLS por coluna, ou com uma view sem essa coluna para quem não é dono. | Alto |
| 14 | **Dados de empresa do cliente não salvam.** As colunas `empresa`, `responsavel`, `cnpj`, `endereco` e `email` nunca foram criadas em `clientes`, mas o formulário as envia. Quem abre "Dados da empresa" e preenche recebe erro técnico. Corrige com a migração `05`. | Crítico |
| 7 | `ocupado()` chamado duas vezes trava o botão em "Salvando…" para sempre. Testado. | Médio |
| 8 | Salvar preços não checa erro nenhum. Mostra "Preços salvos" mesmo falhando. | Médio |
| 9 | Campo `#c-outra-atividade` existe no HTML e tem zero referências no JavaScript. | Médio |
| 10 | Nenhum `try/catch` no projeto. Queda de rede trava a tela. | Médio |
| 12 | `mt-dia` (dia da retirada) é salvo e nunca usado. | Baixo |
| 13 | Sem validação de data. Serviço pode ser marcado pago com data futura. | Baixo |

### Resolvidos em 30-31/08/2026

Todos corrigidos **e testados no navegador**, contra o banco real.

| # | O quê | Como foi provado |
|---|---|---|
| 1 | Valor com vírgula salvava **R$ 0,00** sem avisar | `150,50` → 150.5 e `1.234,56` → 1234.56 |
| 2 | Saldo só somava os últimos 200 lançamentos | 300 entradas de R$ 100 agora dão R$ 30.000 (davam R$ 20.000) |
| 3 | Não dava para editar nem apagar serviço | Editado e apagado contra o banco, com confirmação em folha |
| 4 | `hoje()` usava UTC e gravava o dia seguinte após as 21h | Às 22h30 do dia 30, grava 30 |
| 5 | Negócio com equipe trancava **todo mundo** para fora, dono incluído | Duas contas reais criadas; ambas entram |
| 6 | Saída pessoal não baixava o saldo | R$ 2.000 − 300 − 200 − 500 = R$ 1.000 (ADR-004) |
| 11 | 8 `alert()` e 3 `confirm()` no painel | Trocados por folhas. Sobrou só o de apagar a conta, exceção proposital |
| 15 | Não existia tela para criar convite | Ajustes › Minha equipe gerou o código `FA71838C` |

---

## Validações que faltam

Valor maior que zero · vírgula decimal · confirmação de senha no cadastro
(crítico, porque a recuperação é manual) · telefone de cliente · CNPJ ·
cliente e serviço duplicados · tamanho da imagem no upload (foto de celular
tem 5–8 MB e o limite grátis é 1 GB no total).

---

## Próxima fase — congelado, não entra agora

- **Relatório mensal para imprimir ou mandar** — diferente do comprovante
  de renda, que já existe: seria o detalhe do mês, serviço a serviço.
- **Editar o próprio perfil** — nome e celular de quem usa.
- **Recorrência** — "repetir este atendimento em 15 dias". Hoje o botão
  "Repetir serviço" no perfil do cliente cobre o caso em dois toques.
- **Funcionar sem internet** — decisão adiada de propósito em 31/08:
  esperar aparecer nos relatos do piloto antes de pagar o custo.
- **Assinatura com valor jurídico** no orçamento — exigiria Clicksign ou
  D4Sign, que são pagos. O aceite por link já está no ar.
- **Banco de homologação** — a partir do que estiver em produção. O
  Leandro avisa o dia.
- **Lixeira / desfazer** — avaliado em 31/08 e descartado: o banco impede
  apagar cliente com histórico, apagar serviço não leva o dinheiro junto,
  e o único cadastro trabalhoso (orçamento da calculadora) tem
  "Duplicar".

---

## Limites conhecidos

Medido em 30/08/2026 contra as cotas do plano Free.

O gargalo é **tráfego**, não espaço. Cada ação no app recarrega tudo do
banco: 42 KB para um usuário novo, 236 KB para um com um ano de uso.

| | Usuário novo | Com 1 ano de uso |
|---|---|---|
| Por mês, por prestador | 10,5 MB | 60 MB |
| Cabem no Free (5 GB) | ~485 | ~85 |
| Cabem no Pro, US$ 25 (250 GB) | ~24.000 | ~4.200 |

Em espaço o Free (500 MB) guardaria uns 1.600 prestadores-ano. O limite de
usuários (50.000) não chega perto. Uso real em 30/08: 27 MB de 500 MB,
4 usuários, 0 MB de tráfego.

**Conclusão:** o Free segura o piloto com folga. Ele aperta quando os
primeiros usuários completarem um ano de dados, e a causa é o "recarrega
tudo a cada ação".

**Armadilha do Free:** projeto sem acesso por 7 dias é pausado. Se o piloto
ficar uma semana parado, ninguém entra até despausar.

---

## Bloco entregue em 08/09/2026

Tudo testado no navegador, contra o banco real.

### Corrigido

| O quê | Como apareceu |
|---|---|
| **O resumo do mês não fechava.** Entradas R$ 1.000, saídas R$ 0 e saldo R$ 820 na mesma tela. As linhas eram do mês; o saldo, de todos os tempos. | Reproduzido com uma saída no mês anterior |
| **A migração 07 não protegia nada.** A equipe ainda lia a meta do dono, direto e pelo embed do PostgREST. | Testado com conta de profissional |
| **Campo de hora nunca aparecia em conta nova.** A detecção olhava a primeira linha de atendimentos, e quem acabou de se cadastrar não tem nenhuma. | Cadastro do zero |
| **O gráfico jogava tudo em "Sem categoria".** A consulta dos totais não trazia a coluna `categoria`. | Três saídas de tipos diferentes |
| **O app afirmava que gasto pessoal não muda o saldo** — falso desde o ADR-004. | Leitura da tela |
| **A mensagem de erro mandava "ir em Ajustes"** sem dizer onde fica. | Apontado pelo Leandro |

### Novo

- **Dados do negócio** — CNPJ, site, Instagram, endereço e e-mail, com
  máscara de CNPJ e limpeza automática do @ do Instagram
- **PDF redesenhado** — faixa azul com o CNPJ de quem cobra, bloco verde
  com o valor e a forma de pagamento, rodapé com Instagram e site
- **Forma de pagamento e parcelas** — no serviço e no orçamento, com o
  valor de cada parcela calculado na tela
- **Editar a conta da calculadora** — orçamento já criado volta com os
  itens; ela acrescenta e salva sem duplicar
- **Categoria vira lista** — por profissão, com "Outro" para o resto
- **Gráfico de gastos** — barras horizontais, três meses, com a frase que
  aponta onde dá para economizar
- **Confirmação de senha** no cadastro e no convite
- **Rede de segurança** — erro não previsto vira aviso em português,
  destrava os botões presos em "Salvando…" e oferece um botão que abre o
  WhatsApp da equipe já com o contexto

**Depende do Leandro:** rodar a migração 12.

---

## A estrutura do banco tem cópia — 09/09/2026

`docs/estrutura-do-banco.json` guarda tudo que existe dentro do banco:
140 colunas, 38 índices, 63 restrições, 35 políticas de segurança, 3
gatilhos, os 2 baldes de arquivo e o **código completo das 15 funções** —
inclusive `criar_conta`, `aceitar_convite` e `apagar_minha_conta`, que
foram escritas no chat anterior e não existiam em arquivo nenhum.

Com isso o projeto passa a ter cópia de tudo:

| O quê | Onde fica |
|---|---|
| Estrutura do banco | `docs/estrutura-do-banco.json` |
| Dados | `backup.ps1`, ou o backup pelo navegador |
| Migrações 05 a 12 | `docs/migracoes/` |
| App | GitHub |

**Refazer a exportação depois de cada migração nova.** O arquivo é uma
foto do banco: fica velho assim que algo muda.

### O que a exportação revelou

**Todas as 15 tabelas têm RLS ligada e política definida.** Nenhuma
exposta.

**Quatro tabelas existem e o app não usa:** `checklists`,
`checklist_itens`, `atendimento_checklist` e `historico_precos`. Foram
criadas nas migrações 01 a 04 para um escopo maior que não chegou a ser
construído. Não atrapalham — só ocupam espaço e confundem quem for ler o
banco depois. Decidir em algum momento: usar ou remover.

Há também uma função `exportar_meus_dados` que nenhuma tela chama. Pode
virar o botão de "baixar meus dados" que a LGPD pede.

---

## Decisões de arquitetura (ADR)

### ADR-001 — Arquivos soltos em vez de Next.js
**Quando:** 28/08/2026
**Decisão:** HTML, CSS e JavaScript puro, servidos pelo GitHub Pages, sem
build. Foge do padrão Next.js/Vercel da Lesete.
**Por quê:** piloto que precisa chegar rápido na mão de gente real. Sem
passo de build, não há build para quebrar. Publicar é subir arquivo.
**Custo aceito:** sem componentes, sem verificação automática de tipos, tudo
montado com `innerHTML`, e todo texto precisa passar por `escapar()` na mão.
**Quando revisitar:** quando houver mais de uma pessoa mexendo no código, ou
quando o app passar de umas 3.000 linhas.

### ADR-002 — Login por celular com e-mail fabricado
**Quando:** 30/08/2026
**Decisão:** a pessoa entra com celular e senha. O sistema fabrica
`c55DDNNNNNNNNN@celular.<domínio interno>` (hoje `celular.loen.invalid`,
ver ADR-010) para satisfazer o Supabase Auth, que
exige e-mail. E-mail de verdade é opcional, só para recuperação.
**Por quê:** o público não usa e-mail. Pedir e-mail derrubaria o cadastro.
**Custo aceito:** recuperação de senha vira trabalho manual pelo WhatsApp
para quem não deixou e-mail. Torna a confirmação de senha no cadastro
obrigatória — errar a senha significa perder a conta.

### ADR-003 — Preço é cópia congelada no atendimento
**Quando:** 30/08/2026
**Decisão:** o atendimento guarda `servico_nome` e `valor` no momento do
registro, em vez de só apontar para o catálogo.
**Por quê:** mudar o preço hoje não pode reescrever o que foi cobrado mês
passado. O histórico tem que ser o que aconteceu de verdade.
**Custo aceito:** o mesmo nome de serviço fica repetido em muitas linhas.
Irrelevante nesta escala.

### ADR-004 — Todo dinheiro que sai baixa o saldo
**Quando:** 30/08/2026
**Decisão:** saída do negócio, saída pessoal e retirada baixam o caixa
igual. O rótulo "pessoal" existe só para a pessoa ver na lista. Saída
pessoal e retirada contam igual na meta.
**Por quê:** o público não tem conta PJ — a carteira dela é o caixa. O
modelo anterior, em que saída pessoal não baixava nada, fazia o app mostrar
mais dinheiro do que existia na carteira.
**Custo aceito:** o saldo de quem já tinha saídas pessoais registradas vai
diminuir quando isso subir. O número novo é o correto; o antigo estava
inflado.

### ADR-005 — Segurança no banco, não no app
**Quando:** 28/08/2026
**Decisão:** as regras de quem vê o quê vivem no Supabase (RLS e permissões
do Postgres). O app só evita pedir o que sabe que não pode.
**Por quê:** o código roda no navegador e é público. Qualquer pessoa pode
ler e chamar o banco direto. Segurança no app seria teatro.
**Verificado em 30/08:** visitante anônimo recebe `42501 permission denied`
nas 8 tabelas — mais restritivo que RLS sozinha, porque nem chega a
consultar. Falta verificar o isolamento **entre negócios diferentes**, que
exige duas contas de teste.

### ADR-006 — Agenda como modo da aba Serviços, não aba nova
**Quando:** 30/08/2026
**Decisão:** a Agenda é mais um filtro dentro de Serviços, com dois modos
(lista por dia e calendário do mês). Não virou a sexta aba da barra de baixo.
**Por quê:** um serviço com situação "agendado" e data no futuro **já é** um
agendamento — não é dado novo, é visualização. E a barra de baixo já tem
cinco ícones; a sexta aba começaria a espremer os rótulos em celular pequeno.
**Custo aceito:** a Agenda fica um toque mais escondida do que se fosse aba
própria. Se o uso mostrar que ela é a tela mais aberta do dia, vira aba.
**Depende de:** migração 06, que adiciona a coluna `hora`. O app funciona sem
ela — esconde o campo de hora e mostra "—" na lista.

### ADR-007 — Esconder coluna exige tirar o acesso à tabela inteira
**Quando:** 08/09/2026
**Decisão:** para esconder uma coluna, sempre `revoke select on tabela`
seguido de `grant select (colunas permitidas)`. Nunca
`revoke select (coluna)` sozinho.
**Por quê:** no Postgres, o `grant` de tabela inteira vence o `revoke` de
coluna, e o revoke é ignorado **em silêncio**. A migração 07 pareceu ter
funcionado e não protegia nada: a equipe continuou lendo a meta do dono por
mais de uma semana, direto e pelo embed do PostgREST. A migração 08 usou a
mesma sintaxe e funcionou — só porque naquela tabela o grant amplo já não
existia. Mesma linha de SQL, resultados opostos.
**Custo aceito:** toda coluna nova precisa entrar no `grant`, senão some
para o app. É um custo bom: erra para o lado seguro.
**Como verificar:** entrar como profissional e tentar ler a coluna. Ler o
SQL não basta — a sintaxe errada parece certa.

### ADR-008 — Detecção de migração pergunta pela coluna, não pelo dado
**Quando:** 08/09/2026
**Decisão:** para saber se uma migração já rodou, pedir a coluna ao banco
(`select('hora').limit(1)`) e olhar se deu erro. Nunca inspecionar a
primeira linha de dado.
**Por quê:** conta nova não tem dado nenhum. A detecção pelo dado concluía
"a coluna não existe" para exatamente quem estava começando, e o campo de
hora nunca aparecia para essa pessoa.
**Custo aceito:** uma consulta a mais por carregamento, com peso
desprezível.

### ADR-009 — Aviso de erro oferece caminho, não instrução
**Quando:** 08/09/2026
**Decisão:** quando algo falha, o aviso traz um botão que resolve — no
caso do erro, abrir o WhatsApp da equipe já com a tela, o perfil, a hora e
o detalhe técnico preenchidos. Não se escreve "vá em Ajustes e procure".
**Por quê:** mandar a pessoa procurar uma tela é devolver o problema para
ela, no momento em que ela já está travada. E o relato que chega sem
contexto obriga a equipe a adivinhar o que aconteceu.
**Custo aceito:** a folha de aviso ficou com um botão a mais para
gerenciar, e `avisarNaFolha` precisa esconder o "Cancelar" que só faz
sentido em pergunta.

### ADR-010 — Domínio interno do login termina em `.invalid`
**Quando:** 28/09/2026
**Decisão:** o login fabricado passa de `c55...@celular.kitnarv.app` para
`c55...@celular.loen.invalid`. O domínio fica em `config.js`
(`DOMINIO_CELULAR`) e na função `recuperar-senha` — os dois precisam ser
iguais.
**Por quê:** o app mudou de nome e ainda não tinha ninguém usando, então
não havia momento mais barato para trocar. O final `.invalid` é reservado
no mundo todo (RFC 2606) para endereço que não existe: com o Resend ligado
como SMTP do Supabase, nenhuma mensagem automática do sistema consegue
cair na caixa de um desconhecido dono de um domínio parecido.
**Custo aceito:** as contas de teste antigas, com o domínio velho, não
entram mais. Serão apagadas antes de ir ao ar. Daqui para frente este
domínio **não muda nunca** — trocar exigiria reescrever o login de todas as
contas.

### ADR-011 — Recuperação de senha por e-mail, sem mexer no login
**Quando:** 28/09/2026. Substitui o "custo aceito" do ADR-002.
**Decisão:** o e-mail de verdade é obrigatório e fica em
`perfis.email_recuperacao`, nunca no login do Supabase. Duas funções no
servidor fazem a ponte:
- `recuperar-senha` — recebe celular ou e-mail, acha a conta, gera o link
  com o admin do Supabase e manda pelo Resend. Responde sempre igual,
  exista a conta ou não. No máximo 3 links por conta por hora
  (tabela `recuperacoes`). O link só pode levar aos endereços do app que
  a função conhece.
- `entrar-com-email` — deixa entrar pelo e-mail. Fica no servidor porque o
  login interno contém o celular: se fosse para o navegador, quem soubesse
  um e-mail descobriria o celular do dono.

A migração 14 põe as regras no banco: e-mail único, sempre minúsculo, com
formato válido, e **só a própria pessoa troca o próprio e-mail** — sem
isso o dono, que pode editar o perfil da equipe, poria o e-mail dele no
perfil de um funcionário e tomaria a conta pelo link.
**Por quê:** o público perdia a conta se esquecesse a senha, e a saída
pelo WhatsApp dependia de uma pessoa da equipe disponível.
**Custo aceito:** o cadastro ficou com dois campos a mais (e-mail e
repetição). Entrar pelo e-mail passa por uma função a mais, e o limite de
tentativas de login do Supabase é contado pelo endereço do servidor dela,
não de quem digita — se o app crescer muito, subir esse limite em
Authentication → Rate Limits.
