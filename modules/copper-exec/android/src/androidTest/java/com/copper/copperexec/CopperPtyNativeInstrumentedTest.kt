package com.copper.copperexec

import android.os.Build
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Exercises the JNI PTY transport on a real Android kernel before a full Copper
 * bootstrap is available. It intentionally launches Android's own shell here:
 * Copper Runtime Bash cannot exist until the verified Copper archive is built
 * and installed. This test proves the PTY creation, resize, input, byte-stream
 * output, child exit, and descriptor cleanup paths without misrepresenting
 * /system/bin/sh as the Copper package terminal.
 */
@RunWith(AndroidJUnit4::class)
class CopperPtyNativeInstrumentedTest {
  /**
   * Runs in the asset-validation workflow, which fetches the exact successful
   * Copper bootstrap and supplies it as a temporary Gradle asset. The API-35
   * x86_64 emulator can prove the real Android installer, archive digest,
   * restored symlinks, modes, and prefix layout, but cannot execute an app's
   * arm64 ELF from private storage through its native bridge.
   */
  @Test(timeout = 120_000)
  fun installsVerifiedCopperBootstrapWhenBundled() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val bundled = CopperRuntimeInstaller.status(context)
    assumeTrue(
      "This validation requires the verified Copper arm64 bootstrap asset.",
      bundled["bundleAvailable"] == true
    )

