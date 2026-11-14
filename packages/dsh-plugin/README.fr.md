# @memlens/dsh-plugin

Le plugin DeepSeek Harness de memlens.

**État :** étape 1. Le plugin ouvre le stockage de mémoire et lit la configuration de chaque session.
Il ne donne encore ni outil de mémoire ni contexte de mémoire.

## Points d'entrée

- Le point d'entrée hôte `@memlens/dsh-plugin` a le nom de plugin `dsh-memlens`. Le patch du paquet
  insère la ligne `memlens`.
- Le point d'entrée préréglage `@memlens/dsh-plugin/preset` a le nom de plugin `memlens/preset`. Un
  préréglage d'agent le charge avec la clé `profile`.

### Ligne hôte

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### Ligne de préréglage

Ajoutez cette ligne à la liste `plugins` d'un préréglage d'agent. La clé `profile` est obligatoire.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Configuration

Le plugin lit le fichier de base `$XDG_CONFIG_HOME/memlens/config.toml`. Le plugin n'écrit pas ce
fichier. Si le fichier est absent, le remplacement intégré s'applique : le profil `default`, les
portées `*`, les budgets 20 et 10 et la portée `user:notes`.

Le chemin du stockage vient d'abord de la configuration du plugin, puis de `MEMLENS_STORE`, puis du
fichier de base.

Les réglages sont fusionnés dans cet ordre : le préréglage, le patch du plugin, le profil de base. La
clé `profile` du préréglage choisit le nom du profil.

Le modèle de la session a besoin d'au moins 65 536 jetons de contexte. Le plugin arrête une session
avec un modèle plus petit.

Les métadonnées d'affichage sont dans `locale/<language>.json`. L'icône est `icon.svg`.

## Compilation et tests

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Version

La version testée est DeepSeek Harness `0.2.2-rc.3`. Le manifeste accepte `>=0.2.1-0`. Une version
plus ancienne n'est pas vérifiée.
