import { Children, isValidElement, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { MarkdownArtifact } from "@/lib/payload/schema";

type MarkdownRendererProps = {
  artifact: MarkdownArtifact;
};

function getCodeLanguage(children: ReactNode): string {
  const firstChild = Children.toArray(children).find((child) => isValidElement(child));

  if (!firstChild || !isValidElement<{ className?: string }>(firstChild)) {
    return "text";
  }

  const match = /language-([\w-]+)/.exec(firstChild.props.className ?? "");
  return match?.[1]?.replace(/[-_]/g, " ") ?? "text";
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

const markdownComponents: Components = {
  a({ node: _node, className, ...props }) {
    return <a {...props} className={cn("markdown-link", className)} rel="noreferrer" target="_blank" />;
  },
  code({ node: _node, className, ...props }) {
    const isBlock = typeof className === "string" && className.includes("language-");

    return <code {...props} className={cn(isBlock ? "markdown-code" : "markdown-inline-code", className)} />;
  },
  pre({ node: _node, children }) {
    return (
      <div className="markdown-code-frame">
        <div className="markdown-code-head">
          <span className="markdown-code-chip">{getCodeLanguage(children)}</span>
          <span className="markdown-code-caption">fenced block</span>
        </div>
        <pre className="markdown-code-pre">{children}</pre>
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

export function MarkdownRenderer({ artifact }: MarkdownRendererProps) {
  const heading = artifact.title ?? artifact.filename ?? artifact.id;

  return (
    <div className="markdown-document">
      <header className="markdown-print-heading">
        <p className="section-kicker">Markdown artifact</p>
        <h1>{heading}</h1>
        {artifact.filename ? <p>{artifact.filename}</p> : null}
      </header>

      <article className="markdown-article">
        <ReactMarkdown
          components={markdownComponents}
          rehypePlugins={[[rehypeSanitize, markdownSchema], rehypeHighlight]}
          remarkPlugins={[remarkGfm]}
          skipHtml
        >
          {artifact.content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
