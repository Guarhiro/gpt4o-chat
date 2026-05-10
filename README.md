# GPT-4o Chat

OpenRouter API 経由で GPT-4o とチャットできるブラウザアプリです。  
ビルド不要 — HTML/CSS/JS のみで動作します。

![screenshot](docs/screenshot.png)

## 機能

- **ストリーミング応答** — リアルタイムにトークンを表示
- **画像入力（Vision）** — 画像をアップロードして GPT-4o に分析させる（ドラッグ&ドロップ対応）
- **Markdown レンダリング** — コードハイライト・テーブル・リスト等を整形表示
- **コードブロックコピー** — ワンクリックでコピー
- **会話管理** — 複数の会話を作成・切り替え・削除（LocalStorage に自動保存）
- **モデル切り替え** — GPT-4o / GPT-4o mini
- **設定パネル** — API キー・システムプロンプト・Temperature・最大トークン数
- **レスポンシブ UI** — デスクトップ・モバイル対応

## セットアップ

### 1. OpenRouter API キーを取得

[OpenRouter](https://openrouter.ai/) でアカウントを作成し、API キーを発行してください。

### 2. アプリを起動

ビルドツールは不要です。任意の方法でローカルサーバーを起動してください。

```bash
# Python
python3 -m http.server 8080

# Node.js (npx)
npx serve .

# VS Code
# Live Server 拡張機能で index.html を開く
```

ブラウザで `http://localhost:8080` を開きます。

### 3. API キーを設定

左下の **設定** ボタンから OpenRouter API キーを入力して保存すれば、すぐにチャットを開始できます。

> API キーはブラウザの LocalStorage に保存され、外部には送信されません（OpenRouter API への認証ヘッダーとしてのみ使用）。

## ファイル構成

```
gpt4o-chat-app/
├── index.html   # メインHTML
├── style.css    # ChatGPT風ダークテーマUI
├── app.js       # アプリケーションロジック
├── LICENSE      # MIT License
└── README.md
```

## 技術スタック

- **HTML / CSS / JavaScript** — フレームワーク不使用
- **[OpenRouter API](https://openrouter.ai/docs)** — LLM ルーティング
- **[marked.js](https://marked.js.org/)** — Markdown パーサー
- **[highlight.js](https://highlightjs.org/)** — シンタックスハイライト

## ライセンス

[MIT](LICENSE)
