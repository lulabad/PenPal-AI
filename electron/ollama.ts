import { Ollama } from "ollama";
import type { Message } from "ollama";
import type { TutorResponse, StreamChunk, UserPreferences, ConversationSession } from "../src/shared/types";
import { buildSystemPrompt } from "./prompts";

const DEFAULT_MODEL = "qwen3:latest";
const DEFAULT_ENDPOINT = "http://localhost:11434";

let ollamaClient: Ollama | null = null;

const activeSessions = new Map<string, { messages: Message[] }>();

function getClient(endpoint: string): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: endpoint });
  }
  return ollamaClient;
}

export async function startOllamaSession(
  sessionId: string,
  topic: string,
  explanationLanguage: string,
  onStream?: (chunk: StreamChunk) => void,
  prefs?: Pick<UserPreferences, "ollamaModel" | "ollamaEndpoint">
): Promise<TutorResponse> {
  const model = prefs?.ollamaModel ?? DEFAULT_MODEL;
  const endpoint = prefs?.ollamaEndpoint ?? DEFAULT_ENDPOINT;
  const client = getClient(endpoint);

  const systemPrompt = buildSystemPrompt(topic, explanationLanguage);

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "Start the session. Ask me your first question." },
  ];

  let accumulated = "";
  const stream = await client.chat({ model, messages, stream: true });
  for await (const chunk of stream) {
    const delta = chunk.message.content;
    accumulated += delta;
    onStream?.({ sessionId, delta });
  }

  messages.push({ role: "assistant", content: accumulated });
  activeSessions.set(sessionId, { messages });

  return parseTutorResponse(accumulated);
}

export async function sendMessage(
  sessionId: string,
  message: string,
  onStream?: (chunk: StreamChunk) => void,
  prefs?: Pick<UserPreferences, "ollamaModel" | "ollamaEndpoint">
): Promise<TutorResponse> {
  const entry = activeSessions.get(sessionId);
  if (!entry) {
    throw new Error(`No active session: ${sessionId}`);
  }

  const model = prefs?.ollamaModel ?? DEFAULT_MODEL;
  const endpoint = prefs?.ollamaEndpoint ?? DEFAULT_ENDPOINT;
  const client = getClient(endpoint);

  entry.messages.push({ role: "user", content: message });

  let accumulated = "";
  const stream = await client.chat({
    model,
    messages: entry.messages,
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.message.content;
    accumulated += delta;
    onStream?.({ sessionId, delta });
  }

  entry.messages.push({ role: "assistant", content: accumulated });

  return parseTutorResponse(accumulated, message);
}

export function resumeSession(session: ConversationSession): void {
  if (activeSessions.has(session.id)) return; // already live

  const systemPrompt = buildSystemPrompt(session.topic, session.explanationLanguage);
  const messages: Message[] = [{ role: "system", content: systemPrompt }];

  for (const turn of session.turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.content });
    } else {
      // Reconstruct the structured response so the model has proper context
      const content = turn.tutorResponse
        ? [
            `[CORRECTED_TEXT]\n${turn.tutorResponse.correctedText}\n[/CORRECTED_TEXT]`,
            `[CORRECTIONS]\n${turn.tutorResponse.corrections
              .map(
                (c) =>
                  `Original: ${c.original}\nCorrected: ${c.corrected}\nExplanation: ${c.explanation}`
              )
              .join("\n\n")}\n[/CORRECTIONS]`,
            `[ENCOURAGEMENT]\n${turn.tutorResponse.encouragement}\n[/ENCOURAGEMENT]`,
            `[NEXT_QUESTION]\n${turn.tutorResponse.nextQuestion}\n[/NEXT_QUESTION]`,
          ].join("\n\n")
        : turn.content;
      messages.push({ role: "assistant", content });
    }
  }

  activeSessions.set(session.id, { messages });
}

export async function endSession(sessionId: string): Promise<void> {
  activeSessions.delete(sessionId);
}

