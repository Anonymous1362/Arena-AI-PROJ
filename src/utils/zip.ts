/**
 * Minimal ZIP writer — STORE method, zero dependencies.
 *
 * Why hand-rolled: the obvious library (fflate) is small, but every dependency
 * in a phone app is a supply-chain and bundle-size decision, and ZIP's *store*
 * format is ~120 lines of well-specified binary layout. The result opens in
 * ZArchiver, Files, Finder, Windows Explorer — anything.
 *
 * Trade, stated plainly: entries are stored uncompressed. For source code that
 * means bigger archives than deflate would give; for the app it means no
 * native/wasm inflater, instant packing, and honest behaviour on a 60 fps
 * device. (Compression is a later optimisation, not a correctness one.)
 */

/* --------------------------------- crc32 ---------------------------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* -------------------------------- encoding -------------------------------- */

export function utf8Bytes(s: string): Uint8Array {
  // globalThis.TextEncoder exists on Hermes (and everywhere else we run).
  const TE = (globalThis as { TextEncoder?: new () => { encode: (s: string) => Uint8Array } }).TextEncoder;
  if (TE) return new TE().encode(s);
  // Fallback: manual UTF-8 (ASCII fast path + multibyte).
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return Uint8Array.from(out);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bytesFromBase64(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) - pad);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    out[p++] = (a << 2) | (b >> 4);
    if (c >= 0 && p < out.length) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0 && p < out.length) out[p++] = ((c & 3) << 6) | d;
  }
  return out;
}

export function base64FromBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    s += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)];
    s += i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=';
    s += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return s;
}

/* ---------------------------------- zip ----------------------------------- */

export interface ZipEntry {
  /** Path inside the archive, `/` separated. Directories end with `/`. */
  name: string;
  data: Uint8Array;
  /** Modification time; defaults to now. */
  mtime?: number;
}

function dosDateTime(ms: number): { time: number; date: number } {
  const d = new Date(ms);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const year = Math.max(1980, d.getFullYear());
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

class Writer {
  private chunks: Uint8Array[] = [];
  /** Bytes written so far — read by zipStore to record local-header offsets. */
  len = 0;

  push(b: Uint8Array) {
    this.chunks.push(b);
    this.len += b.length;
  }
  bytes(n: number) {
    this.push(new Uint8Array(n));
  }
  u8(v: number) {
    const b = new Uint8Array(1);
    b[0] = v & 0xff;
    this.push(b);
  }
  u16(v: number) {
    const b = new Uint8Array(2);
    b[0] = v & 0xff;
    b[1] = (v >>> 8) & 0xff;
    this.push(b);
  }
  u32(v: number) {
    const b = new Uint8Array(4);
    for (let i = 0; i < 4; i++) b[i] = (v >>> (i * 8)) & 0xff;
    this.push(b);
  }
  result(): Uint8Array {
    const out = new Uint8Array(this.len);
    let o = 0;
    for (const c of this.chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

/** Packs entries into a valid ZIP (store method). Directories: name ends `/`. */
export function zipStore(entries: ZipEntry[]): Uint8Array {
  const w = new Writer();
  const central: { name: Uint8Array; crc: number; size: number; offset: number; time: number; date: number }[] = [];

  for (const e of entries) {
    const name = utf8Bytes(e.name);
    const crc = e.name.endsWith('/') && e.data.length === 0 ? 0 : crc32(e.data);
    const { time, date } = dosDateTime(e.mtime ?? Date.now());
    const offset = w.len;

    // local file header
    w.u32(0x04034b50);
    w.u16(20); // version needed
    w.u16(0x0800); // UTF-8 names
    w.u16(0); // method: store
    w.u16(time);
    w.u16(date);
    w.u32(crc);
    w.u32(e.data.length);
    w.u32(e.data.length);
    w.u16(name.length);
    w.u16(0);
    w.push(name);
    w.push(e.data);

    central.push({ name, crc, size: e.data.length, offset, time, date });
  }

  const cdStart = w.len;
  for (const c of central) {
    w.u32(0x02014b50);
    w.u16(20); // made by
    w.u16(20); // needed
    w.u16(0x0800);
    w.u16(0);
    w.u16(c.time);
    w.u16(c.date);
    w.u32(c.crc);
    w.u32(c.size);
    w.u32(c.size);
    w.u16(c.name.length);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u16(0);
    w.u32(0);
    w.u32(c.offset);
    w.push(c.name);
  }
  const cdSize = w.len - cdStart;

  // end of central directory
  w.u32(0x06054b50);
  w.u16(0);
  w.u16(0);
  w.u16(central.length);
  w.u16(central.length);
  w.u32(cdSize);
  w.u32(cdStart);
  w.u16(0);

  return w.result();
}
