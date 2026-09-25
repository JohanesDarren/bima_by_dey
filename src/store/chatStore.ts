import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { localStore } from '../lib/storage';
import { streamKroomboxChat } from '../services/kroombox';
import { buildSessionTitle, buildSystemPrompt } from '../utils/promptBuilder';
import type { ChatMessage, Profile } from '../types';

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

/** Ambil riwayat chat guest dari MMKV/localStorage (jika ada). */
function loadGuestHistory(): ChatMessage[] {
  const raw = localStore.getGuestHistory();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    // Riwayat tamu bisa rusak (versi lama / tulisan tangan) — saring dulu supaya
    // pesan cacat tidak jadi balon kosong di layar.
    return Array.isArray(parsed)
      ? parsed.filter(
          (value): value is ChatMessage =>
            Boolean(value) &&
            typeof value === 'object' &&
            ((value as ChatMessage).role === 'user' ||
              (value as ChatMessage).role === 'assistant') &&
            typeof (value as ChatMessage).content === 'string',
        )
      : [];
  } catch {
    return [];
  }
}

/** Simpan riwayat chat guest (pangkas bubble asisten kosong, batasi 100 pesan). */
function saveGuestHistory(messages: ChatMessage[]): void {
  const clean = messages.filter(
    (m) => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0),
  );
  localStore.setGuestHistory(JSON.stringify(clean.slice(-100)));
}

interface ChatState {
  messages: ChatMessage[];
  currentSessionId: string | null;
  streamStatus: StreamStatus;
  isStreaming: boolean;
  streamError: string | null;
  activeStream: { close: () => void } | null;
  lastUserQuery: string;

  hydrateGuestHistory: () => void;
  sendMessage: (
    query: string,
    profile: Profile | null,
    userId: string | null,
    isGuest: boolean,
  ) => Promise<void>;
  retryLast: (profile: Profile | null, userId: string | null, isGuest: boolean) => Promise<void>;
  loadSessions: (userId: string) => Promise<ChatMessage[]>;
  loadSessionMessages: (sessionId: string) => Promise<void>;
  createNewSession: () => void;
  clearStreamError: () => void;
  abortStream: () => void;
  resetChat: () => void;
}

/** Persist a completed message pair to Supabase (skip in guest mode). */
async function persistMessages(userId: string, sessionId: string, msgs: ChatMessage[]) {
  if (!userId) return;
  await supabase.from('chat_messages').insert(
    msgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        session_id: sessionId,
        role: m.role,
        content: m.content,
        reasoning_content: m.reasoning_content,
      })),
  );
}

/** Empty-state seeded greeting. */
function welcomeMessage(): ChatMessage {
  return {
    role: 'assistant',
    content:
      'Halo! 👋 Saya asisten **sorgumcore**. Ceritakan bahan yang kamu punya, misalnya "Saya punya ayam, selada, dan sorgum", nanti saya racikkan resep sehatnya!',
    reasoning_content: null,
  };
}

