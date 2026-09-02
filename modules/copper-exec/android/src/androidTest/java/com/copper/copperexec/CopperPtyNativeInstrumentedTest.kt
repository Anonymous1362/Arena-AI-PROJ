package com.copper.copperexec

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
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
