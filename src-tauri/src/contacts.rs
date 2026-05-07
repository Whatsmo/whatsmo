use serde::Deserialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

#[derive(Deserialize)]
struct DeviceContact {
    name: String,
    phone: String,
}

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.whatsmo.mobile";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("contacts")
        .setup(|app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin(PLUGIN_IDENTIFIER, "ContactsPlugin")
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .build()
}