/** Jalankan stream + kelola state streaming. Dipakai sendMessage & retryLast. */
async function runStream(
  set: (partial: Partial<ChatState>) => void,
  get: () => ChatState,
  query: string,
  profile: Profile | null,
  userId: string | null,
  isGuest: boolean,
) {
  const trimmed = query.trim();
  if (!trimmed || get().isStreaming) return;

  const hasPriorUserMessage = get().messages.some((m) => m.role === 'user');
  const base = hasPriorUserMessage ? [] : [welcomeMessage()];
  const userMsg: ChatMessage = { role: 'user', content: trimmed, reasoning_content: null };
  const assistantMsg: ChatMessage = { role: 'assistant', content: '', reasoning_content: null };
  const messages = [...base, userMsg, assistantMsg];
  set({
    messages,
    isStreaming: true,
    streamStatus: 'streaming',
    streamError: null,
    lastUserQuery: trimmed,
  });

  // Injeksi demografi (PRD F-03) — API BIMA tidak punya field "system",
  // jadi parameter digabung ke pesan user.
  const systemHint = profile ? `${buildSystemPrompt(profile)}\n\n` : '';
  const userPrompt = `${systemHint}${trimmed}`;
  const history = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Penyimpanan tidak boleh menunda jawaban RAG: pembuatan sesi berjalan BERBARENGAN
  // dengan permintaan ke server, bukan di depannya. Dulu `await` di sini menahan
  // jawaban sampai Supabase selesai (dan kalau lambat/gagal, jawaban ikut tertunda).
  const currentSessionId = get().currentSessionId;
  const sessionPromise: Promise<string | null> =
    currentSessionId || isGuest || !userId
      ? Promise.resolve(currentSessionId)
      : Promise.resolve(
          supabase
            .from('chat_sessions')
            .insert({ user_id: userId, title: buildSessionTitle(trimmed) })
            .select('id')
            .single(),
        )
          .then(({ data }) => {
            const id = data?.id ?? null;
            if (id) set({ currentSessionId: id });
            return id;
          })
          .catch(() => null);

  const stream = streamKroomboxChat(
    { message: userPrompt, history, stream: true, useRag: true },
    {
      onToken: (delta) => {
        const { messages: cur } = get();
        const last = cur[cur.length - 1];
        if (last?.role === 'assistant') {
          const updated = [...cur.slice(0, -1), { ...last, content: last.content + delta }];
          set({ messages: updated });
        }
      },
      onDone: async () => {
        const cur = get().messages;
        if (!isGuest && userId) {
          // Penyimpanan dijalankan di belakang: pengguna sudah melihat jawabannya.
          sessionPromise
            .then((sessionId) => (sessionId ? persistMessages(userId, sessionId, cur) : undefined))
            .catch(() => undefined);
        } else if (isGuest) {
          saveGuestHistory(cur);
        }
        set({ isStreaming: false, streamStatus: 'done', activeStream: null });
      },
      onError: (err) => {
        // Pertahankan teks parsial (PRD QA scenario 1) + surface error state.
        set({
          isStreaming: false,
          streamStatus: 'error',
          streamError: err.message,
          activeStream: null,
        });
      },
    },
  );
  set({ activeStream: stream });
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [welcomeMessage()],
  currentSessionId: null,
  streamStatus: 'idle',
  isStreaming: false,
  streamError: null,
  activeStream: null,
  lastUserQuery: '',

  hydrateGuestHistory: () => {
    const history = loadGuestHistory();
    if (history.length > 0) {
      // Jangan tumpuk greeting kalau sudah ada riwayat nyata.
      set({ messages: history, currentSessionId: null });
    }
  },

  sendMessage: (query, profile, userId, isGuest) =>
    runStream(set, get, query, profile, userId, isGuest),

  retryLast: (profile, userId, isGuest) => {
    const query = get().lastUserQuery;
    if (!query) return Promise.resolve();
    // Buang bubble asisten yang gagal/kosong di akhir sebelum kirim ulang.
    const { messages: cur } = get();
    const last = cur[cur.length - 1];
    const pruned =
      last?.role === 'assistant' && last.content.trim().length === 0 ? cur.slice(0, -1) : cur;
    set({ messages: pruned });
    return runStream(set, get, query, profile, userId, isGuest);
  },

  loadSessions: async (userId) => {
    if (!userId) return [];
    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    return (data ?? []) as unknown as ChatMessage[];
  },

  loadSessionMessages: async (sessionId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('role, content, reasoning_content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    const rows = (data ?? []) as ChatMessage[];
    set({ messages: rows.length ? rows : [welcomeMessage()], currentSessionId: sessionId });
  },

  createNewSession: () => {
    get().abortStream();
    if (localStore.isGuestMode()) {
      saveGuestHistory([welcomeMessage()]);
    }
    set({
      messages: [welcomeMessage()],
      currentSessionId: null,
      streamStatus: 'idle',
      streamError: null,
    });
  },

  clearStreamError: () => set({ streamError: null, streamStatus: 'idle' }),
  abortStream: () => {
    get().activeStream?.close();
    set({ activeStream: null, isStreaming: false, streamStatus: 'idle' });
  },

  resetChat: () => {
    get().abortStream();
    set({
      messages: [welcomeMessage()],
      currentSessionId: null,
      streamStatus: 'idle',
      isStreaming: false,
      streamError: null,
      activeStream: null,
    });
  },
}));
