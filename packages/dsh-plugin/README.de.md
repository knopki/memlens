---
description: "Das DeepSeek-Harness-Plugin von memlens: die zwei Einstiegspunkte, der Speicherkontext, die Speicherwerkzeuge, der Hinweis, der Verdichtungs-Worker und die Montage der Konsole."
kind: "package-reference"
---

# @memlens/dsh-plugin

[English](README.md) | [中文](README.zh.md) | Deutsch | [Español](README.es.md) | [Français](README.fr.md) | [日本語](README.ja.md) | [Português](README.pt.md) | [Русский](README.ru.md)

## Übersicht

`@memlens/dsh-plugin` gibt jedem Agenten von DeepSeek Harness den Speicher von memlens. Der
Host-Einstiegspunkt öffnet einen gemeinsamen Speicher. Er gibt jedem laufenden Agenten den
Speicherkontext, die Speicherwerkzeuge und den Hinweis. Er startet auch den Hintergrund-Worker, der
alte Notizen zu Zusammenfassungszeilen zusammenfasst. Der Preset-Einstiegspunkt lässt ein
Agent-Preset sein Speicherprofil wählen. Das Paket montiert die Konsole als Seitenleiste und als
Sitzungs-Tab in die Webseite des Harness.

## Inhaltsverzeichnis

