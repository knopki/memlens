---
description: "Le plugin DeepSeek Harness de memlens : les deux entrées, le contexte de mémoire, les outils de mémoire, le rappel, le travailleur de compaction et le montage de la console."
kind: "package-reference"
---

# @memlens/dsh-plugin

[English](README.md) | [中文](README.zh.md) | [Deutsch](README.de.md) | [Español](README.es.md) | Français | [日本語](README.ja.md) | [Português](README.pt.md) | [Русский](README.ru.md)

## Résumé

`@memlens/dsh-plugin` donne à chaque agent DeepSeek Harness la mémoire de memlens. Le point d'entrée
hôte ouvre un stockage partagé unique. Il donne à chaque agent actif le contexte de mémoire, les
outils de mémoire et le rappel. Il démarre aussi le travailleur en arrière-plan qui replie les
anciennes notes en lignes de résumé. Le point d'entrée préréglage laisse un préréglage d'agent
choisir son profil de mémoire. Le paquet monte la console dans la page Web du harness, comme panneau
latéral et comme onglet de session.

## Table des matières

- [Utiliser ce paquet](#use-this-package)
- [Comprendre l'implémentation](#understand-the-implementation)
- [Pour aller plus loin](#further-exploration)
- [Expérience du modèle](#model-experience)
- [Limites connues et travail différé](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Utiliser ce paquet

### Installation

Ajoutez le paquet au profil que vous utilisez :

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

L'option `--profile` nomme le profil, par exemple `web` ou `desktop`. La commande transmet le reste
de ses arguments à pnpm dans le répertoire du profil.

Le point d'entrée hôte exige le service LLM, parce que le travailleur envoie les appels de compaction
par ce service. Le point d'entrée hôte déclare le service d'espace de travail comme facultatif.

### Points d'entrée

- Le point d'entrée hôte est le module `@memlens/dsh-plugin`. Le patch du paquet insère la ligne
  `memlens`, et un profil remplace cet id de ligne.
- Le point d'entrée préréglage est le module `@memlens/dsh-plugin/preset`. Un préréglage d'agent le
  monte comme ligne `memlens/preset`.

Le point d'entrée hôte déclare le nom `memlens`, et le point d'entrée préréglage
déclare `memlens/preset`.

#### Ligne hôte

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### Ligne de préréglage

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

Une clé `profile` absente sélectionne le profil `default`.

### Configuration

La table `config` d'une ligne porte les réglages de cette couche. Voici l'exemple de la ligne hôte :

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

Voici l'exemple de la ligne de préréglage :

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

Chaque clé est facultative. Une valeur rejetée donne la couche vide, donc une ligne fautive ne change
aucune session.

Le préréglage remplace le patch du plugin. Le patch du plugin remplace le profil de base. La clé
`profile` du préréglage sélectionne le nom du profil. Le préréglage n'accepte aucune clé de
compaction et aucune clé de stockage.

Le fichier de base est `config.toml` dans le répertoire de configuration de la plateforme. Si le fichier est absent, le
remplacement intégré s'applique : le profil `default`, les portées `*`, les budgets 20 et 10 et la
portée `project:misc`. Une section absente du fichier donne sa valeur par défaut. Un fichier de base
invalide ou illisible garde le stockage fermé, et la session continue.

Le chemin du stockage vient d'abord du patch `store.path`, puis de `MEMLENS_STORE`, puis du fichier
de base.

La compaction en arrière-plan a besoin d'une route de modèle, et le plugin ne choisit jamais de
modèle. Les clés `provider` et `model` de l'exemple donnent cette route. Les identifiants viennent de
la route LLM de votre harness. Un `provider` ou un `model` manquant arrête chaque passe avec l'erreur
`The compaction model is not configured. Set provider and model.`

Consultez chaque clé, sa valeur par défaut et des exemples complets dans
[Configuration](../../docs/configuration.md).

### Règles d'autorité

L'agent principal écrit une note dans le stockage. Un sous-agent enfant écrit une proposition à la
place. Une écriture hors des portées du profil devient une proposition pour un humain. Un `forget`
hors des portées écrit une proposition de masquage.

Un enfant `off` ne reçoit aucun outil de mémoire et aucun contexte de mémoire. Une proposition
d'enfant se collecte sous l'id de session de l'enfant. Le parent reçoit une ligne de rapport pour
chaque proposition quand l'enfant se termine.

Seuls la CLI et la console modifient, expurgent, acceptent et rejettent. Le stockage rejette une
proposition expirée sans humain.

### Version

La version minimale acceptée est DeepSeek Harness `0.2.2-rc.3`. Le manifeste accepte `>=0.2.2-rc.3`.

-----

<a id="understand-the-implementation"></a>
## Comprendre l'implémentation

<details>
<summary>Détails internes de l'implémentation — cliquez pour développer</summary>

Cette section explique comment le plugin tient le stockage et la surface de chaque agent. Lisez
[Utiliser ce paquet](#use-this-package) pour le comportement observable.

### Conception

Le stockage est une base de données SQLite qui garde les notes de chaque session. Le contexte de
mémoire, les outils de mémoire et le rappel utilisent le stockage. Cette section appelle l'ensemble
de ces parties la surface d'un agent. Monter la surface veut dire enregistrer ces parties dans le
contexte d'un agent.

- **Un stockage pour l'hôte.** L'hôte ouvre le stockage une fois et le partage avec chaque agent. Le
  point d'entrée préréglage ajoute des réglages à un préréglage d'agent, et il ne démarre aucun second
  stockage.
- **L'ouverture peut échouer.** Ouvrir le stockage veut dire lire la configuration et se connecter à
  la base de données. Un répertoire absent, un verrou de base de données d'un autre processus ou un
  fichier de configuration invalide arrête l'ouverture. Le plugin garde chaque session, monte la
  surface qui répond des erreurs et essaie l'ouverture de nouveau après une attente. Chaque nouvel
  essai attend plus longtemps que le précédent.
- **La surface de chaque agent.** L'hôte et l'agent possèdent tous deux la surface de l'agent, et
  chaque enregistrement se termine avec le contexte de l'agent. Un sous-agent enfant ne reçoit aucun
  rappel, parce que le rappel demande une écriture de mémoire.
- **Un stockage non ouvert.** Le contexte et les outils répondent des erreurs. Une session sans
  section de contexte enregistrée ne reçoit aucun texte de mémoire, et la surface ne reçoit aucun
  rappel. La console montre l'erreur du stockage.
- **Un stockage qui s'ouvre plus tard.** Le plugin démarre le travailleur et monte la surface de
  nouveau pour chaque agent actif. Une session qui a commencé sur un stockage indisponible reçoit sa
  mémoire plus tard.
- **Un second montage retire d'abord l'ancienne surface.** Les registres de l'hôte rejettent un
  second enregistrement d'un même nom. Un montage échoué se répète avec une seconde entre les essais,
  un petit nombre de fois, donc une défaillance passagère ne coûte aucune surface. Un montage épuisé
  journalise la perte. Le code et le journal de débogage appellent ce second montage un respawn.
- **Le travailleur démarre une passe à un déclencheur.** Une passe démarre quand les plages sales
  atteignent le nombre du lot. Elle démarre aussi quand le temps d'inactivité du stockage expire, et
  dix secondes après le démarrage tant que du travail attend. Le travailleur appelle la route
  configurée, respecte la limite d'appels horaire et enregistre les événements récents dans un
  journal.
- **La console utilise le service Remote.** Le plugin enregistre l'espace de noms de la console
  seulement quand le service Typert est présent. L'onglet lit et écrit alors la mémoire sans route
  HTTP du plugin.

### Carte des sources

| Fichier                  | Rôle                                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `src/index.ts`           | Le point d'entrée hôte : le stockage, le travailleur, la surface de chaque agent, le montage |
| `src/preset.ts`          | Le point d'entrée préréglage : l'enregistrement de la configuration par portée               |
| `src/config.ts`          | Les deux schémas de réglages du harness, avec des feuilles permissives                       |
| `src/service.ts`         | Le stockage partagé et la configuration de chaque préréglage d'agent                         |
| `src/runtime.ts`         | La configuration de base et la portée active d'un répertoire de travail                      |
| `src/memory-context.ts`  | Le contexte de mémoire, la restauration depuis l'historique, le déclencheur d'actualisation  |
| `src/memory-tools.ts`    | Le jeu d'outils de chaque mode d'agent, et le rapport au parent d'un enfant                  |
| `src/nudge.ts`           | Les deux compteurs, la remise à zéro à l'écriture d'une note, et la ligne injectée           |
| `src/worker.ts`          | La passe de compaction, l'appel de modèle par lot, la limite de débit, le journal            |
| `src/tools/*.ts`         | Un schéma, une réponse et un moteur de rendu pour chaque outil de mémoire                    |
| `src/console/*.ts`       | Les lectures de la console, les actions, l'état et le service Remote                         |
| `src/client/*.tsx`       | Le montage du panneau latéral et de l'onglet de session                                      |
| `locale/<language>.json` | Le titre et la description de chaque langue dans la liste des plugins                        |
| `icon.svg`               | L'icône du panneau                                                                           |

Le corps du client vit dans `@memlens/ui`. Ce paquet porte le montage et le service Remote.

</details>

-----

<a id="further-exploration"></a>
## Pour aller plus loin

Ce paquet est l'entrée harness de la mémoire. Lisez ces pages pour l'état qu'il monte.

- [Architecture](../../docs/architecture.md) — le stockage, le contexte, les outils, le travailleur
  et les consoles en un seul endroit.
- [Outils d'agent](../../docs/features/agent-tools.feature) — le comportement des outils de mémoire.
- [Propositions](../../docs/features/proposals.feature) — les modes de sous-agent et le flux de
  proposition.
- [Contexte de mémoire](../../docs/features/memory-context.feature) — l'instantané et ses
  déclencheurs.
- [Rappel](../../docs/features/nudge.feature) — les compteurs et la ligne.
- [Configuration](../../docs/configuration.md) — chaque clé, sa valeur par défaut et l'ordre des
  couches.
- [Prompts](../../docs/prompts.md) — les prompts du produit et la place de chacun.
- [Glossaire](../../docs/glossary.md) — les termes de ce paquet.

-----

<a id="model-experience"></a>
## Expérience du modèle

### Prompt système

#### Ce que le modèle voit

Le plugin enregistre le contexte de mémoire pour chaque agent avec `required: true` et l'ordre 220,
après les contextes d'exécution intégrés. Le harness écrit le texte comme message de contexte
d'exécution, et il écrit un nouveau message seulement quand le texte change.

Le texte est une section `<memory>` avec ces parties :

- `<how-to>` porte le texte de politique et la valeur de `customPromptAppend`. La clé `customPrompt`
  remplace tout le gabarit.
- `<directions>` porte une ligne pour chacune des portées les plus récentes du profil, comme
  `[<key>] <age> <summary>`. Les portées plus anciennes que le budget se joignent en une liste de
  clés.
- `<here>` porte la frontière de la portée active, comme `#<pos> <date> <body>` pour une note et
  `#<a>-<b> <start>..<end> <summary>` pour une plage.

Le texte de politique énonce la forme de l'arbre, les deux outils de lecture et les règles d'une
écriture. Le [contrat de contexte](../../packages/core/src/domain/context.ts) porte le texte, et
[Prompts](../../docs/prompts.md) nomme sa place.

#### Effet sur les jetons

Un coût fixe sur chaque requête qui porte le contexte de mémoire. Le coût croît avec les budgets
`here` et `directions` et avec la valeur de `customPromptAppend`.

#### Effet sur le cache KV

Le texte de mémoire se trouve dans le contexte d'exécution au début de la requête. Il reste le même
pendant les tours d'une session et pendant les écritures de cette session. Cette section est stable
en préfixe pour toute la session.

Le plugin rend le texte de nouveau à une nouvelle session et à une compaction de la conversation par
le harness. Le texte change seulement quand les notes, les budgets ou le prompt personnalisé changent.

### Schémas et résultats des outils

#### Ce que le modèle voit

Les définitions d'outil dans la portée de l'agent, avec les descriptions, les paramètres et les
schémas de réponse de `src/tools`. Le jeu de chaque agent dépend du mode du profil :

| Outil           | Agent principal | Enfant `propose` | Enfant `read` |
| --------------- | --------------- | ---------------- | ------------- |
| `memory_note`   | oui             | oui, proposition | non           |
| `memory_find`   | oui             | oui              | oui           |
| `memory_open`   | oui             | oui              | oui           |
| `memory_map`    | oui             | oui              | oui           |
| `memory_forget` | oui             | non              | non           |
| `memory_review` | oui             | non              | non           |

Un enfant `off` ne reçoit aucun outil et aucun contexte de mémoire.

Chaque appel répond avec un texte rendu. La table donne le texte de chaque outil :

| Outil           | Le texte que le modèle lit                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| `memory_note`   | `saved <addr>`, ou `Proposed to your parent: <body> (proposal <id>)`                                     |
| `memory_find`   | Une ligne pour chaque occurrence, comme `<addr>  <date>  <kind>  <body>`, ou `No hit.`                   |
| `memory_open`   | L'entrée avec sa forme longue, une ligne pour chaque enfant d'une plage, ou `The range holds no record.` |
| `memory_map`    | Une ligne pour chaque portée, ou une ligne pour chaque plage de la frontière                             |
| `memory_forget` | `Done. A target outside the profile waits for a human.`                                                  |
| `memory_review` | Une ligne pour chaque enregistrement dû, ou `reviewed <count> records, next <date>`                      |

#### Effet sur les jetons

Un coût de schéma fixe plus une réponse compacte pour chaque appel. Le rapport au parent ajoute une
ligne pour chaque proposition ouverte d'un enfant quand l'enfant se termine.

#### Effet sur le cache KV

Les schémas sont stables en préfixe tant que le jeu d'outils et le mode du profil restent inchangés.
Un appel et sa réponse s'ajoutent après le préfixe réutilisable.

### Lignes de rappel

#### Ce que le modèle voit

Le plugin compte les appels d'outils et les tours de l'agent principal. Un compteur qui atteint sa
limite injecte une ligne de rôle utilisateur. La ligne porte `{n}`, et le compte prend sa place. Les
textes par défaut sont :

```text
[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
```

La section `[nudge]` de la configuration donne les comptes et les textes. Une limite de zéro ou moins
désactive son compteur.

#### Effet sur les jetons

Une ligne courte à chaque limite atteinte. Une écriture de note ou un rappel remet les deux compteurs
à zéro, donc les lignes restent rares.

#### Effet sur le cache KV

La ligne s'ajoute après le préfixe réutilisable, donc elle n'invalide aucune entrée antérieure.

<a id="known-limitations-and-deferred-work"></a>
## Limites connues et travail différé

Ces limites définissent quand ce paquet convient mal ou demande un soin particulier. Ce sont des
contraintes actuelles du paquet, pas une liste de tâches en attente.

- **La compaction a besoin d'une route configurée.** Une passe sans `provider` ni `model` échoue avec
  « The compaction model is not configured. Set provider and model. » La console montre cette erreur
  dans l'écran de maintenance, et les plages touchées restent sales pour la passe suivante. Voir
  [Configuration](#configure-it).
- **Un second montage a un nombre d'essais borné.** Le plugin retire d'abord l'ancienne surface, puis
  monte de nouveau avec une seconde entre les essais. Un montage épuisé journalise la perte, et
  l'agent reste sans surface jusqu'au déclencheur suivant.
- **Le rappel compte l'agent principal seulement.** Un sous-agent ne reçoit aucun rappel, et rien ne
  l'incite à consigner un constat.
- **La console a besoin du service Typert.** L'espace de noms s'enregistre seulement quand le service
  apparaît. Un profil sans la passerelle Web ne reçoit aucune console, et le plugin ne signale aucune
  erreur.

<a id="dev-note"></a>
### Note de développement

<details>
<summary>Contexte de travail pour les mainteneurs — cliquez pour développer</summary>

Cette note de développement est un contexte de travail pour les mainteneurs. Elle est explicitement
sans autorité.

La console de l'interface graphique du harness ressemble à une partie de `@memlens/ui`, mais la
séparation n'est pas nette. Ce paquet porte le montage, le service Remote, les lectures et les
actions. Le corps du client porte le modèle, le stockage, les écrans et les traductions. Un
changement d'un écran de console touche les deux paquets. Un changement d'un appel de console touche
d'abord `src/console/remote-contract.ts`, parce que les deux faces du Remote lisent les mêmes
descripteurs.

La compilation et les vérifications :

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

La commande `pnpm run verify` à la racine du dépôt lance la compilation et toutes les vérifications.

</details>
