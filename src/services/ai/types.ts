/**
 * Bentuk data yang melintasi batas module AI: permintaan stream, penangan
 * peristiwa, dan satu giliran riwayat percakapan.
 *
 * Dipisah dari transport.ts supaya module yang cuma butuh BENTUK data (mis.
 * giliran percakapan) tidak ikut menyeret transport beserta react-native-sse —
 * dan tetap bisa diuji tanpa jaringan.
 */

/** Satu pesan riwayat percakapan (role: user/assistant) untuk kolom `history`. */
export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
}

export interface StreamRequest {
  /** pesan terbaru user */
  message: string;
  /** riwayat chat (role: user/assistant) untuk konteks */
  history?: HistoryEntry[];
  model?: string | null;
  useRag?: boolean;
  /**
   * Batas token keluaran (dipungut dari versi upstream). Berguna sebagai jaring terhadap
   * jawaban yang berlarut-larut: panjang keluaran ≈ lama proses. Nilainya sengaja
   * longgar — dipasang ketat, JSON resep bisa terpotong dan malah minta ulang.
   */
  maxTokens?: number;
}

export interface StreamHandlers {
  /** text chunk dari delta stream */
  onToken: (text: string) => void;
  /** selesai stream */
  onDone: (finishReason?: string) => void;
  /** error jaringan/API */
  onError: (err: Error) => void;
  /** sumber RAG (kalau dikirim event pertama {"sources": [...]}) */
  onSources?: (sources: unknown[]) => void;
}
