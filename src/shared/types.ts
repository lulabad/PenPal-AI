// ── Shared types for IPC between main ↔ renderer ──

export interface Correction {
  original: string;
  corrected: string;
  explanation: string;
}

export interface TutorResponse {
  correctedText: string;
  corrections: Correction[];
  encouragement: string;
  nextQuestion: string;
}

export interface ConversationTurn {
  id: string;
  role: "assistant" | "user";
  content: string;
  tutorResponse?: TutorResponse;
  timestamp: number;
}

export interface ConversationSession {
  id: string;
  topic: string;
  explanationLanguage: string;
  turns: ConversationTurn[];
  createdAt: number;
  updatedAt: number;
}

export interface StartSessionRequest {
  topic: string;
  explanationLanguage: string;
}

export interface SendMessageRequest {
  sessionId: string;
  message: string;
}

export interface StreamChunk {
  sessionId: string;
  delta: string;
}

export interface SessionResult {
  sessionId: string;
  turn: ConversationTurn;
}

export interface UserPreferences {
  explanationLanguage: string;
  recentTopics: string[];
  theme: "light" | "dark";
}

export const TOPICS = [
  "Daily Life",
  "Travel & Culture",
  "Technology",
  "Food & Cooking",
  "Nature & Environment",
  "Work & Career",
  "Hobbies & Leisure",
  "Health & Fitness",
  "Movies & Books",
  "Random",
] as const;

export type Topic = (typeof TOPICS)[number];
