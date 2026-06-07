'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Copy, Check, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MessageContentProps {
  content: string;
  isUser?: boolean;
}

// 代码块组件
function CodeBlock({ 
  language, 
  children 
}: { 
  language?: string; 
  children: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3 -mx-1">
      <div className="flex items-center justify-between bg-slate-800 text-white text-xs px-4 py-2 rounded-t-lg">
        <span className="font-mono">{language || 'code'}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-slate-300 hover:text-white hover:bg-slate-700"
          onClick={handleCopy}
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 mr-1" />
              已复制
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 mr-1" />
              复制
            </>
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language || 'text'}
        style={oneLight}
        customStyle={{
          margin: 0,
          borderTopLeftRadius: 0,
          borderTopRightRadius: 0,
          fontSize: '13px',
        }}
        showLineNumbers
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

// 链接组件
function Link({ 
  href, 
  children 
}: { 
  href?: string; 
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-0.5"
    >
      {children}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </a>
  );
}

/** 检测内容是否为 HTML（来自金蝶社区 AI 问答接口） */
function isHtmlContent(content: string): boolean {
  const stripped = content.trim();
  return stripped.startsWith('<') && (stripped.includes('</p>') || stripped.includes('</div>') || stripped.includes('<img'));
}

// Markdown渲染组件
export default function MessageContent({ content, isUser }: MessageContentProps) {
  if (isUser) {
    return <p className="whitespace-pre-wrap break-words">{content}</p>;
  }

  // HTML 内容直接渲染（来自金蝶社区 AI 问答接口）
  if (isHtmlContent(content)) {
    return (
      <div 
        className="prose prose-sm prose-slate max-w-none text-sm leading-relaxed
          [&_p]:my-2 [&_p]:leading-relaxed
          [&_strong]:text-slate-800 [&_b]:text-slate-800
          [&_a]:text-blue-600 [&_a]:hover:text-blue-700 [&_a]:underline
          [&_img]:max-w-full [&_img]:rounded-lg [&_img]:my-3
          [&_ol]:list-decimal [&_ol]:ml-4 [&_ol]:my-2
          [&_ul]:list-disc [&_ul]:ml-4 [&_ul]:my-2
          [&_li]:my-0.5
          [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2
          [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2
          [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1
          [&_blockquote]:border-l-4 [&_blockquote]:border-blue-400 [&_blockquote]:bg-blue-50 [&_blockquote]:py-2 [&_blockquote]:px-3 [&_blockquote]:rounded-r
          [&_table]:min-w-full [&_table]:border-collapse
          [&_hr]:my-4 [&_hr]:border-slate-200"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  return (
    <div className="prose prose-sm prose-slate max-w-none dark:prose-invert 
      prose-headings:text-slate-800 prose-headings:font-semibold
      prose-h1:text-lg prose-h1:mb-3 prose-h1:mt-4
      prose-h2:text-base prose-h2:mb-2 prose-h2:mt-3
      prose-h3:text-sm prose-h3:mb-2 prose-h3:mt-2
      prose-p:my-2 prose-p:leading-relaxed
      prose-li:my-0.5
      prose-ul:my-2 prose-ol:my-2
      prose-blockquote:border-l-blue-400 prose-blockquote:bg-blue-50 prose-blockquote:py-1 prose-blockquote:px-3 prose-blockquote:rounded-r prose-blockquote:not-italic
      prose-code:text-pink-600 prose-code:bg-pink-50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
      prose-strong:text-slate-800
      prose-a:text-blue-600">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || '');
            const isInline = !match && !String(children).includes('\n');
            
            if (isInline) {
              return (
                <code className="text-pink-600 bg-pink-50 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
                  {children}
                </code>
              );
            }
            
            return (
              <CodeBlock language={match?.[1]}>
                {String(children).replace(/\n$/, '')}
              </CodeBlock>
            );
          },
          a({ href, children }) {
            return <Link href={href}>{children}</Link>;
          },
          ul({ children }) {
            return <ul className="list-disc list-outside ml-4 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-outside ml-4 space-y-1">{children}</ol>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-blue-400 bg-blue-50 py-2 px-3 rounded-r my-3 text-slate-600">
                {children}
              </blockquote>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border-collapse border border-slate-200 text-sm">
                  {children}
                </table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-semibold">
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="border border-slate-200 px-3 py-2">
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
