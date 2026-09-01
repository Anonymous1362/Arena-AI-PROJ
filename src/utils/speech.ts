/**
 * Read-aloud (TTS) facade — expo-speech, free & offline on-device voices on
 * iOS/Android; falls back to Web Speech on the PWA. Respects the
 * auto-read-aloud setting; stop() always works.
 */
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

let lastHash = '';

/** Strip markdown noise so the voice reads clean prose. */
function speakable(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|]/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3500);
}

export function isSpeaking(): boolean {
  return Speech.isSpeakingAsync().catch(() => false) as unknown as boolean;
}

export async function speakAloud(text: string, hash?: string): Promise<void> {
  stopSpeaking();
  const clean = speakable(text);
  if (!clean) return;
  lastHash = hash ?? '';
  if (Platform.OS === 'web') {
    const synth = (window as any).speechSynthesis;
    if (!synth) return;
    const u = new SpeechSynthesisUtterance(clean);
    u.rate = 1.0;
    synth.speak(u);
    return;
  }
  Speech.speak(clean, { rate: 1.0, pitch: 1.0 });
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web') {
    (window as any).speechSynthesis?.cancel?.();
    return;
  }
  Speech.stop().catch(() => {});
}

export function shouldAutoRead(text: string, hash: string | undefined, done: boolean): boolean {
  return done && !!hash && hash !== lastHash;
}
