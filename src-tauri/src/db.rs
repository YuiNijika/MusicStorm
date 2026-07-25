use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Manager, State};

pub struct DbState(pub Mutex<Connection>);

const SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS library_folder (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  recursive INTEGER NOT NULL DEFAULT 1,
  track_count INTEGER NOT NULL DEFAULT 0,
  last_scanned_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS track (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  cover_url TEXT,
  file_path TEXT,
  folder_id TEXT,
  lrc_path TEXT,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  added_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES library_folder(id)
);

CREATE TABLE IF NOT EXISTS playlist (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  folder_id TEXT,
  cover_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS playlist_track (
  playlist_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS play_session (
  id TEXT PRIMARY KEY,
  track_id TEXT NOT NULL,
  source TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  listened_ms INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  device_id TEXT,
  quality_br INTEGER
);

CREATE TABLE IF NOT EXISTS listen_daily (
  day TEXT PRIMARY KEY,
  play_count INTEGER NOT NULL DEFAULT 0,
  unique_tracks INTEGER NOT NULL DEFAULT 0,
  total_ms INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_track_folder ON track(folder_id);
CREATE INDEX IF NOT EXISTS idx_session_started ON play_session(started_at);
"#;

const SCHEMA_V2: &str = r#"
CREATE TABLE IF NOT EXISTS api_cache (
  cache_key TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_cache_expires ON api_cache(expires_at);
"#;

const SCHEMA_V3: &str = r#"
ALTER TABLE library_folder ADD COLUMN artist TEXT NOT NULL DEFAULT '';
ALTER TABLE library_folder ADD COLUMN cover_data TEXT;
"#;

fn now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn new_id() -> String {
    format!(
        "{:x}-{:x}",
        now_ms(),
        (now_ms() as u64).wrapping_mul(0x9e37_79b9)
    )
}

pub fn open_db(app: &AppHandle) -> Result<Connection, String> {
    let paths = ensure_storage_paths(app)?;
    let conn = Connection::open(&paths.database_path).map_err(|e| format!("open db: {e}"))?;
    migrate(&conn)?;
    Ok(conn)
}

/// 对齐 G2M：exe 同级目录下 resources/config + cache
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoragePaths {
    pub app_dir: String,
    pub config_dir: String,
    pub cache_dir: String,
    pub database_path: String,
}

/// 运行目录 = 可执行文件所在目录（G2M 同款布局）
/// 优先 Tauri PathResolver::executable_dir，失败再 fallback current_exe().parent()
fn resolve_app_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if let Ok(dir) = app.path().executable_dir() {
        return Ok(dir);
    }

    let executable_path = std::env::current_exe()
        .map_err(|error| format!("failed to resolve executable path: {error}"))?;
    executable_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "failed to resolve application directory".to_string())
}

pub fn ensure_storage_paths(app: &AppHandle) -> Result<StoragePathsInner, String> {
    let app_dir = resolve_app_dir(app)?;

    // G2M: <exe_dir>/resources/config/database.db
    let resources_dir = app_dir.join("resources");
    let config_dir = resources_dir.join("config");
    // 文件缓存旁挂：<exe_dir>/cache
    let cache_dir = app_dir.join("cache");

    fs::create_dir_all(&config_dir)
        .map_err(|error| format!("failed to create config directory: {error}"))?;
    fs::create_dir_all(&cache_dir)
        .map_err(|error| format!("failed to create cache directory: {error}"))?;

    let database_path = config_dir.join("musicstorm.db");
    migrate_legacy_app_data_db(app, &database_path)?;

    Ok(StoragePathsInner {
        app_dir,
        config_dir,
        cache_dir,
        database_path,
    })
}

pub struct StoragePathsInner {
    pub app_dir: PathBuf,
    pub config_dir: PathBuf,
    pub cache_dir: PathBuf,
    pub database_path: PathBuf,
}

fn migrate_legacy_app_data_db(app: &AppHandle, target: &Path) -> Result<(), String> {
    if target.exists() {
        return Ok(());
    }

    for candidate in legacy_db_candidates(app) {
        if candidate.exists() && candidate != target {
            if let Some(parent) = target.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if fs::copy(&candidate, target).is_ok() {
                return Ok(());
            }
        }
    }
    Ok(())
}

/// 旧版可能落在 Tauri app_local_data / 环境变量路径
fn legacy_db_candidates(app: &AppHandle) -> Vec<PathBuf> {
    let mut out = Vec::new();

    if let Ok(dir) = app.path().app_local_data_dir() {
        out.push(dir.join("musicstorm.db"));
        out.push(dir.join("data").join("musicstorm.db"));
    }
    if let Ok(dir) = app.path().app_data_dir() {
        out.push(dir.join("musicstorm.db"));
        out.push(dir.join("data").join("musicstorm.db"));
    }
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        out.push(
            PathBuf::from(&local)
                .join("com.musicstorm.app")
                .join("musicstorm.db"),
        );
        out.push(PathBuf::from(&local).join("music-storm").join("musicstorm.db"));
    }
    if let Ok(roaming) = std::env::var("APPDATA") {
        out.push(
            PathBuf::from(roaming)
                .join("com.musicstorm.app")
                .join("musicstorm.db"),
        );
    }
    out
}

fn migrate(conn: &Connection) -> Result<(), String> {
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("user_version: {e}"))?;
    if version < 1 {
        conn.execute_batch(SCHEMA_V1)
            .map_err(|e| format!("schema v1: {e}"))?;
        conn.pragma_update(None, "user_version", 1)
            .map_err(|e| format!("set user_version: {e}"))?;
    }
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("user_version: {e}"))?;
    if version < 2 {
        conn.execute_batch(SCHEMA_V2)
            .map_err(|e| format!("schema v2: {e}"))?;
        conn.pragma_update(None, "user_version", 2)
            .map_err(|e| format!("set user_version: {e}"))?;
    }
    let version: i32 = conn
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(|e| format!("user_version: {e}"))?;
    if version < 3 {
        // ALTER 可能在重复列名时失败；用 try 逐条执行
        for stmt in SCHEMA_V3
            .split(';')
            .map(str::trim)
            .filter(|s| !s.is_empty())
        {
            let _ = conn.execute_batch(&format!("{stmt};"));
        }
        conn.pragma_update(None, "user_version", 3)
            .map_err(|e| format!("set user_version: {e}"))?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertFolderInput {
    pub path: String,
    pub display_name: Option<String>,
    pub track_count: i64,
    pub artist: Option<String>,
    pub cover_data: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTrackInput {
    pub id: String,
    pub source: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration_ms: i64,
    pub cover_url: Option<String>,
    pub file_path: Option<String>,
    pub folder_path: Option<String>,
    pub lrc_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionStart {
    pub id: String,
    pub track_id: String,
    pub source: String,
    pub started_at: i64,
    pub quality_br: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaySessionEnd {
    pub id: String,
    pub track_id: String,
    pub source: String,
    pub started_at: i64,
    pub ended_at: i64,
    pub listened_ms: i64,
    pub completed: bool,
    pub quality_br: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListenStats {
    pub day: String,
    pub play_count: i64,
    pub unique_tracks: i64,
    pub total_ms: i64,
}

fn folder_name(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(path)
        .to_string()
}

#[tauri::command]
pub fn db_upsert_folder(
    state: State<'_, DbState>,
    input: UpsertFolderInput,
) -> Result<String, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let ts = now_ms();
    let display = input
        .display_name
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| folder_name(&input.path));
    let artist = input.artist.unwrap_or_default();
    let cover_data = input.cover_data.filter(|s| !s.is_empty());

    let existing: Option<String> = conn
        .query_row(
            "SELECT id FROM library_folder WHERE path = ?1",
            params![input.path],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        conn.execute(
            "UPDATE library_folder SET display_name = ?1, track_count = ?2, last_scanned_at = ?3, updated_at = ?3, artist = ?4, cover_data = ?5 WHERE id = ?6",
            params![display, input.track_count, ts, artist, cover_data, id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(id);
    }

    let id = new_id();
    conn.execute(
        "INSERT INTO library_folder (id, path, display_name, recursive, track_count, last_scanned_at, created_at, updated_at, artist, cover_data)
         VALUES (?1, ?2, ?3, 1, ?4, ?5, ?5, ?5, ?6, ?7)",
        params![id, input.path, display, input.track_count, ts, artist, cover_data],
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub fn db_upsert_tracks(
    state: State<'_, DbState>,
    tracks: Vec<UpsertTrackInput>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let ts = now_ms();
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for track in tracks {
        let folder_id: Option<String> = match track.folder_path.as_ref() {
            Some(path) => tx
                .query_row(
                    "SELECT id FROM library_folder WHERE path = ?1",
                    params![path],
                    |row| row.get(0),
                )
                .ok(),
            None => None,
        };

        tx.execute(
            "INSERT INTO track (id, source, title, artist, album, duration_ms, cover_url, file_path, folder_id, lrc_path, added_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(id) DO UPDATE SET
               title = excluded.title,
               artist = excluded.artist,
               album = excluded.album,
               duration_ms = excluded.duration_ms,
               cover_url = excluded.cover_url,
               file_path = excluded.file_path,
               folder_id = excluded.folder_id,
               lrc_path = excluded.lrc_path,
               updated_at = excluded.updated_at",
            params![
                track.id,
                track.source,
                track.title,
                track.artist,
                track.album,
                track.duration_ms,
                track.cover_url,
                track.file_path,
                folder_id,
                track.lrc_path,
                ts,
            ],
        )
        .map_err(|e| e.to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_start_play_session(
    state: State<'_, DbState>,
    input: PlaySessionStart,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO play_session (id, track_id, source, started_at, ended_at, listened_ms, completed, quality_br)
         VALUES (?1, ?2, ?3, ?4, NULL, 0, 0, ?5)",
        params![
            input.id,
            input.track_id,
            input.source,
            input.started_at,
            input.quality_br,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn db_end_play_session(
    state: State<'_, DbState>,
    input: PlaySessionEnd,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let completed = if input.completed { 1 } else { 0 };
    conn.execute(
        "INSERT INTO play_session (id, track_id, source, started_at, ended_at, listened_ms, completed, quality_br)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           listened_ms = excluded.listened_ms,
           completed = excluded.completed,
           quality_br = excluded.quality_br",
        params![
            input.id,
            input.track_id,
            input.source,
            input.started_at,
            input.ended_at,
            input.listened_ms,
            completed,
            input.quality_br,
        ],
    )
    .map_err(|e| e.to_string())?;

    // 有效听歌：≥30s 或 completed
    let counts = input.completed || input.listened_ms >= 30_000;
    if counts {
        let day = chrono_day(input.ended_at);
        conn.execute(
            "INSERT INTO listen_daily (day, play_count, unique_tracks, total_ms)
             VALUES (?1, 1, 1, ?2)
             ON CONFLICT(day) DO UPDATE SET
               play_count = play_count + 1,
               total_ms = total_ms + excluded.total_ms",
            params![day, input.listened_ms],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn chrono_day(ms: i64) -> String {
    // 简化：用 UTC 日；本地统计后续可改
    let secs = ms / 1000;
    let days = secs / 86_400;
    // 1970-01-01 + days — 用简单格式够用
    let epoch_days = days;
    // 避免引入 chrono 依赖：YYYY-MM-DD 近似用 ISO 从系统本地格式化
    use std::time::{Duration, UNIX_EPOCH};
    let datetime = UNIX_EPOCH + Duration::from_secs(secs.max(0) as u64);
    // Windows 无 chrono 时用 debug 时间不够；用固定公式
    let _ = datetime;
    // 使用本地偏移粗略：直接存 unix day 也可；这里用简易算法
    format_ymd(epoch_days)
}

fn format_ymd(epoch_days: i64) -> String {
    // 简化公历换算（足够统计用途）
    let z = epoch_days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{:04}-{:02}-{:02}", y, m, d)
}

#[tauri::command]
pub fn db_get_listen_stats(
    state: State<'_, DbState>,
    day: Option<String>,
) -> Result<Option<ListenStats>, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let day = day.unwrap_or_else(|| format_ymd((now_ms() / 1000) / 86_400));
    let row = conn.query_row(
        "SELECT day, play_count, unique_tracks, total_ms FROM listen_daily WHERE day = ?1",
        params![day],
        |row| {
            Ok(ListenStats {
                day: row.get(0)?,
                play_count: row.get(1)?,
                unique_tracks: row.get(2)?,
                total_ms: row.get(3)?,
            })
        },
    );
    match row {
        Ok(stats) => Ok(Some(stats)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_get_setting(state: State<'_, DbState>, key: String) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    match conn.query_row(
        "SELECT value FROM app_setting WHERE key = ?1",
        params![key],
        |row| row.get(0),
    ) {
        Ok(v) => Ok(Some(v)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn db_set_setting(
    state: State<'_, DbState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    conn.execute(
        "INSERT INTO app_setting (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn get_storage_paths(app: AppHandle) -> Result<StoragePaths, String> {
    let paths = ensure_storage_paths(&app)?;
    Ok(StoragePaths {
        app_dir: paths.app_dir.to_string_lossy().into_owned(),
        config_dir: paths.config_dir.to_string_lossy().into_owned(),
        cache_dir: paths.cache_dir.to_string_lossy().into_owned(),
        database_path: paths.database_path.to_string_lossy().into_owned(),
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiCacheEntry {
    pub body: String,
    pub created_at: i64,
    pub expires_at: i64,
}

#[tauri::command]
pub fn api_cache_get(
    state: State<'_, DbState>,
    key: String,
) -> Result<Option<ApiCacheEntry>, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let now = now_ms();
    // 顺手清理过期
    let _ = conn.execute("DELETE FROM api_cache WHERE expires_at < ?1", params![now]);

    match conn.query_row(
        "SELECT body, created_at, expires_at FROM api_cache WHERE cache_key = ?1 AND expires_at >= ?2",
        params![key, now],
        |row| {
            Ok(ApiCacheEntry {
                body: row.get(0)?,
                created_at: row.get(1)?,
                expires_at: row.get(2)?,
            })
        },
    ) {
        Ok(entry) => Ok(Some(entry)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

fn sanitize_cache_filename(key: &str) -> String {
    key.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
}

fn remove_cache_file(cache_dir: &Path, key: &str) {
    let safe = sanitize_cache_filename(key);
    if safe.is_empty() {
        return;
    }
    let file = cache_dir.join(format!("{safe}.json"));
    let _ = fs::remove_file(file);
}

/// 删除已过期的 DB 行，并移除对应 cache 目录文件
pub fn purge_expired_api_cache(app: &AppHandle, conn: &Connection) -> Result<u64, String> {
    let now = now_ms();
    let mut expired_keys: Vec<String> = Vec::new();
    {
        let mut stmt = conn
            .prepare("SELECT cache_key FROM api_cache WHERE expires_at < ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![now], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        for row in rows.flatten() {
            expired_keys.push(row);
        }
    }

    let deleted = conn
        .execute("DELETE FROM api_cache WHERE expires_at < ?1", params![now])
        .map_err(|e| e.to_string())? as u64;

    if let Ok(paths) = ensure_storage_paths(app) {
        for key in &expired_keys {
            remove_cache_file(&paths.cache_dir, key);
        }

        // 顺带清掉 cache 目录里无 DB 对应的孤儿 json
        if let Ok(entries) = fs::read_dir(&paths.cache_dir) {
            let mut live_files = std::collections::HashSet::new();
            if let Ok(mut stmt) = conn.prepare("SELECT cache_key FROM api_cache") {
                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                    for key in rows.flatten() {
                        live_files.insert(format!("{}.json", sanitize_cache_filename(&key)));
                    }
                }
            }
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) != Some("json") {
                    continue;
                }
                let name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or_default()
                    .to_string();
                if !live_files.contains(&name) {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }

    Ok(deleted)
}

#[tauri::command]
pub fn api_cache_purge_expired(
    app: AppHandle,
    state: State<'_, DbState>,
) -> Result<u64, String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    purge_expired_api_cache(&app, &conn)
}

#[tauri::command]
pub fn api_cache_set(
    app: AppHandle,
    state: State<'_, DbState>,
    key: String,
    body: String,
    ttl_ms: i64,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    let now = now_ms();
    let ttl = ttl_ms.max(1_000);
    let expires = now + ttl;
    // 写入前先清过期，避免无限堆积
    let _ = purge_expired_api_cache(&app, &conn);

    conn.execute(
        "INSERT INTO api_cache (cache_key, body, created_at, expires_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(cache_key) DO UPDATE SET
           body = excluded.body,
           created_at = excluded.created_at,
           expires_at = excluded.expires_at",
        params![key, body, now, expires],
    )
    .map_err(|e| e.to_string())?;

    // 同步写一份到 exe/cache 目录便于排查
    if let Ok(paths) = ensure_storage_paths(&app) {
        let file = paths
            .cache_dir
            .join(format!("{}.json", sanitize_cache_filename(&key)));
        let _ = fs::write(file, &body);
    }
    Ok(())
}

#[tauri::command]
pub fn api_cache_clear(app: AppHandle, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|_| "db lock".to_string())?;
    conn.execute("DELETE FROM api_cache", [])
        .map_err(|e| e.to_string())?;
    if let Ok(paths) = ensure_storage_paths(&app) {
        if let Ok(entries) = fs::read_dir(&paths.cache_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    let _ = fs::remove_file(path);
                }
            }
        }
    }
    Ok(())
}

#[allow(dead_code)]
pub fn db_path_hint(app: &AppHandle) -> Result<PathBuf, String> {
    let paths = ensure_storage_paths(app)?;
    Ok(paths.database_path)
}