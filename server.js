// server.js
import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Discord Webhook
const DISCORD_SEARCH_LOG = "https://discord.com/api/webhooks/1458559479531573383/clnGsN1RzEesGLtsYWRApXlKxBY1ON5vuSVT9nJUxIPrs5bka8ADZPKxGT4K5isUIfdY";
const DISCORD_ADDLINE_LOG = "https://discord.com/api/webhooks/1458559343065829377/9pf_8WeNhGb9XzVoMJTmoj9YTy7-imKELnzFxMTayIv_hUTlM-gA19_3eGMYKdOEO6w5";
const DISCORD_ERROR_LOG = "https://discord.com/api/webhooks/1458547135472467998/2Ces9SugoRXoJgyC-WavJ3tmNmLy90Z5xIhvBLWcwkN_LZnRjLfxsTf5dOR3eHOX8lMO";

// 駅データ
let stationData = [];

// Discord送信用
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

function logErrorToDiscord(message) {
  sendDiscordLog(DISCORD_ERROR_LOG, message).catch(e => console.error("Discord送信失敗:", e));
}

// 駅追加（Discord専用）
function addStation(line, station, distance) {
  const exists = stationData.find(s => s.station === station.trim());
  if (exists) return false;
  stationData.push({line: line.trim(), station: station.trim(), distance: Number(distance)});
  sendDiscordLog(DISCORD_ADDLINE_LOG, `駅追加: ${station} (${line}, ${distance}km)`);
  return true;
}

// 経路検索
function searchRoute(start, end, via = []) {
  try {
    const path = [start, ...via.filter(Boolean), end];
    let totalDistance = 0;

    for (let i = 0; i < path.length - 1; i++) {
      const from = stationData.find(s => s.station === path[i].trim());
      const to   = stationData.find(s => s.station === path[i + 1].trim());
      if (!from || !to) throw new Error(`駅データ不足: ${path[i]} → ${path[i + 1]}`);
      totalDistance += Math.abs(to.distance - from.distance);
    }

    const fare = calculateFare(totalDistance);
    return { path, distance: totalDistance, fare };
  } catch (err) {
    logErrorToDiscord(`searchRouteエラー: ${err.message}`);
    return { error: err.message };
  }
}

// 運賃表
const fareTable = [
  {maxDistance: 1, fare: 140}, {maxDistance: 3, fare: 200}, {maxDistance: 6, fare: 230},
  {maxDistance: 10, fare: 280}, {maxDistance: 15, fare: 330}, {maxDistance: 20, fare: 380},
  {maxDistance: 25, fare: 430}, {maxDistance: 30, fare: 480}, {maxDistance: 35, fare: 530},
  {maxDistance: 40, fare: 580}, {maxDistance: 45, fare: 630}, {maxDistance: 50, fare: 680},
  {maxDistance: 55, fare: 730}, {maxDistance: 60, fare: 780}, {maxDistance: 65, fare: 830},
  {maxDistance: 70, fare: 880}, {maxDistance: 75, fare: 930}, {maxDistance: 80, fare: 980},
  {maxDistance: 85, fare: 1030}, {maxDistance: 90, fare: 1080},
];

function calculateFare(distance) {
  for (let i = 0; i < fareTable.length; i++) {
    if (distance <= fareTable[i].maxDistance) return fareTable[i].fare;
  }
  const lastFare = fareTable[fareTable.length - 1].fare;
  return lastFare + Math.ceil((distance - fareTable[fareTable.length - 1].maxDistance) / 10) * 50;
}

// ---------------- UI ----------------
app.get("/", (req, res) => {
  res.sendFile("index.html", {root: "public"});
});

// 経路検索 API
app.post("/search", async (req,res)=>{
  const {start,end,via}=req.body;
  const result = searchRoute(start,end,via||[]);
  await sendDiscordLog(DISCORD_SEARCH_LOG, `検索: ${start} → ${end} 経由: ${via?.join(",") || "-"} 結果: ${JSON.stringify(result)}`);
  res.json(result);
});

// 駅追加 API（Discord専用）
app.post("/addStationDiscord",(req,res)=>{
  const {line,station,distance,token} = req.body;
  // 任意の簡易認証
  if(token !== process.env.DISCORD_TOKEN){ 
    return res.status(403).json({error:"認証失敗"});
  }
  const added=addStation(line,station,distance);
  res.json({added,station,line,distance});
});

// データリセット API
app.post("/resetStations",(req,res)=>{
  stationData=[];
  sendDiscordLog(DISCORD_ADDLINE_LOG,"駅データを完全リセットしました");
  res.json({message:"駅データを完全リセットしました"});
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
