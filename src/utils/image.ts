import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

/** Convert an image URI (file:// on native, blob/http/data on web) to a data URL. */
export async function imageToDataUrl(uri: string, mime = 'image/jpeg'): Promise<string> {
  if (uri.startsWith('data:')) return uri;
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Failed to read image.'));
      reader.readAsDataURL(blob);
    });
  }
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  return `data:${mime};base64,${b64}`;
}

/** Rough JPEG/PNG downscale is out of scope; we just cap by file size here. */
export async function imageDataUrlForApi(uri: string, mime?: string, maxBytes = 4 * 1024 * 1024): Promise<string> {
  const dataUrl = await imageToDataUrl(uri, mime);
  const approxBytes = Math.ceil(((dataUrl.length - dataUrl.indexOf(',')) * 3) / 4);
  if (approxBytes > maxBytes) {
    throw new Error(`Image too large (${(approxBytes / 1024 / 1024).toFixed(1)} MB). Pick one under ${maxBytes / 1024 / 1024} MB.`);
  }
  return dataUrl;
}
