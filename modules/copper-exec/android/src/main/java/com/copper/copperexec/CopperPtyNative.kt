package com.copper.copperexec

/** Minimal JNI surface for persistent Copper Runtime pseudo-terminal sessions. */
internal object CopperPtyNative {
  init {
    System.loadLibrary("copper_pty")
  }

  /** Returns [masterPtyFileDescriptor, childProcessId]. */
  external fun nativeCreate(
    executable: String,
    workingDirectory: String,
    arguments: Array<String>,
    environment: Array<String>,
    rows: Int,
    columns: Int
  ): IntArray

  /** Reads terminal bytes into [destination]; -1 is terminal EOF. */
  external fun nativeRead(descriptor: Int, destination: ByteArray): Int
  external fun nativeWrite(descriptor: Int, source: ByteArray): Int
  external fun nativeResize(descriptor: Int, rows: Int, columns: Int)
  external fun nativeWait(pid: Int): Int
  external fun nativeSignal(pid: Int, signalNumber: Int)
  external fun nativeClose(descriptor: Int)
}