export async function shutdownOllama(): Promise<void> {
  activeSessions.clear();
  ollamaClient = null;
}

function parseTutorResponse(raw: string, userMessage?: string): TutorResponse {
  // Strip <think>…</think> blocks emitted by reasoning models (e.g. deepseek-r1)
  const content = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const correctedText = sanitizeCorrectedText(extractSection(content, "CORRECTED_TEXT"));
  const encouragement = extractSection(content, "ENCOURAGEMENT");
  const nextQuestion = extractSection(content, "NEXT_QUESTION");
  const correctionsRaw = extractSection(content, "CORRECTIONS");

  if (nextQuestion) {
    return {
      correctedText,
      corrections: filterSpuriousCorrections(parseCorrections(correctionsRaw), userMessage),
      encouragement,
      nextQuestion,
    };
  }

  // Fallback: try JSON parsing for backward compatibility
  const json = tryParseJson(content);
  if (json) {
    return {
      correctedText: sanitizeCorrectedText(json.correctedText ?? ""),
      corrections: filterSpuriousCorrections(
        Array.isArray(json.corrections) ? json.corrections : [],
        userMessage
      ),
      encouragement: json.encouragement ?? "",
      nextQuestion: json.nextQuestion ?? "",
    };
  }

  console.warn("[PenPal] Could not parse tutor response, using fallback.");
  return {
    correctedText: "",
    corrections: [],
    encouragement: "",
    nextQuestion: content,
  };
}

function extractSection(text: string, name: string): string {
  // Try exact match with closing tag
  const closedMatch = text.match(
    new RegExp(`\\[${name}\\]\\s*([\\s\\S]*?)\\s*\\[/${name}\\]`, "i")
  );
  if (closedMatch) return closedMatch[1].trim();

  // Fallback: opening tag present but closing tag omitted (common at end of response)
  const openMatch = text.match(
    new RegExp(`\\[${name}\\]\\s*([\\s\\S]+)$`, "i")
  );
  return openMatch ? openMatch[1].trim() : "";
}

function parseCorrections(
  raw: string
): { original: string; corrected: string; explanation: string }[] {
  if (!raw) return [];

  const blocks = raw.split(/\n\s*\n/).filter((b) => b.trim());
  const corrections: { original: string; corrected: string; explanation: string }[] = [];

  for (const block of blocks) {
    const original = block.match(/Original:\s*(.+)/i)?.[1]?.trim() ?? "";
    const corrected = block.match(/Corrected:\s*(.+)/i)?.[1]?.trim() ?? "";
    const explanation = block.match(/Explanation:\s*([\s\S]+)/i)?.[1]?.trim() ?? "";
    if (original || corrected) {
      corrections.push({ original, corrected, explanation });
    }
  }

  return corrections;
}

function filterSpuriousCorrections(
  corrections: { original: string; corrected: string; explanation: string }[],
  userMessage?: string
): { original: string; corrected: string; explanation: string }[] {
  return corrections.filter((c) => {
    const orig = c.original.trim();
    const corr = c.corrected.trim();

    // Drop no-op corrections
    if (orig === corr) return false;

    // Drop corrections whose only change is appending terminal punctuation that
    // the user's original message already contained at the same position.
    const terminalPunct = /[.!?]$/;
    const corrAddsOnlyPunct =
      terminalPunct.test(corr) &&
      !terminalPunct.test(orig) &&
      corr.slice(0, -1) === orig;

    if (corrAddsOnlyPunct && userMessage) {
      const addedPunct = corr.slice(-1);
      if (userMessage.includes(orig + addedPunct)) return false;
    }

    return true;
  });
}

function sanitizeCorrectedText(text: string): string {
  // Collapse doubled (or more) terminal punctuation produced by the model
  // blindly appending a period to text that already ended with one.
  return text.replace(/([.!?])\1+/g, "$1");
}

function tryParseJson(text: string): Record<string, any> | null {
  try {
    let cleaned = text;
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
    }
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object") return obj;
    return null;
  } catch {
    return null;
  }
}

