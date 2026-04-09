import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  startCopilotSession,
  sendMessage,
  endSession,
  shutdownCopilot,
} from "./copilot";
import type {
  StartSessionRequest,
  SendMessageRequest,
  ConversationSession,
  ConversationTurn,
  UserPreferences,
} from "../src/shared/types";

// Persistence via electron-store (lazy-loaded because it's ESM-only in v10)
let storeInstance: any = null;
async function getStore() {
  if (!storeInstance) {
    const { default: Store } = await import("electron-store");
    storeInstance = new Store({
      defaults: {
        sessions: [] as ConversationSession[],
        preferences: {
          explanationLanguage: "English",
          recentTopics: [],
        } as UserPreferences,
      },
    });
  }
  return storeInstance;
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    title: "PenPal AI",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ── IPC Handlers ──

function registerIpcHandlers() {
  ipcMain.handle(
    "copilot:start-session",
    async (_event, req: StartSessionRequest) => {
      const sessionId = uuidv4();

      const firstResponse = await startCopilotSession(
        sessionId,
        req.topic,
        req.explanationLanguage,
        (chunk) => {
          mainWindow?.webContents.send("copilot:stream", chunk);
        }
      );

      // Persist the new session
      const store = await getStore();
      const sessions: ConversationSession[] = store.get("sessions");
      const now = Date.now();

      const firstTurn: ConversationTurn = {
        id: uuidv4(),
        role: "assistant",
        content: firstResponse.nextQuestion,
        tutorResponse: firstResponse,
        timestamp: now,
      };

      const session: ConversationSession = {
        id: sessionId,
        topic: req.topic,
        explanationLanguage: req.explanationLanguage,
        turns: [firstTurn],
        createdAt: now,
        updatedAt: now,
      };
      sessions.unshift(session);
      store.set("sessions", sessions);

      // Update recent topics
      const prefs: UserPreferences = store.get("preferences");
      prefs.recentTopics = [
        req.topic,
        ...prefs.recentTopics.filter((t: string) => t !== req.topic),
      ].slice(0, 5);
      store.set("preferences", prefs);

      return { sessionId, firstResponse };
    }
  );

  ipcMain.handle(
    "copilot:send-message",
    async (_event, req: SendMessageRequest) => {
      const tutorResponse = await sendMessage(
        req.sessionId,
        req.message,
        (chunk) => {
          mainWindow?.webContents.send("copilot:stream", chunk);
        }
      );

      // Persist turns
      const store = await getStore();
      const sessions: ConversationSession[] = store.get("sessions");
      const session = sessions.find((s) => s.id === req.sessionId);
      if (session) {
        const now = Date.now();
        const userTurn: ConversationTurn = {
          id: uuidv4(),
          role: "user",
          content: req.message,
          timestamp: now,
        };
        const assistantTurn: ConversationTurn = {
          id: uuidv4(),
          role: "assistant",
          content: tutorResponse.nextQuestion,
          tutorResponse,
          timestamp: now + 1,
        };
        session.turns.push(userTurn, assistantTurn);
        session.updatedAt = now;
        store.set("sessions", sessions);
      }

      return tutorResponse;
    }
  );

  ipcMain.handle("copilot:end-session", async (_event, sessionId: string) => {
    await endSession(sessionId);
  });

  ipcMain.handle("store:get-sessions", async () => {
    const store = await getStore();
    return store.get("sessions") as ConversationSession[];
  });

  ipcMain.handle("store:delete-session", async (_event, sessionId: string) => {
    const store = await getStore();
    const sessions: ConversationSession[] = store.get("sessions");
    store.set(
      "sessions",
      sessions.filter((s) => s.id !== sessionId)
    );
    await endSession(sessionId);
  });

  ipcMain.handle("store:get-preferences", async () => {
    const store = await getStore();
    return store.get("preferences") as UserPreferences;
  });

  ipcMain.handle(
    "store:save-preferences",
    async (_event, prefs: UserPreferences) => {
      const store = await getStore();
      store.set("preferences", prefs);
    }
  );
}

// ── App lifecycle ──

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on("window-all-closed", async () => {
  await shutdownCopilot();
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
