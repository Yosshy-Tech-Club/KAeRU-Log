# KAeRU Log

[Read in English](README.md)

---

KAeRU Log は、Node.js を使って構築した軽量チャットアプリです。  
このアプリは **必ず Cloudflare Workers を経由してアクセスする** 運用を前提としています。  
実際のサーバーは Render や Koyeb などでホストされ、Workers がリバースプロキシとして機能します。

---

## ディレクトリ構成

```
/
├─ .github
│  ├─ README.md
│  └─ README.ja.md
├─ public
│  ├─ index.html
│  ├─ main.js
│  ├─ socket.io.min.js
│  ├─ style.css
│  ├─ logo.png
│  ├─ favicon-16x16.png
│  ├─ favicon-32x32.png
│  └─ favicon-96x96.png
├─ src
│  └─ worker.js
├─ server.js
├─ package.json
└─ LICENSE
```

---

## 動作環境とセットアップ

Node.js (v22 以上推奨) がインストールされた環境で動作します。  

本アプリは以下の構成で運用されます：

1. **アプリ本体**：Render/Koyeb 等で Node.js サーバーを稼働  
2. **Cloudflare Workers**：`src/worker.js` を使ってリクエストを必ず経由  

### 1. アプリ本体をデプロイ

Render や Koyeb などのホスティングサービスで、リポジトリをデプロイします。  
環境変数 `.env` を設定してください：

```.env
REDIS_URL=redis://<ホスト>:<ポート>

# 任意（推奨）
ADMIN_PASS=<管理者パスワード>
SECRET_KEY=<トークン用シークレットキー>
WORKER_SECRET=<worker.js と同一のシークレットキー>
```

- `REDIS_URL` は **必ず定義**  
- `WORKER_SECRET` は Cloudflare Workers との認証用です  

アプリ本体の URL は、後で Workers の `TARGET_URL` として指定します。

---

### 2. Cloudflare Workers 側の設定

1. `src/worker.js` を使用します。
2. `TARGET_URL` と `WORKER_SECRET` を Cloudflare 環境変数に設定：

```.env
TARGET_URL=<Render/Koyeb 上のアプリ URL>
WORKER_SECRET=<.env と同一のキー>
```

3. `wrangler` で Workers をデプロイ：

```bash
wrangler publish
```

これにより、アプリ本体にアクセスするすべてのリクエストは Workers を経由するようになります。

---

## アクセス

Cloudflare Workers 経由の URL でアクセスしてください：

[https://kaeru-log.yosshy-123.workers.dev/](https://kaeru-log.yosshy-123.workers.dev/)

---

## 記事

KAeRU Log の紹介記事はこちら：

[https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450](https://qiita.com/Yosshy_123/items/fa7289905f2fca60e450)

---

## バグ報告・フィードバック

不具合や改善リクエストは **Issue の作成** または *Yosshy_123@proton.me* までご連絡ください。

---

## ライセンス

このプロジェクトは **MIT ライセンス** です。

---

## デプロイ

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Yosshy-123/KAeRU-Log.git)

[![Deploy to Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/Yosshy-123/KAeRU-Log.git)
