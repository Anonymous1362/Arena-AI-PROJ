/**
 * Read-aloud (TTS) facade — expo-speech on native and Web Speech on PWA.
 * Voice quality is supplied by the device, so Copper exposes the installed
 * voices instead of pretending a network/API model can improve them.
 */
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export interface ReadAloudVoice {
  id: string;
  label: string;
  language: string;
  enhanced: boolean;
}

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

/** List voices installed on this device, with English voices first for Copper's UI. */
export async function getReadAloudVoices(): Promise<ReadAloudVoice[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices
      .map((voice) => ({
        id: voice.identifier,
        label: voice.name || voice.identifier,
        language: voice.language || 'und',
        enhanced: voice.quality === Speech.VoiceQuality.Enhanced,
      }))
      .sort((a, b) => {
        const aEnglish = a.language.toLowerCase().startsWith('en') ? 0 : 1;
        const bEnglish = b.language.toLowerCase().startsWith('en') ? 0 : 1;
        return aEnglish - bEnglish || Number(b.enhanced) - Number(a.enhanced) || a.label.localeCompare(b.label);
      });
  } catch {
    return [];
  }
}

export async function speakAloud(text: string, _messageId?: string, voice?: string): Promise<void> {
  stopSpeaking();
  const clean = speakable(text);
  if (!clean) return;
  if (Platform.OS === 'web') {
    const synth = (window as any).speechSynthesis;
    if (!synth) return;
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.04;
    synth.speak(utterance);
    return;
  }
  // Do not wait to discover voices at playback time: that made the first
  // read-aloud action feel delayed. A selected installed voice is used
  // immediately; Android falls back to its system voice if it was removed.
  Speech.speak(clean, { rate: 1.04, pitch: 1.0, voice: voice || undefined });
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web') {
    (window as any).speechSynthesis?.cancel?.();
    return;
  }
  Speech.stop().catch(() => {});
}
