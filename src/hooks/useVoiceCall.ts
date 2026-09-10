import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { chatKroombox } from '../services/kroombox';
import type { Segment } from '../types';

export type VoiceCallState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

export function useVoiceCall(segment: Segment) {
  const [state, setState] = useState<VoiceCallState>('idle');
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // References for cleanup and state tracking inside callbacks
  const sttListenerRefs = useRef<any[]>([]);
  const speechModuleRef = useRef<any>(null);
  const isActiveRef = useRef<boolean>(false);

  const loadModule = async () => {
    if (speechModuleRef.current) return speechModuleRef.current;
    try {
      const mod = await import('expo-speech-recognition');
      speechModuleRef.current = mod.ExpoSpeechRecognitionModule;
      return mod.ExpoSpeechRecognitionModule;
    } catch (e) {
      console.warn('[useVoiceCall] Failed to load speech-recognition module', e);
      return null;
    }
  };

  const cleanupSTT = () => {
    sttListenerRefs.current.forEach((sub) => {
      if (typeof sub.remove === 'function') sub.remove();
    });
    sttListenerRefs.current = [];
  };

  const stopCall = useCallback(async () => {
    isActiveRef.current = false;
    setState('idle');
    Speech.stop(); // Stop TTS
    
    const mod = speechModuleRef.current;
    if (mod) {
      try {
        mod.stop();
      } catch (e) {}
    }
    cleanupSTT();
  }, []);

  const startListening = useCallback(async () => {
    if (!isActiveRef.current) return;
    
    cleanupSTT();
    const mod = await loadModule();
    if (!mod) {
      setErrorMsg('Modul suara tidak tersedia');
      setState('error');
      return;
    }

    try {
      const perm = await mod.requestPermissionsAsync();
      if (!perm.granted) {
        setErrorMsg('Izin mikrofon ditolak');
        setState('error');
        return;
      }

      setTranscript('');
      setState('listening');

      // Register listeners safely
      const subResult = mod.addListener('result', async (e: any) => {
        if (!isActiveRef.current) return;
        const text = e.results?.[0]?.transcript ?? '';
        setTranscript(text);
        
        if (e.isFinal) {
          mod.stop();
          if (text.trim().length > 0) {
            processUtterance(text);
          } else {
            // Restart if empty final result
            setTimeout(() => {
              if (isActiveRef.current) {
                startListening();
              }
            }, 500);
          }
        }
      });

      const subError = mod.addListener('error', (e: any) => {
        if (!isActiveRef.current) return;
        if (e.error !== 'aborted') {
          if (e.error === 'speech-timeout' || e.error === 'no-speech') {
            // Restart listening gracefully if timeout
            setTimeout(() => {
              if (isActiveRef.current) {
                startListening(); // Re-initialize completely
              }
            }, 500);
          } else {
            console.warn('[useVoiceCall] STT Error:', e.error);
            setErrorMsg(`Kesalahan pendengaran: ${e.error}`);
            setState('error');
          }
        }
      });
      
      const subEnd = mod.addListener('end', () => {
        // Fallback: If it ended unexpectedly while we still thought it was listening
        if (isActiveRef.current) {
          setState((curr) => {
            if (curr === 'listening') {
              setTimeout(() => {
                if (isActiveRef.current) startListening();
              }, 500);
            }
            return curr;
          });
        }
      });

      sttListenerRefs.current = [subResult, subError, subEnd];
      mod.start({ lang: 'id-ID', interimResults: true, continuous: false });
    } catch (e: any) {
      console.warn('[useVoiceCall] start failed:', e);
      setErrorMsg(e.message || 'Gagal memulai mikrofon');
      setState('error');
    }
  }, []);

  const processUtterance = async (text: string) => {
    if (!isActiveRef.current) return;
    setState('thinking');
    setAiResponse('');
    
    try {
      const response = await chatKroombox({
        message: `Konteks Segment: ${JSON.stringify(segment)}. Pengguna berkata: "${text}". Jawablah dengan singkat, ramah, dan ringkas layaknya obrolan telepon (Voice Call). Jangan gunakan list, bullet point, atau format markdown. Maksimal 3 kalimat.`,
        useRag: true,
        stream: false,
      });
      
      if (!isActiveRef.current) return;
      
      setAiResponse(response);
      setState('speaking');
      
      Speech.speak(response, {
        language: 'id-ID',
        rate: 1.0,
        pitch: 1.05,
        onDone: () => {
          if (isActiveRef.current) {
            startListening();
          }
        },
        onError: (e) => {
          console.warn('[useVoiceCall] TTS Error', e);
          if (isActiveRef.current) {
            startListening();
          }
        }
      });
      
    } catch (e: any) {
      console.warn('[useVoiceCall] AI Error:', e);
      if (!isActiveRef.current) return;
      
      setState('speaking');
      Speech.speak('Maaf, saya sedang kesulitan mengingat resep. Bisa diulangi?', {
        language: 'id-ID',
        onDone: () => {
          if (isActiveRef.current) {
            startListening();
          }
        }
      });
    }
  };

  const startCall = useCallback(async () => {
    isActiveRef.current = true;
    await startListening();
  }, [startListening]);

  useEffect(() => {
    return () => {
      // Unmount cleanup
      isActiveRef.current = false;
      Speech.stop();
      cleanupSTT();
      const mod = speechModuleRef.current;
      if (mod) {
        try { mod.abort(); } catch {}
      }
    };
  }, []);

  return {
    state,
    transcript,
    aiResponse,
    errorMsg,
    startCall,
    stopCall,
  };
}

