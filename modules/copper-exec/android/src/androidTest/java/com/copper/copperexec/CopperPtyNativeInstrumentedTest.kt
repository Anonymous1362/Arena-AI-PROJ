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
