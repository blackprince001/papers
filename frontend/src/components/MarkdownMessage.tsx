import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import 'katex/dist/katex.min.css';

interface MarkdownMessageProps {
  content: string;
  className?: string;
}

export function MarkdownMessage({ content, className = '' }: MarkdownMessageProps) {
  return (
    <div className={`markdown-content text-sm leading-[1.75] ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={[rehypeKatex]}
        components={{
          code({ node, className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '');
            const language = match ? match[1] : '';
            const inline = !match; // If no language match, it's inline code

            return !inline && language ? (
              <SyntaxHighlighter
                style={oneLight}
                language={language}
                PreTag="div"
                className="rounded-lg my-3 !p-4 text-xs font-mono"
                customStyle={{
                  marginTop: '0.75rem',
                  marginBottom: '0.75rem',
                  padding: '1rem',
                  backgroundColor: 'var(--color-green-4)',
                } as any}
                {...(props as any)}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            ) : (
              <code className={`bg-green-4 px-1.5 py-0.5 rounded text-xs font-mono ${className || ''}`} {...props}>
                {children}
              </code>
            );
          },
          p({ children }) {
            return <p className="mb-3 last:mb-0 leading-[1.75] text-sm">{children}</p>;
          },
          h1({ children }) {
            return <h1 className="text-lg font-semibold mb-3 mt-4 first:mt-0 leading-tight">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0 leading-tight">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-sm font-medium mb-2 mt-3 first:mt-0 leading-tight">{children}</h3>;
          },
          h4({ children }) {
            return <h4 className="text-sm font-medium mb-2 mt-2 first:mt-0 leading-tight">{children}</h4>;
          },
          h5({ children }) {
            return <h5 className="text-sm font-medium mb-2 mt-2 first:mt-0 leading-tight">{children}</h5>;
          },
          h6({ children }) {
            return <h6 className="text-xs font-medium mb-1 mt-2 first:mt-0 leading-tight">{children}</h6>;
          },
          ul({ children }) {
            return <ul className="list-disc list-outside mb-4 space-y-2 ml-6">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-outside mb-4 space-y-2 ml-6">{children}</ol>;
          },
          li({ children }) {
            return <li className="leading-[1.75]">{children}</li>;
          },
          blockquote({ children }) {
            return (
              <blockquote className="border-l-4 border-blue-5 pl-4 italic my-4 text-green-34 bg-blue-5 py-2 rounded-r">
                {children}
              </blockquote>
            );
          },
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-700 underline transition-colors font-medium"
              >
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full border border-green-6 rounded-lg overflow-hidden">{children}</table>
              </div>
            );
          },
          th({ children }) {
            return (
              <th className="border border-green-6 px-4 py-3 bg-green-4 font-semibold text-left">
                {children}
              </th>
            );
          },
          td({ children }) {
            return <td className="border border-green-6 px-4 py-3">{children}</td>;
          },
          hr() {
            return <hr className="my-6 border-green-6" />;
          },
          strong({ children }) {
            return <strong className="font-semibold">{children}</strong>;
          },
          em({ children }) {
            return <em className="italic">{children}</em>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

