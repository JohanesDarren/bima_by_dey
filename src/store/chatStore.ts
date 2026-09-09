import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { streamKroomboxChat } from '../services/kroombox';
import { buildChatMessages, buildSessionTitle } from '../utils/promptBuilder';
import type { ChatMessage, Profile } from '../types';

type StreamStatus = 'idle' | 'streaming' | 'done' | 'error';

interface ChatState {
  messages: ChatMessage[];
  currentSessionId: string | null;
  streamStatus: StreamStatus;
  isStreaming: boolean;
  streamError: string | null;
  activeStream: { close: () => void } | null;

  sendMessage: (
    query: string,
    profile: Profile | null,
    userId: string | null,
    isGuest: boolean,
  ) => Promise<void>;
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
      'Halo! 👋 Saya asisten **Dapur Sorgum Ceria**. Ceritakan bahan yang kamu punya, misalnya "Saya punya ayam, selada, dan sorgum", nanti saya racikkan resep sehatnya!',
    reasoning_content: null,
  };
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [welcomeMessage()],
  currentSessionId: null,
  streamStatus: 'idle',
  isStreaming: false,
  streamError: null,
  activeStream: null,

  sendMessage: async (query, profile, userId, isGuest) => {
    if (get().isStreaming) return;
    const trimmed = query.trim();
    if (!trimmed) return;

    // If we've already sent something, keep history; else start with greeting.
    const hasPriorUserMessage = get().messages.some((m) => m.role === 'user');
    const base = hasPriorUserMessage ? [] : [welcomeMessage()];
    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      reasoning_content: null,
    };
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      reasoning_content: null,
    };
    const messages = [...base, userMsg, assistantMsg];
    set({ messages, isStreaming: true, streamStatus: 'streaming', streamError: null });

    // Build payload with profile injection (PRD F-03).
    const payloadMsgs = profile
      ? buildChatMessages(profile, trimmed)
      : [{ role: 'user' as const, content: trimmed }];

    // Session creation (auth only; guests skip DB entirely).
    let sessionId = get().currentSessionId;
    if (!sessionId && !isGuest && userId) {
      const title = buildSessionTitle(trimmed);
      const { data } = await supabase
        .from('chat_sessions')
        .insert({ user_id: userId, title })
        .select('id')
        .single();
      sessionId = data?.id ?? null;
      set({ currentSessionId: sessionId });
    }

    const stream = streamKroomboxChat(
      { messages: payloadMsgs, stream: true, use_rag: true },
      {
        onToken: (delta) => {
          const { messages: cur } = get();
          const last = cur[cur.length - 1];
          if (last?.role === 'assistant') {
            const updated = [...cur.slice(0, -1), { ...last, content: last.content + delta }];
            set({ messages: updated });
          }
        },
        onReasoningToken: (delta) => {
          const { messages: cur } = get();
          const last = cur[cur.length - 1];
          if (last?.role === 'assistant') {
            const updated = [
              ...cur.slice(0, -1),
              { ...last, reasoning_content: (last.reasoning_content ?? '') + delta },
            ];
            set({ messages: updated });
          }
        },
        onDone: async () => {
          const cur = get().messages;
          if (!isGuest && userId && sessionId) {
            await persistMessages(userId, sessionId, cur);
          }
          set({ isStreaming: false, streamStatus: 'done', activeStream: null });
        },
        onError: (err) => {
          // Keep partial text (PRD QA scenario 1) + surface error state.
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
