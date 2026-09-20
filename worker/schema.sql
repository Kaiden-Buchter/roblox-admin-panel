PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_credentials (
  admin_id INTEGER PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(admin_id) REFERENCES admins(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS players (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  last_seen_at INTEGER,
  last_server_id TEXT,
  stats_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
  server_id TEXT PRIMARY KEY,
  game_name TEXT,
  job_id TEXT,
  player_count INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS active_sessions (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  server_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'Playing',
  joined_at INTEGER NOT NULL,
  last_heartbeat_at INTEGER NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  username TEXT,
  reason TEXT NOT NULL,
  expires_at INTEGER,
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER,
  revoked_by INTEGER,
  FOREIGN KEY(created_by) REFERENCES admins(id),
  FOREIGN KEY(revoked_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_bans_user_active ON bans(user_id, revoked_at, expires_at);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_type TEXT NOT NULL,
  target_user_id TEXT,
  server_id TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  claimed_at INTEGER,
  completed_at INTEGER,
  result_json TEXT,
  FOREIGN KEY(created_by) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_commands_server_status ON commands(server_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_commands_user_status ON commands(target_user_id, status, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  admin_id INTEGER,
  admin_username TEXT,
  admin_display_name TEXT,
  action TEXT NOT NULL,
  target_user_id TEXT,
  target_username TEXT,
  server_id TEXT,
  reason TEXT,
  changed_values_json TEXT,
  success INTEGER NOT NULL DEFAULT 1,
  error_message TEXT,
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action, timestamp DESC);
