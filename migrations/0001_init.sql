-- Bastion Siege D1 schema. The API also applies this automatically (CREATE IF NOT EXISTS) on first request.
CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  recovery_hash TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  friend_code TEXT UNIQUE NOT NULL,
  title TEXT,
  clan_id TEXT,
  best_wave INTEGER NOT NULL DEFAULT 0,
  reports INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS players_clan ON players(clan_id);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  created INTEGER NOT NULL,
  season TEXT NOT NULL,
  map TEXT, mode TEXT, seed TEXT, modifiers TEXT, ascension INTEGER,
  wave INTEGER, score INTEGER, kills INTEGER, hero_kills INTEGER, duration INTEGER
);
CREATE INDEX IF NOT EXISTS runs_player ON runs(player_id, created);

CREATE TABLE IF NOT EXISTS bests (
  player_id TEXT NOT NULL,
  board TEXT NOT NULL,          -- wave | score | hero | daily
  period TEXT NOT NULL,         -- 2026-W41 | all | daily-2026-10-08
  value INTEGER NOT NULL,
  updated INTEGER NOT NULL,
  PRIMARY KEY (player_id, board, period)
);
CREATE INDEX IF NOT EXISTS bests_board ON bests(board, period, value DESC);

CREATE TABLE IF NOT EXISTS friends (
  a TEXT NOT NULL, b TEXT NOT NULL, created INTEGER NOT NULL,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  payload TEXT,
  created INTEGER NOT NULL,
  claimed INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS inbox_player ON inbox(player_id, claimed, created);

CREATE TABLE IF NOT EXISTS clans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tag TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  leader TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  treasury INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS clan_weekly (
  clan_id TEXT NOT NULL, season TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0, rewarded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, season)
);
CREATE TABLE IF NOT EXISTS clan_contrib (
  clan_id TEXT NOT NULL, season TEXT NOT NULL, player_id TEXT NOT NULL,
  kills INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (clan_id, season, player_id)
);

CREATE TABLE IF NOT EXISTS siege (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  max_hp INTEGER NOT NULL,
  hp INTEGER NOT NULL,
  starts INTEGER NOT NULL,
  ends INTEGER NOT NULL,
  defeated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS siege_contrib (
  siege_id TEXT NOT NULL, player_id TEXT NOT NULL, damage INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (siege_id, player_id)
);

CREATE TABLE IF NOT EXISTS reports (reporter TEXT NOT NULL, target TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY (reporter, target));
CREATE TABLE IF NOT EXISTS blocks (player_id TEXT NOT NULL, blocked TEXT NOT NULL, PRIMARY KEY (player_id, blocked));
CREATE TABLE IF NOT EXISTS rate (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS season_claims (player_id TEXT NOT NULL, season TEXT NOT NULL, PRIMARY KEY (player_id, season));
