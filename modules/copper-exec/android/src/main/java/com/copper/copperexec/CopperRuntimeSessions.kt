package com.copper.copperexec

import android.content.Context
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Owns persistent pseudo-terminal processes for the manual Copper Runtime
 * terminal. This is intentionally separate from agent tools: callers must opt
 * into this API explicitly, and CopperExecModule requires Android's manual
 * all-files grant before creating a session with a shared-storage cwd.
 */
internal object CopperRuntimeSessions {
  private const val PREFIX_DIRECTORY = "usr"
  private const val HOME_DIRECTORY = "home"
  private const val DEFAULT_ROWS = 28
  private const val DEFAULT_COLUMNS = 100
  private const val MAX_INPUT_BYTES = 256 * 1024
  private const val SIGNAL_HANGUP = 1

  private data class Session(
    val id: String,
    val descriptor: Int,
    val pid: Int,
    val cwd: String,
    val startedAtEpochMs: Long,
    val closed: AtomicBoolean = AtomicBoolean(false)
  )

  private val sessions = ConcurrentHashMap<String, Session>()

  fun start(
    context: Context,
    cwd: File,
    rows: Int,
    columns: Int,
    emit: (String, Map<String, Any?>) -> Unit
  ): Map<String, Any?> {
    val runtime = CopperRuntimeInstaller.status(context)
    check(runtime["ready"] == true) {
      "Copper Runtime is not ready. Install or repair the verified runtime before opening a package terminal."
    }

    val prefix = File(context.filesDir, PREFIX_DIRECTORY)
    val home = File(context.filesDir, HOME_DIRECTORY)
    val shell = File(prefix, "bin/bash")
    check(shell.canExecute()) { "Copper Runtime Bash is unavailable or not executable." }

    val terminalRows = rows.coerceIn(2, 300).takeIf { rows > 0 } ?: DEFAULT_ROWS
    val terminalColumns = columns.coerceIn(10, 500).takeIf { columns > 0 } ?: DEFAULT_COLUMNS
    val environment = environment(prefix, home, cwd)
    val process = CopperPtyNative.nativeCreate(
      shell.absolutePath,
      cwd.absolutePath,
      arrayOf(shell.absolutePath, "--login"),
      environment.toTypedArray(),
      terminalRows,
      terminalColumns
    )
    check(process.size == 2 && process[0] >= 0 && process[1] > 0) {
      "Copper Runtime did not return a valid terminal process."
    }

    val session = Session(
      id = UUID.randomUUID().toString(),
      descriptor = process[0],
      pid = process[1],
      cwd = cwd.absolutePath,
      startedAtEpochMs = System.currentTimeMillis()
    )
    sessions[session.id] = session
    readOutput(session, emit)
    waitForExit(session, emit)

    return sessionInfo(session)
  }

  fun write(sessionId: String, input: String): Int {
    val session = session(sessionId)
    check(!session.closed.get()) { "Terminal session is closed." }
    val bytes = input.toByteArray(StandardCharsets.UTF_8)
    require(bytes.size <= MAX_INPUT_BYTES) { "Terminal paste is limited to 256 KiB at a time." }
    return CopperPtyNative.nativeWrite(session.descriptor, bytes)
  }

  fun resize(sessionId: String, rows: Int, columns: Int) {
    val session = session(sessionId)
    check(!session.closed.get()) { "Terminal session is closed." }
    CopperPtyNative.nativeResize(session.descriptor, rows.coerceIn(2, 300), columns.coerceIn(10, 500))
  }

  fun close(sessionId: String): Boolean {
    val session = sessions.remove(sessionId) ?: return false
    if (session.closed.compareAndSet(false, true)) {
      try {
        CopperPtyNative.nativeSignal(session.pid, SIGNAL_HANGUP)
      } finally {
        CopperPtyNative.nativeClose(session.descriptor)
      }
    }
    return true
  }

  fun list(): List<Map<String, Any?>> = sessions.values
    .sortedBy { it.startedAtEpochMs }
    .map(::sessionInfo)

  private fun session(sessionId: String): Session =
    sessions[sessionId] ?: throw IllegalArgumentException("Terminal session was not found.")

  private fun sessionInfo(session: Session): Map<String, Any?> = mapOf(
    "id" to session.id,
    "pid" to session.pid,
    "cwd" to session.cwd,
    "startedAtEpochMs" to session.startedAtEpochMs
  )

  private fun environment(prefix: File, home: File, cwd: File): List<String> {
    val termuxExec = File(prefix, "lib/libtermux-exec.so")
    return buildList {
      add("HOME=${home.absolutePath}")
      add("PREFIX=${prefix.absolutePath}")
      add("TMPDIR=${File(prefix, "tmp").absolutePath}")
      add("PATH=${File(prefix, "bin").absolutePath}:/system/bin:/system/xbin")
      add("SHELL=${File(prefix, "bin/bash").absolutePath}")
      add("PWD=${cwd.absolutePath}")
      add("TERM=xterm-256color")
      add("COLORTERM=truecolor")
      add("LANG=en_US.UTF-8")
      if (termuxExec.isFile) add("LD_PRELOAD=${termuxExec.absolutePath}")
    }
  }

  private fun readOutput(session: Session, emit: (String, Map<String, Any?>) -> Unit) {
    Thread {
      val buffer = ByteArray(16 * 1024)
      try {
        while (!session.closed.get()) {
          val count = CopperPtyNative.nativeRead(session.descriptor, buffer)
          if (count <= 0) break
          // A terminal byte stream may contain ANSI controls; it is sent as-is
          // rather than being flattened into ordinary agent/chat text.
          emit("runtimeOutput", mapOf(
            "sessionId" to session.id,
            "data" to String(buffer, 0, count, StandardCharsets.UTF_8)
          ))
        }
      } catch (error: Exception) {
        if (!session.closed.get()) {
          emit("runtimeError", mapOf("sessionId" to session.id, "message" to (error.message ?: "Terminal output failed.")))
        }
      }
    }.apply {
      name = "CopperRuntime-output-${session.id.take(8)}"
      isDaemon = true
      start()
    }
  }

  private fun waitForExit(session: Session, emit: (String, Map<String, Any?>) -> Unit) {
    Thread {
      val exitCode = CopperPtyNative.nativeWait(session.pid)
      val wasOpen = session.closed.compareAndSet(false, true)
      sessions.remove(session.id, session)
      try {
        CopperPtyNative.nativeClose(session.descriptor)
      } catch (_: Exception) {
        // The reader or close() may already have closed the descriptor.
      }
      emit("runtimeExit", mapOf(
        "sessionId" to session.id,
        "exit" to exitCode,
        "closedByUser" to !wasOpen
      ))
    }.apply {
      name = "CopperRuntime-exit-${session.id.take(8)}"
      isDaemon = true
      start()
    }
  }
}
