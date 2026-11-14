# @memlens/dsh-plugin

O plugin memlens do DeepSeek Harness.

**Estado:** fase 1. O plugin abre o armazenamento de memória e lê a configuração de cada sessão.
Ainda não dá ferramenta de memória nem contexto de memória.

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

Adicione esta linha à lista `plugins` de uma predefinição de agente. A chave `profile` é obrigatória.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Configuração

O plugin lê o arquivo base `$XDG_CONFIG_HOME/memlens/config.toml`. O plugin não grava esse arquivo. Se
o arquivo não existir, vale a substituição integrada: o perfil `default`, os escopos `*`, os
orçamentos 20 e 10 e o escopo `user:notes`.

O caminho do armazenamento vem primeiro da configuração do plugin, depois de `MEMLENS_STORE`, depois
do arquivo base.

As configurações são mescladas nesta ordem: a predefinição, o patch do plugin, o perfil base. A chave
`profile` da predefinição escolhe o nome do perfil.

O modelo da sessão precisa de pelo menos 65 536 tokens de contexto. O plugin para uma sessão com um
modelo menor.

Os metadados de exibição estão em `locale/<language>.json`. O ícone é `icon.svg`.

## Compilar e testar

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Versão

A versão testada é DeepSeek Harness `0.2.2-rc.3`. O manifesto aceita `>=0.2.1-0`. Uma versão mais
antiga não está verificada.
