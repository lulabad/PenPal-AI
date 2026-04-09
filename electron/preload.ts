import { contextBridge, ipcRenderer } from "electron";
import type {
  StartSessionRequest,
  SendMessageRequest,
  ConversationSession,
  UserPreferences,
  StreamChunk,
  TutorResponse,
} from "../src/shared/types";

export interface PenPalAPI {
  startSession: (req: StartSessionRequest) => Promise<{
    sessionId: string;
    firstResponse: TutorResponse;
  }>;
  sendMessage: (req: SendMessageRequest) => Promise<TutorResponse>;
  endSession: (sessionId: string) => Promise<void>;
  getSessions: () => Promise<ConversationSession[]>;
  deleteSession: (sessionId: string) => Promise<void>;
  getPreferences: () => Promise<UserPreferences>;
  savePreferences: (prefs: UserPreferences) => Promise<void>;
  onStream: (callback: (chunk: StreamChunk) => void) => () => void;
}

const api: PenPalAPI = {
  startSession: (req) => ipcRenderer.invoke("copilot:start-session", req),
  sendMessage: (req) => ipcRenderer.invoke("copilot:send-message", req),
  endSession: (id) => ipcRenderer.invoke("copilot:end-session", id),
  getSessions: () => ipcRenderer.invoke("store:get-sessions"),
  deleteSession: (id) => ipcRenderer.invoke("store:delete-session", id),
  getPreferences: () => ipcRenderer.invoke("store:get-preferences"),
  savePreferences: (prefs) =>
    ipcRenderer.invoke("store:save-preferences", prefs),
  onStream: (callback) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      chunk: StreamChunk
    ) => {
      callback(chunk);
    };
    ipcRenderer.on("copilot:stream", handler);
    return () => ipcRenderer.removeListener("copilot:stream", handler);
  },
};

contextBridge.exposeInMainWorld("penpal", api);
