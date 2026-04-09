import { useState, useRef, useEffect } from "react";
import type {
  ConversationSession,
  ConversationTurn,
} from "../shared/types";
import { CorrectionCard } from "./CorrectionCard";

interface Props {
  session: ConversationSession;
  onSessionUpdate: (session: ConversationSession) => void;
  onEnd: () => void;
}

export function PracticeScreen({ session, onSessionUpdate, onEnd }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamText, setStreamText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [session.turns, streamText]);

  useEffect(() => {
    const unsub = window.penpal.onStream((chunk) => {
      if (chunk.sessionId === session.id) {
        setStreamText((prev) => prev + chunk.delta);
      }
    });
    return unsub;
  }, [session.id]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setStreamText("");

    const userTurn: ConversationTurn = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    const updatedTurns = [...session.turns, userTurn];
    onSessionUpdate({ ...session, turns: updatedTurns });
    setInput("");

    try {
      const tutorResponse = await window.penpal.sendMessage({
        sessionId: session.id,
        message: trimmed,
      });

      const assistantTurn: ConversationTurn = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: tutorResponse.nextQuestion,
        tutorResponse,
        timestamp: Date.now(),
      };

      onSessionUpdate({
        ...session,
        turns: [...updatedTurns, assistantTurn],
        updatedAt: Date.now(),
      });
      setStreamText("");
    } catch (err: any) {
      setError(err?.message ?? "Failed to send message");
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleEnd = async () => {
    await window.penpal.endSession(session.id);
    onEnd();
  };

  return (
    <div className="practice-screen">
      <div className="practice-header">
        <div>
          <h2>{session.topic}</h2>
          <span className="practice-meta">
            Explanations in {session.explanationLanguage}
          </span>
        </div>
        <button className="end-btn" onClick={handleEnd}>
          End Session
        </button>
      </div>

      <div className="conversation">
        {session.turns.map((turn) => (
          <div key={turn.id} className={`turn turn-${turn.role}`}>
            {turn.role === "assistant" && turn.tutorResponse ? (
              <CorrectionCard
                response={turn.tutorResponse}
                isFirst={session.turns.indexOf(turn) === 0}
              />
            ) : (
              <div className="turn-bubble">
                <p>{turn.content}</p>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="turn turn-assistant">
            <div className="turn-bubble streaming">
              <span className="typing-indicator">
                <span></span><span></span><span></span>
              </span>
              {streamText && <span className="thinking-label">Thinking…</span>}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="input-area">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Write your answer here… (Enter to send, Shift+Enter for new line)"
          rows={3}
          disabled={loading}
        />
        <button
          className="send-btn"
          onClick={handleSend}
          disabled={loading || !input.trim()}
        >
          {loading ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
