-- 駅テーブル
CREATE TABLE IF NOT EXISTS stations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

-- 運賃テーブル
CREATE TABLE IF NOT EXISTS fares (
    id SERIAL PRIMARY KEY,
    from_station INT REFERENCES stations(id),
    to_station INT REFERENCES stations(id),
    fare INT NOT NULL,
    UNIQUE(from_station, to_station)
);

-- 経路テーブル
CREATE TABLE IF NOT EXISTS routes (
    id SERIAL PRIMARY KEY,
    from_station INT REFERENCES stations(id),
    to_station INT REFERENCES stations(id),
    via_station_ids INT[],
    UNIQUE(from_station, to_station, via_station_ids)
);
