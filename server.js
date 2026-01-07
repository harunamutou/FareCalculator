// server.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public")); // HTML/JS 配信用

const PORT = process.env.PORT || 3000;

// Discord Webhook
const DISCORD_ACCESS_LOG = "https://discord.com/api/webhooks/1458546755468660982/YTlFt_XZIhm4k01U8LLdF2wEAk2VYCmQH--BMmENQKEMg1fXh0W0eJDH1mE88g_Z7Jf";
const DISCORD_SEARCH_LOG = "https://discord.com/api/webhooks/1458559479531573383/clnGsN1RzEesGLtsYWRApXlKxBY1ON5vuSVT9nJUxIPrs5bka8ADZPKxGT4K5isUIfdY";
const DISCORD_ADDLINE_LOG = "https://discord.com/api/webhooks/1458559343065829377/9pf_8WeNhGb9XzVoMJTmoj9YTy7-imKELnzFxMTayIv_hUTlM-gA19_3eGMYKdOEO6w5";
const DISCORD_ERROR_LOG = "https://discord.com/api/webhooks/1458547135472467998/2Ces9SugoRXoJgyC-WavJ3tmNmLy90Z5xIhvBLWcwkN_LZnRjLfxsTf5dOR3eHOX8lMO";

// スプレッドシートID
const SPREADSHEET_ID = "1i1nrENJPUUUt5oxmJHmgglK04kpZrscp";

let stationData = [];

// Discord Webhook送信
async function sendDiscordLog(webhook, content) {
  try {
    await fetch(webhook, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({content}),
    });
  } catch (err) {
    console.error("Discord Webhook送信失敗:", err.message);
  }
}

// 非同期でエラー送信（Promise 無視）
function logErrorToDiscord(message) {
  sendDiscordLog(DISCORD_ERROR_LOG, message).catch(e => console.error("Discord送信失敗:", e));
}

// スプレッドシートから駅データ取得
async function loadStations() {
  try {
    const url = `https://script.google.com/macros/s/${SPREADSHEET_ID}/exec?action=getStations`;
    const res = await fetch(url);
    const data = await res.json();
    // 駅名トリム + distance 数値化
    stationData = data.map(s => ({
      line: s.line.trim(),
      station: s.station.trim(),
      distance: Number(s.distance)
    }));
    await sendDiscordLog(DISCORD_ACCESS_LOG, `駅データロード完了: ${stationData.length}件`);
    console.log(`駅データロード完了: ${stationData.length}件`);
  } catch (err) {
    logErrorToDiscord(`loadStationsエラー: ${err.message}`);
    console.error(err);
  }
}

// 経路検索
function searchRoute(start, end, via = []) {
  try {
    const path = [start, ...via.filter(Boolean), end];

    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const from = stationData.find(s => s.station === path[i].trim());
      const to   = stationData.find(s => s.station === path[i + 1].trim());
      if (!from || !to) throw new Error(`駅データ不足: ${path[i]} → ${path[i+1]}`);
      totalDistance += Math.abs(to.distance - from.distance);
    }

    const fare = calculateFare(totalDistance);
    return { path, distance: totalDistance, fare };
  } catch (err) {
    logErrorToDiscord(`searchRouteエラー: ${err.message}`);
    return { error: err.message };
  }
}

// 運賃計算
function calculateFare(distance) {
  if (distance <= 1) return 140;
  if (distance <= 3) return 200;
  if (distance <= 6) return 230;
  if (distance <= 10) return 280;
  return 280 + Math.floor((distance - 10) / 10) * 50;
}

// ---------------- API ----------------

// ブラウザ用UI
app.get("/", (req, res) => {
  res.send(`
  <!DOCTYPE html>
  <html lang="ja">
  <head>
    <meta charset="UTF-8">
    <title>経路検索アプリ</title>
    <style>
      body { font-family: sans-serif; background:#f7f7f7; display:flex; flex-direction:column; align-items:center; padding:50px; }
      .container { background:#fff; padding:20px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.1); width:400px; }
      input { width:100%; padding:8px; margin:5px 0; border-radius:4px; border:1px solid #ccc; }
      button { padding:10px 20px; border:none; border-radius:4px; background:#4CAF50; color:white; cursor:pointer; }
      button:hover { background:#45a049; }
      pre { background:#eee; padding:10px; border-radius:4px; overflow:auto; }
    </style>
  </head>
  <body>
    <div class="container">
      <h2>経路検索</h2>
      <input id="start" placeholder="出発駅">
      <input id="end" placeholder="到着駅">
      <input id="via1" placeholder="経由駅1 (任意)">
      <input id="via2" placeholder="経由駅2 (任意)">
      <input id="via3" placeholder="経由駅3 (任意)">
      <button onclick="search()">検索</button>
      <h3>結果</h3>
      <pre id="result">ここに結果が表示されます</pre>
    </div>
    <script>
      async function search() {
        const start = document.getElementById("start").value.trim();
        const end = document.getElementById("end").value.trim();
        const via = [document.getElementById("via1").value,
                     document.getElementById("via2").value,
                     document.getElementById("via3").value].filter(Boolean);
        const res = await fetch("/search", {
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body: JSON.stringify({start,end,via})
        });
        const data = await res.json();
        document.getElementById("result").textContent = JSON.stringify(data,null,2);
      }
    </script>
  </body>
  </html>
  `);
});

// 経路検索 API
app.post("/search", async (req, res) => {
  const {start, end, via} = req.body;
  const result = searchRoute(start, end, via || []);
  await sendDiscordLog(DISCORD_SEARCH_LOG, `検索: ${start} → ${end} 経由: ${via?.join(",") || "-"} 結果: ${JSON.stringify(result)}`);
  res.json(result);
});

// データ再読み込み
app.post("/reload", async (req, res) => {
  await loadStations();
  res.json({status:"reloaded", count:stationData.length});
});

// 起動時に駅データロード
loadStations();

// サーバー起動
app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
