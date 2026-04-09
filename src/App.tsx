import { useState, useEffect } from "react";
import type { ConversationSession, UserPreferences } from "./shared/types";
import { HomeScreen } from "./components/HomeScreen";
import { PracticeScreen } from "./components/PracticeScreen";
import { HistoryScreen } from "./components/HistoryScreen";

type Screen = "home" | "practice" | "history";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeSession, setActiveSession] =
    useState<ConversationSession | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences>({
    explanationLanguage: "English",
    recentTopics: [],
  });

  useEffect(() => {
    window.penpal.getPreferences().then(setPreferences);
  }, []);

  const handleStartSession = (session: ConversationSession) => {
    setActiveSession(session);
    setScreen("practice");
  };

  const handleEndSession = () => {
    setActiveSession(null);
    setScreen("home");
    window.penpal.getPreferences().then(setPreferences);
  };

  const handleResumeSession = (session: ConversationSession) => {
    setActiveSession(session);
    setScreen("practice");
  };

  return (
    <div className="app">
      <header className="app-header">
        <button className="logo-btn" onClick={() => setScreen("home")}>
          ✏️ PenPal AI
        </button>
        <nav>
          <button
            className={screen === "home" ? "active" : ""}
            onClick={() => setScreen("home")}
          >
            New Session
          </button>
          <button
            className={screen === "history" ? "active" : ""}
            onClick={() => setScreen("history")}
          >
            History
          </button>
        </nav>
      </header>

      <main className="app-main">
        {screen === "home" && (
          <HomeScreen
            preferences={preferences}
            onPreferencesChange={async (prefs) => {
              setPreferences(prefs);
              await window.penpal.savePreferences(prefs);
            }}
            onStartSession={handleStartSession}
          />
        )}
        {screen === "practice" && activeSession && (
          <PracticeScreen
            session={activeSession}
            onSessionUpdate={setActiveSession}
            onEnd={handleEndSession}
          />
        )}
        {screen === "history" && (
          <HistoryScreen
            onResume={handleResumeSession}
            onBack={() => setScreen("home")}
          />
        )}
      </main>
    </div>
  );
}
