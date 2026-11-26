/**
 * Image attachments must outlive the OS cache directory.
 *
 * The document picker copies into `cacheDirectory`, which Android and iOS are
 * free to clear at any time — a chat reopened the next day would show broken
 * images. We copy each pick into `documentDirectory/attachments/` instead, so
 * the image stays as long as the conversation does.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import type { MessageAttachment } from '@/src/store/chats';
import { uid } from '@/src/utils/id';

const DIR = `${FileSystem.documentDirectory ?? ''}attachments/`;

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
};

function extensionFor(name?: string | null, mime?: string | null): string {
  const fromName = name?.match(/\.[A-Za-z0-9]{1,5}$/)?.[0];
  if (fromName) return fromName.toLowerCase();
  return EXT_BY_MIME[(mime ?? '').toLowerCase()] ?? '.jpg';
}

export interface PickedAsset {
  uri: string;
  mimeType?: string | null;
  name?: string | null;
}

/** Copy a picked image into permanent app storage. */
export async function persistImageAsset(asset: PickedAsset): Promise<MessageAttachment> {
  const mime = asset.mimeType ?? 'image/jpeg';
  const name = asset.name ?? `image${extensionFor(null, mime)}`;

  if (Platform.OS === 'web') {
    // Blob/data URLs from the browser picker are already stable for the session.
    return { kind: 'image', uri: asset.uri, mime, name };
  }

  try {
    const dir = await FileSystem.getInfoAsync(DIR);
    if (!dir.exists) await FileSystem.makeDirectoryAsync(DIR, { intermediates: true });
    const target = `${DIR}${uid('img')}${extensionFor(name, mime)}`;
    await FileSystem.copyAsync({ from: asset.uri, to: target });
    return { kind: 'image', uri: target, mime, name };
  } catch {
    // If the copy fails (read-only picker source, quota), keep the picker URI
    // so the message still sends now.
    return { kind: 'image', uri: asset.uri, mime, name };
  }
}

/** Remove stored attachments that no conversation references any more. */
export async function deleteAttachmentFile(uri: string): Promise<void> {
  if (Platform.OS === 'web' || !uri.startsWith(DIR)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* best effort */
  }
}
