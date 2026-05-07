use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.whatsmo.mobile";

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("contacts")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                _api.register_android_plugin(PLUGIN_IDENTIFIER, "ContactsPlugin")
                    .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .build()
}
