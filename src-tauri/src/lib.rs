mod whatsapp;

use whatsapp::{
    WhatsmoState, disconnect_session, download_media_attachment, get_account_device,
    get_session_status, logout_session, request_pair_code, resume_saved_session, revoke_status,
    send_image_status, send_media_message, send_raw_status, send_status_reaction,
    send_text_message, send_text_status, send_video_status, start_qr_auth, sync_contact_profiles,
    sync_contacts, sync_group_metadata,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .manage(WhatsmoState::default())
        .invoke_handler(tauri::generate_handler![
            start_qr_auth,
            request_pair_code,
            resume_saved_session,
            send_text_message,
            send_media_message,
            download_media_attachment,
            send_text_status,
            send_raw_status,
            send_image_status,
            send_video_status,
            revoke_status,
            send_status_reaction,
            sync_contact_profiles,
            sync_contacts,
            sync_group_metadata,
            get_account_device,
            get_session_status,
            logout_session,
            disconnect_session
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Whatsmo app")
}
