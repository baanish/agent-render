"use client";

import dynamic from "next/dynamic";
import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
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

const EmbeddedCodeRenderer = dynamic(
  () => import("@/components/renderers/code-renderer").then((module) => module.CodeRenderer),
  { ssr: false },
);

function getCodeLanguage(className?: string): string {
  const match = /language-([\w-]+)/.exec(className ?? "");
  return match?.[1]?.toLowerCase() ?? "text";
}

function getCodeContents(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => {
      if (typeof child === "string") {
        return child;
      }

      if (isValidElement<{ children?: ReactNode }>(child)) {
        return getCodeContents(child.props.children);
      }

      return "";
    })
    .join("")
    .replace(/\n$/, "");
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

/** Public API for `MarkdownRenderer`. */
export function MarkdownRenderer({ artifact, onReady }: MarkdownRendererProps) {
  const heading = artifact.title ?? artifact.filename ?? artifact.id;
  const embeddedBlockCount = useMemo(() => (artifact.content.match(/```[\s\S]*?```/g) ?? []).length, [artifact.content]);
  const [readyBlockIds, setReadyBlockIds] = useState<string[]>([]);

  useEffect(() => {
    setReadyBlockIds([]);
  }, [artifact.content, artifact.id]);

  useEffect(() => {
    if (readyBlockIds.length >= embeddedBlockCount) {
      onReady?.();
    }
  }, [embeddedBlockCount, onReady, readyBlockIds.length]);

  let blockIndex = 0;
  const markdownComponents: Components = {
    a({ node: _node, className, ...props }) {
      return <a {...props} className={cn("markdown-link", className)} rel="noreferrer" target="_blank" />;
    },
    code({ node: _node, className, children, ...props }) {
      const isBlock = typeof className === "string" && className.includes("language-");

      if (!isBlock) {
        return <code {...props} className={cn("markdown-inline-code", className)}>{children}</code>;
      }

      const language = getCodeLanguage(className);
      const code = getCodeContents(children);
      const blockId = `${artifact.id}-code-${blockIndex}`;
      blockIndex += 1;

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
              setReadyBlockIds((current) => (current.includes(blockId) ? current : [...current, blockId]));
            }}
          />
        </div>
      );
    },
    pre({ node: _node, children }) {
      return <>{children}</>;
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
    <div className="markdown-document" data-testid="renderer-markdown" data-renderer-ready={readyBlockIds.length >= embeddedBlockCount ? "true" : "false"}>
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
