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
    theme: "light",
  });

  useEffect(() => {
    window.penpal.getPreferences().then((prefs) => {
      const merged = { ...prefs, theme: prefs.theme ?? "light" };
      setPreferences(merged);
      applyTheme(merged.theme);
    });
  }, []);

  function applyTheme(theme: "light" | "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }

  async function handlePreferencesChange(prefs: UserPreferences) {
    setPreferences(prefs);
    applyTheme(prefs.theme);
    await window.penpal.savePreferences(prefs);
  }

  function toggleTheme() {
    const next = preferences.theme === "light" ? "dark" : "light";
    handlePreferencesChange({ ...preferences, theme: next });
  }

  const handleStartSession = (session: ConversationSession) => {
    setActiveSession(session);
    setScreen("practice");
  };

  const handleEndSession = () => {
    setActiveSession(null);
    setScreen("home");
    window.penpal.getPreferences().then((prefs) => {
      const merged = { ...prefs, theme: prefs.theme ?? "light" };
      setPreferences(merged);
      applyTheme(merged.theme);
    });
  };

  const handleResumeSession = async (session: ConversationSession) => {
    await window.penpal.resumeSession(session.id);
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
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={preferences.theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          >
            {preferences.theme === "light" ? "🌙" : "☀️"}
          </button>
        </nav>
      </header>

      <main className="app-main">
        {screen === "home" && (
          <HomeScreen
            preferences={preferences}
            onPreferencesChange={handlePreferencesChange}
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
