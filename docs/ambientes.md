# Produção, homologação e backup — o guia

Escrito em 09/09/2026. Reescrito em 29/09/2026, quando a homologação foi
criada e o backup foi para o computador do Leandro.

---

## Os dois bancos

| | Produção | Homologação |
|---|---|---|
| Projeto | `rtisqipntpnvlhetfoeb` | `iswndjsgpdiuoxfnnwux` |
| Nome no Supabase | Loen Soluções | Loen Soluções - Homologação |
| Dados | reais | só de teste — pode quebrar, pode apagar |
| Quem usa | `app.loenstudiocriativo.com.br` e `leoof7.github.io` | o app aberto em qualquer outro endereço (localhost, rede local) |

O app escolhe sozinho pelo endereço (`config.js`, função
`ambienteAtual`). Fora de produção aparece uma **faixa listrada no topo**.

Os dois ficam na organização "Loen Soluções" (plano grátis: 2 projetos).

### Como a homologação foi montada

1. A estrutura inteira da produção foi lida com
   `docs/gerar-estrutura-completa.sql` e salva em
   `docs/migracoes/00-estrutura-completa.sql` — tabelas, regras de
   acesso, funções, gatilhos, permissões e pastas de fotos. **Sem dado
   nenhum.**
2. Esse `00` rodou no projeto novo, depois a migração `17`.
3. As funções `entrar-com-email` e `recuperar-senha` foram publicadas lá
   também. A `recuperar-senha` só manda e-mail se os segredos
   `RESEND_API_KEY` e `REMETENTE` forem cadastrados na homologação.

### Ajuste que só dá para fazer no painel

Na homologação: **Authentication → Sign In / Providers → Email →
desligar "Confirm email"** (igual à produção). Sem isso, o cadastro
recusa o e-mail interno `...@celular.loen.invalid`.

### A regra daqui em diante

```
1. escrevo a migração (arquivo numerado em docs/migracoes/)
2. roda em HOMOLOGAÇÃO e eu testo o app apontando para lá
3. deu certo? backup da produção, depois roda em PRODUÇÃO
4. de tempos em tempos, gerar o 00 de novo
```

---

## Backup

### Como funciona

O **Agendador de Tarefas do Windows** roda `backup-agendado.ps1` todo dia
às 9h. Se o PC estiver desligado, roda quando ele ligar.

- Copia **todas** as tabelas e a lista de logins para `backups\` (na
  pasta do projeto) e para `OneDrive\Backups\Loen Solucoes` (nuvem).
- Confere sozinho se apareceu tabela nova que a lista não conhece.
- Guarda **30 dias** e apaga as cópias mais velhas — só depois de um
  backup que deu certo. É o que a Política de Privacidade promete.
- Se falhar, cria o arquivo **"BACKUP LOEN FALHOU - leia.txt"** na Área
  de Trabalho. O detalhe fica em `backups\ultimo-backup.log`.

A chave secreta fica no cofre do Windows (`.chave-supabase`), que só a
conta do Leandro neste PC consegue abrir. Nunca vai para o git.

### Ligar pela primeira vez (uma vez só)

No PowerShell, dentro da pasta do projeto:

1. `.\guardar-chave.ps1` — cole a chave secreta (Supabase → Project
   Settings → API Keys → Secret keys → `default` → olho → copiar).
2. `.\agendar-backup.ps1` — cria a tarefa e já roda o primeiro backup.

**Se a pasta do projeto mudar de nome ou de lugar, rode
`.\agendar-backup.ps1` de novo.** A tarefa guarda o caminho.

### O robô do GitHub fica DESLIGADO

`.github/workflows/backup.yml` existe, mas **não deve receber a chave**.
O repositório é público, e em repositório público qualquer pessoa logada
no GitHub baixa os arquivos que o robô guarda — seriam os dados dos
participantes. Para desligar: GitHub → repositório → **Actions** →
"Backup do banco" → **⋯** → **Disable workflow**.

### Restaurar

Projeto novo → rodar `00-estrutura-completa.sql` e as migrações
seguintes → recriar os logins com o mesmo `id` a partir do
`..._logins.json` (a tabela `perfis` depende deles) → rodar o
`..._dados.sql`. O backup não guarda senha: cada pessoa cria uma nova
pelo "Esqueci minha senha". **Ainda não foi ensaiado** — ensaiar na
homologação antes de precisar de verdade.

O plano Pro do Supabase (US$ 25/mês) tem backup próprio com restauração
por botão — vale quando o app tiver gente pagando.

---

## O domínio

O app está em `app.loenstudiocriativo.com.br` (GitHub Pages, arquivo
`CNAME`; no Cloudflare, registro CNAME `app` → `leoof7.github.io`, só
DNS). A página `loenstudiocriativo.com.br/solucoes` leva para ele.
