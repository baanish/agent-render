"use client";

import { useEffect } from "react";
import type { ChoicesArtifact } from "@/lib/payload/schema";

type ChoicesRendererProps = {
  artifact: ChoicesArtifact;
  onReady: () => void;
};

/**
 * Renders a `choices` artifact: stable option ids the reader answers with in chat. Presentational
 * by design — the viewer is static, so the reply channel is the conversation, not this page.
 */
export function ChoicesRenderer({ artifact, onReady }: ChoicesRendererProps) {
  useEffect(() => {
    onReady();
  }, [artifact.id, onReady]);

  const exampleIds = artifact.options
    .slice(0, 2)
    .map((option) => option.id)
    .join(", ");

  return (
    <div className="ar-choices" data-testid="renderer-choices" data-renderer-ready="true">
      {artifact.prompt ? <p className="ar-choices-prompt">{artifact.prompt}</p> : null}
      <ol className="ar-choice-list">
        {artifact.options.map((option) => (
          <li key={option.id} className="ar-choice">
            <span className="ar-choice-id">{option.id}</span>
            <div className="ar-choice-body">
              <p className="ar-choice-label">{option.label}</p>
              {option.detail ? <p className="ar-choice-detail">{option.detail}</p> : null}
            </div>
          </li>
        ))}
      </ol>
      <p className="ar-choices-hint">
        {artifact.multi
          ? `Reply to the agent in chat with the option ids you want, e.g. "do ${exampleIds}".`
          : `Reply to the agent in chat with one option id, e.g. "${artifact.options[0]?.id}".`}
      </p>
    </div>
  );
}
