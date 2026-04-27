use std::{sync::Arc, time::Duration};

use chrono::Utc;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State, async_runtime::JoinHandle};
use tokio::sync::Mutex;
use wacore::{
    download::MediaType,
    iq::spec::IqSpec,
    proto_helpers::MessageExt,
    request::InfoQuery,
    types::{
        events::Event,
        presence::{ChatPresence, ReceiptType},
    },
};
use wacore_binary::{
    builder::NodeBuilder,
    jid::{DEFAULT_USER_SERVER, Jid, JidExt},
    node::{Node, NodeContent},
};
use waproto::whatsapp as wa;
use whatsapp_rust::{
    Client, StatusPrivacySetting, StatusSendOptions, TokioRuntime, bot::Bot,
    pair_code::PairCodeOptions, store::SqliteStore,
};
use whatsapp_rust_tokio_transport::TokioWebSocketTransportFactory;
use whatsapp_rust_ureq_http_client::UreqHttpClient;

type CommandResult<T> = Result<T, String>;
const SESSION_DB_FILE: &str = "whatsapp-session.db";
const LOGOUT_TIMEOUT: Duration = Duration::from_secs(3);

struct RemoveCompanionDeviceSpec {
    jid: Jid,
}

impl RemoveCompanionDeviceSpec {
    fn new(jid: &Jid) -> Self {
        Self { jid: jid.clone() }
    }
}

impl IqSpec for RemoveCompanionDeviceSpec {
    type Response = ();

    fn build_iq(&self) -> InfoQuery<'static> {
        let child = NodeBuilder::new("remove-companion-device")
            .attr("jid", self.jid.clone())
            .attr("reason", "user_initiated")
            .build();

