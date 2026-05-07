mod contacts;
mod whatsapp;

use whatsapp::{
    WhatsmoState, disconnect_session, download_media_attachment, edit_message, get_account_device,
    get_session_status, logout_session, mark_chat_read, request_pair_code, resume_saved_session,
    revoke_message, revoke_status, send_chat_presence, send_image_status, send_media_message,
    send_raw_status, send_reaction, send_status_reaction, send_text_message, send_text_status,
    send_video_status, start_qr_auth, sync_contact_profiles, sync_contacts, sync_group_metadata,
};

use std::panic;
use tauri::Manager;
use tracing_subscriber::{EnvFilter, fmt, layer::SubscriberExt, util::SubscriberInitExt};

fn setup_logging(log_dir: &std::path::Path) {
    let file_appender = tracing_appender::rolling::daily(log_dir, "whatsmo.log");

    tracing_subscriber::registry()
        .with(EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,whatsapp_rust=warn")))
        .with(
            fmt::layer()
                .with_writer(file_appender)
                .with_ansi(false)
                .with_target(true)
                .json()
        )
        .init();
}

fn setup_panic_hook(log_dir: std::path::PathBuf) {
    panic::set_hook(Box::new(move |info| {
        let payload = info.payload().downcast_ref::<&str>().copied().unwrap_or("unknown");
        let location = info.location().map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column())).unwrap_or_default();
        let crash_report = format!(
            "PANIC at {}\nMessage: {}\nTimestamp: {}\n",
            location, payload, chrono::Utc::now()
        );

        let crash_file = log_dir.join("crash.log");
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_file)
            .and_then(|mut f| std::io::Write::write_all(&mut f, crash_report.as_bytes()));

        tracing::error!(panic.payload = payload, panic.location = %location, "PANIC");
    }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(contacts::init())
        .manage(WhatsmoState::default())
        .setup(|app| {
            let log_dir = app.path().app_log_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let _ = std::fs::create_dir_all(&log_dir);
            setup_logging(&log_dir);
            setup_panic_hook(log_dir);
            tracing::info!("Whatsmo started");
            Ok(())
        })
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
            revoke_message,
            edit_message,
            send_reaction,
            send_chat_presence,
            mark_chat_read,
            get_account_device,
            get_session_status,
            logout_session,
            disconnect_session
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Whatsmo app")
}
