# @memlens/dsh-plugin

[English](README.md) | [中文](README.zh.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | Português | [Русский](README.ru.md)

memlens é uma memória de longo prazo para um agente. Um armazenamento SQLite contém as notas, e uma
árvore de resumos fica acima delas. Este pacote dá essa memória aos agentes do DeepSeek Harness. O
[README principal](https://github.com/knopki/memlens/blob/HEAD/README.md) descreve o problema, o
projeto, a CLI e o console.

## Resumo

`@memlens/dsh-plugin` dá a cada agente do DeepSeek Harness a memória do memlens. A entrada do host
abre um armazenamento compartilhado. Ela dá a cada agente ativo o contexto de memória, as ferramentas
de memória e o aviso. Ela também inicia o trabalhador em segundo plano que agrega notas antigas em
linhas de resumo. A entrada de predefinição deixa uma predefinição de agente escolher o seu perfil de
memória. O pacote monta o console na página Web do harness como um painel lateral e uma aba de sessão.

## Sumário

- [Use este pacote](#use-this-package)
- [Entenda a implementação](#understand-the-implementation)
- [Exploração adicional](#further-exploration)
- [Experiência do modelo](#model-experience)
- [Limitações conhecidas e trabalho adiado](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use este pacote

### Instale-o

Adicione o pacote ao perfil que você usa:

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

A opção `--profile` nomeia o perfil, por exemplo `web` ou `desktop`. O comando encaminha o resto dos
seus argumentos para o pnpm no diretório do perfil.

A entrada do host requer o serviço LLM, porque o trabalhador envia as chamadas de compactação por
ele. A entrada do host declara o serviço de workspace como opcional.

### Entradas

- A entrada do host é o módulo `@memlens/dsh-plugin`. O patch do bundle insere a linha `memlens`, e
  um perfil substitui esse id de linha.
- A entrada de predefinição é o módulo `@memlens/dsh-plugin/preset`. Uma predefinição de agente a
  monta como linha `memlens/preset`.

A entrada do host declara o nome `memlens`, e a entrada de predefinição declara `memlens/preset`.

#### Linha do host

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### Linha da predefinição

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

Uma chave `profile` ausente seleciona o perfil `default`.

### Configure-o

A tabela `config` de uma linha contém as configurações dessa camada. O exemplo da linha do host:

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        defaultProfile: work
        budget:
          here: 40
        compaction:
          provider: deepseek-official
          model: deepseek-flash
```

O exemplo da linha da predefinição:

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

Cada chave é opcional. Um valor rejeitado dá a camada vazia, então uma linha errada não muda nenhuma
sessão.

A predefinição substitui o patch do plugin. O patch do plugin substitui o perfil base. A chave
`profile` da predefinição seleciona o nome do perfil. A predefinição não aceita chave de compactação
nem chave de armazenamento.

O arquivo base é `config.toml` no diretório de configuração da plataforma. Se o arquivo estiver ausente, valem os
padrões integrados: o perfil `default`, os escopos `*`, os orçamentos 20 e 10 e o escopo
`project:misc`. Uma seção ausente do arquivo dá o seu valor padrão. Um arquivo base inválido ou
ilegível mantém o armazenamento fechado, e a sessão continua.

O caminho do armazenamento vem primeiro do patch `store.path`, depois de `MEMLENS_STORE`, depois do
arquivo base.

A compactação em segundo plano precisa de uma rota de modelo, e o plugin nunca escolhe um modelo. As
chaves `provider` e `model` do exemplo definem essa rota. Os ids vêm da rota LLM do seu harness. Um
provider ou um model ausente interrompe cada passagem com o erro
`The compaction model is not configured. Set provider and model.`

Veja cada chave, o seu padrão e exemplos completos em [Configuração](../../docs/configuration.md).

### Regras de autoridade

O agente principal escreve uma nota no armazenamento. Um subagente filho escreve uma proposta em vez
disso. Uma escrita fora dos escopos do perfil se torna uma proposta para um humano. Um `forget` fora
dos escopos escreve uma proposta de ocultação.

Um filho `off` não recebe ferramenta de memória nem contexto de memória. Uma proposta de filho se
junta sob o id de sessão do filho. O pai recebe uma linha de relato para cada proposta quando o filho
termina.

Só a CLI e o console emendam, apagam, aceitam e descartam. O armazenamento descarta uma proposta
expirada sem intervenção humana.

### Versão

A versão mínima aceita é DeepSeek Harness `0.2.2-rc.3`. O manifesto aceita `>=0.2.2-rc.3 <0.3.0-0`.

-----

<a id="understand-the-implementation"></a>
## Entenda a implementação

<details>
<summary>Detalhes internos da implementação — clique para expandir</summary>

Esta seção explica como o plugin mantém o armazenamento e a superfície de cada agente. Leia
[Use este pacote](#use-this-package) para o comportamento observável.

### Projeto

O armazenamento é um banco de dados SQLite que mantém as notas de cada sessão. O contexto de memória,
as ferramentas de memória e o aviso usam o armazenamento. Esta seção chama o conjunto dessas partes de
superfície de um agente. Montar a superfície significa registrar essas partes no contexto de um
agente.

- **Um armazenamento para o host.** O host abre o armazenamento uma vez e o compartilha com cada
  agente. A entrada de predefinição adiciona configurações a uma predefinição de agente, e ela não
  inicia um segundo armazenamento.
- **A abertura pode falhar.** Abrir o armazenamento significa ler a configuração e conectar ao banco
  de dados. Um diretório ausente, um bloqueio do banco de outro processo ou um arquivo de
  configuração inválido interrompem a abertura. O plugin mantém cada sessão, monta a superfície que
  responde com erros, e tenta a abertura de novo depois de uma espera. Cada nova tentativa espera mais
  que a última.
- **A superfície de cada agente.** O host e o agente possuem ambos a superfície do agente, e cada
  registro termina com o contexto do agente. Um subagente filho não recebe aviso, porque o aviso pede
  uma escrita de memória.
- **Um armazenamento que não está aberto.** O contexto e as ferramentas respondem com erros. Uma
  sessão sem seção de contexto salva não recebe texto de memória, e a superfície não recebe aviso. O
  console mostra o erro do armazenamento.
- **Um armazenamento que abre depois.** O plugin inicia o trabalhador e monta a superfície de novo
  para cada agente ativo. Uma sessão que começou em um armazenamento indisponível recebe a sua
  memória depois.
- **Uma segunda montagem remove a superfície antiga primeiro.** Os registros do host rejeitam um
  segundo registro de um nome. Uma montagem que falha se repete com um segundo entre as tentativas,
  um número pequeno de vezes, então uma falha transitória não custa superfície. Uma montagem esgotada
  registra a perda. O código e o log de depuração chamam essa segunda montagem de respawn.
- **O trabalhador inicia uma passagem em um gatilho.** Uma passagem começa quando os intervalos sujos
  alcançam a contagem do lote. Ela também começa quando o tempo ocioso do armazenamento expira, e dez
  segundos depois do início enquanto há trabalho esperando. O trabalhador chama a rota configurada,
  mantém o limite horário de chamadas e registra os eventos recentes em um diário.
- **O console usa o serviço Remote.** O plugin registra o namespace do console só quando o serviço
  Typert está presente. A aba então lê e escreve a memória sem rota HTTP do plugin.

### Mapa do código-fonte

| Arquivo                  | Papel                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| `src/index.ts`           | A entrada do host: o armazenamento, o trabalhador, a superfície de cada agente, a montagem |
| `src/preset.ts`          | A entrada de predefinição: o registro da configuração com escopo                           |
| `src/config.ts`          | Os dois esquemas de configuração do harness, com folhas permissivas                        |
| `src/service.ts`         | O armazenamento compartilhado e a configuração de cada predefinição de agente              |
| `src/runtime.ts`         | A configuração base e o escopo ativo de um diretório de trabalho                           |
| `src/memory-context.ts`  | O contexto de memória, a restauração do histórico, o gatilho de atualização                |
| `src/memory-tools.ts`    | O conjunto de ferramentas de cada modo de agente, e o relato ao pai de um filho            |
| `src/nudge.ts`           | Os dois contadores, a reinicialização na escrita de nota, e a linha injetada               |
| `src/worker.ts`          | A passagem de compactação, a chamada de modelo em lote, o limite de taxa, o diário         |
| `src/tools/*.ts`         | Um esquema, uma resposta e um renderizador para cada ferramenta de memória                 |
| `src/console/*.ts`       | As leituras do console, as ações, o status e o serviço Remote                              |
| `src/client/*.tsx`       | A montagem do painel lateral e da aba de sessão                                            |
| `locale/<language>.json` | O título e a descrição de cada idioma na lista de plugins                                  |
| `icon.svg`               | O ícone do painel                                                                          |

O corpo do cliente está em `@memlens/ui`. Este pacote contém a montagem e o serviço Remote.

</details>

-----

<a id="further-exploration"></a>
## Exploração adicional

Este pacote é a entrada do harness da memória. Leia estas páginas para o estado que ele monta.

- [Arquitetura](../../docs/architecture.md) — o armazenamento, o contexto, as ferramentas, o
  trabalhador e os consoles em um só lugar.
- [Ferramentas do agente](../../docs/features/agent-tools.feature) — o comportamento das ferramentas
  de memória.
- [Propostas](../../docs/features/proposals.feature) — os modos de subagente e o fluxo de proposta.
- [Contexto de memória](../../docs/features/memory-context.feature) — o snapshot e os seus gatilhos.
- [Aviso](../../docs/features/nudge.feature) — os contadores e a linha.
- [Configuração](../../docs/configuration.md) — cada chave, o seu padrão e a ordem das camadas.
- [Prompts](../../docs/prompts.md) — os prompts do produto e o lugar de cada um.
- [Glossário](../../docs/glossary.md) — os termos deste pacote.

-----

<a id="model-experience"></a>
## Experiência do modelo

### Prompt do sistema

#### O que o modelo vê

O plugin registra o contexto de memória de cada agente com `required: true` e a ordem 220, depois dos
contextos de runtime integrados. O harness escreve o texto como uma mensagem de contexto de runtime, e
ele escreve uma mensagem nova só quando o texto muda.

O texto é uma seção `<memory>` com estas partes:

- `<how-to>` contém o texto da política e o valor de `customPromptAppend`. A chave `customPrompt`
  substitui o template inteiro.
- `<directions>` contém uma linha para cada um dos escopos mais novos do perfil, como
  `[<key>] <age> <summary>`. Os escopos mais antigos que o orçamento se juntam em uma lista de chaves.
- `<here>` contém a fronteira do escopo ativo, como `#<pos> <date> <body>` para uma nota e
  `#<a>-<b> <start>..<end> <summary>` para um intervalo.

O texto da política declara a forma da árvore, as duas ferramentas de leitura e as regras de uma
escrita. O [contrato de contexto](../../packages/core/src/domain/context.ts) contém o texto, e
[Prompts](../../docs/prompts.md) nomeia o seu lugar.

#### Efeito em tokens

Um custo fixo em cada requisição que contém o contexto de memória. O custo cresce com os orçamentos
`here` e `directions`, e com o valor de `customPromptAppend`.

#### Efeito no cache KV

O texto de memória fica no contexto de runtime no início da requisição. Ele permanece o mesmo nos
turnos de uma sessão e nas escritas dessa sessão. Esta seção é estável no prefixo para a sessão
inteira.

O plugin renderiza o texto de novo em uma sessão nova e em uma compactação da conversa pelo harness.
O texto muda só quando as notas, os orçamentos ou o prompt personalizado mudam.

### Esquemas e resultados das ferramentas

#### O que o modelo vê

As definições de ferramentas no escopo do agente, com as descrições, os parâmetros e os esquemas de
resposta de `src/tools`. O conjunto de cada agente depende do modo do perfil:

| Ferramenta      | Agente principal | Filho `propose` | Filho `read` |
| --------------- | ---------------- | --------------- | ------------ |
| `memory_note`   | sim              | sim, proposta   | não          |
| `memory_find`   | sim              | sim             | sim          |
| `memory_open`   | sim              | sim             | sim          |
| `memory_map`    | sim              | sim             | sim          |
| `memory_forget` | sim              | não             | não          |
| `memory_review` | sim              | não             | não          |

Um filho `off` não recebe ferramenta nem contexto de memória.

Cada chamada responde com um texto renderizado. A tabela dá o texto de cada ferramenta:

| Ferramenta      | O texto que o modelo lê                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `memory_note`   | `saved <addr>`, ou `Proposed to your parent: <body> (proposal <id>)`                                        |
| `memory_find`   | Uma linha para cada acerto, como `<addr>  <date>  <kind>  <body>`, ou `No hit.`                             |
| `memory_open`   | A entrada com o seu texto longo, uma linha para cada filho de um intervalo, ou `The range holds no record.` |
| `memory_map`    | Uma linha para cada escopo, ou uma linha para cada intervalo da fronteira                                   |
| `memory_forget` | `Done. A target outside the profile waits for a human.`                                                     |
| `memory_review` | Uma linha para cada registro vencido, ou `reviewed <count> records, next <date>`                            |

#### Efeito em tokens

Um custo fixo de esquema mais uma resposta compacta para cada chamada. O relato ao pai acrescenta uma
linha para cada proposta aberta de um filho quando o filho termina.

#### Efeito no cache KV

Os esquemas são estáveis no prefixo enquanto o conjunto de ferramentas e o modo do perfil ficam
inalterados. Uma chamada e a sua resposta se acrescentam depois do prefixo reutilizável.

### Linhas do aviso

#### O que o modelo vê

O plugin conta as chamadas de ferramentas e os turnos do agente principal. Um contador que alcança o
seu limite injeta uma linha com o papel de usuário. A linha contém `{n}`, e a contagem toma o seu
lugar. Os textos padrão são:

```text
[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
```

A seção `[nudge]` da configuração define as contagens e os textos. Um limite de zero ou menos
desativa o seu contador.

#### Efeito em tokens

Uma linha curta em cada limite alcançado. Uma escrita de nota ou um aviso zera os dois contadores,
então as linhas continuam raras.

#### Efeito no cache KV

A linha se acrescenta depois do prefixo reutilizável, então ela não invalida nenhuma entrada anterior.

<a id="known-limitations-and-deferred-work"></a>
## Limitações conhecidas e trabalho adiado

Estes limites definem quando este pacote é uma escolha ruim ou precisa de cuidado especial. Eles são
restrições atuais do pacote, não uma lista de tarefas pendentes.

- **A compactação precisa de uma rota configurada.** Uma passagem sem provider ou sem model falha com
  "The compaction model is not configured. Set provider and model." O console mostra esse erro na tela
  de manutenção, e os intervalos afetados ficam sujos para a próxima passagem. Veja
  [Configure-o](#configure-it).
- **Uma segunda montagem tem uma contagem limitada de tentativas.** O plugin remove a superfície
  antiga primeiro e depois monta de novo com um segundo entre as tentativas. Uma montagem esgotada
  registra a perda, e o agente fica sem superfície até o próximo gatilho.
- **O aviso conta só o agente principal.** Um subagente não recebe aviso nem lembrete para registrar
  um achado.
- **O console precisa do serviço Typert.** O namespace se registra só quando o serviço aparece. Um
  perfil sem o gateway Web não recebe console, e o plugin não relata erro.

<a id="dev-note"></a>
### Nota de desenvolvimento

<details>
<summary>Contexto de trabalho para mantenedores — clique para expandir</summary>

Esta nota de desenvolvimento é contexto de trabalho para mantenedores. Ela não tem autoridade
explícita.

O console da GUI do harness parece uma parte de `@memlens/ui`, mas a divisão não é limpa. Este pacote
contém a montagem, o serviço Remote, as leituras e as ações. O corpo do cliente contém o modelo, o
armazenamento, as telas e as traduções. Uma mudança de uma tela do console toca os dois pacotes. Uma
mudança de uma chamada do console toca `src/console/remote-contract.ts` primeiro, porque as duas faces
do Remote leem os mesmos descritores.

A compilação e as verificações:

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

O comando `pnpm run verify` na raiz do repositório executa a compilação e cada verificação.

</details>
