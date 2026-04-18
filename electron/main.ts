import { app, BrowserWindow, ipcMain, Menu } from "electron";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import {
  startOllamaSession,
  sendMessage,
  resumeSession,
  endSession,
  shutdownOllama,
} from "./ollama";
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
          theme: "light",
          ollamaModel: "qwen3:latest",
          ollamaEndpoint: "http://localhost:11434",
        } as UserPreferences,
        windowBounds: { width: 1100, height: 780 } as {
          x?: number;
          y?: number;
          width: number;
          height: number;
          isMaximized?: boolean;
        },
      },
    });
  }
  return storeInstance;
}

let mainWindow: BrowserWindow | null = null;

function resolveIcon() {
  const iconFile = process.platform === "win32" ? "icon.ico" : "icon.png";
  return app.isPackaged
    ? path.join(process.resourcesPath, iconFile)
    : path.join(__dirname, "..", "build", iconFile);
}

async function createWindow() {
  const store = await getStore();
  const bounds = store.get("windowBounds") as {
    x?: number;
    y?: number;
    width: number;
    height: number;
    isMaximized?: boolean;
  };

  mainWindow = new BrowserWindow({
    ...(bounds.x !== undefined && bounds.y !== undefined
      ? { x: bounds.x, y: bounds.y }
      : {}),
    width: bounds.width,
    height: bounds.height,
    minWidth: 700,
    minHeight: 500,
    title: "PenPal AI",
    icon: resolveIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (bounds.isMaximized) {
    mainWindow.maximize();
  }

  const saveBounds = () => {
    if (!mainWindow) return;
    const isMaximized = mainWindow.isMaximized();
    // Save the normal (non-maximized) bounds so restoring works correctly
    const normal = isMaximized
      ? (store.get("windowBounds") as any)
      : mainWindow.getBounds();
    store.set("windowBounds", { ...normal, isMaximized });
  };

  mainWindow.on("resized", saveBounds);
  mainWindow.on("moved", saveBounds);
  mainWindow.on("maximize", saveBounds);
  mainWindow.on("unmaximize", saveBounds);
  mainWindow.on("close", saveBounds);

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

// ── IPC Handlers ──

function registerIpcHandlers() {
  ipcMain.handle(
    "penpal:start-session",
    async (_event, req: StartSessionRequest) => {
      const sessionId = uuidv4();

      const store = await getStore();
      const prefs: UserPreferences = store.get("preferences");

      const firstResponse = await startOllamaSession(
        sessionId,
        req.topic,
        req.explanationLanguage,
        (chunk) => {
          mainWindow?.webContents.send("penpal:stream", chunk);
        },
        prefs
      );

      // Persist the new session
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
      prefs.recentTopics = [
        req.topic,
        ...prefs.recentTopics.filter((t: string) => t !== req.topic),
      ].slice(0, 5);
      store.set("preferences", prefs);

      return { sessionId, firstResponse };
    }
  );

  ipcMain.handle(
    "penpal:send-message",
    async (_event, req: SendMessageRequest) => {
      const store = await getStore();
      const prefs: UserPreferences = store.get("preferences");

      const tutorResponse = await sendMessage(
        req.sessionId,
        req.message,
        (chunk) => {
          mainWindow?.webContents.send("penpal:stream", chunk);
        },
        prefs
      );

      // Persist turns
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

  ipcMain.handle("penpal:end-session", async (_event, sessionId: string) => {
    await endSession(sessionId);
  });

  ipcMain.handle("penpal:resume-session", async (_event, sessionId: string) => {
    const store = await getStore();
    const sessions: ConversationSession[] = store.get("sessions");
    const session = sessions.find((s) => s.id === sessionId);
    if (session) resumeSession(session);
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

  ipcMain.handle(
    "store:rename-session",
    async (_event, sessionId: string, title: string) => {
      const store = await getStore();
      const sessions: ConversationSession[] = store.get("sessions");
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        session.title = title;
        store.set("sessions", sessions);
      }
    }
  );

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

// ── Menu ──

function buildAppMenu(): Menu | null {
  if (process.platform === "darwin") {
    return Menu.buildFromTemplate([
      { role: "appMenu" },
      { role: "editMenu" },
      { role: "windowMenu" },
    ]);
  }
  return null;
}

// ── App lifecycle ──

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildAppMenu());
  registerIpcHandlers();
  await createWindow();
});

app.on("window-all-closed", async () => {
  await shutdownOllama();
  app.quit();
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
