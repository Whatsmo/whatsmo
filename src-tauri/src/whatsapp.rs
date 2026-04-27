use std::sync::Arc;

use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, async_runtime::JoinHandle};
use tokio::sync::Mutex;
use wacore::{
    download::MediaType,
    proto_helpers::MessageExt,
    types::{
        events::Event,
        presence::{ChatPresence, ReceiptType},
    },
};
use wacore_binary::jid::{Jid, JidExt};
use waproto::whatsapp as wa;
use whatsapp_rust::{
    Client, StatusPrivacySetting, StatusSendOptions, TokioRuntime, bot::Bot,
    pair_code::PairCodeOptions, store::SqliteStore,
};
use whatsapp_rust_tokio_transport::TokioWebSocketTransportFactory;
use whatsapp_rust_ureq_http_client::UreqHttpClient;

type CommandResult<T> = Result<T, String>;

#[derive(Clone, Copy)]
enum SessionMode {
    Pair,
    ResumeOnly,
}

#[derive(Default, Clone)]
pub struct WhatsmoState {
    inner: Arc<Mutex<BridgeRuntime>>,
}

#[derive(Default)]
struct BridgeRuntime {
    client: Option<Arc<Client>>,
    runner: Option<JoinHandle<()>>,
    connected: bool,
    status_message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPayload {
    mode: AuthMode,
    #[serde(skip_serializing_if = "Option::is_none")]
    qr_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pair_code: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone_number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
enum AuthMode {
    Qr,
    PairCode,
    Connecting,
    Connected,
    LoggedOut,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionPayload {
    connected: bool,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusPayload {
    connected: bool,
    running: bool,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingMessagePayload {
    id: String,
    chat_id: String,
    sender_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    timestamp_ms: i64,
    is_group: bool,
    from_me: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutgoingMessagePayload {
    id: String,
    chat_id: String,
    text: String,
    timestamp_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptPayload {
    chat_id: String,
    message_id: String,
    status: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypingPayload {
    chat_id: String,
    name: String,
    is_typing: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusPostPayload {
    id: String,
    text: String,
    timestamp_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactLookupPayload {
    id: String,
    phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    lid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    about: Option<String>,
    is_business: bool,
    is_registered: bool,
}

#[tauri::command]
pub async fn start_qr_auth(
    app: AppHandle,
    state: State<'_, WhatsmoState>,
) -> CommandResult<AuthPayload> {
    start_session(app, state.inner.clone(), None, SessionMode::Pair).await?;
    Ok(AuthPayload {
        mode: AuthMode::Connecting,
        qr_code: None,
        pair_code: None,
        phone_number: None,
        message: Some("Starting QR pairing session...".to_string()),
    })
}

#[tauri::command]
pub async fn resume_saved_session(
    app: AppHandle,
    state: State<'_, WhatsmoState>,
) -> CommandResult<SessionStatusPayload> {
    start_session(app, state.inner.clone(), None, SessionMode::ResumeOnly).await
}

#[tauri::command]
pub async fn request_pair_code(
    app: AppHandle,
    state: State<'_, WhatsmoState>,
    phone_number: String,
) -> CommandResult<AuthPayload> {
    let cleaned = phone_number
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();

    if cleaned.len() < 8 {
        return Err("Phone number must include country code, for example 62812...".to_string());
    }

    start_session(
        app,
        state.inner.clone(),
        Some(cleaned.clone()),
        SessionMode::Pair,
    )
    .await?;
    Ok(AuthPayload {
        mode: AuthMode::Connecting,
        qr_code: None,
        pair_code: None,
        phone_number: Some(cleaned),
        message: Some("Requesting pair code from WhatsApp...".to_string()),
    })
}

#[tauri::command]
pub async fn send_text_message(
    state: State<'_, WhatsmoState>,
    chat_id: String,
    text: String,
) -> CommandResult<OutgoingMessagePayload> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("Message cannot be empty.".to_string());
    }

    let client = {
        let guard = state.inner.lock().await;
        if !guard.connected {
            return Err("WhatsApp session is not connected yet.".to_string());
        }

        guard
            .client
            .clone()
            .ok_or_else(|| "WhatsApp session is not connected yet.".to_string())?
    };

    let jid = chat_id
        .parse::<Jid>()
        .map_err(|error| format!("Invalid chat id: {error}"))?;
    let message = wa::Message {
        conversation: Some(trimmed.clone()),
        ..Default::default()
    };

    let message_id = client
        .send_message(jid, message)
        .await
        .map_err(|error| format!("Failed to send message: {error}"))?;

    Ok(OutgoingMessagePayload {
        id: message_id,
        chat_id,
        text: trimmed,
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn send_text_status(
    state: State<'_, WhatsmoState>,
    text: String,
    background_argb: u32,
    font: i32,
    recipients: Vec<String>,
    privacy: Option<String>,
) -> CommandResult<StatusPostPayload> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("Status text cannot be empty.".to_string());
    }

    if recipients.is_empty() {
        return Err("Add at least one status recipient phone number.".to_string());
    }

    let client = {
        let guard = state.inner.lock().await;
        if !guard.connected {
            return Err("WhatsApp session is not connected yet.".to_string());
        }

        guard
            .client
            .clone()
            .ok_or_else(|| "WhatsApp session is not connected yet.".to_string())?
    };

    let recipient_jids = parse_status_recipients(recipients)?;

    let message_id = client
        .status()
        .send_text(
            &trimmed,
            background_argb,
            font.clamp(0, 4),
            recipient_jids,
            status_options(privacy.as_deref())?,
        )
        .await
        .map_err(|error| format!("Failed to post status: {error}"))?;

    Ok(StatusPostPayload {
        id: message_id,
        text: trimmed,
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn send_raw_status(
    state: State<'_, WhatsmoState>,
    text: String,
    recipients: Vec<String>,
    privacy: Option<String>,
) -> CommandResult<StatusPostPayload> {
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        return Err("Raw status text cannot be empty.".to_string());
    }

    let client = connected_client(&state).await?;
    let recipient_jids = parse_status_recipients(recipients)?;
    let message = wa::Message {
        extended_text_message: Some(Box::new(wa::message::ExtendedTextMessage {
            text: Some(trimmed.clone()),
            ..Default::default()
        })),
        ..Default::default()
    };

    let message_id = client
        .status()
        .send_raw(message, recipient_jids, status_options(privacy.as_deref())?)
        .await
        .map_err(|error| format!("Failed to post raw status: {error}"))?;

    Ok(StatusPostPayload {
        id: message_id,
        text: trimmed,
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn send_image_status(
    state: State<'_, WhatsmoState>,
    data: Vec<u8>,
    thumbnail: Option<Vec<u8>>,
    caption: Option<String>,
    recipients: Vec<String>,
    privacy: Option<String>,
) -> CommandResult<StatusPostPayload> {
    if data.is_empty() {
        return Err("Image data cannot be empty.".to_string());
    }

    let client = connected_client(&state).await?;
    let recipient_jids = parse_status_recipients(recipients)?;
    let upload = client
        .upload(data.clone(), MediaType::Image)
        .await
        .map_err(|error| format!("Failed to upload image status: {error}"))?;
    let caption_text = caption
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    let thumbnail_bytes =
        thumbnail.unwrap_or_else(|| data.iter().copied().take(64 * 1024).collect());

    let message_id = client
        .status()
        .send_image(
            &upload,
            thumbnail_bytes,
            caption_text,
            recipient_jids,
            status_options(privacy.as_deref())?,
        )
        .await
        .map_err(|error| format!("Failed to post image status: {error}"))?;

    Ok(StatusPostPayload {
        id: message_id,
        text: caption.unwrap_or_else(|| "Image status".to_string()),
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn send_video_status(
    state: State<'_, WhatsmoState>,
    data: Vec<u8>,
    thumbnail: Vec<u8>,
    duration_seconds: u32,
    caption: Option<String>,
    recipients: Vec<String>,
    privacy: Option<String>,
) -> CommandResult<StatusPostPayload> {
    if data.is_empty() {
        return Err("Video data cannot be empty.".to_string());
    }
    if thumbnail.is_empty() {
        return Err("Video status requires a JPEG thumbnail.".to_string());
    }

    let client = connected_client(&state).await?;
    let recipient_jids = parse_status_recipients(recipients)?;
    let upload = client
        .upload(data, MediaType::Video)
        .await
        .map_err(|error| format!("Failed to upload video status: {error}"))?;
    let caption_text = caption
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());

    let message_id = client
        .status()
        .send_video(
            &upload,
            thumbnail,
            duration_seconds,
            caption_text,
            recipient_jids,
            status_options(privacy.as_deref())?,
        )
        .await
        .map_err(|error| format!("Failed to post video status: {error}"))?;

    Ok(StatusPostPayload {
        id: message_id,
        text: caption.unwrap_or_else(|| "Video status".to_string()),
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn revoke_status(
    state: State<'_, WhatsmoState>,
    message_id: String,
    recipients: Vec<String>,
    privacy: Option<String>,
) -> CommandResult<StatusPostPayload> {
    let trimmed = message_id.trim().to_string();
    if trimmed.is_empty() {
        return Err("Status message ID cannot be empty.".to_string());
    }

    let client = connected_client(&state).await?;
    let recipient_jids = parse_status_recipients(recipients)?;
    let revoke_id = client
        .status()
        .revoke(
            trimmed.clone(),
            recipient_jids,
            status_options(privacy.as_deref())?,
        )
        .await
        .map_err(|error| format!("Failed to revoke status: {error}"))?;

    Ok(StatusPostPayload {
        id: revoke_id,
        text: format!("Revoked {trimmed}"),
        timestamp_ms: Utc::now().timestamp_millis(),
    })
}

#[tauri::command]
pub async fn send_status_reaction(
    state: State<'_, WhatsmoState>,
    status_owner: String,
    server_id: u64,
    reaction: String,
) -> CommandResult<StatusPostPayload> {
    let _ = state;
    let _ = status_owner;
    let _ = server_id;
    let _ = reaction;
    Err(
        "Status reactions are documented upstream but not exposed by the installed whatsapp-rust 0.5.0 crate yet."
            .to_string(),
    )
}

#[tauri::command]
pub async fn sync_contacts(
    state: State<'_, WhatsmoState>,
    phones: Vec<String>,
) -> CommandResult<Vec<ContactLookupPayload>> {
    let clean_phones = phones
        .iter()
        .map(|phone| normalize_phone(phone))
        .collect::<CommandResult<Vec<_>>>()?;
    let phone_refs = clean_phones.iter().map(String::as_str).collect::<Vec<_>>();

    let client = connected_client(&state).await?;
    let contacts = client
        .contacts()
        .get_info(&phone_refs)
        .await
        .map_err(|error| format!("Failed to sync contacts: {error}"))?;

    Ok(contacts
        .into_iter()
        .map(|contact| ContactLookupPayload {
            id: contact.jid.to_string(),
            phone: contact.jid.user.clone(),
            lid: contact.lid.map(|jid| jid.to_string()),
            about: contact.status,
            is_business: contact.is_business,
            is_registered: contact.is_registered,
        })
        .collect())
}

#[tauri::command]
pub async fn get_session_status(
    state: State<'_, WhatsmoState>,
) -> CommandResult<SessionStatusPayload> {
    let guard = state.inner.lock().await;
    Ok(SessionStatusPayload {
        connected: guard.connected,
        running: guard.runner.is_some(),
        message: if guard.status_message.is_empty() {
            "No WhatsApp session running.".to_string()
        } else {
            guard.status_message.clone()
        },
    })
}

#[tauri::command]
pub async fn disconnect_session(
    state: State<'_, WhatsmoState>,
) -> CommandResult<ConnectionPayload> {
    let mut guard = state.inner.lock().await;
    if let Some(runner) = guard.runner.take() {
        runner.abort();
    }
    guard.client = None;
    guard.connected = false;
    guard.status_message = "Local Whatsmo session stopped.".to_string();

    Ok(ConnectionPayload {
        connected: false,
        message: "Local Whatsmo session stopped. Use WhatsApp linked devices to unlink fully."
            .to_string(),
    })
}

async fn start_session(
    app: AppHandle,
    state: Arc<Mutex<BridgeRuntime>>,
    phone_number: Option<String>,
    mode: SessionMode,
) -> CommandResult<SessionStatusPayload> {
    let initial_message = match mode {
        SessionMode::Pair => "Preparing encrypted WhatsApp session...",
        SessionMode::ResumeOnly => "Restoring saved WhatsApp session...",
    };

    emit_auth(
        &app,
        AuthPayload {
            mode: AuthMode::Connecting,
            qr_code: None,
            pair_code: None,
            phone_number: phone_number.clone(),
            message: Some(initial_message.to_string()),
        },
    );

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    tokio::fs::create_dir_all(&app_data_dir)
        .await
        .map_err(|error| format!("Could not create app data directory: {error}"))?;
    let db_path = app_data_dir.join("whatsapp-session.db");
    let db_path = db_path.to_string_lossy().to_string();

    {
        let mut guard = state.lock().await;
        if let Some(runner) = guard.runner.take() {
            runner.abort();
        }
        guard.client = None;
        guard.connected = false;
        guard.status_message = initial_message.to_string();
    }

    let backend = Arc::new(
        SqliteStore::new(&db_path)
            .await
            .map_err(|error| format!("Could not open WhatsApp session store: {error}"))?,
    );

    let event_app = app.clone();
    let event_state = state.clone();
    let mut builder = Bot::builder()
        .with_backend(backend)
        .with_transport_factory(TokioWebSocketTransportFactory::new())
        .with_http_client(UreqHttpClient::new())
        .with_runtime(TokioRuntime);

    if let Some(number) = phone_number.clone() {
        builder = builder.with_pair_code(PairCodeOptions {
            phone_number: number,
            ..Default::default()
        });
    }

    let mut bot = builder
        .on_event(move |event, client| {
            let app = event_app.clone();
            let state = event_state.clone();
            let phone_number = phone_number.clone();
            async move {
                {
                    let mut guard = state.lock().await;
                    guard.client = Some(client.clone());
                }

                match &event {
                    Event::PairingQrCode { code, .. } => {
                        {
                            let mut guard = state.lock().await;
                            guard.connected = false;
                            guard.status_message = "Waiting for QR scan.".to_string();
                        }
                        emit_auth(
                            &app,
                            AuthPayload {
                                mode: AuthMode::Qr,
                                qr_code: Some(code.to_string()),
                                pair_code: None,
                                phone_number: None,
                                message: Some(
                                    "Scan this QR code from WhatsApp linked devices.".to_string(),
                                ),
                            },
                        );
                    }
                    Event::PairingCode { code, .. } => {
                        {
                            let mut guard = state.lock().await;
                            guard.connected = false;
                            guard.status_message =
                                "Waiting for pair code confirmation.".to_string();
                        }
                        emit_auth(
                            &app,
                            AuthPayload {
                                mode: AuthMode::PairCode,
                                qr_code: None,
                                pair_code: Some(code.to_string()),
                                phone_number: phone_number.clone(),
                                message: Some(
                                    "Enter this code in WhatsApp linked devices.".to_string(),
                                ),
                            },
                        );
                    }
                    Event::Connected(_) => {
                        {
                            let mut guard = state.lock().await;
                            guard.connected = true;
                            guard.status_message = "Connected to WhatsApp.".to_string();
                        }
                        emit_auth(
                            &app,
                            AuthPayload {
                                mode: AuthMode::Connected,
                                qr_code: None,
                                pair_code: None,
                                phone_number: None,
                                message: Some(
                                    "Connected. Whatsmo is syncing companion messages.".to_string(),
                                ),
                            },
                        );
                        emit_connection(&app, true, "Connected to WhatsApp.".to_string());
                    }
                    Event::LoggedOut(_) => {
                        {
                            let mut guard = state.lock().await;
                            guard.connected = false;
                            guard.client = None;
                            guard.status_message = "Logged out from WhatsApp.".to_string();
                        }
                        emit_auth(
                            &app,
                            AuthPayload {
                                mode: AuthMode::LoggedOut,
                                qr_code: None,
                                pair_code: None,
                                phone_number: None,
                                message: Some("WhatsApp logged this companion out.".to_string()),
                            },
                        );
                        emit_connection(&app, false, "Logged out from WhatsApp.".to_string());
                    }
                    Event::Message(message, info) => {
                        let chat_id = info.source.chat.to_string();
                        let payload = IncomingMessagePayload {
                            id: info.id.to_string(),
                            chat_id: chat_id.clone(),
                            sender_id: info.source.sender.to_string(),
                            text: message.text_content().map(ToString::to_string),
                            timestamp_ms: info.timestamp.timestamp_millis(),
                            is_group: info.source.is_group,
                            from_me: info.source.is_from_me,
                        };
                        emit_event(&app, "whatsmo://message", payload);
                    }
                    Event::Receipt(receipt) => {
                        if let Some(status) = receipt_status(&receipt.r#type) {
                            for message_id in &receipt.message_ids {
                                emit_event(
                                    &app,
                                    "whatsmo://receipt",
                                    ReceiptPayload {
                                        chat_id: receipt.source.chat.to_string(),
                                        message_id: message_id.to_string(),
                                        status: status.to_string(),
                                    },
                                );
                            }
                        }
                    }
                    Event::ChatPresence(presence) => {
                        emit_event(
                            &app,
                            "whatsmo://typing",
                            TypingPayload {
                                chat_id: presence.source.chat.to_string(),
                                name: presence.source.sender.to_string(),
                                is_typing: matches!(presence.state, ChatPresence::Composing),
                            },
                        );
                    }
                    _ => {}
                }
            }
        })
        .build()
        .await
        .map_err(|error| format!("Could not build WhatsApp bot: {error}"))?;

    if matches!(mode, SessionMode::ResumeOnly) && bot.client().get_pn().await.is_none() {
        let message = "No saved WhatsApp session found. Pair this device to continue.".to_string();
        {
            let mut guard = state.lock().await;
            guard.client = None;
            guard.connected = false;
            guard.status_message = message.clone();
        }
        emit_auth(
            &app,
            AuthPayload {
                mode: AuthMode::LoggedOut,
                qr_code: None,
                pair_code: None,
                phone_number: None,
                message: Some(message.clone()),
            },
        );
        return Ok(SessionStatusPayload {
            connected: false,
            running: false,
            message,
        });
    }

    let run_app = app.clone();
    let run_state = state.clone();
    let runner = tauri::async_runtime::spawn(async move {
        match bot.run().await {
            Ok(handle) => {
                if let Err(error) = handle.await {
                    {
                        let mut guard = run_state.lock().await;
                        guard.connected = false;
                        guard.client = None;
                        guard.status_message = format!("WhatsApp session stopped: {error}");
                    }
                    emit_connection(
                        &run_app,
                        false,
                        format!("WhatsApp session stopped: {error}"),
                    );
                }
            }
            Err(error) => {
                {
                    let mut guard = run_state.lock().await;
                    guard.connected = false;
                    guard.client = None;
                    guard.status_message = format!("Could not start WhatsApp session: {error}");
                }
                emit_auth(
                    &run_app,
                    AuthPayload {
                        mode: AuthMode::Error,
                        qr_code: None,
                        pair_code: None,
                        phone_number: None,
                        message: Some(format!("Could not start WhatsApp session: {error}")),
                    },
                );
                emit_connection(
                    &run_app,
                    false,
                    format!("Could not start WhatsApp session: {error}"),
                );
            }
        }
    });

    let mut guard = state.lock().await;
    guard.runner = Some(runner);
    Ok(SessionStatusPayload {
        connected: false,
        running: true,
        message: initial_message.to_string(),
    })
}

fn emit_auth(app: &AppHandle, payload: AuthPayload) {
    emit_event(app, "whatsmo://auth", payload);
}

fn emit_connection(app: &AppHandle, connected: bool, message: String) {
    emit_event(
        app,
        "whatsmo://connection",
        ConnectionPayload { connected, message },
    );
}

fn receipt_status(receipt_type: &ReceiptType) -> Option<&'static str> {
    match receipt_type {
        ReceiptType::Delivered | ReceiptType::Sender => Some("delivered"),
        ReceiptType::Read | ReceiptType::ReadSelf => Some("read"),
        ReceiptType::Played | ReceiptType::PlayedSelf => Some("played"),
        _ => None,
    }
}

async fn connected_client(state: &State<'_, WhatsmoState>) -> CommandResult<Arc<Client>> {
    let guard = state.inner.lock().await;
    if !guard.connected {
        return Err("WhatsApp session is not connected yet.".to_string());
    }

    guard
        .client
        .clone()
        .ok_or_else(|| "WhatsApp session is not connected yet.".to_string())
}

fn status_options(privacy: Option<&str>) -> CommandResult<StatusSendOptions> {
    let privacy = match privacy.unwrap_or("contacts") {
        "contacts" => StatusPrivacySetting::Contacts,
        "allowlist" => StatusPrivacySetting::AllowList,
        "denylist" => StatusPrivacySetting::DenyList,
        unknown => return Err(format!("Unknown status privacy setting: {unknown}")),
    };

    Ok(StatusSendOptions { privacy })
}

fn parse_status_recipients(recipients: Vec<String>) -> CommandResult<Vec<Jid>> {
    if recipients.is_empty() {
        return Err("Add at least one status recipient.".to_string());
    }

    recipients
        .into_iter()
        .map(|recipient| parse_status_recipient(&recipient))
        .collect()
}

fn parse_status_recipient(input: &str) -> CommandResult<Jid> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Status recipient cannot be empty.".to_string());
    }

    let jid = if trimmed.contains('@') {
        trimmed
            .parse::<Jid>()
            .map_err(|error| format!("Invalid status recipient {trimmed}: {error}"))?
    } else {
        let digits = normalize_phone(trimmed)?;
        format!("{digits}@s.whatsapp.net")
            .parse::<Jid>()
            .map_err(|error| format!("Invalid status recipient {trimmed}: {error}"))?
    };

    if jid.is_group() || jid.is_status_broadcast() || jid.is_broadcast_list() {
        return Err(format!(
            "Invalid status recipient {trimmed}. Status recipients must be user phone JIDs."
        ));
    }

    Ok(jid)
}

fn normalize_phone(input: &str) -> CommandResult<String> {
    let digits = input
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();

    if digits.len() < 7 || digits.starts_with('0') {
        return Err(format!(
            "Invalid phone number {input}. Use international format, for example 62812..."
        ));
    }

    Ok(digits)
}

fn emit_event<T>(app: &AppHandle, event: &str, payload: T)
where
    T: Serialize + Clone,
{
    if let Err(error) = app.emit(event, payload) {
        eprintln!("failed to emit {event}: {error}");
    }
}
