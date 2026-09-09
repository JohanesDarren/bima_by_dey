import { useCallback } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import { useProfileStore } from '../store/profileStore';

/**
 * Thin wrapper around the chat store that glues together the auth session,
 * the current profile, and the streaming send action.
 */
export function useChat() {
  const userId = useAuthStore((s) => s.user?.id);
  const isGuest = useAuthStore((s) => s.isGuest);
  const profile = useProfileStore((s) => s.profile);

  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamStatus = useChatStore((s) => s.streamStatus);
  const streamError = useChatStore((s) => s.streamError);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadSessions = useChatStore((s) => s.loadSessions);
  const loadSessionMessages = useChatStore((s) => s.loadSessionMessages);
  const createNewSession = useChatStore((s) => s.createNewSession);
  const clearStreamError = useChatStore((s) => s.clearStreamError);
  const abortStream = useChatStore((s) => s.abortStream);

  const send = useCallback(
    (query: string) => sendMessage(query, profile, userId ?? null, isGuest),
    [sendMessage, profile, userId, isGuest],
  );

  return {
    messages,
    isStreaming,
    streamStatus,
    streamError,
    send,
    loadSessions,
    loadSessionMessages,
    createNewSession,
    clearStreamError,
    abortStream,
  };
}
