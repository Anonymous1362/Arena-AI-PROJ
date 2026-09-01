/**
 * Voice input (STT) facade.
 * Native: expo-speech-recognition (on-device, free, no cloud).
 * Web/PWA: Web Speech API when the browser exposes it.
 * Everything is feature-detected — UI hides the mic when unsupported.
 */
import { Platform } from 'react-native';

/* eslint-disable @typescript-eslint/no-explicit-any */

let nativeModule: any = null;
try {
  // Native builds resolve this; the web export is a safe stub.
  nativeModule = require('expo-speech-recognition');
} catch {
  nativeModule = null;
}

export interface SttHandle {
  stop: () => void;
}

export function sttSupported(): boolean {
  if (Platform.OS !== 'web') return !!nativeModule?.SpeechRecognition;
  if (typeof window === 'undefined') return false;
  return !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
}

/** Start listening; calls onPartial with interim results, onFinal when done. */
export async function startDictation(callbacks: {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (err: string) => void;
}): Promise<SttHandle | null> {
  if (!sttSupported()) return null;

  if (Platform.OS === 'web') {
    const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      callbacks.onPartial((finalText + ' ' + interim).trim());
    };
    rec.onerror = (e: any) => callbacks.onError(String(e?.error ?? 'microphone error'));
    rec.onend = () => callbacks.onFinal(finalText.trim());
    rec.start();
    return { stop: () => rec.stop() };
  }

  const SpeechRec = nativeModule.SpeechRecognition;
  const perm = await SpeechRec.requestPermissionsAsync?.().catch(() => ({ granted: false }));
  if (!perm?.granted) {
    callbacks.onError('Microphone permission needed.');
    return null;
  }

  let finalText = '';
  let rec: any = null;
  const start = async () => {
    rec = await SpeechRec.start({
      lang: 'en-US',
      interimResults: true,
      maxAlternatives: 1,
      continuous: true,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
      contextStrings: ['Copper'],
    });
  };

  return await new Promise<SttHandle>((resolve) => {
    rec = SpeechRec.createSpeechRecognizer?.({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      onResult: (event: any) => {
        if (event.isFinal) finalText += event.results?.[0]?.transcript ?? '';
        callbacks.onPartial((finalText + ' ' + (event.results?.[0]?.transcript ?? '')).trim());
      },
      onError: (e: any) => callbacks.onError(String(e?.message ?? e ?? 'recognition error')),
      onEnd: async () => {
        callbacks.onFinal(finalText.trim());
      },
    });
    if (rec?.start) {
      rec.start();
      resolve({
        stop: () => {
          try {
            rec.stop();
          } catch {
            /* noop */
          }
        },
      });
    } else {
      // fallback to the promise-style API if factory isn't available
      start()
        .then(() =>
          resolve({
            stop: () => {
              try {
                nativeModule.SpeechRecognition.stop?.();
              } catch {
                /* noop */
              }
            },
          })
        )
        .catch((e: Error) => callbacks.onError(e.message));
    }
  });
}
