# Produção e homologação — o guia

Escrito em 09/09/2026, quando o Leandro perguntou como subir para
produção sem perder dados.

---

## Primeiro, desfazendo uma confusão

**O banco que existe hoje JÁ É produção.**

O `rtisqipntpnvlhetfoeb` tem os participantes reais do piloto, e o app
publicado em `leoof7.github.io` aponta para ele desde o primeiro dia.

Então não existe "subir o banco para produção" e não há dado nenhum a
migrar. **Ninguém vai perder nada, porque nada precisa se mover.**

O que falta é o contrário: **criar um lugar seguro para testar**, e parar
de mexer direto no banco onde tem gente trabalhando.

```
COMO ESTÁ HOJE                    COMO FICA DEPOIS

    seu computador                    seu computador
          |                                 |
          v                                 v
   [ PRODUÇÃO ]  <- app             [ HOMOLOGAÇÃO ]     [ PRODUÇÃO ] <- app
   dados reais      publicado        pode quebrar        dados reais
```

---

## Passo 1 — Criar o banco de homologação

**No painel do Supabase:**

1. Clique no nome da organização (canto superior esquerdo) → **New project**
2. Nome: `loen-homologacao`
3. Região: **South America (São Paulo)** — a mesma da produção
4. Senha do banco: gere uma e **guarde**. Não é a mesma da produção
5. Aguarde uns 2 minutos

⚠️ **Atenção ao plano grátis:** ele dá **2 projetos por organização**. Se
já houver dois, o novo projeto precisa de outra organização — que também
é grátis.

**Depois de criado, copie a estrutura para lá:**

6. No projeto NOVO, abra o **SQL Editor**
7. Rode, **nesta ordem**, os arquivos de `docs/migracoes/`: `05`, `06`,
   `07`, `08`, `09`, `10`, `11`, `12`
8. As migrações 01 a 04 não existem em arquivo — elas estão descritas em
   `docs/estrutura-do-banco.json`. Me mande esse arquivo que eu escrevo o
   SQL de criação a partir dele

**Não copie os dados.** Homologação com dado de participante real é o
mesmo risco de novo, em outro lugar. Crie duas ou três contas de teste
lá e trabalhe com elas.

**Por fim, ligue os dois no app:**

9. Em `config.js`, preencha `AMBIENTES.homologacao` com a URL e a chave
   publicável do projeto novo (Project Settings → API Keys)

Pronto. A partir daí:

| Onde você abre | Qual banco |
|---|---|
| `localhost` | homologação |
| rede local (`192.168...`) | homologação |
| `leoof7.github.io` | produção |
| domínio próprio da Loen | produção |

E fora de produção o app mostra uma **faixa listrada no topo** dizendo
onde você está. Não dá para confundir.

---

## Passo 2 — Backup automático

> **Situação em 17/09/2026:** o backup **funcionou** 13 vezes, de 28/08 a
> 09/09/2026, e **falha desde 10/09** — 8 falhas seguidas. O segredo
> `SUPABASE_SECRET_KEY` não está mais cadastrado no repositório.
>
> Some-se a isso que, desde 17/09/2026, **o banco não é mais da conta do
> Leandro**: foi transferido para `redenarv@gmail.com`. Para religar o
> backup é preciso uma chave secreta pedida a quem cuida dessa conta.
>
> Decisão pendente: religar o backup ou desligar a rotina para parar de
> gerar falha todo dia.

Está pronto em `.github/workflows/backup.yml`. Para ligar:

1. Pegue a chave secreta:
   Supabase → Project Settings → API Keys → **Secret keys** → `default` →
   ícone de olho → copiar
2. Vá em `github.com/leoof7/loen-solucoes` → **Settings** → **Secrets and
   variables** → **Actions** → **New repository secret**
3. Nome: `SUPABASE_SECRET_KEY`
   Valor: a chave que você copiou
4. **Add secret**

Para testar na hora, sem esperar o horário:

5. Aba **Actions** → "Backup do banco" → **Run workflow**
6. Quando terminar, o arquivo aparece em **Artifacts**, no fim da página

Depois disso ele roda **todo dia às 6h da manhã**, sozinho.

**Duas coisas importantes:**

- Segredo do GitHub é privado **mesmo em repositório público**. Ele não
  aparece no log — o GitHub apaga o valor da saída.
- O backup **nunca** é gravado no repositório. Fica como *artifact*, que
  só quem tem acesso ao repositório baixa. Se fosse commitado, os dados
  dos participantes ficariam públicos.

O artifact dura **90 dias** (teto do plano grátis). De vez em quando,
baixe um e guarde no seu Drive — assim existe cópia fora do GitHub
também.

---

## Passo 3 — O domínio próprio da Loen

Quando comprar o domínio:

1. No provedor do domínio, aponte para o GitHub Pages
2. Em `github.com/leoof7/loen-solucoes` → Settings → Pages → **Custom domain** →
   o domínio da Loen
3. Marque **Enforce HTTPS**

Depois, acrescente o domínio na lista de endereços de produção do
`config.js` (função `ambienteAtual`).

---

## Como trabalhar daqui em diante

**A regra:** migração nova roda **primeiro** em homologação. Só depois
de funcionar lá é que vai para produção.

```
1. escrevo a migração
2. você roda em HOMOLOGAÇÃO
3. eu testo o app apontando para lá
4. deu certo? você roda em PRODUÇÃO
5. refaz a exportação da estrutura
```

Hoje pulamos direto para o passo 4, e foi por sorte somada a cuidado que
nada quebrou. A migração 07, por exemplo, ficou uma semana sem proteger
nada e ninguém percebeu — em homologação isso teria aparecido no mesmo
dia.

---

## O que continua sem solução

**Restaurar um backup ainda é manual.** Se o banco for perdido, alguém
precisa criar um projeto novo, rodar as migrações e importar o `.sql`
gerado. Leva tempo, mas é possível — que é o que importa. Antes de ter o
backup, não era.

**O plano Free não faz backup por conta própria.** O que montamos aqui
substitui isso. No plano Pro (US$ 25/mês) existe backup diário do próprio
Supabase, com restauração por botão — vale a pena quando o piloto virar
produto de verdade.
