import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  requestRecordingPermissionsAsync,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
} from 'expo-audio';
import {
  isTranscriptionConfigured,
  transcribeAudio,
  TranscriptionError,
  TRANSCRIPTION_MESSAGES,
} from '../services/speechToText';

export interface VoiceInput {
  recording: boolean;
  transcribing: boolean;
  error: string | null;
  /** Ketuk untuk mulai merekam; ketuk lagi untuk berhenti lalu menyalin jadi teks. */
  toggle: () => Promise<void>;
}

/**
 * Rekaman suara → teks (9router) untuk panel chat. Bukan fitur RAG; hanya cara
 * mengisi kotak pesan. `onTranscript` menerima teks hasil salinan.
 *
 * Dipisah dari panel chat supaya urusan perekam (izin, mode audio, berhenti saat
 * panel ditutup) hidup di satu tempat.
 */
export function useVoiceInput(onTranscript: (text: string) => void): VoiceInput {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  // Status rekam disimpan sebagai state sendiri: `recorder.isRecording` adalah getter
  // native yang tidak memicu render ulang, jadi ikon tombol bisa tertinggal.
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTranscriptRef = useRef(onTranscript);
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  // Panel ditutup (pindah layar) saat menyalin: hasilnya tidak boleh lagi dikirim.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Panel ditutup saat masih merekam → hentikan mikrofon. Layout effect: pembersihnya
  // jalan SEBELUM useAudioRecorder melepas objek perekamnya (itu efek biasa).
  useLayoutEffect(
    () => () => {
      try {
        if (recordingRef.current) recorder.stop().catch(() => {});
      } catch {
        // Perekam sudah dilepas — tidak ada yang perlu dihentikan.
      }
    },
    [recorder],
  );

  const toggle = async () => {
    if (transcribing) return;
    setError(null);

    if (recordingRef.current) {
      recordingRef.current = false;
      setRecording(false);
      setTranscribing(true);
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) throw new TranscriptionError(TRANSCRIPTION_MESSAGES.emptyAudio);
        const text = await transcribeAudio({ uri, language: 'id' });
        if (mounted.current) onTranscriptRef.current(text);
      } catch (err) {
        if (mounted.current) {
          setError(err instanceof TranscriptionError ? err.message : TRANSCRIPTION_MESSAGES.failed);
        }
      } finally {
        if (mounted.current) setTranscribing(false);
      }
      return;
    }

    if (!isTranscriptionConfigured()) {
      setError(TRANSCRIPTION_MESSAGES.missingConfig);
      return;
    }

    try {
      // Izin mikrofon diminta saat tombol ditekan, bukan saat panel dibuat — supaya
      // pengguna melihat konteksnya. Tanpa ini recorder.prepareToRecordAsync() gagal
      // senyap di perangkat yang belum pernah memberi izin.
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('Izin mikrofon ditolak. Aktifkan izin mikrofon di pengaturan HP.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = true;
      setRecording(true);
    } catch {
      setError(TRANSCRIPTION_MESSAGES.failed);
    }
  };

  return { recording, transcribing, error, toggle };
}
