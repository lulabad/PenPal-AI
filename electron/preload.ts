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
  resumeSession: (sessionId: string) => Promise<void>;
  getSessions: () => Promise<ConversationSession[]>;
  deleteSession: (sessionId: string) => Promise<void>;
  renameSession: (sessionId: string, title: string) => Promise<void>;
  getPreferences: () => Promise<UserPreferences>;
  savePreferences: (prefs: UserPreferences) => Promise<void>;
  onStream: (callback: (chunk: StreamChunk) => void) => () => void;
}

const api: PenPalAPI = {
  startSession: (req) => ipcRenderer.invoke("penpal:start-session", req),
  sendMessage: (req) => ipcRenderer.invoke("penpal:send-message", req),
  endSession: (id) => ipcRenderer.invoke("penpal:end-session", id),
  resumeSession: (id) => ipcRenderer.invoke("penpal:resume-session", id),
  getSessions: () => ipcRenderer.invoke("store:get-sessions"),
  deleteSession: (id) => ipcRenderer.invoke("store:delete-session", id),
  renameSession: (id, title) =>
    ipcRenderer.invoke("store:rename-session", id, title),
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
    ipcRenderer.on("penpal:stream", handler);
    return () => ipcRenderer.removeListener("penpal:stream", handler);
  },
};

contextBridge.exposeInMainWorld("penpal", api);
