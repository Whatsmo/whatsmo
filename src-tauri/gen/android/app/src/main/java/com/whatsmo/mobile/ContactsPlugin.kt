package com.whatsmo.mobile

import android.Manifest
import android.app.Activity
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@TauriPlugin
class ContactsPlugin(private val activity: Activity) : Plugin(activity) {

    private val REQUEST_CODE = 9001
    private var pendingInvoke: Invoke? = null

    @Command
    fun getContacts(invoke: Invoke) {
        if (ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            pendingInvoke = invoke
            ActivityCompat.requestPermissions(
                activity,
                arrayOf(Manifest.permission.READ_CONTACTS),
                REQUEST_CODE
            )
            return
        }

        returnContacts(invoke)
    }

    @Command
    fun checkPermission(invoke: Invoke) {
        val granted = ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CONTACTS) ==
            PackageManager.PERMISSION_GRANTED
        val result = JSObject()
        result.put("granted", granted)
        invoke.resolve(result)
    }

    private fun returnContacts(invoke: Invoke) {
        val reader = ContactsReader(activity)
        val json = reader.readContacts()
        val result = JSObject()
        result.put("contacts", json)
        invoke.resolve(result)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == REQUEST_CODE && pendingInvoke != null) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                returnContacts(pendingInvoke!!)
            } else {
                pendingInvoke!!.reject("READ_CONTACTS permission denied")
            }
            pendingInvoke = null
        }
    }
}
