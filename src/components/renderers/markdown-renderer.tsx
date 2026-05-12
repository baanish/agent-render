"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { MarkdownArtifact } from "@/lib/payload/schema";

type MarkdownRendererProps = {
  artifact: MarkdownArtifact;
  onReady?: () => void;
};

type HastNode = {
  type?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  value?: unknown;
};

const EmbeddedCodeRenderer = dynamic(
  () => import("@/components/renderers/code-renderer").then((module) => module.CodeRenderer),
  { ssr: false },
);

const MermaidBlock = dynamic(
  () => import("@/components/renderers/mermaid-block").then((module) => module.MermaidBlock),
  { ssr: false },
);

const EMBEDDED_CODE_BLOCK_PATTERN = /(?:^|\n)```[^\n]*\n[\s\S]*?\n```(?=\n|$)/g;
const LANGUAGE_CLASS_PREFIX = "language-";

function countEmbeddedCodeBlocks(content: string): number {
  EMBEDDED_CODE_BLOCK_PATTERN.lastIndex = 0;
  let count = 0;
  while (EMBEDDED_CODE_BLOCK_PATTERN.exec(content)) {
    count += 1;
  }
  return count;
}

function getCodeLanguage(className?: string): string {
  const value = className ?? "";
  const start = value.indexOf(LANGUAGE_CLASS_PREFIX);
  if (start === -1) {
    return "text";
  }

  const languageStart = start + LANGUAGE_CLASS_PREFIX.length;
  let languageEnd = languageStart;
  while (languageEnd < value.length) {
    const code = value.charCodeAt(languageEnd);
    const isAlphaNumeric =
      (code >= 48 && code <= 57) ||
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122);

    if (!isAlphaNumeric && code !== 45 && code !== 95) {
      break;
    }

    languageEnd += 1;
  }

  return languageEnd > languageStart
    ? value.slice(languageStart, languageEnd).toLowerCase()
    : "text";
}

function appendNodeText(node: HastNode | undefined, parts: string[]): void {
  if (!node) {
    return;
  }

  if (typeof node.value === "string") {
    parts.push(node.value);
    return;
  }

  const children = node.children;
  if (!children) {
    return;
  }

  for (const child of children) {
    appendNodeText(child, parts);
  }
}

function getNodeText(node: HastNode | undefined): string {
  const parts: string[] = [];
  appendNodeText(node, parts);
  return parts.join("");
}

function getNodeClassName(node: HastNode | undefined): string | undefined {
  const className = node?.properties?.className;
  if (typeof className === "string") {
    return className;
  }
  if (Array.isArray(className)) {
    let joined = "";
    for (const value of className) {
      if (typeof value !== "string") {
        continue;
      }
      joined = joined ? `${joined} ${value}` : value;
    }
    return joined || undefined;
  }
  return undefined;
}

function getPreCodeNode(node: HastNode | undefined): HastNode | undefined {
  const children = node?.children;
  if (!children) {
    return undefined;
  }

  for (const child of children) {
    if (child.tagName === "code") {
      return child;
    }
  }

  return undefined;
}

const markdownSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "input"],
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    input: [...(defaultSchema.attributes?.input ?? []), ["type"], ["checked"], ["disabled"]],
    li: [...(defaultSchema.attributes?.li ?? []), ["className"]],
    th: [...(defaultSchema.attributes?.th ?? []), ["align"]],
    td: [...(defaultSchema.attributes?.td ?? []), ["align"]],
    ul: [...(defaultSchema.attributes?.ul ?? []), ["className"]],
  },
};

/**
 * Displays markdown artifacts in the primary viewer stage using sanitized GFM output.
 * Consumes `artifact` content and optional `onReady`, which fires after embedded fenced code blocks report ready.
 * Reuses the CodeMirror renderer for code fences and keeps raw HTML disabled for safer rendering.
 */
export function MarkdownRenderer({ artifact, onReady }: MarkdownRendererProps) {
  const heading = artifact.title ?? artifact.filename ?? artifact.id;
  const embeddedBlockCount = useMemo(() => countEmbeddedCodeBlocks(artifact.content), [artifact.content]);
  const readyBlockIdsRef = useRef<Set<string>>(new Set());
  const [readyBlockCount, setReadyBlockCount] = useState(0);

  useEffect(() => {
    readyBlockIdsRef.current.clear();
    setReadyBlockCount(0);
  }, [artifact.content, artifact.id]);

  useEffect(() => {
    if (readyBlockCount >= embeddedBlockCount) {
      onReady?.();
    }
  }, [embeddedBlockCount, onReady, readyBlockCount]);

  const markBlockReady = useCallback((blockId: string) => {
    if (readyBlockIdsRef.current.has(blockId)) {
      return;
    }

    readyBlockIdsRef.current.add(blockId);
    setReadyBlockCount(readyBlockIdsRef.current.size);
  }, []);

  let blockIndex = 0;
  const markdownComponents: Components = {
    a({ node: _node, className, ...props }) {
      return <a {...props} className={cn("markdown-link", className)} rel="noreferrer" target="_blank" />;
    },
    code({ node: _node, className, children, ...props }) {
      return <code {...props} className={cn("markdown-inline-code", className)}>{children}</code>;
    },
    pre({ node, children }) {
      const codeNode = getPreCodeNode(node as HastNode | undefined);
      if (!codeNode) {
        return <pre>{children}</pre>;
      }

      const className = getNodeClassName(codeNode);
      const language = getCodeLanguage(className);
      const code = getNodeText(codeNode).replace(/\n$/, "");
      const blockId = `${artifact.id}-code-${blockIndex}`;
      blockIndex += 1;

      if (language === "mermaid") {
        return (
          <div className="markdown-mermaid-frame">
            <div className="markdown-code-head">
              <span className="markdown-code-chip">mermaid</span>
              <span className="markdown-code-caption">diagram</span>
            </div>
            <MermaidBlock
              code={code}
              onReady={() => {
                markBlockReady(blockId);
              }}
            />
          </div>
        );
      }

      return (
        <div className="markdown-code-frame">
          <div className="markdown-code-head">
            <span className="markdown-code-chip">{language}</span>
            <span className="markdown-code-caption">premium fence</span>
          </div>
          <EmbeddedCodeRenderer
            compact
            artifact={{
              id: blockId,
              kind: "code",
              content: code,
              language,
            }}
            onReady={() => {
              markBlockReady(blockId);
            }}
          />
        </div>
      );
    },
    table({ node: _node, className, ...props }) {
      return (
        <div className="markdown-table-wrap">
          <table {...props} className={cn("markdown-table", className)} />
        </div>
      );
    },
  };

  return (
    <div className="markdown-document" data-testid="renderer-markdown" data-renderer-ready={readyBlockCount >= embeddedBlockCount ? "true" : "false"}>
      <header className="markdown-print-heading">
        <p className="section-kicker">Markdown artifact</p>
        <h1>{heading}</h1>
        {artifact.filename ? <p>{artifact.filename}</p> : null}
      </header>

      <article className="markdown-article">
        <ReactMarkdown components={markdownComponents} rehypePlugins={[[rehypeSanitize, markdownSchema]]} remarkPlugins={[remarkGfm]} skipHtml>
          {artifact.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
