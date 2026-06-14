use chrono::{Datelike, Local, TimeZone};
use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager};
#[cfg(not(target_os = "macos"))]
use tauri_plugin_opener::OpenerExt;

const MONTH_ABBREVS: [&str; 12] = [
    "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec",
];

#[derive(Serialize)]
struct Entry {
    id: String,
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

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn entries_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app_data_dir(app)?.join("entries");
    fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

fn sqlite_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("freewrite.sqlite"))
}

fn count_words(content: &str) -> i64 {
    content.split_whitespace().count() as i64
}

fn system_time_to_seconds(time: SystemTime) -> Result<i64, String> {
    time.duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| error.to_string())
}

fn entry_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{id}.md"))
}

fn date_prefix_from_timestamp(timestamp_secs: i64) -> String {
    let datetime = Local
        .timestamp_opt(timestamp_secs, 0)
        .single()
        .unwrap_or_else(Local::now);

    let month = MONTH_ABBREVS[(datetime.month() as usize) - 1];
    format!(
        "{}-{}-{:02}",
        datetime.year(),
        month,
        datetime.day()
    )
}

fn next_entry_id(dir: &Path, timestamp_secs: i64) -> Result<String, String> {
    let prefix = date_prefix_from_timestamp(timestamp_secs);
    let id_prefix = format!("{prefix}-");
    let mut max_increment = 0u32;

    for entry in fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        let Some(stem) = path.file_stem() else {
            continue;
        };

        let stem = stem.to_string_lossy();
        if !stem.starts_with(&id_prefix) {
            continue;
        }

        let Some(suffix) = stem.strip_prefix(&id_prefix) else {
            continue;
        };

        if let Ok(increment) = suffix.parse::<u32>() {
            max_increment = max_increment.max(increment);
        }
    }

    Ok(format!("{prefix}-{}", max_increment + 1))
}

fn read_entry(path: &Path) -> Result<Entry, String> {
    let id = path
        .file_stem()
        .ok_or_else(|| "Entry file has no name".to_string())?
        .to_string_lossy()
        .to_string();

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let word_count = count_words(&content);
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;

    let updated_at = system_time_to_seconds(
        metadata
            .modified()
            .map_err(|error| error.to_string())?,
    )?;

    let created_at = match metadata.created().or_else(|_| metadata.modified()) {
        Ok(time) => system_time_to_seconds(time)?,
        Err(_) => updated_at,
    };

    Ok(Entry {
        id,
        content,
        created_at,
        updated_at,
        word_count,
    })
}

fn migrate_sqlite_if_needed(app: &AppHandle) -> Result<(), String> {
    let sqlite_file = sqlite_path(app)?;
    if !sqlite_file.exists() {
        return Ok(());
    }

    let dir = entries_dir(app)?;
    let has_entries = fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .any(|entry| {
            entry
                .path()
                .extension()
                .is_some_and(|extension| extension == "md")
        });

    if has_entries {
        return Ok(());
    }

    migrate_sqlite_entries(&sqlite_file, &dir)?;

    let backup_path = sqlite_file.with_extension("sqlite.bak");
    if backup_path.exists() {
        fs::remove_file(&backup_path).map_err(|error| error.to_string())?;
    }
    fs::rename(&sqlite_file, &backup_path).map_err(|error| error.to_string())?;

    Ok(())
}

fn migrate_sqlite_entries(sqlite_file: &Path, entries_directory: &Path) -> Result<(), String> {
    use filetime::{set_file_times, FileTime};
    use rusqlite::Connection;

    let connection = Connection::open(sqlite_file).map_err(|error| error.to_string())?;
    let mut statement = connection
        .prepare(
            "SELECT content, created_at, updated_at
             FROM entries
             WHERE length(trim(content)) > 0",
        )
        .map_err(|error| error.to_string())?;

    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
            ))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;

    let mut rows = rows;
    rows.sort_by_key(|(_, created_at, _)| *created_at);

    for (content, created_at, updated_at) in rows {
        let id = next_entry_id(entries_directory, created_at)?;
        let path = entry_path(entries_directory, &id);

        fs::write(&path, content).map_err(|error| error.to_string())?;

        let created = FileTime::from_unix_time(created_at, 0);
        let updated = FileTime::from_unix_time(updated_at, 0);
        set_file_times(&path, created, updated).map_err(|error| error.to_string())?;
    }

    Ok(())
}

fn ensure_storage(app: &AppHandle) -> Result<PathBuf, String> {
    migrate_sqlite_if_needed(app)?;
    entries_dir(app)
}

#[tauri::command]
fn save_entry(app: AppHandle, id: Option<String>, content: String) -> Result<Entry, String> {
    let dir = ensure_storage(&app)?;
    let now = now_seconds()?;

    let entry_id = match id {
        Some(entry_id) => {
            let path = entry_path(&dir, &entry_id);
            if !path.exists() {
                return Err(format!("Entry not found: {entry_id}"));
            }
            fs::write(&path, &content).map_err(|error| error.to_string())?;
            entry_id
        }
        None => {
            let entry_id = next_entry_id(&dir, now)?;
            let path = entry_path(&dir, &entry_id);
            fs::write(&path, &content).map_err(|error| error.to_string())?;

            use filetime::{set_file_times, FileTime};
            let created = FileTime::from_unix_time(now, 0);
            set_file_times(&path, created, created).map_err(|error| error.to_string())?;

            entry_id
        }
    };

    read_entry(&entry_path(&dir, &entry_id))
}

#[tauri::command]
fn list_entries(app: AppHandle) -> Result<Vec<Entry>, String> {
    let dir = ensure_storage(&app)?;

    let mut entries = fs::read_dir(&dir)
        .map_err(|error| error.to_string())?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "md"))
        .filter_map(|path| read_entry(&path).ok())
        .filter(|entry| !entry.content.trim().is_empty())
        .collect::<Vec<_>>();

    entries.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(entries)
}

#[tauri::command]
fn delete_entry(app: AppHandle, id: String) -> Result<(), String> {
    let dir = ensure_storage(&app)?;
    let path = entry_path(&dir, &id);

    if path.exists() {
        fs::remove_file(&path).map_err(|error| error.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn reveal_entries_folder(app: AppHandle) -> Result<(), String> {
    let dir = ensure_storage(&app)?;

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&dir)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        app.opener()
            .open_path(dir.to_string_lossy().to_string(), None::<&str>)
            .map_err(|error| error.to_string())?;
    }

    Ok(())
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
            delete_entry,
            reveal_entries_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
