// server.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// Discord Webhook
const DISCORD_ACCESS_LOG = "https://discord.com/api/webhooks/1458546755468660982/YTlFt_XZIhm4k01U8LLdF2wEAkq2VYCmQH--BMmENQKEMg1fXh0W0eJDH1mE88g_Z7Jf";
const DISCORD_SEARCH_LOG = "https://discord.com/api/webhooks/1458559479531573383/clnGsN1RzEesGLtsYWRApXlKxBY1ON5vuSVT9nJUxIPrs5bka8ADZPKxGT4K5isUIfdY";
const DISCORD_ADDLINE_LOG = "https://discord.com/api/webhooks/1458559343065829377/9pf_8WeNhGb9XzVoMJTmoj9YTy7-imKELnzFxMTayIv_hUTlM-gA19_3eGMYKdOEO6w5";
const DISCORD_ERROR_LOG = "https://discord.com/api/webhooks/1458547135472467998/2Ces9SugoRXoJgyC-WavJ3tmNmLy90Z5xIhvBLWcwkN_LZnRjLfxsTf5dOR3eHOX8lMO";

// スプレッドシートIDとシート名
const SPREADSHEET_ID = "1i1nrENJPUUUt5oxmJHmgglK04kpZrscp";
const SHEET_NAME = "stations";

let stationData = []; // {line, station, distance}

// Discord Webhookに送信
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

// GAS API 経由でスプレッドシート取得
async function loadStations() {
  try {
    const url = `https://script.google.com/macros/s/${SPREADSHEET_ID}/exec?action=getStations`;
    const res = await fetch(url);
    stationData = await res.json();
    await sendDiscordLog(DISCORD_ACCESS_LOG, `駅データロード完了: ${stationData.length}件`);
  } catch (err) {
    await sendDiscordLog(DISCORD_ERROR_LOG, `loadStationsエラー: ${err.message}`);
    console.error(err);
  }
}

// 経路検索
function searchRoute(start, end, via = []) {
  try {
    const path = [start, ...via.filter(Boolean), end];
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const from = stationData.find(s => s.station === path[i]);
      const to = stationData.find(s => s.station === path[i + 1]);
      if (!from || !to) throw new Error(`駅データ不足: ${path[i]} → ${path[i+1]}`);
      totalDistance += Math.abs(to.distance - from.distance);
    }

    const fare = calculateFare(totalDistance);
    return {path, distance: totalDistance, fare};
  } catch (err) {
    sendDiscordLog(DISCORD_ERROR_LOG, `searchRouteエラー: ${err.message}`);
    return {error: err.message};
  }
}

// JR本州三社運賃簡易計算
function calculateFare(distance) {
  if (distance <= 1) return 140;
  if (distance <= 3) return 200;
  if (distance <= 6) return 230;
  if (distance <= 10) return 280;
  return 280 + Math.floor((distance - 10) / 10) * 50;
}

// ---------------- API ----------------

// GET / で動作確認用
app.get("/", (req, res) => {
  res.send("Server is running! Use /search POST API to query routes.");
});

// 経路検索
app.post("/search", async (req, res) => {
  const {start, end, via} = req.body;
  const result = searchRoute(start, end, via || []);
  await sendDiscordLog(DISCORD_SEARCH_LOG, `検索: ${start} → ${end} 経由: ${via?.join(",") || "-"} 結果: ${JSON.stringify(result)}`);
  res.json(result);
});

// 路線追加
app.post("/addline", async (req, res) => {
  const {line} = req.body;
  try {
    const url = `https://script.google.com/macros/s/${SPREADSHEET_ID}/exec`;
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "addLine", line})
    });
    await sendDiscordLog(DISCORD_ADDLINE_LOG, `路線追加: ${line}`);
    res.json({status: "success", line});
  } catch (err) {
    await sendDiscordLog(DISCORD_ERROR_LOG, `addLineエラー: ${err.message}`);
    res.status(500).json({error: err.message});
  }
});

// 駅追加
app.post("/addstation", async (req, res) => {
  const {line, station, distance} = req.body;
  try {
    const url = `https://script.google.com/macros/s/${SPREADSHEET_ID}/exec`;
    await fetch(url, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({action: "addStation", line, station, distance})
    });
    await sendDiscordLog(DISCORD_ADDLINE_LOG, `駅追加: ${line} - ${station} (${distance}km)`);
    res.json({status: "success", line, station, distance});
  } catch (err) {
    await sendDiscordLog(DISCORD_ERROR_LOG, `addStationエラー: ${err.message}`);
    res.status(500).json({error: err.message});
  }
});

// データ再読み込み
app.post("/reload", async (req, res) => {
  await loadStations();
  res.json({status: "reloaded", count: stationData.length});
});

// 起動時に駅データロード
loadStations();

// サーバー起動
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
