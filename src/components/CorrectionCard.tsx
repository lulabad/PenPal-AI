import type { TutorResponse } from "../shared/types";

interface Props {
  response: TutorResponse;
  isFirst: boolean;
}

export function CorrectionCard({ response, isFirst }: Props) {
  const hasCorrections = response.corrections.length > 0;

  return (
    <div className="correction-card">
      {/* Encouragement */}
      {response.encouragement && (
        <div className="cc-encouragement">
          <span className="cc-icon">💬</span>
          <p>{response.encouragement}</p>
        </div>
      )}

      {/* Corrected text (skip for the opening question) */}
      {!isFirst && response.correctedText && (
        <div className="cc-corrected">
          <h4>✅ Corrected Version</h4>
          <p>{response.correctedText}</p>
        </div>
      )}

      {/* Corrections list */}
      {hasCorrections && (
        <div className="cc-corrections">
          <h4>📝 Corrections</h4>
          <ul>
            {response.corrections.map((c, i) => (
              <li key={i}>
                <span className="cc-original">{c.original}</span>
                <span className="cc-arrow">→</span>
                <span className="cc-fixed">{c.corrected}</span>
                <p className="cc-explanation">{c.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Next question */}
      {response.nextQuestion && (
        <div className="cc-question">
          <h4>❓ Next Question</h4>
          <p>{response.nextQuestion}</p>
        </div>
      )}
    </div>
  );
}
