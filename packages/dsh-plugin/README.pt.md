# @memlens/dsh-plugin

O plugin memlens do DeepSeek Harness.

**Estado:** fases 1 a 4. O plugin abre o armazenamento de memória, dá a cada agente o seu contexto de
memória, as suas ferramentas de memória e o aviso, e executa a compactação em segundo plano. O
console do plugin fica fora deste pacote.

## Superfície de memória

O plugin registra um contexto de execução para cada agente. O contexto mantém a fatia de memória e
fica estável entre os gatilhos aceitos: uma sessão nova, uma compactação bem-sucedida do harness e um
tempo ocioso acima do TTL do modelo.

O plugin registra estas ferramentas no contexto de cada agente:

| Ferramenta    | Agente principal | Filho (proposta) | Filho (leitura) |
| ------------- | ---------------- | ---------------- | --------------- |
| memory_note   | sim              | sim, proposta    | não             |
| memory_find   | sim              | sim              | sim             |
| memory_open   | sim              | sim              | sim             |
| memory_map    | sim              | sim              | sim             |
| memory_forget | sim              | não              | não             |
| memory_review | sim              | não              | não             |

Um filho `off` não recebe ferramenta de memória nem contexto de memória. Uma proposta de um filho se
junta sob o id de sessão do filho, e o pai recebe uma linha de relato por proposta quando o filho
termina.

O aviso conta as chamadas de ferramentas e os turnos do agente principal. Um limite atingido injeta
uma linha, e uma gravação de nota ou um aviso zera os dois contadores.

O trabalhador em segundo plano inicia uma compactação no limite de sujeira e no limite ocioso do
armazenamento. O trabalhador chama a rota LLM configurada e mantém os seus limites de chamadas.

## Entradas

- A entrada do host `@memlens/dsh-plugin` tem o nome de plugin `dsh-memlens`. O patch do pacote
  insere a linha `memlens`.
- A entrada de predefinição `@memlens/dsh-plugin/preset` tem o nome de plugin `memlens/preset`. Uma
  predefinição de agente a carrega com a chave `profile`.

### Linha do host

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### Linha da predefinição

Adicione esta linha à lista `plugins` de uma predefinição de agente. A chave `profile` é opcional.
Sem a chave, aplica-se o perfil `default`.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Configuração

O plugin lê o arquivo base `$XDG_CONFIG_HOME/memlens/config.toml`. O plugin não grava esse arquivo. Se
o arquivo não existir, vale a substituição integrada: o perfil `default`, os escopos `*`, os
orçamentos 20 e 10 e o escopo `project:misc`.

O caminho do armazenamento vem primeiro da configuração do plugin, depois de `MEMLENS_STORE`, depois
do arquivo base.

As configurações são mescladas nesta ordem: a predefinição, o patch do plugin, o perfil base. A chave
`profile` da predefinição escolhe o nome do perfil.

Os metadados de exibição estão em `locale/<language>.json`. O ícone é `icon.svg`.

## Compilar e testar

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Versão

A versão mínima aceita é DeepSeek Harness `0.2.2-rc.3`. O manifesto aceita `>=0.2.2-rc.3`.
