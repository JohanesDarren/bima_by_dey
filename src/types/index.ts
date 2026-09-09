/** Domain types matching the Supabase schema in supabase/migrations/*.sql (snake_case). */

export type AgeGroup = 'Balita' | 'Anak SD' | 'Remaja' | 'Dewasa' | 'Lansia';
export type SpecialCondition = 'Bumil' | 'Busui' | 'ABK' | 'Non-ABK' | 'Umum';

export interface Profile {
  id: string; // = auth.users.id
  full_name: string | null;
  target_age_group: AgeGroup | null;
  special_condition: SpecialCondition | null;
  ai_reasoning_enabled: boolean;
  created_at: string;
  updated_at: string;
}

/** Profile stripped of timestamps, used for editing/saving (camelCase in the form). */
export interface ProfileInput {
  fullName: string;
  targetAgeGroup: AgeGroup | null;
  specialCondition: SpecialCondition | null;
  aiReasoningEnabled: boolean;
}

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: MessageRole;
  content: string;
  reasoning_content: string | null;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created_at: string;
}

/** Payload sent to Kroombox /api/chat (per PRD 5.4). */
export interface KroomboxChatMessage {
  role: MessageRole;
  content: string;
}

export interface KroomboxRequest {
  messages: KroomboxChatMessage[];
  stream: boolean;
  use_rag: boolean;
}

/** Shape of each SSE `data: {...}` chunk emitted by the Kroombox API. */
export interface KroomboxStreamChunk {
  choices?: {
    delta?: { content?: string; reasoning_content?: string };
    finish_reason?: string | null;
  }[];
  message?: { content?: string; reasoning_content?: string };
  done?: boolean;
  error?: string;
}
