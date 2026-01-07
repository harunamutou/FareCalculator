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

// 駅データ初期は空
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

// 駅追加
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

// JR本州三社風運賃表（距離 km → 基本運賃）
const fareTable = [
  {maxDistance: 1, fare: 140}, {maxDistance: 3, fare: 190}, {maxDistance: 10, fare: 200},
  {maxDistance: 15, fare: 240}, {maxDistance: 20, fare: 330},
  {maxDistance: 25, fare: 420}, {maxDistance: 30, fare: 510}, {maxDistance: 35, fare: 590},
  {maxDistance: 40, fare: 680}, {maxDistance: 45, fare: 770}, {maxDistance: 50, fare: 860},
  {maxDistance: 60, fare: 990}, {maxDistance: 70, fare: 1170}, {maxDistance: 80, fare: 1340},
  {maxDistance: 90, fare: 1520}, {maxDistance: 100, fare: 1690}, {maxDistance: 120, fare: 1980},
  {maxDistance: 140, fare: 2310}, {maxDistance: 160, fare: 2640},
];

// 運賃計算
function calculateFare(distance) {
  for (let i = 0; i < fareTable.length; i++) {
    if (distance <= fareTable[i].maxDistance) return fareTable[i].fare;
  }
  // 上限超過分は10kmごとに50円加算
  const lastFare = fareTable[fareTable.length - 1].fare;
  return lastFare + Math.ceil((distance - fareTable[fareTable.length - 1].maxDistance) / 10) * 50;
}

// ---------------- UI ----------------
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>経路検索アプリ</title>
<style>
body{font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;background:#f0f2f5;display:flex;justify-content:center;padding:50px;}
.container{width:420px;background:#fff;border-radius:10px;box-shadow:0 4px 20px rgba(0,0,0,0.1);padding:25px;}
input{width:100%;padding:10px;margin:6px 0;border-radius:6px;border:1px solid #ccc;}
button{width:100%;padding:12px;border:none;border-radius:6px;background:#007BFF;color:white;font-weight:bold;cursor:pointer;margin:8px 0;}
button:hover{background:#0056b3;}
.card{background:#fefefe;border-radius:8px;padding:15px;margin:10px 0;box-shadow:0 2px 10px rgba(0,0,0,0.08);}
.card p{margin:4px 0;}
.distance{color:#1E90FF;font-weight:bold;}
.fare{color:#28a745;font-weight:bold;}
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
<div id="result"></div>
<h3>駅追加（テスト用）</h3>
<input id="line" placeholder="路線名">
<input id="station" placeholder="駅名">
<input id="distance" placeholder="距離(km)">
<button onclick="addStationUI()">追加</button>
</div>
<script>
async function search() {
  const start=document.getElementById("start").value.trim();
  const end=document.getElementById("end").value.trim();
  const via=[document.getElementById("via1").value,
             document.getElementById("via2").value,
             document.getElementById("via3").value].filter(Boolean);
  const res=await fetch("/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({start,end,via})});
  const data=await res.json();
  const resultDiv=document.getElementById("result");
  if(data.error){
    resultDiv.innerHTML='<div class="card" style="color:red;">エラー: '+data.error+'</div>';
  }else{
    resultDiv.innerHTML='<div class="card"><p><strong>経路:</strong> '+data.path.join(" → ")+'</p><p><strong>総距離:</strong> <span class="distance">'+data.distance.toFixed(2)+' km</span></p><p><strong>運賃:</strong> <span class="fare">¥'+data.fare.toLocaleString()+'</span></p></div>';
  }
}
async function addStationUI() {
  const line=document.getElementById("line").value.trim();
  const station=document.getElementById("station").value.trim();
  const distance=document.getElementById("distance").value.trim();
  if(!line||!station||!distance){alert("line, station, distance は必須です");return;}
  const res=await fetch("/addStation",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({line,station,distance})});
  const data=await res.json();
  alert(JSON.stringify(data));
}
</script>
</body>
</html>`);
});

// 経路検索 API
app.post("/search", async (req,res)=>{
  const {start,end,via}=req.body;
  const result = searchRoute(start,end,via||[]);
  await sendDiscordLog(DISCORD_SEARCH_LOG, `検索: ${start} → ${end} 経由: ${via?.join(",") || "-"} 結果: ${JSON.stringify(result)}`);
  res.json(result);
});

// 駅追加 API
app.post("/addStation",(req,res)=>{
  const {line,station,distance}=req.body;
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
