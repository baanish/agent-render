import { MarkdownRenderer, sampleEnvelopes } from "agent-render";

const roadmap = sampleEnvelopes[0].artifacts[0];
const releaseNotes = sampleEnvelopes[4].artifacts[0];

/** Canonical document: headings, blockquote, task list, table, code fence. */
export const SprintRoadmap = () => <MarkdownRenderer artifact={roadmap} />;

/** Long-form release notes: dense tables, ordered lists, ascii diagram fence. */
export const ReleaseNotes = () => <MarkdownRenderer artifact={releaseNotes} />;
