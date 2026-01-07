import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import fetch from 'node-fetch';

const app = express();
const PORT = process.env.PORT || 3000;

// Discord Webhook URL は Render の Environment に設定
const SEARCH_WEBHOOK = process.env.SEARCH_WEBHOOK;
const ERROR_WEBHOOK = process.env.ERROR_WEBHOOK;
const DISTANCE_WEBHOOK = process.env.DISTANCE_WEBHOOK;

app.use(bodyParser.json());

// サンプル駅データ（Discord から追加する想定）
let stations = {}; 

// 距離データ追加（Discord ボット専用 API）
app.post('/api/add-station', (req, res) => {
  const { name, distance } = req.body;
  if (!name || distance === undefined) {
    return res.status(400).json({ error: '駅名と距離を指定してください' });
  }
  stations[name] = distance;

  // Discord に通知
  if (DISTANCE_WEBHOOK) {
    fetch(DISTANCE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `駅追加: ${name} → ${distance} km` })
    });
  }

  res.json({ status: 'ok', stations });
});

// 検索 API
app.post('/search', (req, res) => {
  try {
    const { from, to, via } = req.body; // viaは省略可能
    if (!from || !to) {
      return res.status(400).json({ error: 'from と to は必須です' });
    }

    if (!stations[from] || !stations[to]) {
      if (ERROR_WEBHOOK) {
        fetch(ERROR_WEBHOOK, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `駅データ不足: ${from} → ${to}` })
        });
      }
      return res.status(400).json({ error: `駅データ不足: ${from} → ${to}` });
    }

    // 経路距離計算（via は配列想定）
    let route = [from];
    let totalDistance = 0;

    if (via && Array.isArray(via)) {
      for (const v of via) {
        if (!stations[v]) throw new Error(`駅データ不足: ${route[route.length-1]} → ${v}`);
        totalDistance += Math.abs(stations[v] - stations[route[route.length-1]]);
        route.push(v);
      }
    }

    totalDistance += Math.abs(stations[to] - stations[route[route.length-1]]);
    route.push(to);

    // 運賃計算（JR本州3社風・簡易）
    let fare = Math.ceil(totalDistance * 0.24); // 例: km × 0.24円

    // Discord に検索ログ通知
    if (SEARCH_WEBHOOK) {
      fetch(SEARCH_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `検索: ${from} → ${to}, via: ${via || 'なし'}, 距離: ${totalDistance}km, 運賃: ${fare}円` })
      });
    }

    res.json({ route, distance: totalDistance, fare });

  } catch (err) {
    if (ERROR_WEBHOOK) {
      fetch(ERROR_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `検索エラー: ${err.message}` })
      });
    }
    res.status(500).json({ error: err.message });
  }
});

// 簡易テスト用
app.get('/', (req, res) => {
  res.send('Transfer Search App is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
