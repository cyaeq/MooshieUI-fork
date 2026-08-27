//! SQLite storage for the prompt favourites library.
//!
//! Replaces the previous browser-side `localStorage` persistence so favourites
//! survive across browsers/devices and become the authoritative store. Each
//! user gets an independent DB file:
//!   - desktop / localhost admin: `{app_data_dir}/prompt_favourites.sqlite`
//!   - LAN user `alice`:          `{app_data_dir}/users/alice/prompt_favourites.sqlite`
//!
//! Connections are opened per operation. Favourites are edited at human speed,
//! so the open cost is irrelevant and short connections keep multi-user access
//! trivially correct.

use std::path::PathBuf;

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};

use crate::config;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptFavouriteEntry {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub positive: String,
    #[serde(default)]
    pub negative: String,
    #[serde(default = "default_mode")]
    pub mode: String,
    #[serde(default = "default_style_preset")]
    pub style_preset: String,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub sort_order: i64,
    #[serde(default)]
    pub group_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptFavouriteGroup {
    pub id: String,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub collapsed: bool,
    #[serde(default)]
    pub created_at: i64,
    #[serde(default)]
    pub sort_order: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PromptFavouritesSnapshot {
    #[serde(default)]
    pub entries: Vec<PromptFavouriteEntry>,
    #[serde(default)]
    pub groups: Vec<PromptFavouriteGroup>,
}

fn default_mode() -> String {
    "image".to_string()
}

fn default_style_preset() -> String {
    "none".to_string()
}

/// Sanitise a username for use as a directory name. Mirrors
/// `user_prefs::prefs_path` so a user's favourites and prefs land under the
/// same directory.
fn safe_username(username: &str) -> Option<String> {
    let safe: String = username
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-')
        .collect();
    if safe.is_empty() {
        None
    } else {
        Some(safe)
    }
}

fn db_path(username: Option<&str>) -> Option<PathBuf> {
    let base = config::app_data_dir()?;
    match username {
        Some(name) => {
            let safe = safe_username(name)?;
            Some(
                base.join("users")
                    .join(safe)
                    .join("prompt_favourites.sqlite"),
            )
        }
        None => Some(base.join("prompt_favourites.sqlite")),
    }
}

fn open(username: Option<&str>) -> Result<Connection, String> {
    let path = db_path(username).ok_or("Cannot resolve prompt favourites database path")?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let c = Connection::open(&path).map_err(|e| e.to_string())?;
    init_schema(&c).map_err(|e| e.to_string())?;
    Ok(c)
}

fn init_schema(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        r#"
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS prompt_favourite_groups (
            id         TEXT    PRIMARY KEY,
            title      TEXT    NOT NULL DEFAULT '',
            collapsed  INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS prompt_favourites (
            id           TEXT    PRIMARY KEY,
            name         TEXT    NOT NULL DEFAULT '',
            positive     TEXT    NOT NULL DEFAULT '',
            negative     TEXT    NOT NULL DEFAULT '',
            mode         TEXT    NOT NULL DEFAULT 'image',
            style_preset TEXT    NOT NULL DEFAULT 'none',
            created_at   INTEGER NOT NULL DEFAULT 0,
            sort_order   INTEGER NOT NULL DEFAULT 0,
            group_id     TEXT REFERENCES prompt_favourite_groups(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_pf_group ON prompt_favourites(group_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_pf_sort ON prompt_favourites(sort_order);
        "#,
    )?;
    apply_migrations(c);
    Ok(())
}

/// Additive, idempotent column migrations. SQLite has no ADD COLUMN IF NOT
/// EXISTS, so a re-run fails with "duplicate column name" — that exact error is
/// expected and swallowed; anything else is logged.
fn apply_migrations(c: &Connection) {
    for ddl in [
        "ALTER TABLE prompt_favourites ADD COLUMN name TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE prompt_favourites ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE prompt_favourite_groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
    ] {
        if let Err(e) = c.execute(ddl, []) {
            let msg = e.to_string();
            if !msg.contains("duplicate column name") {
                log::warn!("prompt_favourites_db: migration failed ({ddl}): {msg}");
            }
        }
    }
}

pub fn list(username: Option<&str>) -> Result<PromptFavouritesSnapshot, String> {
    let c = open(username)?;
    let mut groups = Vec::new();
    {
        let mut stmt = c
            .prepare(
                "SELECT id, title, collapsed, created_at, sort_order \
                 FROM prompt_favourite_groups ORDER BY sort_order ASC, created_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(PromptFavouriteGroup {
                    id: r.get(0)?,
                    title: r.get(1)?,
                    collapsed: r.get::<_, i64>(2)? != 0,
                    created_at: r.get(3)?,
                    sort_order: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            groups.push(row.map_err(|e| e.to_string())?);
        }
    }
    let mut entries = Vec::new();
    {
        let mut stmt = c
            .prepare(
                "SELECT id, name, positive, negative, mode, style_preset, created_at, sort_order, group_id \
                 FROM prompt_favourites ORDER BY sort_order ASC, created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok(PromptFavouriteEntry {
                    id: r.get(0)?,
                    name: r.get(1)?,
                    positive: r.get(2)?,
                    negative: r.get(3)?,
                    mode: r.get(4)?,
                    style_preset: r.get(5)?,
                    created_at: r.get(6)?,
                    sort_order: r.get(7)?,
                    group_id: r.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        for row in rows {
            entries.push(row.map_err(|e| e.to_string())?);
        }
    }
    Ok(PromptFavouritesSnapshot { entries, groups })
}

fn upsert_entry_tx(c: &Connection, e: &PromptFavouriteEntry) -> Result<(), String> {
    c.execute(
        "INSERT INTO prompt_favourites \
            (id, name, positive, negative, mode, style_preset, created_at, sort_order, group_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(id) DO UPDATE SET \
            name = excluded.name, positive = excluded.positive, negative = excluded.negative, \
            mode = excluded.mode, style_preset = excluded.style_preset, \
            sort_order = excluded.sort_order, group_id = excluded.group_id",
        params![
            e.id,
            e.name,
            e.positive,
            e.negative,
            e.mode,
            e.style_preset,
            e.created_at,
            e.sort_order,
            e.group_id,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn upsert_group_tx(c: &Connection, g: &PromptFavouriteGroup) -> Result<(), String> {
    c.execute(
        "INSERT INTO prompt_favourite_groups (id, title, collapsed, created_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(id) DO UPDATE SET \
            title = excluded.title, collapsed = excluded.collapsed, sort_order = excluded.sort_order",
        params![
            g.id,
            g.title,
            i64::from(g.collapsed),
            g.created_at,
            g.sort_order
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_entry(username: Option<&str>, entry: &PromptFavouriteEntry) -> Result<(), String> {
    let c = open(username)?;
    upsert_entry_tx(&c, entry)
}

pub fn delete_entry(username: Option<&str>, id: &str) -> Result<(), String> {
    let c = open(username)?;
    c.execute("DELETE FROM prompt_favourites WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Rewrite `sort_order` from the position of each id in `ids`. Ids absent from
/// the database are ignored.
pub fn reorder_entries(username: Option<&str>, ids: &[String]) -> Result<(), String> {
    let mut c = open(username)?;
    let tx = c.transaction().map_err(|e| e.to_string())?;
    for (index, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE prompt_favourites SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn set_entry_group(
    username: Option<&str>,
    id: &str,
    group_id: Option<&str>,
) -> Result<(), String> {
    let c = open(username)?;
    c.execute(
        "UPDATE prompt_favourites SET group_id = ?1 WHERE id = ?2",
        params![group_id, id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn upsert_group(username: Option<&str>, group: &PromptFavouriteGroup) -> Result<(), String> {
    let c = open(username)?;
    upsert_group_tx(&c, group)
}

pub fn delete_group(username: Option<&str>, id: &str) -> Result<(), String> {
    let c = open(username)?;
    // Explicit NULL-out rather than relying on ON DELETE SET NULL: the
    // foreign_keys pragma is per-connection and a legacy DB may predate it.
    c.execute(
        "UPDATE prompt_favourites SET group_id = NULL WHERE group_id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    c.execute(
        "DELETE FROM prompt_favourite_groups WHERE id = ?1",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// Import a snapshot. `replace` wipes the library first; otherwise entries and
/// groups are upserted by id and duplicate prompt bodies are skipped.
pub fn import(
    username: Option<&str>,
    snapshot: &PromptFavouritesSnapshot,
    replace: bool,
) -> Result<PromptFavouritesSnapshot, String> {
    let mut c = open(username)?;
    {
        let tx = c.transaction().map_err(|e| e.to_string())?;
        if replace {
            tx.execute("DELETE FROM prompt_favourites", [])
                .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM prompt_favourite_groups", [])
                .map_err(|e| e.to_string())?;
        }
        for g in &snapshot.groups {
            if g.id.is_empty() {
                continue;
            }
            upsert_group_tx(&tx, g)?;
        }
        let valid_groups: std::collections::HashSet<&str> =
            snapshot.groups.iter().map(|g| g.id.as_str()).collect();
        for e in &snapshot.entries {
            if e.id.is_empty() {
                continue;
            }
            if !replace && entry_body_exists(&tx, e)? {
                continue;
            }
            let mut entry = e.clone();
            // Drop dangling group references so the FK constraint holds.
            if let Some(ref gid) = entry.group_id {
                if !valid_groups.contains(gid.as_str()) && !group_exists(&tx, gid)? {
                    entry.group_id = None;
                }
            }
            upsert_entry_tx(&tx, &entry)?;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }
    list(username)
}

fn group_exists(c: &Connection, id: &str) -> Result<bool, String> {
    let count: i64 = c
        .query_row(
            "SELECT COUNT(1) FROM prompt_favourite_groups WHERE id = ?1",
            params![id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

/// True when a different row already holds the same prompt body — the dedupe
/// rule the frontend store applied before the SQLite migration.
fn entry_body_exists(c: &Connection, e: &PromptFavouriteEntry) -> Result<bool, String> {
    let count: i64 = c
        .query_row(
            "SELECT COUNT(1) FROM prompt_favourites \
             WHERE id <> ?1 AND positive = ?2 AND negative = ?3 AND mode = ?4",
            params![e.id, e.positive, e.negative, e.mode],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem_db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init_schema(&c).unwrap();
        c
    }

    fn entry(id: &str, positive: &str, sort_order: i64) -> PromptFavouriteEntry {
        PromptFavouriteEntry {
            id: id.to_string(),
            name: String::new(),
            positive: positive.to_string(),
            negative: String::new(),
            mode: "image".to_string(),
            style_preset: "none".to_string(),
            created_at: 1,
            sort_order,
            group_id: None,
        }
    }

    #[test]
    fn safe_username_strips_traversal() {
        assert_eq!(safe_username("../../etc").as_deref(), Some("etc"));
        assert_eq!(safe_username("Alice_1-x").as_deref(), Some("Alice_1-x"));
        assert_eq!(safe_username("..").as_deref(), None);
        assert_eq!(safe_username("").as_deref(), None);
    }

    #[test]
    fn upsert_replaces_existing_row() {
        let c = mem_db();
        upsert_entry_tx(&c, &entry("a", "cat", 0)).unwrap();
        let mut updated = entry("a", "dog", 5);
        updated.name = "renamed".to_string();
        upsert_entry_tx(&c, &updated).unwrap();
        let (positive, name, sort): (String, String, i64) = c
            .query_row(
                "SELECT positive, name, sort_order FROM prompt_favourites WHERE id = 'a'",
                [],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .unwrap();
        assert_eq!(positive, "dog");
        assert_eq!(name, "renamed");
        assert_eq!(sort, 5);
    }

    #[test]
    fn upsert_preserves_created_at() {
        let c = mem_db();
        upsert_entry_tx(&c, &entry("a", "cat", 0)).unwrap();
        let mut later = entry("a", "cat", 0);
        later.created_at = 999;
        upsert_entry_tx(&c, &later).unwrap();
        let created: i64 = c
            .query_row(
                "SELECT created_at FROM prompt_favourites WHERE id = 'a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(created, 1);
    }

    #[test]
    fn entry_body_exists_ignores_self() {
        let c = mem_db();
        let a = entry("a", "cat", 0);
        upsert_entry_tx(&c, &a).unwrap();
        assert!(!entry_body_exists(&c, &a).unwrap());
        assert!(entry_body_exists(&c, &entry("b", "cat", 0)).unwrap());
        assert!(!entry_body_exists(&c, &entry("b", "dog", 0)).unwrap());
    }

    #[test]
    fn deleting_group_clears_entry_reference() {
        let c = mem_db();
        let group = PromptFavouriteGroup {
            id: "g1".to_string(),
            title: "G".to_string(),
            collapsed: false,
            created_at: 1,
            sort_order: 0,
        };
        upsert_group_tx(&c, &group).unwrap();
        let mut e = entry("a", "cat", 0);
        e.group_id = Some("g1".to_string());
        upsert_entry_tx(&c, &e).unwrap();

        c.execute(
            "UPDATE prompt_favourites SET group_id = NULL WHERE group_id = 'g1'",
            [],
        )
        .unwrap();
        c.execute("DELETE FROM prompt_favourite_groups WHERE id = 'g1'", [])
            .unwrap();

        let group_id: Option<String> = c
            .query_row(
                "SELECT group_id FROM prompt_favourites WHERE id = 'a'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(group_id, None);
    }

    #[test]
    fn migrations_are_idempotent() {
        let c = mem_db();
        apply_migrations(&c);
        apply_migrations(&c);
        upsert_entry_tx(&c, &entry("a", "cat", 0)).unwrap();
        let count: i64 = c
            .query_row("SELECT COUNT(1) FROM prompt_favourites", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