    CopperRuntimeInstaller.remove(context, preserveHome = false)
    try {
      val installed = CopperRuntimeInstaller.install(context, replaceExisting = false)
      assertEquals("ready", installed["state"])
      assertTrue("The installed prefix must be ready.", installed["ready"] == true)
      assertEquals("ci-validation", installed["assetStageMode"])
      assertTrue("CI-only staged assets must retain their candidate-only label.", installed["candidateOnly"] == true)

      val prefix = File(context.filesDir, "usr")
      assertTrue("Copper Bash must have execute mode.", File(prefix, "bin/bash").canExecute())
      assertTrue("Copper apt must have execute mode.", File(prefix, "bin/apt").canExecute())
      assertTrue("Copper pkg must have execute mode.", File(prefix, "bin/pkg").canExecute())
      assertTrue("The termux-exec compatibility library must resolve.", File(prefix, "lib/libtermux-exec.so").isFile)
    } finally {
      CopperRuntimeInstaller.remove(context, preserveHome = false)
    }
  }

  /**
   * A true runtime execution test: it remains skipped in x86 CI rather than
   * claiming native-bridge support that Android refused for private ELF exec.
   * It runs automatically in an arm64 instrumented build with the same
   * verified asset and Copper package identity.
   */
  @Test(timeout = 150_000)
  fun runsCopperBashThroughPtyOnArm64WhenBundled() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    assumeTrue(
      "Copper Bash execution requires an arm64 Android device.",
      Build.SUPPORTED_ABIS.firstOrNull() == "arm64-v8a"
    )
    assumeTrue(
      "This validation requires the verified Copper arm64 bootstrap asset.",
      CopperRuntimeInstaller.status(context)["bundleAvailable"] == true
    )

    CopperRuntimeInstaller.remove(context, preserveHome = false)
    try {
      CopperRuntimeInstaller.install(context, replaceExisting = false)
      val prefix = File(context.filesDir, "usr")
      val receivedOutput = StringBuilder()
      val receivedPrompt = CountDownLatch(1)
      val cwd = context.cacheDir.apply { mkdirs() }
      val session = CopperRuntimeSessions.start(context, cwd, rows = 24, columns = 80) { event, body ->
        if (event == "runtimeOutput") {
          synchronized(receivedOutput) {
            receivedOutput.append(body["data"] as? String ?: "")
            if (receivedOutput.contains("copper-runtime-bash-ok:")) receivedPrompt.countDown()
          }
        }
      }
      val sessionId = session["id"] as String
      try {
        assertTrue(
          "Copper Bash must receive input through its PTY.",
          CopperRuntimeSessions.write(sessionId, "printf 'copper-runtime-bash-ok:%s\\n' \"\$PREFIX\"\n") > 0
        )
        assertTrue(
          "Copper Bash output was: $receivedOutput",
          receivedPrompt.await(20, TimeUnit.SECONDS)
        )
        synchronized(receivedOutput) {
          assertTrue(
            "Copper Bash must use Copper's private prefix, output was: $receivedOutput",
            receivedOutput.contains("copper-runtime-bash-ok:${prefix.absolutePath}")
          )
        }
      } finally {
        CopperRuntimeSessions.close(sessionId)
      }
    } finally {
      CopperRuntimeInstaller.remove(context, preserveHome = false)
    }
  }

  /**
   * Storage accounting is deliberately tested without a bundled bootstrap, so
   * cache/home/repair measurements remain covered by Android instrumentation.
   * The added leaf files are unique and cleaned up without touching a real
   * prefix.
   */
  @Test(timeout = 15_000)
  fun reportsNonOverlappingRuntimeStorageBreakdown() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val token = "copper-quota-${System.nanoTime()}"
    val files = context.filesDir
    val added = listOf(
      File(files, "usr/bin/$token-runtime") to 19,
      File(files, "usr/var/cache/apt/archives/$token.deb") to 23,
      File(files, "usr/var/lib/apt/lists/$token-index") to 29,
      File(files, "usr/tmp/$token-tmp") to 31,
      File(files, "home/$token-home") to 37,
      File(files, "copper-runtime/$token-metadata") to 41,
      File(files, "usr-staging/$token-staging") to 43,
      File(files, "usr-previous/$token-previous") to 47
    )
    val before = CopperRuntimeInstaller.status(context)
    try {
      for ((file, size) in added) {
        assertTrue("Could not create test parent for ${file.path}", file.parentFile?.mkdirs() == true || file.parentFile?.isDirectory == true)
        file.writeBytes(ByteArray(size) { 0x63 })
      }
      val after = CopperRuntimeInstaller.status(context)

      assertEquals(19L, statusBytes(after, "runtimePayloadBytes") - statusBytes(before, "runtimePayloadBytes"))
      assertEquals(23L, statusBytes(after, "aptArchiveBytes") - statusBytes(before, "aptArchiveBytes"))
      assertEquals(29L, statusBytes(after, "aptListsBytes") - statusBytes(before, "aptListsBytes"))
      assertEquals(31L, statusBytes(after, "runtimeTemporaryBytes") - statusBytes(before, "runtimeTemporaryBytes"))
      assertEquals(37L, statusBytes(after, "shellHomeBytes") - statusBytes(before, "shellHomeBytes"))
      assertEquals(41L, statusBytes(after, "installerMetadataBytes") - statusBytes(before, "installerMetadataBytes"))
      assertEquals(90L, statusBytes(after, "repairStagingBytes") - statusBytes(before, "repairStagingBytes"))
      assertEquals(
        270L,
        statusBytes(after, "persistentBytes") - statusBytes(before, "persistentBytes")
      )
    } finally {
      added.map { it.first }.forEach { it.delete() }
    }
  }

  private fun statusBytes(status: Map<String, Any?>, key: String): Long =
    status[key] as? Long ?: throw AssertionError("Runtime status $key was not a Long: ${status[key]}")

  @Test(timeout = 15_000)
  fun createsInteractivePtyAndReturnsChildExit() {
    val context = InstrumentationRegistry.getInstrumentation().targetContext
    val cwd = context.cacheDir.apply { mkdirs() }
    val process = CopperPtyNative.nativeCreate(
      "/system/bin/sh",
      cwd.absolutePath,
      arrayOf("/system/bin/sh", "-c", "read value; printf 'copper-pty-reply:%s\\n' \"\$value\"; exit 23"),
      arrayOf(
        "HOME=${cwd.absolutePath}",
        "PATH=/system/bin:/system/xbin",
        "TERM=xterm-256color",
        "TMPDIR=${cwd.absolutePath}"
      ),
      rows = 24,
      columns = 80
    )

    assertEquals("Native PTY must return a descriptor and child PID.", 2, process.size)
    assertTrue("Native PTY descriptor must be non-negative.", process[0] >= 0)
    assertTrue("Native PTY child PID must be positive.", process[1] > 0)

    val descriptor = process[0]
    try {
      CopperPtyNative.nativeResize(descriptor, 32, 120)
      val input = "copper-pty-input\n".toByteArray(StandardCharsets.UTF_8)
      assertEquals(input.size, CopperPtyNative.nativeWrite(descriptor, input))

      val output = ByteArrayOutputStream()
      val buffer = ByteArray(4 * 1024)
      while (true) {
        val count = CopperPtyNative.nativeRead(descriptor, buffer)
        if (count <= 0) break
        output.write(buffer, 0, count)
      }

      val terminalOutput = output.toString(StandardCharsets.UTF_8.name())
      assertTrue("PTY output was: $terminalOutput", terminalOutput.contains("copper-pty-reply:copper-pty-input"))
      assertEquals(23, CopperPtyNative.nativeWait(process[1]))
    } finally {
      CopperPtyNative.nativeClose(descriptor)
    }
  }
}
