import EventSource from 'react-native-sse';
import { KROOMBOX_BASE_URL, KROOMBOX_CHAT_ENDPOINT } from '../lib/kroomboxConfig';
import type { KroomboxChatMessage, KroomboxStreamChunk } from '../types';

export interface StreamHandlers {
  onToken: (text: string) => void; // streamed content delta
  onReasoningToken: (text: string) => void; // streamed reasoning delta (Proses Meracik Resep)
  onDone: (finishReason?: string) => void;
  onError: (err: Error) => void;
}

export interface StreamRequest {
  messages: KroomboxChatMessage[];
  stream?: boolean;
  use_rag?: boolean;
}

/**
 * Streams the RAG answer from Kroombox POST /api/chat over Server-Sent Events.
 *
 * react-native-sse exposes EventSource with a POST body via the `body` option,
 * which keeps the code identical on Android + iOS and gives us ready-made
 * reconnect/error handling. See PRD §5.4.
 */
export function streamKroomboxChat(req: StreamRequest, handlers: StreamHandlers) {
  const url = `${KROOMBOX_BASE_URL}${KROOMBOX_CHAT_ENDPOINT}`;
  const es = new EventSource(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: req.messages,
      stream: req.stream ?? true,
      use_rag: req.use_rag ?? true,
    }),
    pollingInterval: 0,
  });

  es.addEventListener('message', (event) => {
    if (!event.data) return;
    let chunk: KroomboxStreamChunk;
    try {
      chunk = JSON.parse(event.data);
    } catch {
      return; // ignore keep-alive or non-JSON noise
    }

    if (chunk.error) {
      handlers.onError(new Error(chunk.error));
      es.close();
      return;
    }

    const choice = chunk.choices?.[0];
    const delta = choice?.delta ?? chunk.message ?? {};

    if (delta.reasoning_content) {
      handlers.onReasoningToken(delta.reasoning_content);
    }
    if (delta.content) {
      handlers.onToken(delta.content);
    }
    if (
      chunk.done === true ||
      choice?.finish_reason === 'stop' ||
      choice?.finish_reason === 'end_turn'
    ) {
      handlers.onDone(choice?.finish_reason ?? undefined);
      es.close();
    }
  });

  es.addEventListener('error', (event) => {
    // react-native-sse error events are not typed with a message in all
    // builds; derive a readable reason from the event type when present.
    const reason =
      'message' in event && typeof (event as { message?: unknown }).message === 'string'
        ? ((event as { message: string }).message as string)
        : event.type === 'timeout'
          ? 'Timeout menunggu respons Kroombox.'
          : 'Koneksi ke Kroombox terputus.';
    // Keep partial text (PRD QA scenario 1) + surface the error state.
    handlers.onError(new Error(reason));
    es.close();
  });

  es.addEventListener('open', () => {
    // Connection established — no-op, ready to receive deltas.
  });

  return es;
}

/** Convenience error classifier used by the chat store. */
export class KroomboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KroomboxError';
  }
}
