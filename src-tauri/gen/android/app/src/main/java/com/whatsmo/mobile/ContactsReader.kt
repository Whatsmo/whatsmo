package com.whatsmo.mobile

import android.content.ContentResolver
import android.content.Context
import android.provider.ContactsContract
import org.json.JSONArray
import org.json.JSONObject

class ContactsReader(private val context: Context) {

    fun readContacts(): String {
        val contacts = JSONArray()
        val resolver: ContentResolver = context.contentResolver

        val projection = arrayOf(
            ContactsContract.CommonDataKinds.Phone.CONTACT_ID,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        )

        val cursor = resolver.query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI,
            projection,
            null,
            null,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC"
        )

        val seen = mutableSetOf<String>()

        cursor?.use {
            val nameIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME)
            val numberIdx = it.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER)

            while (it.moveToNext()) {
                val name = it.getString(nameIdx) ?: continue
                val rawNumber = it.getString(numberIdx) ?: continue
                val normalized = normalizePhone(rawNumber)
                if (normalized.isEmpty() || !seen.add(normalized)) continue

                contacts.put(JSONObject().apply {
                    put("name", name)
                    put("phone", normalized)
                })
            }
        }

        return contacts.toString()
    }

    private fun normalizePhone(input: String): String {
        return input.filter { it.isDigit() || it == '+' }.trimStart('+')
    }
}
