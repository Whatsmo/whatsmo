package com.whatsmo.mobile

import android.Manifest
import android.app.Activity
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin(
    permissions = [
        Permission(strings = [Manifest.permission.READ_CONTACTS], alias = "readContacts")
    ]
)
class ContactsPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun getContacts(invoke: Invoke) {
        if (getPermissionState("readContacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("readContacts", invoke, "contactsPermissionCallback")
            return
        }
        returnContacts(invoke)
    }

    @Command
    fun checkPermission(invoke: Invoke) {
        val granted = getPermissionState("readContacts") == PermissionState.GRANTED
        val result = JSObject()
        result.put("granted", granted)
        invoke.resolve(result)
    }

    @PermissionCallback
    private fun contactsPermissionCallback(invoke: Invoke) {
        if (getPermissionState("readContacts") == PermissionState.GRANTED) {
            returnContacts(invoke)
        } else {
            invoke.reject("READ_CONTACTS permission denied")
        }
    }

    private fun returnContacts(invoke: Invoke) {
        val reader = ContactsReader(activity)
        val json = reader.readContacts()
        val result = JSObject()
        result.put("contacts", json)
        invoke.resolve(result)
    }
}
