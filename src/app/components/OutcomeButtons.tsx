'use client';

import { useState, useTransition } from 'react';

type Status = 'adopted' | 'ignored' | 'modified';

export function OutcomeButtons({
  suggestionId,
  initialStatus,
}: {
  suggestionId: string;
  initialStatus: Status | null;
}) {
  const [status, setStatus] = useState<Status | null>(initialStatus);
  const [pending, startTransition] = useTransition();

  function record(next: Status) {
    startTransition(async () => {
      const res = await fetch('/api/outcomes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suggestion_id: suggestionId, status: next }),
      });
      if (res.ok) setStatus(next);
    });
  }

  return (
    <div>
      <div className="outcome-row">
        <button
          className={`btn ${status === 'adopted' ? 'primary' : ''}`}
          onClick={() => record('adopted')}
          disabled={pending}
        >
          Adopt
        </button>
        <button
          className={`btn ${status === 'modified' ? 'primary' : ''}`}
          onClick={() => record('modified')}
          disabled={pending}
        >
          Modify
        </button>
        <button
          className={`btn ${status === 'ignored' ? 'primary' : ''}`}
          onClick={() => record('ignored')}
          disabled={pending}
        >
          Skip
        </button>
      </div>
      {status && (
        <div className={`outcome-pill ${status}`}>
          Logged as <strong>{status}</strong> — feeds the learning-to-rank model.
        </div>
      )}
    </div>
  );
}