- [Dieses Paket verwenden](#use-this-package)
- [Die Implementierung verstehen](#understand-the-implementation)
- [Weiterführende Seiten](#further-exploration)
- [Modellerfahrung](#model-experience)
- [Bekannte Grenzen und zurückgestellte Arbeit](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Dieses Paket verwenden

### Installieren

Füge das Paket dem Profil hinzu, das du verwendest:

```sh
dsh plugin --profile web add @memlens/dsh-plugin
```

Die Option `--profile` nennt das Profil, zum Beispiel `web` oder `desktop`. Der Befehl reicht die
übrigen Argumente im Profilordner an pnpm weiter.

Der Host-Einstiegspunkt braucht den LLM-Dienst, weil der Worker die Verdichtungsaufrufe über ihn
sendet. Der Host-Einstiegspunkt deklariert den Workspace-Dienst als optional.

### Einstiegspunkte

- Der Host-Einstiegspunkt ist das Modul `@memlens/dsh-plugin`. Der Bundle-Patch fügt die Zeile
  `memlens` ein, und ein Profil überschreibt diese Zeilen-ID.
- Der Preset-Einstiegspunkt ist das Modul `@memlens/dsh-plugin/preset`. Ein Agent-Preset montiert es
  als Zeile `memlens/preset`.

Der Host-Einstiegspunkt deklariert den Namen `memlens`, und der Preset-Einstiegspunkt
deklariert `memlens/preset`.

#### Host-Zeile

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

#### Preset-Zeile

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
```

Ein fehlender Schlüssel `profile` wählt das Profil `default`.

### Konfigurieren

Die Tabelle `config` einer Zeile enthält die Einstellungen dieser Ebene. Das Beispiel der
Host-Zeile:

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

Das Beispiel der Preset-Zeile:

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

Jeder Schlüssel ist optional. Ein abgelehnter Wert ergibt die leere Ebene, also ändert eine
fehlerhafte Zeile keine Sitzung.

Das Preset überschreibt den Plugin-Patch. Der Plugin-Patch überschreibt das Basisprofil. Der
Preset-Schlüssel `profile` wählt den Profilnamen. Das Preset akzeptiert keinen Verdichtungsschlüssel
und keinen Speicherschlüssel.

Die Basisdatei ist `config.toml` im Konfigurationsverzeichnis der Plattform. Wenn die Datei fehlt, gilt der eingebaute
Ersatz: das Profil `default`, die Scopes `*`, die Budgets 20 und 10 und der Scope `project:misc`.
Ein fehlender Abschnitt der Datei ergibt seinen Standardwert. Eine ungültige oder unlesbare
Basisdatei hält den Speicher geschlossen, und die Sitzung läuft weiter.

Der Speicherpfad kommt zuerst aus dem Patch `store.path`, dann aus `MEMLENS_STORE`, dann aus der
Basisdatei.

Die Hintergrundverdichtung braucht eine Modellroute, und das Plugin wählt nie ein Modell. Die
Schlüssel `provider` und `model` des Beispiels ergeben diese Route. Die IDs kommen aus der
LLM-Route deines Harness. Ein fehlender Provider oder ein fehlendes Modell stoppt jeden Durchlauf
mit dem Fehler `The compaction model is not configured. Set provider and model.`

Jeder Schlüssel, sein Standardwert und vollständige Beispiele stehen in
[Konfiguration](../../docs/configuration.md).

### Zuständigkeitsregeln

Der Hauptagent schreibt eine Notiz in den Speicher. Ein Kind-Subagent schreibt stattdessen einen
Vorschlag. Ein Schreibvorgang außerhalb der Profil-Scopes wird ein Vorschlag für einen Menschen. Ein
`forget` außerhalb der Scopes schreibt einen Vorschlag zum Verbergen.

Ein Kind mit `off` bekommt kein Speicherwerkzeug und keinen Speicherkontext. Ein Vorschlag eines
Kindes sammelt sich unter der Sitzungs-ID des Kindes. Der Elternteil bekommt eine Berichtszeile für
jeden Vorschlag, wenn das Kind endet.

Nur die CLI und die Konsole ändern, schwärzen, nehmen an und verwerfen. Der Speicher verwirft einen
abgelaufenen Vorschlag ohne Menschen.

### Version

Die niedrigste akzeptierte Version ist DeepSeek Harness `0.2.2-rc.3`. Das Manifest akzeptiert
`>=0.2.2-rc.3`.

-----

<a id="understand-the-implementation"></a>
## Die Implementierung verstehen

<details>
<summary>Interne Implementierung – zum Aufklappen klicken</summary>

Dieser Abschnitt erklärt, wie das Plugin den Speicher und die Oberfläche jedes Agenten hält. Lies
[Dieses Paket verwenden](#use-this-package) für das beobachtbare Verhalten.

### Aufbau

Der Speicher ist eine SQLite-Datenbank, die die Notizen jeder Sitzung enthält. Der Speicherkontext,
die Speicherwerkzeuge und der Hinweis nutzen den Speicher. Dieser Abschnitt nennt die Menge dieser
Teile die Oberfläche eines Agenten. Die Oberfläche montieren heißt, diese Teile im Kontext eines
Agenten zu registrieren.

- **Ein Speicher für den Host.** Der Host öffnet den Speicher einmal und teilt ihn mit jedem Agenten.
  Der Preset-Einstiegspunkt fügt Einstellungen zu einem Agent-Preset hinzu, und er startet keinen
  zweiten Speicher.
- **Das Öffnen kann fehlschlagen.** Den Speicher öffnen heißt, die Konfiguration zu lesen und sich
  mit der Datenbank zu verbinden. Ein fehlender Ordner, eine Datenbanksperre eines anderen
  Prozesses oder eine ungültige Konfigurationsdatei stoppt das Öffnen. Das Plugin hält jede Sitzung,
  montiert die Oberfläche, die Fehler beantwortet, und versucht das Öffnen nach einer Wartezeit
  erneut. Jeder neue Versuch wartet länger als der letzte.
- **Die Oberfläche jedes Agenten.** Der Host und der Agent besitzen beide die Oberfläche des
  Agenten, und jede Registrierung endet mit dem Agentenkontext. Ein Kind-Subagent bekommt keinen
  Hinweis, weil der Hinweis einen Speicherschreibvorgang verlangt.
- **Ein Speicher, der nicht offen ist.** Der Kontext und die Werkzeuge beantworten Fehler. Eine
  Sitzung ohne gespeicherten Kontextabschnitt bekommt keinen Speichertext, und die Oberfläche
  bekommt keinen Hinweis. Die Konsole zeigt den Fehler des Speichers.
- **Ein Speicher, der später öffnet.** Das Plugin startet den Worker und montiert die Oberfläche für
  jeden laufenden Agenten erneut. Eine Sitzung, die auf einem nicht verfügbaren Speicher begann,
  bekommt ihren Speicher später.
- **Eine zweite Montage entfernt zuerst die alte Oberfläche.** Die Register des Hosts weisen eine
  zweite Registrierung eines Namens ab. Eine fehlgeschlagene Montage wiederholt sich mit einer
  Sekunde Abstand, eine kleine Zahl von Malen, also kostet ein vorübergehender Fehler keine
  Oberfläche. Eine Montage, die alle Versuche verbraucht, protokolliert den Verlust. Der Code und das
  Debug-Log nennen diese zweite Montage einen Respawn.
- **Der Worker startet einen Durchlauf an einem Auslöser.** Ein Durchlauf startet, wenn die
  schmutzigen Bereiche die Batch-Anzahl erreichen. Er startet auch, wenn die Leerlaufzeit des
  Speichers abläuft, und zehn Sekunden nach dem Start, während Arbeit wartet. Der Worker ruft die
  konfigurierte Route auf, hält das stündliche Aufruflimit ein und schreibt die letzten Ereignisse in
  ein Journal.
- **Die Konsole nutzt den Remote-Dienst.** Das Plugin registriert den Konsolen-Namespace nur, wenn
  der Typert-Dienst vorhanden ist. Der Tab liest und schreibt den Speicher dann ohne HTTP-Route des
  Plugins.

### Dateiübersicht

| Datei                    | Rolle                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| `src/index.ts`           | Der Host-Einstiegspunkt: der Speicher, der Worker, die Oberfläche jedes Agenten, die Montage |
| `src/preset.ts`          | Der Preset-Einstiegspunkt: die Registrierung der Konfiguration je Scope                      |
| `src/config.ts`          | Die zwei Einstellungsschemata des Harness, mit nachsichtigen Blättern                        |
| `src/service.ts`         | Der gemeinsame Speicher und die Konfiguration jedes Agent-Presets                            |
| `src/runtime.ts`         | Die Basiskonfiguration und der aktive Scope eines Arbeitsordners                             |
| `src/memory-context.ts`  | Der Speicherkontext, die Wiederherstellung aus der Historie, der Aktualisierungsauslöser     |
| `src/memory-tools.ts`    | Die Werkzeugmenge jedes Agentenmodus und der Bericht an den Elternteil                       |
| `src/nudge.ts`           | Die zwei Zähler, der Reset beim Notizschreiben und die eingefügte Zeile                      |
| `src/worker.ts`          | Der Verdichtungsdurchlauf, der Batch-Modellaufruf, das Ratenlimit, das Journal               |
| `src/tools/*.ts`         | Ein Schema, eine Antwort und ein Renderer für jedes Speicherwerkzeug                         |
| `src/console/*.ts`       | Die Lesezugriffe der Konsole, die Aktionen, der Status und der Remote-Dienst                 |
| `src/client/*.tsx`       | Die Montage der Seitenleiste und des Sitzungs-Tabs                                           |
| `locale/<language>.json` | Der Titel und die Beschreibung jeder Sprache in der Plugin-Liste                             |
| `icon.svg`               | Das Symbol der Leiste                                                                        |

Der Client-Teil liegt in `@memlens/ui`. Dieses Paket hält die Montage und den Remote-Dienst.

</details>

-----

<a id="further-exploration"></a>
## Weiterführende Seiten

Dieses Paket ist der Harness-Einstiegspunkt des Speichers. Lies diese Seiten für den Zustand, den es
montiert.

- [Architektur](../../docs/architecture.md) – der Speicher, der Kontext, die Werkzeuge, der Worker
  und die Konsolen an einem Ort.
- [Agent-Werkzeuge](../../docs/features/agent-tools.feature) – das Verhalten der Speicherwerkzeuge.
- [Vorschläge](../../docs/features/proposals.feature) – die Subagent-Modi und der Ablauf der
  Vorschläge.
- [Speicherkontext](../../docs/features/memory-context.feature) – der Schnappschuss und seine
  Auslöser.
- [Hinweis](../../docs/features/nudge.feature) – die Zähler und die Zeile.
- [Konfiguration](../../docs/configuration.md) – jeder Schlüssel, sein Standardwert und die
  Reihenfolge der Ebenen.
- [Prompts](../../docs/prompts.md) – die Prompts des Produkts und der Ort jedes einzelnen.
- [Glossar](../../docs/glossary.md) – die Begriffe dieses Pakets.

-----

<a id="model-experience"></a>
## Modellerfahrung

### System-Prompt

#### Was das Modell sieht

Das Plugin registriert den Speicherkontext für jeden Agenten mit `required: true` und der Reihenfolge
220, nach den eingebauten Laufzeitkontexten. Das Harness schreibt den Text als
Laufzeitkontext-Nachricht, und es schreibt nur eine neue Nachricht, wenn sich der Text ändert.

Der Text ist ein Abschnitt `<memory>` mit diesen Teilen:

- `<how-to>` enthält den Richtlinientext und den Wert von `customPromptAppend`. Der Schlüssel
  `customPrompt` ersetzt die ganze Vorlage.
- `<directions>` enthält eine Zeile für jeden der neuesten Scopes des Profils, als
  `[<key>] <age> <summary>`. Die Scopes, die älter als das Budget sind, treten zu einer Liste von
  Schlüsseln zusammen.
- `<here>` enthält die Front des aktiven Scopes, als `#<pos> <date> <body>` für eine Notiz und
  `#<a>-<b> <start>..<end> <summary>` für einen Bereich.

Der Richtlinientext nennt die Form des Baums, die zwei Lesewerkzeuge und die Regeln eines
Schreibvorgangs. Der [Kontextvertrag](../../packages/core/src/domain/context.ts) enthält den Text,
und [Prompts](../../docs/prompts.md) nennt seinen Ort.

#### Wirkung auf die Token

Feste Kosten bei jeder Anfrage, die den Speicherkontext enthält. Die Kosten wachsen mit den Budgets
`here` und `directions` und mit dem Wert von `customPromptAppend`.

#### Wirkung auf den KV-Cache

Der Speichertext sitzt im Laufzeitkontext am Anfang der Anfrage. Er bleibt durch die Züge einer
Sitzung und durch die Schreibvorgänge dieser Sitzung gleich. Dieser Abschnitt ist für die ganze
Sitzung präfixstabil.

Das Plugin rendert den Text bei einer neuen Sitzung neu und bei einer Verdichtung der Unterhaltung
durch das Harness. Der Text ändert sich nur, wenn sich die Notizen, die Budgets oder der
Custom-Prompt ändern.

### Werkzeugschemata und Ergebnisse

#### Was das Modell sieht

Die Werkzeugdefinitionen im Agenten-Scope, mit den Beschreibungen, den Parametern und den
Antwortschemata aus `src/tools`. Die Menge jedes Agenten hängt vom Modus des Profils ab:

| Werkzeug        | Hauptagent | `propose`-Kind | `read`-Kind |
| --------------- | ---------- | -------------- | ----------- |
| `memory_note`   | ja         | ja, Vorschlag  | nein        |
| `memory_find`   | ja         | ja             | ja          |
| `memory_open`   | ja         | ja             | ja          |
| `memory_map`    | ja         | ja             | ja          |
| `memory_forget` | ja         | nein           | nein        |
| `memory_review` | ja         | nein           | nein        |

Ein Kind mit `off` bekommt kein Werkzeug und keinen Speicherkontext.

Jeder Aufruf antwortet mit einem gerenderten Text. Die Tabelle nennt den Text jedes Werkzeugs:

| Werkzeug        | Der Text, den das Modell liest                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| `memory_note`   | `saved <addr>` oder `Proposed to your parent: <body> (proposal <id>)`                                        |
| `memory_find`   | Eine Zeile für jeden Treffer, als `<addr>  <date>  <kind>  <body>`, oder `No hit.`                           |
| `memory_open`   | Der Eintrag mit seiner Langform, eine Zeile für jedes Kind eines Bereichs, oder `The range holds no record.` |
| `memory_map`    | Eine Zeile für jeden Scope oder eine Zeile für jeden Bereich der Front                                       |
| `memory_forget` | `Done. A target outside the profile waits for a human.`                                                      |
| `memory_review` | Eine Zeile für jeden fälligen Datensatz oder `reviewed <count> records, next <date>`                         |

#### Wirkung auf die Token

Feste Schemakosten plus eine kompakte Antwort für jeden Aufruf. Der Bericht an den Elternteil fügt
eine Zeile für jeden offenen Vorschlag eines Kindes hinzu, wenn das Kind endet.

#### Wirkung auf den KV-Cache

Die Schemata sind präfixstabil, solange die Werkzeugmenge und der Modus des Profils unverändert
bleiben. Ein Aufruf und seine Antwort hängen sich hinter dem wiederverwendbaren Präfix an.

### Hinweiszeilen

#### Was das Modell sieht

Das Plugin zählt die Werkzeugaufrufe und die Züge des Hauptagenten. Ein Zähler, der sein Limit
erreicht, fügt eine Zeile in der Rolle des Nutzers ein. Die Zeile enthält `{n}`, und die Anzahl tritt
an seine Stelle. Die Standardtexte sind:

```text
[memory] {n} tool calls since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
[memory] {n} turns since the last record. Anything durable: a decision, a correction, a preference, a failed attempt and its cause?
```

Der Abschnitt `[nudge]` der Konfiguration ergibt die Anzahlen und die Texte. Ein Limit von null oder
weniger deaktiviert seinen Zähler.

#### Wirkung auf die Token

Eine kurze Zeile bei jedem erreichten Limit. Ein Notizschreibvorgang oder ein Hinweis setzt beide
Zähler zurück, also bleiben die Zeilen selten.

#### Wirkung auf den KV-Cache

Die Zeile hängt sich hinter dem wiederverwendbaren Präfix an, also entwertet sie keinen früheren
Eintrag.

<a id="known-limitations-and-deferred-work"></a>
## Bekannte Grenzen und zurückgestellte Arbeit

Diese Grenzen bestimmen, wann dieses Paket schlecht passt oder besondere Sorgfalt braucht. Sie sind
aktuelle Beschränkungen des Pakets, keine Aufgabenliste.

- **Die Verdichtung braucht eine konfigurierte Route.** Ein Durchlauf ohne Provider oder ohne Modell
  schlägt mit „The compaction model is not configured. Set provider and model.“ fehl. Die Konsole
  zeigt diesen Fehler im Wartungsbildschirm, und die betroffenen Bereiche bleiben für den nächsten
  Durchlauf schmutzig. Siehe [Konfigurieren](#configure-it).
- **Eine zweite Montage hat eine begrenzte Anzahl von Versuchen.** Das Plugin entfernt zuerst die
  alte Oberfläche und montiert dann mit einer Sekunde Abstand erneut. Eine Montage, die alle
  Versuche verbraucht, protokolliert den Verlust, und der Agent bleibt ohne Oberfläche bis zum
  nächsten Auslöser.
- **Der Hinweis zählt nur den Hauptagenten.** Ein Subagent bekommt keinen Hinweis und keine
  Erinnerung, einen Befund zu notieren.
- **Die Konsole braucht den Typert-Dienst.** Der Namespace registriert sich nur, wenn der Dienst
  erscheint. Ein Profil ohne das Web-Gateway bekommt keine Konsole, und das Plugin meldet keinen
  Fehler.

<a id="dev-note"></a>
### Entwicklernotiz

<details>
<summary>Arbeitskontext für Maintainer – zum Aufklappen klicken</summary>

Diese Entwicklernotiz ist Arbeitskontext für Maintainer. Sie ist ausdrücklich nicht maßgeblich.

Die Konsole der Harness-GUI sieht wie ein Teil von `@memlens/ui` aus, aber die Trennung ist nicht
sauber. Dieses Paket hält die Montage, den Remote-Dienst, die Lesezugriffe und die Aktionen. Der
Client-Teil enthält das Modell, den Speicher, die Bildschirme und die Übersetzungen. Eine Änderung an
einem Konsolenbildschirm berührt beide Pakete. Eine Änderung an einem Konsolenaufruf berührt zuerst
`src/console/remote-contract.ts`, weil beide Seiten des Remote dieselben Deskriptoren lesen.

Der Build und die Prüfungen:

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

Der Befehl `pnpm run verify` im Wurzelverzeichnis des Repositories startet den Build und jede
Prüfung.

</details>