        InfoQuery::set(
            "md",
            Jid::new("", DEFAULT_USER_SERVER),
            Some(NodeContent::Nodes(vec![child])),
        )
        .with_timeout(LOGOUT_TIMEOUT)
    }

    fn parse_response(&self, _response: &Node) -> Result<Self::Response, anyhow::Error> {
        Ok(())
    }
}

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
pub struct AccountDevicePayload {
    connected: bool,
    logged_in: bool,
    running: bool,
    device_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone_jid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    lid_jid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    push_name: Option<String>,
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
    event_kind: MessageEventKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_message_id: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum MessageEventKind {
    Message,
    Edit,
    Revoke,
    AdminRevoke,
    Other,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySyncPayload {
    chat_id: String,
    title: String,
    unread_count: u32,
    last_message_at: i64,
    is_group: bool,
    messages: Vec<IncomingMessagePayload>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistorySyncProgressPayload {
    active: bool,
    total: i32,
    processed: i32,
    messages: i32,
    notifications: i32,
    receipts: i32,
    message: String,
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
pub struct OutgoingMediaPayload {
    id: String,
    chat_id: String,
    kind: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    caption: Option<String>,
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

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactProfilePayload {
    id: String,
    phone: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    lid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    about: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    picture_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_url: Option<String>,
    is_business: bool,
    updated_at_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactUpdatedPayload {
    jid: String,
    timestamp_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactNumberChangedPayload {
    old_jid: String,
    new_jid: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    old_lid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    new_lid: Option<String>,
    timestamp_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactSyncRequestedPayload {
    #[serde(skip_serializing_if = "Option::is_none")]
    after_ms: Option<i64>,
    timestamp_ms: i64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupParticipantPayload {
    id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    phone_number: Option<String>,
    is_admin: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupMetadataPayload {
    id: String,
    subject: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    description: Option<String>,
    participant_count: usize,
    admin_count: usize,
    is_locked: bool,
    is_announcement: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    creator: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    created_at_ms: Option<i64>,
    participants: Vec<GroupParticipantPayload>,
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
pub async fn send_media_message(
    state: State<'_, WhatsmoState>,
    chat_id: String,
    kind: String,
    data: Vec<u8>,
    mime_type: String,
    file_name: String,
    caption: Option<String>,
    duration_seconds: Option<u32>,
) -> CommandResult<OutgoingMediaPayload> {
    const MAX_MEDIA_BYTES: usize = 64 * 1024 * 1024;

    if data.is_empty() {
        return Err("Attachment file is empty.".to_string());
    }
    if data.len() > MAX_MEDIA_BYTES {
        return Err("Attachment is too large. Maximum supported size is 64 MB.".to_string());
    }

    let client = connected_client(&state).await?;
    let jid = chat_id
        .parse::<Jid>()
        .map_err(|error| format!("Invalid chat id: {error}"))?;
    let media_type = match kind.as_str() {
        "image" => MediaType::Image,
        "video" => MediaType::Video,
        "document" => MediaType::Document,
        other => return Err(format!("Unsupported attachment kind: {other}")),
    };
    let upload = client
        .upload(data, media_type)
        .await
        .map_err(|error| format!("Failed to upload attachment: {error}"))?;
    let clean_caption = caption
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string);
    let clean_name = if file_name.trim().is_empty() {
        "attachment".to_string()
    } else {
        file_name.trim().to_string()
    };
    let clean_mime = if mime_type.trim().is_empty() {
        "application/octet-stream".to_string()
    } else {
        mime_type.trim().to_string()
    };

    let message = match kind.as_str() {
        "image" => wa::Message {
            image_message: Some(Box::new(wa::message::ImageMessage {
                url: Some(upload.url),
                direct_path: Some(upload.direct_path),
                media_key: Some(upload.media_key),
                file_enc_sha256: Some(upload.file_enc_sha256),
                file_sha256: Some(upload.file_sha256),
                file_length: Some(upload.file_length),
                mimetype: Some(clean_mime.clone()),
                caption: clean_caption.clone(),
                ..Default::default()
            })),
            ..Default::default()
        },
        "video" => wa::Message {
            video_message: Some(Box::new(wa::message::VideoMessage {
                url: Some(upload.url),
                direct_path: Some(upload.direct_path),
                media_key: Some(upload.media_key),
                file_enc_sha256: Some(upload.file_enc_sha256),
                file_sha256: Some(upload.file_sha256),
                file_length: Some(upload.file_length),
                mimetype: Some(clean_mime.clone()),
                caption: clean_caption.clone(),
                seconds: duration_seconds,
                ..Default::default()
            })),
            ..Default::default()
        },
        "document" => wa::Message {
            document_message: Some(Box::new(wa::message::DocumentMessage {
                url: Some(upload.url),
                direct_path: Some(upload.direct_path),
                media_key: Some(upload.media_key),
                file_enc_sha256: Some(upload.file_enc_sha256),
                file_sha256: Some(upload.file_sha256),
                file_length: Some(upload.file_length),
                mimetype: Some(clean_mime.clone()),
                title: Some(clean_name.clone()),
                file_name: Some(clean_name.clone()),
                caption: clean_caption.clone(),
                ..Default::default()
            })),
            ..Default::default()
        },
        _ => unreachable!(),
    };

    let message_id = client
        .send_message(jid, message)
        .await
        .map_err(|error| format!("Failed to send attachment: {error}"))?;

    Ok(OutgoingMediaPayload {
        id: message_id,
        chat_id,
        kind,
        name: clean_name,
        caption: clean_caption,
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
pub async fn sync_contact_profiles(
    state: State<'_, WhatsmoState>,
    jids: Vec<String>,
) -> CommandResult<Vec<ContactProfilePayload>> {
    let client = connected_client(&state).await?;
    let parsed_jids = jids
        .iter()
        .map(|jid| parse_profile_jid(jid))
        .collect::<CommandResult<Vec<_>>>()?;
    contact_profiles_for_jids(&client, parsed_jids).await
}

#[tauri::command]
pub async fn sync_group_metadata(
    state: State<'_, WhatsmoState>,
    group_ids: Vec<String>,
) -> CommandResult<Vec<GroupMetadataPayload>> {
    let client = connected_client(&state).await?;
    let mut groups = Vec::new();

    for group_id in group_ids {
        let jid = group_id
            .parse::<Jid>()
            .map_err(|error| format!("Invalid group JID {group_id}: {error}"))?;
        if !jid.is_group() {
            return Err(format!("{group_id} is not a group JID."));
        }

        let metadata =
            client.groups().get_metadata(&jid).await.map_err(|error| {
                format!("Failed to sync group metadata for {group_id}: {error}")
            })?;
        let picture = client
            .contacts()
            .get_profile_picture(&metadata.id, true)
            .await
            .map_err(|error| format!("Failed to sync group picture for {group_id}: {error}"))?;

        let participants = metadata
            .participants
            .iter()
            .map(|participant| GroupParticipantPayload {
                id: participant.jid.to_string(),
                phone_number: participant.phone_number.as_ref().map(ToString::to_string),
                is_admin: participant.is_admin,
            })
            .collect::<Vec<_>>();
        let participant_count = metadata
            .size
            .map(|size| size as usize)
            .unwrap_or(participants.len());
        let admin_count = participants
            .iter()
            .filter(|participant| participant.is_admin)
            .count();

        groups.push(GroupMetadataPayload {
            id: metadata.id.to_string(),
            subject: metadata.subject,
            avatar_url: picture.as_ref().map(|value| value.url.clone()),
            description: metadata.description,
            participant_count,
            admin_count,
            is_locked: metadata.is_locked,
            is_announcement: metadata.is_announcement,
            creator: metadata.creator.map(|jid| jid.to_string()),
            created_at_ms: metadata.creation_time.map(seconds_to_millis),
            participants,
        });
    }

    Ok(groups)
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
pub async fn get_account_device(
    state: State<'_, WhatsmoState>,
) -> CommandResult<AccountDevicePayload> {
    let (client, running, state_connected, state_message) = {
        let guard = state.inner.lock().await;
        (
            guard.client.clone(),
            guard.runner.is_some(),
            guard.connected,
            guard.status_message.clone(),
        )
    };

    let Some(client) = client else {
        return Ok(AccountDevicePayload {
            connected: false,
            logged_in: false,
            running,
            device_name: "Whatsmo mobile companion".to_string(),
            phone_jid: None,
            lid_jid: None,
            push_name: None,
            message: if state_message.is_empty() {
                "No WhatsApp session running.".to_string()
            } else {
                state_message
            },
        });
    };

    let phone_jid = client.get_pn().await.map(|jid| jid.to_string());
    let lid_jid = client.get_lid().await.map(|jid| jid.to_string());
    let push_name = match client.get_push_name().await {
        value if value.trim().is_empty() => None,
        value => Some(value),
    };
    let connected = client.is_connected();
    let logged_in = client.is_logged_in();

    Ok(AccountDevicePayload {
        connected,
        logged_in,
        running,
        device_name: "Whatsmo mobile companion".to_string(),
        phone_jid,
        lid_jid,
        push_name,
        message: if connected && logged_in {
            "Connected and authenticated with WhatsApp.".to_string()
        } else if state_connected {
            "Whatsmo is connected, waiting for account readiness.".to_string()
        } else if state_message.is_empty() {
            "WhatsApp session is not connected.".to_string()
        } else {
            state_message
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

#[tauri::command]
pub async fn logout_session(
    app: AppHandle,
    state: State<'_, WhatsmoState>,
) -> CommandResult<ConnectionPayload> {
    let client = {
        let guard = state.inner.lock().await;
        guard.client.clone().ok_or_else(|| {
            "WhatsApp session is not running. Resume the session before unlinking.".to_string()
        })?
    };

    if !client.is_connected() {
        return Err(
            "WhatsApp session is not connected yet. Wait until it reconnects before unlinking."
                .to_string(),
        );
    }

    let Some(pn) = client.get_pn().await else {
        return Err("Cannot unlink: this session has no paired phone-number JID.".to_string());
    };

    client
        .execute(RemoveCompanionDeviceSpec::new(&pn))
        .await
        .map_err(|error| {
            format!("Failed to unlink this companion device from WhatsApp: {error}")
        })?;
    client.disconnect().await;
    drop(client);

    {
        let mut guard = state.inner.lock().await;
        if let Some(runner) = guard.runner.take() {
            runner.abort();
        }
        guard.client = None;
        guard.connected = false;
        guard.status_message = "WhatsApp companion unlinked. Pair again to continue.".to_string();
    }

    clear_session_files(&app).await?;

    let payload = AuthPayload {
        mode: AuthMode::LoggedOut,
        qr_code: None,
        pair_code: None,
        phone_number: None,
        message: Some("WhatsApp companion unlinked. Pair again to continue.".to_string()),
    };
    emit_auth(&app, payload);
    emit_connection(
        &app,
        false,
        "WhatsApp companion unlinked. Pair again to continue.".to_string(),
    );

    Ok(ConnectionPayload {
        connected: false,
        message: "WhatsApp companion unlinked. Pair again to continue.".to_string(),
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
    let db_path = app_data_dir.join(SESSION_DB_FILE);
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
                            event_kind: message_event_kind(&info.edit),
                            target_message_id: info
                                .meta_info
                                .target_id
                                .as_ref()
                                .map(ToString::to_string),
                        };
                        emit_event(&app, "whatsmo://message", payload);
                    }
                    Event::JoinedGroup(conversation) => {
                        if let Some(payload) = history_sync_payload(conversation) {
                            emit_event(&app, "whatsmo://history-sync", payload);
                        }
                    }
                    Event::OfflineSyncPreview(preview) => {
                        emit_event(
                            &app,
                            "whatsmo://history-progress",
                            HistorySyncProgressPayload {
                                active: true,
                                total: preview.total,
                                processed: 0,
                                messages: preview.messages,
                                notifications: preview.notifications,
                                receipts: preview.receipts,
                                message: format!(
                                    "Syncing {} offline WhatsApp items...",
                                    preview.total
                                ),
                            },
                        );
                    }
                    Event::OfflineSyncCompleted(completed) => {
                        emit_event(
                            &app,
                            "whatsmo://history-progress",
                            HistorySyncProgressPayload {
                                active: false,
                                total: completed.count,
                                processed: completed.count,
                                messages: completed.count,
                                notifications: 0,
                                receipts: 0,
                                message: format!(
                                    "Offline WhatsApp sync completed: {} items.",
                                    completed.count
                                ),
                            },
                        );
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
                    Event::PictureUpdate(update) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-updated",
                            ContactUpdatedPayload {
                                jid: update.jid.to_string(),
                                timestamp_ms: update.timestamp.timestamp_millis(),
                            },
                        );
                    }
                    Event::UserAboutUpdate(update) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-updated",
                            ContactUpdatedPayload {
                                jid: update.jid.to_string(),
                                timestamp_ms: update.timestamp.timestamp_millis(),
                            },
                        );
                    }
                    Event::PushNameUpdate(update) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-updated",
                            ContactUpdatedPayload {
                                jid: update.jid.to_string(),
                                timestamp_ms: update.message.timestamp.timestamp_millis(),
                            },
                        );
                    }
                    Event::ContactUpdated(update) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-updated",
                            ContactUpdatedPayload {
                                jid: update.jid.to_string(),
                                timestamp_ms: update.timestamp.timestamp_millis(),
                            },
                        );
                    }
                    Event::ContactNumberChanged(change) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-number-changed",
                            ContactNumberChangedPayload {
                                old_jid: change.old_jid.to_string(),
                                new_jid: change.new_jid.to_string(),
                                old_lid: change.old_lid.as_ref().map(ToString::to_string),
                                new_lid: change.new_lid.as_ref().map(ToString::to_string),
                                timestamp_ms: change.timestamp.timestamp_millis(),
                            },
                        );
                    }
                    Event::ContactSyncRequested(sync) => {
                        emit_event(
                            &app,
                            "whatsmo://contact-sync-requested",
                            ContactSyncRequestedPayload {
                                after_ms: sync.after.map(|timestamp| timestamp.timestamp_millis()),
                                timestamp_ms: sync.timestamp.timestamp_millis(),
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

async fn clear_session_files(app: &AppHandle) -> CommandResult<()> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Could not resolve app data directory: {error}"))?;
    for suffix in ["", "-shm", "-wal"] {
        let path = app_data_dir.join(format!("{SESSION_DB_FILE}{suffix}"));
        match tokio::fs::remove_file(&path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "Failed to remove local session file {}: {error}",
                    path.display()
                ));
            }
        }
    }

    Ok(())
}

fn receipt_status(receipt_type: &ReceiptType) -> Option<&'static str> {
    match receipt_type {
        ReceiptType::Delivered | ReceiptType::Sender => Some("delivered"),
        ReceiptType::Read | ReceiptType::ReadSelf => Some("read"),
        ReceiptType::Played | ReceiptType::PlayedSelf => Some("played"),
        _ => None,
    }
}

fn history_sync_payload(
    conversation: &wacore::types::events::LazyConversation,
) -> Option<HistorySyncPayload> {
    const MAX_HISTORY_MESSAGES_PER_CHAT: usize = 120;

    let conversation = conversation.get_with_messages()?;
    let chat_id = conversation.id.clone();
    if chat_id.is_empty() {
        return None;
    }

    let is_group = chat_id.contains("@g.us");
    let mut messages = conversation
        .messages
        .iter()
        .filter_map(|history_message| history_message.message.as_ref())
        .filter_map(|message| history_message_payload(&chat_id, is_group, message))
        .collect::<Vec<_>>();
    messages.sort_by_key(|message| message.timestamp_ms);
    if messages.len() > MAX_HISTORY_MESSAGES_PER_CHAT {
        messages = messages.split_off(messages.len() - MAX_HISTORY_MESSAGES_PER_CHAT);
    }

    let last_message_at = conversation
        .last_msg_timestamp
        .or(conversation.conversation_timestamp)
        .map(seconds_to_millis)
        .or_else(|| messages.last().map(|message| message.timestamp_ms))
        .unwrap_or_else(|| Utc::now().timestamp_millis());
    let title = conversation
        .name
        .or(conversation.display_name)
        .or(conversation.pn_jid)
        .unwrap_or_else(|| chat_title_from_jid(&chat_id));

    Some(HistorySyncPayload {
        chat_id,
        title,
        unread_count: conversation.unread_count.unwrap_or(0),
        last_message_at,
        is_group,
        messages,
    })
}

fn history_message_payload(
    fallback_chat_id: &str,
    is_group: bool,
    web_message: &wa::WebMessageInfo,
) -> Option<IncomingMessagePayload> {
    let message = web_message.message.as_ref()?;
    let key = &web_message.key;
    let chat_id = key
        .remote_jid
        .clone()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_chat_id.to_string());
    let from_me = key.from_me.unwrap_or(false);
    let sender_id = if from_me {
        "me".to_string()
    } else if is_group {
        key.participant
            .clone()
            .or_else(|| web_message.participant.clone())
            .unwrap_or_else(|| chat_id.clone())
    } else {
        chat_id.clone()
    };
    let id = key.id.clone().filter(|value| !value.is_empty())?;
    let text = message
        .text_content()
        .map(ToString::to_string)
        .or_else(|| message.get_caption().map(ToString::to_string));

    Some(IncomingMessagePayload {
        id,
        chat_id,
        sender_id,
        text,
        timestamp_ms: web_message
            .message_timestamp
            .map(seconds_to_millis)
            .unwrap_or_else(|| Utc::now().timestamp_millis()),
        is_group,
        from_me,
        event_kind: MessageEventKind::Message,
        target_message_id: None,
    })
}

fn message_event_kind(edit: &wacore::types::message::EditAttribute) -> MessageEventKind {
    use wacore::types::message::EditAttribute;

    match edit {
        EditAttribute::MessageEdit | EditAttribute::AdminEdit => MessageEventKind::Edit,
        EditAttribute::SenderRevoke => MessageEventKind::Revoke,
        EditAttribute::AdminRevoke => MessageEventKind::AdminRevoke,
        EditAttribute::Empty => MessageEventKind::Message,
        EditAttribute::PinInChat | EditAttribute::Unknown(_) => MessageEventKind::Other,
    }
}

fn seconds_to_millis(seconds: u64) -> i64 {
    seconds.saturating_mul(1000).min(i64::MAX as u64) as i64
}

fn chat_title_from_jid(jid: &str) -> String {
    let user = jid.split('@').next().unwrap_or(jid);
    if jid.contains("@g.us") {
        format!("Group {user}")
    } else if user.chars().all(|character| character.is_ascii_digit()) {
        format!("+{user}")
    } else {
        user.to_string()
    }
}

async fn contact_profiles_for_jids(
    client: &Client,
    jids: Vec<Jid>,
) -> CommandResult<Vec<ContactProfilePayload>> {
    if jids.is_empty() {
        return Ok(Vec::new());
    }

    let user_jids = jids
        .iter()
        .filter(|jid| !jid.is_group() && !jid.is_newsletter() && !jid.is_status_broadcast())
        .cloned()
        .collect::<Vec<_>>();
    let user_info = client
        .contacts()
        .get_user_info(&user_jids)
        .await
        .map_err(|error| format!("Failed to sync contact profile info: {error}"))?;
    let mut profiles = Vec::with_capacity(jids.len());

    for jid in jids {
        let info = user_info.get(&jid);
        let picture = client
            .contacts()
            .get_profile_picture(&jid, true)
            .await
            .map_err(|error| format!("Failed to sync profile picture for {jid}: {error}"))?;

        profiles.push(ContactProfilePayload {
            id: jid.to_string(),
            phone: jid.user.clone(),
            lid: info
                .and_then(|value| value.lid.as_ref())
                .map(ToString::to_string),
            about: info.and_then(|value| value.status.clone()),
            picture_id: info
                .and_then(|value| value.picture_id.clone())
                .or_else(|| picture.as_ref().map(|value| value.id.clone())),
            avatar_url: picture.as_ref().map(|value| value.url.clone()),
            is_business: info.is_some_and(|value| value.is_business),
            updated_at_ms: Utc::now().timestamp_millis(),
        });
    }

    Ok(profiles)
}

fn parse_profile_jid(input: &str) -> CommandResult<Jid> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return Err("Profile JID cannot be empty.".to_string());
    }

    if trimmed.contains('@') {
        trimmed
            .parse::<Jid>()
            .map_err(|error| format!("Invalid profile JID {trimmed}: {error}"))
    } else {
        let digits = normalize_phone(trimmed)?;
        format!("{digits}@s.whatsapp.net")
            .parse::<Jid>()
            .map_err(|error| format!("Invalid profile phone {trimmed}: {error}"))
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
