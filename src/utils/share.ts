import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

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

  const fileUri = `${FileSystem.cacheDirectory ?? ''}${filename}`;
  await FileSystem.writeAsStringAsync(fileUri, json, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Export Copper data',
      UTI: 'public.json',
    });
  }
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
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.[0]) throw new Error('No file selected.');
  const asset = res.assets[0];
  return JSON.parse(
    await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 })
  );
}
