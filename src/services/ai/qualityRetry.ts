import { streamKroomboxChat } from './transport';
import { runConversationTurn } from './conversationTurn';
import type { TurnRequest, TurnResult, TurnRunner } from './conversationTurn';
import { answersQuestion, RETRY_ANSWER_INSTRUCTION } from '../../utils/answerQuality';

/**
 * Pembungkus `runTurn` yang mengulang SEKALI bila jawaban tidak menjawab pertanyaan.
 *
 * Kenapa dibungkus di sini, bukan diubah di `ai/conversationTurn`:
 * giliran percakapan di sana milik refactor rekan tim dan punya jatah percobaan
 * (`MAX_ATTEMPTS = 3`) beserta uji yang mengunci hitungannya. Dengan membungkus
 * di lapisan pemanggil, kode giliran tidak tersentuh dan seluruh ujinya tetap
 * sah — sementara pemeriksaan mutu jawaban tetap berjalan.
 *
 * Kenapa hanya SEKALI: percobaan ulang menggandakan waktu tunggu, dan kecepatan
 * menjawab adalah syarat aplikasi ini. Satu percobaan tambahan menutup kasus
 * "model mendeskripsikan hidangan alih-alih menjawab" tanpa membuat pengguna
 * menunggu tiga kali lipat.
 *
 * Kalau jawaban pertama sudah baik, tidak ada permintaan tambahan sama sekali.
 */
export const runTurnWithQualityRetry: TurnRunner = (request, observer) => {
  let closed = false;
  let active: { close: () => void } | null = null;

  const attempt = (req: TurnRequest): Promise<TurnResult> => {
    const running = runConversationTurn(req, streamKroomboxChat, observer);
    active = running;
    return running.result.then((result) => {
      if (closed) return result;
      // Hanya jawaban yang benar-benar terkirim yang dinilai. Kegagalan server
      // sudah punya jalur percobaan ulangnya sendiri di dalam giliran.
      if (result.status !== 'ok') return result;
      if (answersQuestion(req.question, result.text)) return result;

      // Pertanyaan yang sama, dengan penegasan di AKHIR prompt (model cenderung
      // mengikuti instruksi terakhir). Riwayat tidak diubah supaya percakapan
      // tetap bersih.
      const retry: TurnRequest = {
        ...req,
        prompt: `${req.prompt}\n\n${RETRY_ANSWER_INSTRUCTION}`,
      };
      return attempt(retry);
    });
  };

  const result = attempt(request);

  return {
    result,
    close: () => {
      closed = true;
      active?.close();
      active = null;
    },
  };
};
