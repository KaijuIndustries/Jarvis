"use client";

import { Children, isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CheckIcon, CopyIcon } from "./icons";

function nodeText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return nodeText(node.props.children);
  }
  return "";
}

function languageFromClass(className?: string): string {
  const match = className?.match(/language-([^\s]+)/);
  return match?.[1] ?? "";
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const codeElement = Children.toArray(children).find((child) => isValidElement(child));
  const className = isValidElement<{ className?: string }>(codeElement)
    ? codeElement.props.className
    : undefined;
  const language = languageFromClass(className);
  const text = nodeText(children).replace(/\n$/, "");

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <div className="code-block">
      <div className="code-block-bar">
        <span>{language || "code"}</span>
        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>{children}</pre>
    </div>
  );
}

export function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
