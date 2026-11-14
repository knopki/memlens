# @memlens/dsh-plugin

Le plugin DeepSeek Harness de memlens.

**État :** étapes 1 à 4. Le plugin ouvre le stockage de mémoire, donne à chaque agent son contexte de
mémoire, ses outils de mémoire et le rappel, et exécute la compaction en arrière-plan. La console du
plugin reste hors de ce paquet.

## Surface de mémoire

Le plugin enregistre un contexte d'exécution pour chaque agent. Le contexte garde la tranche de
mémoire et reste stable entre les déclencheurs acceptés : une nouvelle session, une compaction
réussie du harness et un temps d'inactivité au-dessus du TTL du modèle.

Le plugin enregistre ces outils dans le contexte de chaque agent :

| Outil         | Agent principal | Enfant (proposition) | Enfant (lecture) |
| ------------- | --------------- | -------------------- | ---------------- |
| memory_note   | oui             | oui, proposition     | non              |
| memory_find   | oui             | oui                  | oui              |
| memory_open   | oui             | oui                  | oui              |
| memory_map    | oui             | oui                  | oui              |
| memory_forget | oui             | non                  | non              |
| memory_review | oui             | non                  | non              |

Un enfant `off` ne reçoit aucun outil de mémoire et aucun contexte de mémoire. Une proposition
d'enfant se collecte sous l'id de session de l'enfant, et le parent reçoit une ligne de rapport par
proposition quand l'enfant se termine.

Le rappel compte les appels d'outils et les tours de l'agent principal. Une limite atteinte injecte
une ligne, et une écriture de note ou un rappel remet les deux compteurs à zéro.

Le travailleur en arrière-plan lance une compaction au seuil de salissure et à la limite
d'inactivité du stockage. Le travailleur appelle la route LLM configurée et respecte ses limites
d'appels.

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

La version testée est DeepSeek Harness `0.2.2-rc.3`. Le manifeste accepte `>=0.2.1-0`. Un contrôle de
chargement de `0.2.1-rc.5` passe : le plugin enregistre son service et le libère proprement. La
surface de mémoire complète n'a des tests que sur `0.2.2-rc.3`.
