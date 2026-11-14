# @memlens/dsh-plugin

memlens の DeepSeek Harness プラグインです。

**状態:** ステージ 1。プラグインはメモリストアを開き、セッションごとに設定を読みます。メモリ
ツールとメモリコンテキストはまだありません。

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

### プリセット行

この行をエージェントプリセットの `plugins` リストに追加します。キー `profile` は必須です。

```yaml
- id: memlens/preset
  name: "@memlens/dsh-plugin/preset"
  config:
    profile: default
```

## 設定

プラグインは基本ファイル `$XDG_CONFIG_HOME/memlens/config.toml` を読みます。プラグインはこの
ファイルを書きません。ファイルがない場合は、組み込みのフォールバックが使われます。プロファイ
ル `default`、スコープ `*`、バジェット 20 と 10、スコープ `user:notes` です。

ストアのパスは、プラグイン設定、`MEMLENS_STORE`、基本ファイルの順に選ばれます。

設定はプリセット、プラグインパッチ、基本プロファイルの順にマージされます。プリセットのキー
`profile` がプロファイル名を選びます。

セッションのモデルには少なくとも 65 536 のコンテキストトークンが必要です。プラグインはより
小さいモデルのセッションを停止します。

表示メタデータは `locale/<language>.json` にあります。アイコンは `icon.svg` です。

## ビルドとテスト

```sh
pnpm run build
pnpm run typecheck
pnpm run test
```

## バージョン

確認したバージョンは DeepSeek Harness `0.2.2-rc.3` です。マニフェストは `>=0.2.1-0` を受け入れ
ます。より古いバージョンは未確認です。
