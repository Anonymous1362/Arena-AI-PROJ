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
  private const val EXIT_OUTPUT_TAIL_CHARS = 4 * 1024
  private const val MAX_RETAINED_EXIT_DETAILS = 12

  private data class Session(
    val id: String,
    val descriptor: Int,
    val pid: Int,
    val cwd: String,
    val startedAtEpochMs: Long,
    val closed: AtomicBoolean = AtomicBoolean(false),
    val descriptorClosed: AtomicBoolean = AtomicBoolean(false),
    val outputTail: StringBuilder = StringBuilder()
  )

  private data class ExitDetail(
    val sessionId: String,
    val exit: Int,
    val closedByUser: Boolean,
    val outputTail: String,
    val exitedAtEpochMs: Long
  )

  private val sessions = ConcurrentHashMap<String, Session>()
  private val recentExits = ConcurrentHashMap<String, ExitDetail>()

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
    val outputThread = readOutput(session, emit)
    waitForExit(session, outputThread, emit)

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
        closeDescriptor(session)
      }
    }
    return true
  }

  fun list(): List<Map<String, Any?>> = sessions.values
    .sortedBy { it.startedAtEpochMs }
    .map(::sessionInfo)

  /** Returns a bounded launch/exit diagnostic after the session leaves the
   * active map. This lets the UI distinguish a stale button from Bash exiting
   * immediately, including the child’s last PTY output when available. */
  fun exitDetail(sessionId: String): Map<String, Any?>? = recentExits[sessionId]?.let { detail ->
    mapOf(
      "sessionId" to detail.sessionId,
      "exit" to detail.exit,
      "closedByUser" to detail.closedByUser,
      "outputTail" to detail.outputTail,
      "exitedAtEpochMs" to detail.exitedAtEpochMs
    )
  }

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

  private fun readOutput(session: Session, emit: (String, Map<String, Any?>) -> Unit): Thread =
    Thread {
      val buffer = ByteArray(16 * 1024)
      try {
        // Keep reading through normal child exit so a last linker/exec error
        // reaches both the visible terminal and the retained diagnostic tail.
        while (true) {
          val count = CopperPtyNative.nativeRead(session.descriptor, buffer)
          if (count <= 0) break
          // A terminal byte stream may contain ANSI controls; it is sent as-is
          // rather than being flattened into ordinary agent/chat text.
          val data = String(buffer, 0, count, StandardCharsets.UTF_8)
          appendOutputTail(session, data)
          emit("runtimeOutput", mapOf(
            "sessionId" to session.id,
            "data" to data
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

  private fun appendOutputTail(session: Session, data: String) = synchronized(session.outputTail) {
    session.outputTail.append(data)
    if (session.outputTail.length > EXIT_OUTPUT_TAIL_CHARS) {
      session.outputTail.delete(0, session.outputTail.length - EXIT_OUTPUT_TAIL_CHARS)
    }
  }

  private fun outputTail(session: Session): String = synchronized(session.outputTail) {
    session.outputTail.toString()
  }

  private fun recordExit(detail: ExitDetail) {
    recentExits[detail.sessionId] = detail
    // Keep only a small bounded diagnostic history. These details are not a
    // terminal transcript and are never persisted beyond the app process.
    while (recentExits.size > MAX_RETAINED_EXIT_DETAILS) {
      val oldest = recentExits.values.minByOrNull { it.exitedAtEpochMs } ?: break
      recentExits.remove(oldest.sessionId, oldest)
    }
  }

  private fun closeDescriptor(session: Session) {
    if (session.descriptorClosed.compareAndSet(false, true)) {
      CopperPtyNative.nativeClose(session.descriptor)
    }
  }

  private fun waitForExit(session: Session, outputThread: Thread, emit: (String, Map<String, Any?>) -> Unit) {
    Thread {
      val exitCode = CopperPtyNative.nativeWait(session.pid)
      // Do not close the PTY master before its reader can drain the child’s
      // final output. A rapid exec failure otherwise looks like a mysterious
      // "session was not found" with no useful cause on the phone.
      if (!session.closed.get()) {
        try {
          outputThread.join(350)
        } catch (_: InterruptedException) {
          Thread.currentThread().interrupt()
        }
      }
      val wasOpen = session.closed.compareAndSet(false, true)
      sessions.remove(session.id, session)
      val detail = ExitDetail(
        sessionId = session.id,
        exit = exitCode,
        closedByUser = !wasOpen,
        outputTail = outputTail(session),
        exitedAtEpochMs = System.currentTimeMillis()
      )
      recordExit(detail)
      try {
        closeDescriptor(session)
      } catch (_: Exception) {
        // The user close path may have released the descriptor first.
      }
      emit("runtimeExit", mapOf(
        "sessionId" to detail.sessionId,
        "exit" to detail.exit,
        "closedByUser" to detail.closedByUser,
        "outputTail" to detail.outputTail,
        "exitedAtEpochMs" to detail.exitedAtEpochMs
      ))
    }.apply {
      name = "CopperRuntime-exit-${session.id.take(8)}"
      isDaemon = true
      start()
    }
  }
}
