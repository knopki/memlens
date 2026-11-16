# @memlens/dsh-plugin

memlens の DeepSeek Harness プラグインです。

**状態:** ステージ 1 から 4。プラグインはメモリストアを開き、各エージェントにメモリコンテキスト、
メモリツール、ナッジを与え、バックグラウンドコンパクションを実行します。プラグインコンソールは
このパッケージの外にあります。

## メモリサーフェス

プラグインはエージェントごとに 1 つのランタイムコンテキストを登録します。コンテキストは
メモリスライスを保持し、受け入れたトリガーの間で安定します。トリガーは、新しいセッション、
DeepSeek Harness のコンパクションの成功、モデル TTL を超えたアイドル時間です。

プラグインは各エージェントのコンテキストに次のツールを登録します。

| ツール        | メインエージェント | 子 (提案)  | 子 (読み取り) |
| ------------- | ------------------ | ---------- | ------------- |
| memory_note   | はい               | はい、提案 | いいえ        |
| memory_find   | はい               | はい       | はい          |
| memory_open   | はい               | はい       | はい          |
| memory_map    | はい               | はい       | はい          |
| memory_forget | はい               | いいえ     | いいえ        |
| memory_review | はい               | いいえ     | いいえ        |

`off` の子はメモリツールもメモリコンテキストも受け取りません。子の提案は子のセッション ID の下に
集まり、子が終了すると親は提案ごとに 1 行のレポートを受け取ります。

ナッジはメインエージェントのツール呼び出しとターンを数えます。上限に達すると 1 行を挿入し、
ノートの書き込みまたはナッジが両方のカウンタをリセットします。

バックグラウンドワーカーは、ダーティしきい値とストアのアイドル上限でコンパクションを開始します。
ワーカーは設定された LLM ルートを呼び出し、その呼び出し上限を守ります。

## エントリ

- ホストエントリ `@memlens/dsh-plugin` のプラグイン名は `dsh-memlens` です。バンドルパッチは行
  `memlens` を挿入します。
- プリセットエントリ `@memlens/dsh-plugin/preset` のプラグイン名は `memlens/preset` です。エー
  ジェントプリセットはキー `profile` でこれを読み込みます。

### ホスト行

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
```

プロファイルの patch ファイルでこの行に `config` テーブルを追加すると、設定を上書きできます。
各キーは任意です：

```yaml
- insert:
    - id: memlens
      name: "@memlens/dsh-plugin"
      config:
        defaultProfile: work
        budget:
          here: 40
```

### プリセット行

この行をエージェントプリセットの `plugins` リストに追加します。キー `profile` は任意です。省略時はプロファイル `default` を使います。

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: work
    budget:
      here: 30
```

## 設定

プラグインは基本ファイル `$XDG_CONFIG_HOME/memlens/config.toml` を読みます。プラグインはこの
ファイルを書きません。ファイルがない場合は、組み込みのフォールバックが使われます。プロファイ
ル `default`、スコープ `*`、バジェット 20 と 10、スコープ `project:misc` です。

ストアのパスは、プラグイン設定、`MEMLENS_STORE`、基本ファイルの順に選ばれます。

設定はプリセット、プラグインパッチ、基本プロファイルの順にマージされます。プリセットのキー
`profile` がプロファイル名を選びます。

すべてのキー、デフォルト値、詳細な例は [docs/configuration.md](../../docs/configuration.md)
にあります。

表示メタデータは `locale/<language>.json` にあります。アイコンは `icon.svg` です。

## ビルドとテスト

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## バージョン

受け入れる最低バージョンは DeepSeek Harness `0.2.2-rc.3` です。マニフェストは `>=0.2.2-rc.3` を受け入れます。
