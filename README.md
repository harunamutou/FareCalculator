# transfer-search-app
# Transfer Search App

## 概要
架空路線の乗換検索アプリ。駅データはDiscord経由で追加可能。結果はDiscordログにも出力。

## 使い方
1. `npm install` または `yarn` で依存をインストール
2. `npm start` または `yarn start` でサーバー起動
3. ブラウザで `http://localhost:3000` にアクセス

### API
- `/search` POST: 経路検索
- `/addStation` POST: 駅追加
- `/resetStations` POST: 駅データリセット

### Discord Webhook
- 検索結果: `/search`
- 駅追加: `/addStation`
- エラー: 内部で自動送信
