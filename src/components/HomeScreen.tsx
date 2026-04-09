import { useState } from "react";
import type {
  UserPreferences,
  ConversationSession,
  ConversationTurn,
} from "../shared/types";
import { TOPICS } from "../shared/types";

interface Props {
  preferences: UserPreferences;
  onPreferencesChange: (prefs: UserPreferences) => void;
  onStartSession: (session: ConversationSession) => void;
}

const LANGUAGES = ["English", "German", "Spanish", "French", "Portuguese", "Italian", "Japanese", "Korean", "Chinese"];

export function HomeScreen({
  preferences,
  onPreferencesChange,
  onStartSession,
}: Props) {
  const [selectedTopic, setSelectedTopic] = useState<string>(TOPICS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const { sessionId, firstResponse } = await window.penpal.startSession({
        topic: selectedTopic,
        explanationLanguage: preferences.explanationLanguage,
      });

      const firstTurn: ConversationTurn = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: firstResponse.nextQuestion,
        tutorResponse: firstResponse,
        timestamp: Date.now(),
      };

      onStartSession({
        id: sessionId,
        topic: selectedTopic,
        explanationLanguage: preferences.explanationLanguage,
        turns: [firstTurn],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch (err: any) {
      setError(err?.message ?? "Failed to start session");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="home-screen">
      <div className="home-hero">
        <h1>Practice Your English Writing</h1>
        <p>
          Choose a topic and start a conversation. I'll ask questions, you
          write answers, and I'll help you improve.
        </p>
      </div>

      <div className="home-settings">
        <label>
          <span>Explanations in</span>
          <select
            value={preferences.explanationLanguage}
            onChange={(e) =>
              onPreferencesChange({
                ...preferences,
                explanationLanguage: e.target.value,
              })
            }
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="topic-grid">
        {TOPICS.map((topic) => (
          <button
            key={topic}
            className={`topic-card ${selectedTopic === topic ? "selected" : ""}`}
            onClick={() => setSelectedTopic(topic)}
          >
            <span className="topic-icon">{topicIcon(topic)}</span>
            <span className="topic-label">{topic}</span>
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      <button
        className="start-btn"
        onClick={handleStart}
        disabled={loading}
      >
        {loading ? "Starting…" : `Start Practice — ${selectedTopic}`}
      </button>
    </div>
  );
}

function topicIcon(topic: string): string {
  const icons: Record<string, string> = {
    "Daily Life": "🏠",
    "Travel & Culture": "✈️",
    Technology: "💻",
    "Food & Cooking": "🍳",
    "Nature & Environment": "🌿",
    "Work & Career": "💼",
    "Hobbies & Leisure": "🎨",
    "Health & Fitness": "🏃",
    "Movies & Books": "🎬",
    Random: "🎲",
  };
  return icons[topic] ?? "📝";
}
