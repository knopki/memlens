# memlens

[English](https://github.com/knopki/memlens/blob/HEAD/README.md) | [中文](https://github.com/knopki/memlens/blob/HEAD/README.zh.md) | [Deutsch](https://github.com/knopki/memlens/blob/HEAD/README.de.md) | [Español](https://github.com/knopki/memlens/blob/HEAD/README.es.md) | [Français](https://github.com/knopki/memlens/blob/HEAD/README.fr.md) | [日本語](https://github.com/knopki/memlens/blob/HEAD/README.ja.md) | Português | [Русский](https://github.com/knopki/memlens/blob/HEAD/README.ru.md)

**Memória de longo prazo para um agente.** O agente começa cada sessão com um mapa do que ele já
sabe. Um arquivo SQLite guarda as notas, e uma árvore de resumos fica acima delas.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/knopki/memlens/HEAD/docs/screenshots/console-overview-dark.png">
  <img src="https://raw.githubusercontent.com/knopki/memlens/HEAD/docs/screenshots/console-overview.png" width="100%" alt="O console do memlens. A barra lateral lista as telas e os escopos. A página mostra sete escopos com as suas contagens, e o trecho montado abaixo deles.">
</picture>

## O problema

Um agente esquece entre sessões. Uma sessão nova começa sem nenhum fato das sessões antigas. Uma
conversa mais longa não é memória: cada token custa, e o modelo ainda perde o começo. A perda
aparece em um projeto que dura semanas: o agente pergunta de novo por uma decisão, e repete um erro
que você já corrigiu.

## A ideia

O memlens mantém um caderno para o agente.

1. O agente escreve uma nota: um fato em 384 caracteres, por exemplo uma decisão ou uma armadilha.
   Uma nota tem um escopo, por exemplo `project:acme/billing`.
2. O armazenamento funde duas notas vizinhas em uma linha. Duas linhas se tornam uma linha de novo.
   Uma linha representa as suas notas por semanas ou anos.
3. No começo da sessão o agente recebe um mapa. O mapa tem uma linha para cada escopo, e a fronteira
   do escopo atual, do intervalo mais antigo até a nota mais nova.
4. O agente abre uma linha de que precisa. Um resumo se abre nas duas linhas abaixo dele. Uma nota
   se abre palavra por palavra, com o seu texto longo.

Uma leitura não custa nenhuma chamada de modelo. Uma nota custa uma chamada de modelo na sua vida,
quando a árvore a mescla.

```mermaid
flowchart LR
  s1[Session 1] -->|memory_note| n[(notes · memlens.db)]
  n -->|compaction| t[tree of summaries]
  t -->|render| m[map in the context]
  m --> s2[Session 2]
  s2 -->|memory_open| t
```

## O que você recebe

- **Um contexto pequeno que continua pequeno.** Você dá ao mapa um orçamento em linhas. Dez notas e
  dez mil notas dão um mapa do mesmo tamanho.
- **Leituras sem chamada de modelo.** `memory_find` usa a busca de texto completo do SQLite.
  `memory_open` lê um registro. O modelo responde só quando a árvore mescla duas notas.
- **Notas, não mensagens.** Cada entrada é um fato, uma decisão, uma preferência, uma tarefa ou uma
  armadilha. O agente faz a curadoria das notas, então o mapa não tem ruído de conversa.
- **Um fato errado é uma edição de uma linha.** O console lista as notas vencidas para revisão. Você
  altera a nota, oculta ela, ou apaga o conteúdo de vez.
- **Um arquivo, sem servidor.** O armazenamento é um arquivo SQLite. O comando `memlens check`
  relata a saúde do arquivo, e `memlens repair` reconstrói os caches a partir dos registros.
- **Cada agente vê os seus próprios escopos.** Um perfil dá um conjunto de escopos e um orçamento.
  Uma leitura ou uma escrita fora do perfil dá um erro, então um projeto não pode ler as notas de
  outro.
- **Três front-ends em um só armazenamento.** O plugin do harness, o terminal e o console do
  navegador leem e escrevem o mesmo arquivo.

## Uma sessão

O mapa é uma seção `<memory>` no contexto do agente. Este exemplo vem de uma memória de sete
escopos. A parte da política e as outras linhas de escopo estão cortadas aqui:

```text
<memory>
…
<directions>
[project:acme/billing] 7d Billing runs an in-house invoice engine behind Stripe, prices in
price_book, and idempotency by invoice id. A trial ends at 23:59 in the customer zone. …
[work:ip] 3d The client pays on the 10th, and the invoice goes out on the 1st. The patent tax
rate is 6 percent, not 13. …
…
</directions>
<here scope="project:acme/billing">
#16-17 2026-09-18..22 The pilot started on 2026-09-15 with 3 customers.; A trial ends at 23:59
in the customer time zone, not in UTC.
#18 2026-09-24 A trial that ends on a Sunday starts dunning on Monday.
#19 2026-09-29 Stripe declines a card on a soft decline for 7 days.
#20 2026-10-02 Write the reconciliation script for the September close.
</here>
</memory>
```

O agente lê o mapa no começo. Ele então busca, abre as linhas de que precisa, e escreve notas novas
conforme o trabalho anda. Um endereço é um escopo e uma posição, por exemplo
`project:acme/billing#19`. O comando `memlens open` dá a nota palavra por palavra, com o seu texto
longo inteiro.

```console
$ memlens find "stripe"
project:acme/billing#19  2026-09-29  fact  Stripe declines a card on a soft decline for 7 days.
project:acme/billing#0  2026-08-04  decision  Stripe is the payment provider, and the invoice engine stays in house.
project:acme/billing#1  2026-08-05  gotcha  Stripe webhook retries arrive out of order, so the handler keys on the event id.
project:acme/billing#7  2026-08-21  decision  Every write to Stripe carries an idempotency key with the invoice id.

$ memlens open project:acme/billing#7
project:acme/billing#7  2026-08-21  decision  review 2027-11-25
Every write to Stripe carries an idempotency key with the invoice id.
--- longform 461 chars ---
# Idempotency on every Stripe write
…
```

## Use no DeepSeek Harness

O mapa e as ferramentas chegam ao agente pelo plugin. O armazenamento sozinho não dá nada a um
agente. Adicione o plugin ao perfil do host:

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

O plugin dá ao harness cinco partes:

- **O mapa.** A sessão começa com a seção `<memory>` do perfil.
- **As ferramentas.** O agente lê, escreve e revisa as notas com elas.
- **O aviso.** Depois de 10 chamadas de ferramentas ou 10 turnos, o harness lembra o agente de
  salvar uma nota.
- **O trabalhador.** O trabalhador mescla os intervalos sujos por uma rota de modelo do harness.
- **O console.** O mesmo cliente abre no painel lateral e em uma aba de sessão.

### As ferramentas

| Ferramenta      | Ação                                                                  |
| --------------- | --------------------------------------------------------------------- |
| `memory_find`   | Busca por palavras, com um limite por data, tipo ou escopo.           |
| `memory_open`   | Abre uma nota pelo seu endereço, ou um resumo nas duas linhas abaixo. |
| `memory_note`   | Salva uma nota.                                                       |
| `memory_map`    | Lista os escopos, ou dá a fronteira de um escopo.                     |
| `memory_review` | Dá as notas vencidas para revisão, ou as marca como revisadas.        |
| `memory_forget` | Oculta uma nota. A posição e o conteúdo ficam, e a nota sai do mapa.  |

A ferramenta `memory_note` também responde a uma repetição: uma escrita que coincide com uma nota
viva dá essa nota, não um segundo registro. Um subagente escreve uma proposta em vez de uma nota
viva, e um humano aceita a proposta no console. O modo padrão de um subagente é `propose`. O modo
`read` dá só as ferramentas de leitura, e o modo `off` não dá memória.

### As duas entradas

O pacote tem duas entradas. Um perfil monta a linha do host, e uma predefinição de agente monta a
linha da predefinição:

| Linha            | Pacote                       | Papel                                                                        |
| ---------------- | ---------------------------- | ---------------------------------------------------------------------------- |
| `memlens`        | `@memlens/dsh-plugin`        | O armazenamento, as ferramentas, o mapa, o aviso e o trabalhador.            |
| `memlens/preset` | `@memlens/dsh-plugin/preset` | O perfil de memória de uma predefinição de agente: os escopos e o orçamento. |

Uma predefinição de agente monta a linha da predefinição para escolher o seu próprio perfil e
orçamento. Sem a linha, o agente usa o perfil que `defaultProfile` nomeia.

A compactação precisa de uma rota de modelo, e o plugin nunca escolhe um modelo. As chaves
`provider` e `model` da linha do host dão essa rota:

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        compaction:
          provider: deepseek-official
          model: deepseek-flash
```

O plugin lê o mesmo `config.toml` que a CLI. A linha do plugin substitui o arquivo base, e a linha
da predefinição substitui a linha do plugin. Veja cada chave, o seu padrão e exemplos em
[packages/dsh-plugin/README.md](https://github.com/knopki/memlens/blob/HEAD/packages/dsh-plugin/README.md).

## Use no terminal

```sh
npm install -g @memlens/cli
```

A instalação dá o binário `memlens`. Escreva uma nota, busque ela, e leia o mapa:

```sh
memlens note "The billing database is Postgres 16." --scope project:acme/billing
memlens find "database"
memlens slice
```

O comando `npx @memlens/cli@latest` executa o mesmo binário sem instalação:

```sh
npx @memlens/cli@latest find "database"
```

O armazenamento é um arquivo `memlens.db` no diretório de dados da plataforma. A opção `--store` e a
variável `MEMLENS_STORE` selecionam outro diretório. A CLI e o plugin usam o mesmo armazenamento,
então o terminal lê as notas de uma sessão viva.

## O console

```sh
memlens ui
```

O console abre em `http://127.0.0.1:7788`. Ele mostra os escopos, a árvore de um escopo, a busca de
texto completo, a fila de revisão, as propostas de subagentes e o diário do trabalhador.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/knopki/memlens/HEAD/docs/screenshots/console-review-dark.png">
  <img src="https://raw.githubusercontent.com/knopki/memlens/HEAD/docs/screenshots/console-review.png" width="100%" alt="A tela Revisão do console. Uma tabela de notas com o endereço, o texto, o tipo e a data de revisão. Cada linha tem as ações Revisada, Alterar, Substituir, Ocultar e Excluir.">
</picture>

O mesmo cliente abre dentro do DeepSeek Harness, como um painel lateral e uma aba de sessão.

## Os comandos

| Comando           | Ação                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `memlens note`    | Salva uma nota.                                                    |
| `memlens find`    | Busca as notas por palavras.                                       |
| `memlens open`    | Lê uma nota, ou as duas linhas abaixo de um resumo.                |
| `memlens slice`   | Imprime o mapa que o agente recebe.                                |
| `memlens review`  | Lista as notas vencidas, ou as marca como revisadas.               |
| `memlens compact` | Inicia uma construção de árvore, ou aplica um arquivo de resposta. |
| `memlens ui`      | Inicia o console.                                                  |

A CLI também dá `amend`, `forget`, `restore`, `redact`, `move`, `import`, `export`, `check`,
`repair`, `journal` e `status`. Veja [docs/architecture.md](https://github.com/knopki/memlens/blob/HEAD/docs/architecture.md).

## Configuração

O memlens funciona sem arquivo de configuração. Para mudar um valor, copie as partes que você quer
para o arquivo base:

| Plataforma | Arquivo de configuração                             | Arquivo de armazenamento                           |
| ---------- | --------------------------------------------------- | -------------------------------------------------- |
| Linux      | `~/.config/memlens/config.toml`                     | `~/.local/share/memlens/memlens.db`                |
| macOS      | `~/Library/Application Support/memlens/config.toml` | `~/Library/Application Support/memlens/memlens.db` |
| Windows    | `%APPDATA%\memlens\config.toml`                     | `%LOCALAPPDATA%\memlens\memlens.db`                |

Um `XDG_CONFIG_HOME` ou `XDG_DATA_HOME` absoluto substitui os caminhos do Linux.

```toml
defaultProfile = "default"

[profile.default]
scopes = ["*"]

[profile.default.budget]
here = 20
directions = 10
```

A chave `here` dá as linhas do escopo atual. A chave `directions` dá as linhas da lista de escopos.
O plugin do DSH lê o mesmo arquivo e acrescenta duas camadas próprias. O comando
`memlens config show` imprime os valores resolvidos, e ele não escreve nenhum arquivo. Veja cada
chave, o seu padrão e exemplos em [docs/configuration.md](https://github.com/knopki/memlens/blob/HEAD/docs/configuration.md).

## Por que não um registro de conversa

| Necessidade       | Um histórico de conversa                   | Um armazenamento vetorial        | memlens                                            |
| ----------------- | ------------------------------------------ | -------------------------------- | -------------------------------------------------- |
| Custo de contexto | Cresce com a conversa                      | Alguns trechos para uma consulta | Uma linha para cada escopo, dentro de um orçamento |
| Recuperação       | As palavras exatas, até o modelo as perder | Texto parecido, sem ordem        | As palavras exatas por endereço, com uma data      |
| Curadoria         | Nenhuma                                    | Nenhuma                          | O agente escreve, e você revisa                    |
| Um fato errado    | Fica no registro                           | Fica no índice                   | Você oculta ou apaga o conteúdo                    |

O memlens não mantém embeddings nem índice vetorial. A busca continua lexical (SQLite FTS5), e uma
nota é um fato curado. O armazenamento não precisa de servidor, de rede nem de GPU.

## Situação

A biblioteca central, a CLI, o console e o plugin do DSH estão prontos, e as verificações do
repositório passam. A compactação precisa de um modelo: o plugin envia as chamadas de mesclagem pelo
harness, e a CLI espera um arquivo de resposta de `memlens compact`.

O código-fonte está no [GitHub](https://github.com/knopki/memlens). Veja [AGENTS.md](https://github.com/knopki/memlens/blob/HEAD/AGENTS.md) para
a compilação, os testes e as regras de trabalho do repositório.

## Documentos

| Arquivo                                                        | Conteúdo                                   |
| -------------------------------------------------------------- | ------------------------------------------ |
| [docs/architecture.md](https://github.com/knopki/memlens/blob/HEAD/docs/architecture.md)                   | Como o sistema funciona.                   |
| [docs/configuration.md](https://github.com/knopki/memlens/blob/HEAD/docs/configuration.md)                 | O formato de configuração e exemplos.      |
| [packages/dsh-plugin/README.md](https://github.com/knopki/memlens/blob/HEAD/packages/dsh-plugin/README.md) | O plugin do DeepSeek Harness.              |
| [docs/features](https://github.com/knopki/memlens/blob/HEAD/docs/features/README.md)                       | Comportamento entre módulos como cenários. |
| [docs/arch/README.md](https://github.com/knopki/memlens/blob/HEAD/docs/arch/README.md)                     | O modelo de arquitetura como diagramas.    |
| [AGENTS.md](https://github.com/knopki/memlens/blob/HEAD/AGENTS.md)                                         | Regras de trabalho para agentes.           |

## Licença

MIT. Veja [LICENSE](https://github.com/knopki/memlens/blob/HEAD/LICENSE).
