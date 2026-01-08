// server/index.js

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// PostgreSQL接続
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});

// ===== DB自動初期化 =====
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS fares (
      id SERIAL PRIMARY KEY,
      from_station INT REFERENCES stations(id),
      to_station INT REFERENCES stations(id),
      fare INT NOT NULL,
      UNIQUE(from_station, to_station)
    );

    CREATE TABLE IF NOT EXISTS routes (
      id SERIAL PRIMARY KEY,
      from_station INT REFERENCES stations(id),
      to_station INT REFERENCES stations(id),
      via_station_ids INT[],
      UNIQUE(from_station, to_station, via_station_ids)
    );
  `);
  console.log("DB initialized!");
}

// ===== APIルート =====

// 駅追加
app.post('/add_station', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "駅名を入力してください" });

  try {
    const result = await pool.query(
      'INSERT INTO stations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING RETURNING *',
      [name]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "駅は既に存在します" });
    }
    res.json({ station: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 運賃追加
app.post('/add_fare', async (req, res) => {
  const { from_id, to_id, fare } = req.body;
  if (!from_id || !to_id || !fare) return res.status(400).json({ error: "必要な情報を入力してください" });

  try {
    const result = await pool.query(
      'INSERT INTO fares (from_station, to_station, fare) VALUES ($1, $2, $3) ON CONFLICT (from_station, to_station) DO NOTHING RETURNING *',
      [from_id, to_id, fare]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "運賃は既に登録済みです" });
    }
    res.json({ fare: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 経路追加
app.post('/add_route', async (req, res) => {
  const { from_id, to_id, via_ids } = req.body;
  if (!from_id || !to_id) return res.status(400).json({ error: "必要な情報を入力してください" });

  try {
    const result = await pool.query(
      'INSERT INTO routes (from_station, to_station, via_station_ids) VALUES ($1, $2, $3) ON CONFLICT (from_station, to_station, via_station_ids) DO NOTHING RETURNING *',
      [from_id, to_id, via_ids || []]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: "経路は既に登録済みです" });
    }
    res.json({ route: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 運賃検索（複数経路対応・最大3経由）
app.get('/search', async (req, res) => {
  const { from_id, to_id, via_ids } = req.query;

  if (!from_id || !to_id) return res.status(400).json({ error: "出発駅と到着駅は必須です" });

  try {
    // via_idsはカンマ区切りで配列に変換
    const vias = via_ids ? via_ids.split(',').map(id => parseInt(id)) : [];

    // 経路検索（シンプルな例：直接運賃とvia運賃を合算）
    let totalFare = 0;

    // 直接運賃
    const direct = await pool.query(
      'SELECT fare FROM fares WHERE from_station=$1 AND to_station=$2',
      [from_id, to_id]
    );
    if (direct.rows.length > 0) totalFare += direct.rows[0].fare;

    // 経由駅がある場合、順番に合算
    for (let i = 0; i < vias.length; i++) {
      const start = i === 0 ? from_id : vias[i - 1];
      const end = vias[i];
      const fareRes = await pool.query('SELECT fare FROM fares WHERE from_station=$1 AND to_station=$2', [start, end]);
      if (fareRes.rows.length === 0) return res.status(404).json({ error: `運賃が未登録です（${start} → ${end}）` });
      totalFare += fareRes.rows[0].fare;
    }

    // 最後の区間
    if (vias.length > 0) {
      const last = vias[vias.length - 1];
      const fareRes = await pool.query('SELECT fare FROM fares WHERE from_station=$1 AND to_station=$2', [last, to_id]);
      if (fareRes.rows.length === 0) return res.status(404).json({ error: `運賃が未登録です（${last} → ${to_id}）` });
      totalFare += fareRes.rows[0].fare;
    }

    res.json({ from_id, to_id, via_ids: vias, totalFare });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ===== DB初期化 → サーバー起動 =====
initDB().then(() => {
  app.listen(process.env.PORT || 3000, () => {
    console.log(`Server running on port ${process.env.PORT || 3000}`);
  });
}).catch(err => {
  console.error("DB初期化エラー:", err);
});
