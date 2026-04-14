import { useState, useEffect, useRef } from "react";
import type { ConversationSession } from "../shared/types";

interface Props {
  onResume: (session: ConversationSession) => void;
  onBack: () => void;
}

export function HistoryScreen({ onResume, onBack }: Props) {
  const [sessions, setSessions] = useState<ConversationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.penpal
      .getSessions()
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (editingId) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editingId]);

  const handleDelete = async (id: string) => {
    await window.penpal.deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setConfirmingId(null);
  };

  const startRename = (session: ConversationSession) => {
    setEditingId(session.id);
    setEditValue(session.title || session.topic);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      await window.penpal.renameSession(editingId, trimmed);
      setSessions((prev) =>
        prev.map((s) => (s.id === editingId ? { ...s, title: trimmed } : s))
      );
    }
    setEditingId(null);
  };

  const cancelRename = () => {
    setEditingId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      cancelRename();
    }
  };

  if (loading) {
    return <div className="history-screen"><p>Loading…</p></div>;
  }

  if (sessions.length === 0) {
    return (
      <div className="history-screen empty">
        <h2>No Sessions Yet</h2>
        <p>Start a practice session to see your history here.</p>
        <button className="start-btn" onClick={onBack}>
          Start Practicing
        </button>
      </div>
    );
  }

  return (
    <div className="history-screen">
      <h2>Session History</h2>
      <div className="history-list">
        {sessions.map((session) => (
          <div key={session.id} className="history-card">
            <div className="history-info">
              {editingId === session.id ? (
                <input
                  ref={editInputRef}
                  className="rename-input"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleRenameKeyDown}
                  onBlur={commitRename}
                />
              ) : (
                <h3>
                  {session.title || session.topic}
                  <button
                    className="rename-btn"
                    onClick={() => startRename(session)}
                    title="Rename session"
                  >
                    ✏️
                  </button>
                </h3>
              )}
              <span className="history-meta">
                {session.turns.length} turns ·{" "}
                {new Date(session.updatedAt).toLocaleDateString()}
              </span>
            </div>
            <div className="history-actions">
              {confirmingId === session.id ? (
                <>
                  <span className="delete-confirm-label">Delete this session?</span>
                  <button
                    className="confirm-delete-btn"
                    onClick={() => handleDelete(session.id)}
                  >
                    Confirm
                  </button>
                  <button
                    className="cancel-btn"
                    onClick={() => setConfirmingId(null)}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => onResume(session)}>Resume</button>
                  <button
                    className="delete-btn"
                    onClick={() => setConfirmingId(session.id)}
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
