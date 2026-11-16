# @memlens/dsh-plugin

Das DeepSeek-Harness-Plugin von memlens.

**Status:** Stufe 1 bis 4. Das Plugin öffnet den Speicher, gibt jedem Agenten seinen
Speicherkontext, seine Speicherwerkzeuge und den Hinweis und führt die Hintergrundverdichtung aus.
Die Plugin-Konsole bleibt außerhalb dieses Pakets.

## Speicheroberfläche

Das Plugin registriert einen Laufzeitkontext für jeden Agenten. Der Kontext hält den
Speicherausschnitt und bleibt zwischen den angenommenen Auslösern stabil: eine neue Sitzung, eine
erfolgreiche Harness-Verdichtung und eine Leerlaufzeit über der Modell-TTL.

Das Plugin registriert diese Werkzeuge im Kontext jedes Agenten:

| Werkzeug      | Hauptagent | Kind (Vorschlag) | Kind (Lesen) |
| ------------- | ---------- | ---------------- | ------------ |
| memory_note   | ja         | ja, Vorschlag    | nein         |
| memory_find   | ja         | ja               | ja           |
| memory_open   | ja         | ja               | ja           |
| memory_map    | ja         | ja               | ja           |
| memory_forget | ja         | nein             | nein         |
| memory_review | ja         | nein             | nein         |

Ein Kind mit `off` bekommt kein Speicherwerkzeug und keinen Speicherkontext. Ein Vorschlag eines
Kindes sammelt sich unter der Sitzungs-ID des Kindes, und der Elternteil bekommt eine Berichtszeile
pro Vorschlag, wenn das Kind endet.

Der Hinweis zählt die Werkzeugaufrufe und die Züge des Hauptagenten. Ein erreichtes Limit fügt eine
Zeile ein, und ein Notizschreiben oder ein Hinweis setzt beide Zähler zurück.

Der Hintergrundworker startet eine Verdichtung an der Dirty-Schwelle und am Leerlauflimit des
Speichers. Der Worker ruft die konfigurierte LLM-Route auf und hält seine Aufruflimits ein.

## Einstiegspunkte

- Der Host-Einstiegspunkt `@memlens/dsh-plugin` hat den Plugin-Namen `dsh-memlens`. Der
  Bundle-Patch fügt die Zeile `memlens` ein.
- Der Preset-Einstiegspunkt `@memlens/dsh-plugin/preset` hat den Plugin-Namen `memlens/preset`. Ein
  Agent-Preset lädt ihn mit dem Schlüssel `profile`.

### Host-Zeile

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

### Preset-Zeile

Füge diese Zeile in die Liste `plugins` eines Agent-Presets ein. Der Schlüssel `profile` ist
optional. Ohne den Schlüssel gilt das Profil `default`.

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## Konfiguration

Das Plugin liest die Basisdatei `$XDG_CONFIG_HOME/memlens/config.toml`. Das Plugin schreibt diese
Datei nicht. Wenn die Datei fehlt, gilt der eingebaute Ersatz: das Profil `default`, die Scopes `*`,
die Budgets 20 und 10 und der Scope `project:misc`.

Der Speicherpfad kommt zuerst aus der Plugin-Konfiguration, dann aus `MEMLENS_STORE`, dann aus der
Basisdatei.

Die Einstellungen werden in dieser Reihenfolge zusammengeführt: Preset, Plugin-Patch, Basisprofil.
Der Preset-Schlüssel `profile` wählt den Profilnamen.

Die Anzeigemetadaten liegen in `locale/<language>.json`. Das Symbol ist `icon.svg`.

## Bauen und testen

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## Version

Die niedrigste akzeptierte Version ist DeepSeek Harness `0.2.2-rc.3`. Das Manifest akzeptiert `>=0.2.2-rc.3`.
