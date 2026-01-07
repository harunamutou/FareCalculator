import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static("../public"));

const PORT = process.env.PORT || 3000;

// Discord Webhook
const DISCORD_SEARCH_LOG = process.env.DISCORD_SEARCH_LOG;
const DISCORD_ADDLINE_LOG = process.env.DISCORD_ADDLINE_LOG;
const DISCORD_ERROR_LOG = process.env.DISCORD_ERROR_LOG;
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;

// 駅データリスト（サーバー起動時は空）
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

// エラー専用
function logErrorToDiscord(message) {
  sendDiscordLog(DISCORD_ERROR_LOG, message);
}

// 駅追加（Discord専用）
function addStation(line, station, distance) {
  if (!line || !station || distance == null) return false;
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
      const to = stationData.find(s => s.station === path[i + 1].trim());
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

// 簡易運賃表
const fareTable = [
  {maxDistance: 1, fare: 140}, {maxDistance: 3, fare: 200}, {maxDistance: 6, fare: 230},
  {maxDistance: 10, fare: 280}, {maxDistance: 15, fare: 330}, {maxDistance: 20, fare: 380},
  {maxDistance: 25, fare: 430}, {maxDistance: 30, fare: 480},
  {maxDistance: 35, fare: 530}, {maxDistance: 40, fare: 580}, {maxDistance: 45, fare: 630},
  {maxDistance: 50, fare: 680}
];

function calculateFare(distance){
  for (let i = 0; i < fareTable.length; i++){
    if(distance <= fareTable[i].maxDistance) return fareTable[i].fare;
  }
  const lastFare = fareTable[fareTable.length-1].fare;
  return lastFare + Math.ceil((distance - fareTable[fareTable.length-1].maxDistance)/10)*50;
}

// Web UI
app.get("/", (req,res)=>res.sendFile("index.html",{root:"../public"}));

// 検索API
app.post("/search", async (req,res)=>{
  const {start,end,via} = req.body;
  const result = searchRoute(start,end,via||[]);
  await sendDiscordLog(DISCORD_SEARCH_LOG, `検索: ${start} → ${end} 経由: ${via?.join(",") || "-"} 結果: ${JSON.stringify(result)}`);
  res.json(result);
});

// Discord専用 駅追加API
app.post("/addStationDiscord",(req,res)=>{
  const {line,station,distance,token} = req.body;
  if(token !== DISCORD_TOKEN) return res.status(403).json({error:"認証失敗"});
  const added = addStation(line,station,distance);
  res.json({added,station,line,distance});
});

// データリセット
app.post("/resetStations",(req,res)=>{
  stationData=[];
  sendDiscordLog(DISCORD_ADDLINE_LOG,"駅データを完全リセットしました");
  res.json({message:"駅データを完全リセットしました"});
});

app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
