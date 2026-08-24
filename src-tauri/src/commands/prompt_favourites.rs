use crate::error::AppError;
use crate::prompt_favourites_db as db;

/// Desktop commands always act on the local admin library; per-user routing
/// happens in `webserver::dispatch_command`, which resolves the LAN username.
#[tauri::command]
pub async fn list_prompt_favourites() -> Result<db::PromptFavouritesSnapshot, AppError> {
    db::list(None).map_err(AppError::Other)
}

#[tauri::command]
pub async fn upsert_prompt_favourite(entry: db::PromptFavouriteEntry) -> Result<(), AppError> {
    db::upsert_entry(None, &entry).map_err(AppError::Other)
}

#[tauri::command]
pub async fn delete_prompt_favourite(id: String) -> Result<(), AppError> {
    db::delete_entry(None, &id).map_err(AppError::Other)
}

#[tauri::command]
pub async fn reorder_prompt_favourites(ids: Vec<String>) -> Result<(), AppError> {
    db::reorder_entries(None, &ids).map_err(AppError::Other)
}

#[tauri::command]
pub async fn set_prompt_favourite_group(
    id: String,
    group_id: Option<String>,
) -> Result<(), AppError> {
    db::set_entry_group(None, &id, group_id.as_deref()).map_err(AppError::Other)
}

#[tauri::command]
pub async fn upsert_prompt_favourite_group(
    group: db::PromptFavouriteGroup,
) -> Result<(), AppError> {
    db::upsert_group(None, &group).map_err(AppError::Other)
}

#[tauri::command]
pub async fn delete_prompt_favourite_group(id: String) -> Result<(), AppError> {
    db::delete_group(None, &id).map_err(AppError::Other)
}

#[tauri::command]
pub async fn import_prompt_favourites(
    snapshot: db::PromptFavouritesSnapshot,
    mode: String,
) -> Result<db::PromptFavouritesSnapshot, AppError> {
    db::import(None, &snapshot, mode == "replace").map_err(AppError::Other)
}
