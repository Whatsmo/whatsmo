package com.whatsmo.mobile

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class WhatsmoKeepAliveService : Service() {
  override fun onCreate() {
    super.onCreate()
    ensureChannel()
    startForeground(
      NOTIFICATION_ID,
      NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("Whatsmo")
        .setContentText("Keeping the WhatsApp companion session ready")
        .setOngoing(true)
        .setSilent(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()
    )
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Whatsmo session",
      NotificationManager.IMPORTANCE_LOW
    ).apply {
      description = "Keeps the Whatsmo companion runtime available while linked"
      setSound(null, null)
    }
    manager.createNotificationChannel(channel)
  }

  companion object {
    private const val CHANNEL_ID = "whatsmo_keepalive"
    private const val NOTIFICATION_ID = 6101
  }
}
