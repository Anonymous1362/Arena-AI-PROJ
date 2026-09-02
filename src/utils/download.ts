/**
 * Getting a sandbox file onto the user's device.
 *
 * Two routes, chosen by what the device allows:
 *  1. **Direct save** — when "All files access" is granted we copy into
 *     `<internal>/Download/` ourselves and tell the user the exact path. That is
 *     the Termux-style "it just lands in Downloads" behaviour.
 *  2. **Share sheet** — otherwise expo-sharing hands the file to Android's
 *     chooser, where "Save to Downloads" / "Files" / Drive / etc. all work.
 *
 * On web/PWA it becomes a normal browser download.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { absoluteUriFor } from '@/src/agent/fs';
import { managedBasePath, managedAccessGranted } from '@/src/agent/fs';
import { fileNameOf } from '@/src/utils/artifacts';

const MIME: Record<string, string> = {
  zip: 'application/zip', apk: 'application/vnd.android.package-archive', pdf: 'application/pdf',
  md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain', json: 'application/json',
  js: 'text/javascript', ts: 'text/typescript', tsx: 'text/typescript', jsx: 'text/javascript',
  html: 'text/html', css: 'text/css', csv: 'text/csv', log: 'text/plain',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml',
  mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4',
};

export function mimeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return MIME[ext] ?? 'application/octet-stream';
}

export interface DownloadResult {
  how: 'saved' | 'shared' | 'browser';
  /** Where it landed, when we know (direct save). */
  where?: string;
}

/** Save-or-share a jailed file. Zips go straight to the sheet; text opens first. */
export async function downloadAgentFile(rel: string): Promise<DownloadResult> {
  const uri = await absoluteUriFor(rel);
  const name = fileNameOf(rel);

  if (Platform.OS === 'web') {
    const text = await FileSystem.readAsStringAsync(uri).catch(() => null);
    const blob = text != null ? new Blob([text], { type: mimeFor(name) }) : new Blob([], { type: mimeFor(name) });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { how: 'browser' };
  }

  // 1) direct copy into the public Download folder when we're allowed to.
  if (managedAccessGranted()) {
    const base = managedBasePath();
    const deviceRoot = base ? base.split('/Download')[0] : '/storage/emulated/0';
    const dest = `file://${deviceRoot}/Download/${name}`;
    try {
      await FileSystem.copyAsync({ from: uri, to: dest });
      return { how: 'saved', where: `${deviceRoot.replace('file://', '')}/Download/${name}` };
    } catch {
      /* fall through to the share sheet */
    }
  }

  // 2) system share sheet (Files → Save to Downloads, Drive, Bluetooth, …).
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: mimeFor(name), dialogTitle: `Save “${name}”` });
    return { how: 'shared' };
  }
  throw new Error('This device offers no way to save files.');
}
