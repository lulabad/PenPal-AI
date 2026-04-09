import { CopilotClient, approveAll } from "@github/copilot-sdk";
import type { TutorResponse, StreamChunk } from "../src/shared/types";
import { buildSystemPrompt } from "./prompts";
import { existsSync } from "fs";

let client: CopilotClient | null = null;

const activeSessions = new Map<
  string,
  { copilotSession: Awaited<ReturnType<CopilotClient["createSession"]>> }
>();

function findCopilotCli(): string | undefined {
  const candidates = [
    // WinGet install location
    `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Packages\\GitHub.Copilot_Microsoft.Winget.Source_8wekyb3d8bbwe\\copilot.exe`,
    // npm global install
    `${process.env.APPDATA}\\npm\\copilot.cmd`,
  ];
  return candidates.find((p) => existsSync(p));
}

async function getClient(): Promise<CopilotClient> {
  if (!client) {
    const cliPath = findCopilotCli();
    client = new CopilotClient({
      logLevel: "warning",
      ...(cliPath ? { cliPath } : {}),
    });
  }
  return client;
}

export async function startCopilotSession(
  sessionId: string,
  topic: string,
  explanationLanguage: string,
  onStream?: (chunk: StreamChunk) => void
): Promise<TutorResponse> {
  const c = await getClient();

  const systemPrompt = buildSystemPrompt(topic, explanationLanguage);

  const copilotSession = await c.createSession({
    streaming: true,
    onPermissionRequest: approveAll,
    systemMessage: {
      mode: "replace",
      content: systemPrompt,
    },
  });

  activeSessions.set(sessionId, { copilotSession });

  let accumulated = "";

  copilotSession.on("assistant.message_delta", (event) => {
    accumulated += event.data.deltaContent;
    onStream?.({ sessionId, delta: event.data.deltaContent });
  });

  const result = await copilotSession.sendAndWait({
    prompt: "Start the session. Ask me your first question.",
  });

  const content = result?.data?.content ?? accumulated;
  return parseTutorResponse(content);
}

export async function sendMessage(
  sessionId: string,
  message: string,
  onStream?: (chunk: StreamChunk) => void
): Promise<TutorResponse> {
  const entry = activeSessions.get(sessionId);
  if (!entry) {
    throw new Error(`No active session: ${sessionId}`);
  }

  let accumulated = "";

  const unsub = entry.copilotSession.on(
    "assistant.message_delta",
    (event) => {
      accumulated += event.data.deltaContent;
      onStream?.({ sessionId, delta: event.data.deltaContent });
    }
  );

  const result = await entry.copilotSession.sendAndWait({
    prompt: message,
  });

  unsub();

  const content = result?.data?.content ?? accumulated;
  return parseTutorResponse(content);
}

export async function endSession(sessionId: string): Promise<void> {
  const entry = activeSessions.get(sessionId);
  if (entry) {
    await entry.copilotSession.disconnect();
    activeSessions.delete(sessionId);
  }
}

export async function shutdownCopilot(): Promise<void> {
  for (const [id] of activeSessions) {
    await endSession(id);
  }
  if (client) {
    await client.stop();
    client = null;
  }
}

function parseTutorResponse(raw: string): TutorResponse {
  const content = raw.trim();

  // Parse section-based format: [SECTION_NAME]...[/SECTION_NAME]
  const correctedText = extractSection(content, "CORRECTED_TEXT");
  const encouragement = extractSection(content, "ENCOURAGEMENT");
  const nextQuestion = extractSection(content, "NEXT_QUESTION");
  const correctionsRaw = extractSection(content, "CORRECTIONS");

  // If we found at least the NEXT_QUESTION section, treat as valid
  if (nextQuestion) {
    return {
      correctedText,
      corrections: parseCorrections(correctionsRaw),
      encouragement,
      nextQuestion,
    };
  }

  // Fallback: try JSON parsing for backward compatibility
  const json = tryParseJson(content);
  if (json) {
    return {
      correctedText: json.correctedText ?? "",
      corrections: Array.isArray(json.corrections) ? json.corrections : [],
      encouragement: json.encouragement ?? "",
      nextQuestion: json.nextQuestion ?? "",
    };
  }

  // Last resort: treat the whole response as a conversational message
  console.warn("[PenPal] Could not parse tutor response, using fallback.");
  return {
    correctedText: "",
    corrections: [],
    encouragement: "",
    nextQuestion: raw,
  };
}

function extractSection(text: string, name: string): string {
  const regex = new RegExp(
    `\\[${name}\\]\\s*([\\s\\S]*?)\\s*\\[/${name}\\]`,
    "i"
  );
  const match = text.match(regex);
  return match ? match[1].trim() : "";
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
