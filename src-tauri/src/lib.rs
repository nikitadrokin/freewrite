use rusqlite::{params, Connection};
use serde::Serialize;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};

#[derive(Serialize)]
struct Entry {
    id: i64,
    content: String,
    created_at: i64,
    updated_at: i64,
    word_count: i64,
}

fn now_seconds() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| error.to_string())
}

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    Ok(app_data_dir.join("freewrite.sqlite"))
}

fn database(app: &AppHandle) -> Result<Connection, String> {
    let connection = Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .execute(
            "CREATE TABLE IF NOT EXISTS entries (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                word_count INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(connection)
}

fn count_words(content: &str) -> i64 {
    content.split_whitespace().count() as i64
}

#[tauri::command]
fn save_entry(app: AppHandle, id: Option<i64>, content: String) -> Result<Entry, String> {
    let connection = database(&app)?;
    let now = now_seconds()?;
    let word_count = count_words(&content);

    let entry_id = match id {
        Some(id) => {
            connection
                .execute(
                    "UPDATE entries SET content = ?1, updated_at = ?2, word_count = ?3 WHERE id = ?4",
                    params![content, now, word_count, id],
                )
                .map_err(|error| error.to_string())?;
            id
        }
        None => {
            connection
                .execute(
                    "INSERT INTO entries (content, created_at, updated_at, word_count) VALUES (?1, ?2, ?3, ?4)",
                    params![content, now, now, word_count],
                )
                .map_err(|error| error.to_string())?;
            connection.last_insert_rowid()
        }
    };

    get_entry(&connection, entry_id)
}

#[tauri::command]
fn list_entries(app: AppHandle) -> Result<Vec<Entry>, String> {
    let connection = database(&app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, content, created_at, updated_at, word_count
             FROM entries
             WHERE length(trim(content)) > 0
             ORDER BY updated_at DESC",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok(Entry {
                id: row.get(0)?,
                content: row.get(1)?,
                created_at: row.get(2)?,
                updated_at: row.get(3)?,
                word_count: row.get(4)?,
            })
        })
        .map_err(|error| error.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn delete_entry(app: AppHandle, id: i64) -> Result<(), String> {
    database(&app)?
        .execute("DELETE FROM entries WHERE id = ?1", params![id])
        .map_err(|error| error.to_string())?;
    Ok(())
}

fn get_entry(connection: &Connection, id: i64) -> Result<Entry, String> {
    connection
        .query_row(
            "SELECT id, content, created_at, updated_at, word_count FROM entries WHERE id = ?1",
            params![id],
            |row| {
                Ok(Entry {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                    word_count: row.get(4)?,
                })
            },
        )
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            save_entry,
            list_entries,
            delete_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
