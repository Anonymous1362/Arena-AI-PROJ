import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { writeAgentExport } from '@/src/agent/fs';
import { AuroraExec } from '@/modules/aurora-exec';

/** Share either a normal file URI or an Android SAF content URI. */
export async function shareExportedFile(
  fileUri: string,
  options: { mimeType: string; dialogTitle: string; UTI?: string }
): Promise<void> {
  // Expo Sharing's FileProvider only maps primary external storage; it cannot
  // share a file from a removable UUID volume and it rejects SAF content://
  // outright. The native bridge handles both without an internal cache copy.
  if (Platform.OS === 'android' && (fileUri.startsWith('file://') || fileUri.startsWith('content://'))) {
    await AuroraExec.shareUri(fileUri, options.mimeType, options.dialogTitle);
    return;
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, options);
  }
}

/**
 * Export helper: writes JSON and hands it to the platform share sheet
 * (native) or triggers a browser download (web/PWA).
 */
export async function shareJson(filename: string, data: unknown): Promise<void> {
  const json = JSON.stringify(data, null, 2);

  if (Platform.OS === 'web') {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }

  // Android exports use the same external/custom root as the agent rather
  // than an internal cache copy. iOS retains its platform sandbox through fs.
  const fileUri = await writeAgentExport(filename, json);
  await shareExportedFile(fileUri, {
    mimeType: 'application/json',
    dialogTitle: 'Export Copper data',
    UTI: 'public.json',
  });
}

/** Read a JSON file picked by the user (native only; web uses <input type=file>). */
export async function readPickedJson(): Promise<unknown> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return reject(new Error('No file selected.'));
        try {
          const text = await file.text();
          resolve(JSON.parse(text));
        } catch (e) {
          reject(e);
        }
      };
      input.oncancel = () => reject(new Error('No file selected.'));
      input.click();
    });
  }
  const DocumentPicker = await import('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    // Android can read the SAF content URI directly. Avoid creating an
    // internal cache copy when the user imports from an SD/external folder.
    copyToCacheDirectory: Platform.OS !== 'android',
  });
  if (res.canceled || !res.assets?.[0]) throw new Error('No file selected.');
  const asset = res.assets[0];
  return JSON.parse(
    await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 })
  );
}
