package com.copper.auroraexec

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Environment
import android.provider.DocumentsContract
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit

private const val DOCUMENTS_AUTHORITY = "com.android.externalstorage.documents"
private const val MAX_TIMEOUT_MS = 60_000L

/**
 * Provides Copper's physical, app-specific external storage location.
 *
 * Android returns one app-specific folder per mounted external volume. A
 * removable volume is deliberately preferred over emulated primary storage,
 * and no internal-files-directory fallback is ever returned on Android.
 */
class AuroraExecModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  override fun definition() = ModuleDefinition {
    Name("AuroraExec")

    AsyncFunction("getStorageInfo") {
      storageInfo(preferredExternalFilesDir())
    }

    // Kept as explicit bridge methods so JS callers can ask for either path.
    AsyncFunction("getExternalFilesDir") {
      storageInfo(preferredExternalFilesDir())
    }

    AsyncFunction("getExternalSdCard") {
      removableExternalFilesDir()?.let { storageInfo(it) }
    }

    /**
     * Shares an external file or SAF content URI directly, without first
     * copying it to an internal cache. File URIs are converted through this
     * module's provider because Expo Sharing only maps the primary volume.
     */
    AsyncFunction("shareUri") { uriString: String, mimeType: String, title: String? ->
      val originalUri = Uri.parse(uriString)
      val shareUri = when (originalUri.scheme) {
        "content" -> originalUri
        "file" -> {
          val file = originalUri.path?.let(::File)
            ?: throw IllegalArgumentException("The external file URI has no path.")
          if (!writableExternalFilesDirs().any { root -> isInside(root, file) }) {
            throw IllegalArgumentException("Only files inside Copper's external workspace can be shared.")
          }
          FileProvider.getUriForFile(
            context,
            context.packageName + ".CopperExternalFileProvider",
            file
          )
        }
        else -> throw IllegalArgumentException("Only file or content URIs can be shared.")
      }
      val intent = Intent(Intent.ACTION_SEND)
        .setType(mimeType)
        .putExtra(Intent.EXTRA_STREAM, shareUri)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      appContext.throwingActivity.startActivity(Intent.createChooser(intent, title))
      true
    }

    /**
     * Runs Android's system shell with the selected external app folder as its
     * working directory. This is not a Termux shell and deliberately does not
     * use or create an internal application prefix.
     */
    AsyncFunction("exec") { command: String, _requestedWorkingDirectory: String?, timeoutMs: Double ->
      val cwd = preferredExternalFilesDir()
        ?: throw IllegalStateException("No writable external storage is mounted. Insert or remount the SD card, then try again.")
      runShell(command, cwd, timeoutMs.toLong())
    }
  }

  /** Returns mounted, writable app-specific external folders only. */
  private fun writableExternalFilesDirs(): List<File> = context
    .getExternalFilesDirs(null)
    .filterNotNull()
    .filter { dir ->
      Environment.getExternalStorageState(dir) == Environment.MEDIA_MOUNTED &&
        (dir.isDirectory || dir.mkdirs())
    }

  /** Prefer a real removable SD card; otherwise use primary external storage. */
  private fun preferredExternalFilesDir(): File? {
    val dirs = writableExternalFilesDirs()
    return dirs.firstOrNull(::isRemovable) ?: dirs.firstOrNull()
  }

  private fun removableExternalFilesDir(): File? =
    writableExternalFilesDirs().firstOrNull(::isRemovable)

  private fun isRemovable(dir: File): Boolean = try {
    Environment.isExternalStorageRemovable(dir)
  } catch (_: Exception) {
    false
  }

  private fun storageInfo(selected: File?): Map<String, Any?> {
    if (selected == null) return mapOf("available" to false)

    val volumeRoot = volumeRootFor(selected)
    val volumeId = volumeRoot.name
    val removable = isRemovable(selected)
    val card = removableExternalFilesDir()
    val selectedInfo = mutableMapOf<String, Any?>(
      "available" to true,
      "kind" to if (removable) "removable" else "primary",
      "label" to if (removable) "SD card ($volumeId)" else "External storage",
      "rootUri" to fileUri(selected),
      "rootPath" to selected.absolutePath,
      "volumeRootUri" to fileUri(volumeRoot),
      "safRootUri" to safRootUri(volumeId)
    )

    if (card != null) {
      val cardRoot = volumeRootFor(card)
      val cardId = cardRoot.name
      selectedInfo["removableRootUri"] = fileUri(cardRoot)
      selectedInfo["removableRootPath"] = cardRoot.absolutePath
      selectedInfo["removableSafRootUri"] = safRootUri(cardId)
    }
    return selectedInfo
  }

  /** Walk /Android/data/<package>/files back to the volume root. */
  private fun volumeRootFor(directory: File): File {
    var current = directory
    while (current.parentFile != null && current.name != "Android") {
      current = current.parentFile
    }
    return current.parentFile ?: directory
  }

  private fun fileUri(file: File): String = Uri.fromFile(file).toString().trimEnd('/') + "/"

  private fun isInside(parent: File, child: File): Boolean = try {
    val parentPath = parent.canonicalPath.trimEnd(File.separatorChar) + File.separator
    val childPath = child.canonicalPath
    childPath.startsWith(parentPath)
  } catch (_: Exception) {
    false
  }

  private fun safRootUri(volumeId: String): String =
    DocumentsContract.buildRootUri(DOCUMENTS_AUTHORITY, volumeId).toString()

  private fun runShell(command: String, cwd: File, requestedTimeoutMs: Long): Map<String, Any> {
    if (command.isBlank()) {
      return mapOf("stdout" to "", "exit" to 0, "timedOut" to false, "cwd" to cwd.absolutePath)
    }

    val timeoutMs = requestedTimeoutMs.coerceIn(1_000L, MAX_TIMEOUT_MS)
    val tempDir = File(cwd, ".tmp").apply { mkdirs() }
    val process = ProcessBuilder("/system/bin/sh", "-c", command)
      .directory(cwd)
      .redirectErrorStream(true)
      .apply {
        environment()["HOME"] = cwd.absolutePath
        environment()["TMPDIR"] = tempDir.absolutePath
        environment()["PREFIX"] = cwd.absolutePath
      }
      .start()

    val output = ByteArrayOutputStream()
    val reader = Thread {
      process.inputStream.use { input -> input.copyTo(output) }
    }.apply {
      isDaemon = true
      start()
    }

    val finished = process.waitFor(timeoutMs, TimeUnit.MILLISECONDS)
    if (!finished) {
      process.destroy()
      if (!process.waitFor(750, TimeUnit.MILLISECONDS)) process.destroyForcibly()
    }
    reader.join(1_500)

    return mapOf(
      "stdout" to output.toString(Charsets.UTF_8.name()),
      "exit" to if (finished) process.exitValue() else 124,
      "timedOut" to !finished,
      "cwd" to cwd.absolutePath
    )
  }
}
