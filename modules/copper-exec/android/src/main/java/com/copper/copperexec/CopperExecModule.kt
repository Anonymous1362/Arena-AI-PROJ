package com.copper.copperexec

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.DocumentsContract
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

private const val DOCUMENTS_AUTHORITY = "com.android.externalstorage.documents"
private const val COPPER_PROJECTS_RELATIVE_PATH = "Download/COPPER Projects"
private const val MAX_TIMEOUT_MS = 60_000L
private const val MAX_OUTPUT_BYTES = 512 * 1024

/**
 * Provides Copper's physical, app-specific external storage location.
 *
 * Android returns one app-specific folder per mounted external volume. A
 * removable volume is deliberately preferred over emulated primary storage,
 * and no internal-files-directory fallback is ever returned on Android.
 */
class CopperExecModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.AppContextLost()

  override fun definition() = ModuleDefinition {
    Name("CopperExec")
    Events("runtimeOutput", "runtimeExit", "runtimeError")

    AsyncFunction("getStorageInfo") {
      storageInfo(preferredExternalFilesDir())
    }

    // Kept as explicit bridge methods so JS callers can ask for either path.
    // This one intentionally mirrors Context.getExternalFilesDir(null), i.e.
    // Android's primary external app folder. getStorageInfo() can prefer a
    // mounted removable volume for Copper's automatic workspace.
    AsyncFunction("getExternalFilesDir") {
      storageInfo(primaryExternalFilesDir())
    }

    AsyncFunction("getExternalSdCard") {
      removableExternalFilesDir()?.let { storageInfo(it) }
    }

    /** Whether Android has granted the special all-shared-storage access. */
    AsyncFunction("hasAllFilesAccess") {
      hasAllFilesAccess()
    }

    /**
     * Opens Android's per-app All files access screen. The user must explicitly
     * enable it there; this method returns the current state immediately.
     */
    AsyncFunction("requestAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
        val packageUri = Uri.parse("package:${context.packageName}")
        val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, packageUri)
        try {
          appContext.throwingActivity.startActivity(intent)
        } catch (_: Exception) {
          appContext.throwingActivity.startActivity(Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION))
        }
      }
      hasAllFilesAccess()
    }

    /**
     * Start manual sessions in the user's COPPER Projects directory when it is
     * present on the preferred removable volume. The manual terminal remains
     * free to navigate elsewhere under /storage/ after explicit approval.
     */
    AsyncFunction("getTerminalStartDirectory") {
      preferredExternalFilesDir()?.let(::volumeRootFor)?.let { volumeRoot ->
        File(volumeRoot, COPPER_PROJECTS_RELATIVE_PATH)
          .takeIf { it.isDirectory }
          ?.canonicalPath
          ?: volumeRoot.absolutePath
      }
    }

    /** Resolves a `cd` target while keeping the manual terminal on /storage. */
    AsyncFunction("resolveSharedDirectory") { target: String, workingDirectory: String? ->
      if (!hasAllFilesAccess()) {
        throw SecurityException("Enable All files access for Copper in Android Settings before using the manual terminal.")
      }
      resolveSharedTerminalDirectory(target, workingDirectory).absolutePath
    }

    /**
     * Runs a manual-terminal command against a caller-selected shared-storage
     * directory. It is enabled only after Android's All files access grant and
     * refuses /data or other private system paths.
     */
    AsyncFunction("execAllFiles") { command: String, workingDirectory: String?, timeoutMs: Double ->
      if (!hasAllFilesAccess()) {
        throw SecurityException("Enable All files access for Copper in Android Settings before using the manual terminal.")
      }
      runShell(command, resolveSharedTerminalDirectory(workingDirectory, null), timeoutMs.toLong())
    }

    /** Copper Runtime bootstrap/package storage status. No runtime is faked
     * when a build does not contain the verified Copper-prefix bootstrap asset. */
    AsyncFunction("getRuntimeStatus") {
      CopperRuntimeInstaller.status(context)
    }

    /** Install a verified bundled Copper Runtime bootstrap atomically. */
    AsyncFunction("installCopperRuntime") { replaceExisting: Boolean ->
      CopperRuntimeInstaller.install(context, replaceExisting)
    }

    /** Reinstall the executable package prefix while preserving shell settings. */
    AsyncFunction("repairCopperRuntime") {
      CopperRuntimeInstaller.repair(context)
    }

    /** Remove the runtime; callers explicitly choose whether $HOME is retained. */
    AsyncFunction("removeCopperRuntime") { preserveHome: Boolean ->
      CopperRuntimeInstaller.remove(context, preserveHome)
    }

    /**
     * Starts a persistent manual Copper Runtime PTY. This endpoint is never
     * registered with the agent tools; its cwd remains on Android shared
     * storage and requires the explicit All files grant.
     */
    AsyncFunction("startRuntimeSession") { workingDirectory: String?, rows: Double, columns: Double ->
      if (!hasAllFilesAccess()) {
        throw SecurityException("Enable All files access for Copper in Android Settings before starting the manual package terminal.")
      }
      val cwd = resolveSharedTerminalDirectory(workingDirectory, null)
      CopperRuntimeSessions.start(context, cwd, rows.toInt(), columns.toInt()) { event, body ->
        sendEvent(event, body)
      }
    }

    AsyncFunction("writeRuntimeSession") { sessionId: String, input: String ->
      CopperRuntimeSessions.write(sessionId, input)
    }

    AsyncFunction("resizeRuntimeSession") { sessionId: String, rows: Double, columns: Double ->
      CopperRuntimeSessions.resize(sessionId, rows.toInt(), columns.toInt())
      true
    }

    AsyncFunction("closeRuntimeSession") { sessionId: String ->
      CopperRuntimeSessions.close(sessionId)
    }

    AsyncFunction("listRuntimeSessions") {
      CopperRuntimeSessions.list()
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
    return dirs.firstOrNull(::isRemovable) ?: primaryExternalFilesDir() ?: dirs.firstOrNull()
  }

  /** Mirrors Context.getExternalFilesDir(null): primary external app storage. */
  private fun primaryExternalFilesDir(): File? {
    val primary = context.getExternalFilesDir(null) ?: return null
    return primary.takeIf { dir ->
      Environment.getExternalStorageState(dir) == Environment.MEDIA_MOUNTED &&
        (dir.isDirectory || dir.mkdirs())
    }
  }

  private fun removableExternalFilesDir(): File? =
    writableExternalFilesDirs().firstOrNull(::isRemovable)

  private fun hasAllFilesAccess(): Boolean =
    Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager()

  /**
   * Keeps the all-files terminal in Android's shared volumes. It may traverse
   * any external card/primary folder after the special grant, but never enters
   * the app-private /data area.
   */
  private fun resolveSharedTerminalDirectory(requested: String?, currentDirectory: String?): File {
    val defaultDir = preferredExternalFilesDir()?.let(::volumeRootFor)
      ?: throw IllegalStateException("No external storage is mounted.")
    val base = currentDirectory?.takeIf { it.isNotBlank() }?.let(::File) ?: defaultDir
    val candidate = when {
      requested.isNullOrBlank() -> base
      File(requested).isAbsolute -> File(requested)
      else -> File(base, requested)
    }
    val canonical = candidate.canonicalFile
    val path = canonical.path
    if (path != "/storage" && !path.startsWith("/storage/")) {
      throw SecurityException("Manual terminal directories must stay on shared external storage (/storage/...).")
    }
    if (!canonical.isDirectory) {
      throw IllegalArgumentException("Directory does not exist: ${canonical.path}")
    }
    return canonical
  }

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
      "label" to if (removable) "SD card ($volumeId)" else "External storage (Android/data/${context.packageName}/files)",
      "rootUri" to fileUri(selected),
      "rootPath" to selected.absolutePath,
      "volumeRootPath" to volumeRoot.absolutePath,
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
    val outputTruncated = AtomicBoolean(false)
    val reader = Thread {
      process.inputStream.use { input ->
        val buffer = ByteArray(8 * 1024)
        while (true) {
          val bytesRead = input.read(buffer)
          if (bytesRead <= 0) break
          synchronized(output) {
            val remaining = MAX_OUTPUT_BYTES - output.size()
            if (remaining > 0) {
              output.write(buffer, 0, minOf(remaining, bytesRead))
            }
            if (bytesRead > remaining) outputTruncated.set(true)
          }
        }
      }
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

    val stdout = output.toString(Charsets.UTF_8.name()) +
      if (outputTruncated.get()) "\n…[output capped at 512 KB]" else ""
    return mapOf(
      "stdout" to stdout,
      "exit" to if (finished) process.exitValue() else 124,
      "timedOut" to !finished,
      "cwd" to cwd.absolutePath
    )
  }
}
