import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/**
 * The Markdown tools write, such as Fathom's meeting summaries: headings,
 * paragraphs, nested lists, bold, italics, code and links. Builds elements,
 * never HTML, and links only to http(s), so a tool's text can't run script.
 */
export function Markdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2 text-meta text-ink', className)}>
      {blocks(text).map((block, index) => {
        const key = `b${index}`;
        if (block.kind === 'heading') {
          const Heading = block.level <= 2 ? 'h3' : 'h4';
          return (
            <Heading
              key={key}
              className="mt-2 font-semibold text-ink first:mt-0"
            >
              {inline(block.text, key)}
            </Heading>
          );
        }
        if (block.kind === 'list') {
          return <List key={key} items={block.items} id={key} />;
        }
        return <p key={key}>{inline(block.text, key)}</p>;
      })}
    </div>
  );
}

type Item = { text: string; ordered: boolean; children: Item[] };
type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: Item[] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

function blocks(text: string): Block[] {
  const result: Block[] = [];
  let paragraph: string[] = [];
  // Nested lists: the items at each depth, and how far that depth is indented.
  let stack: { indent: number; items: Item[] }[] = [];

  const endParagraph = () => {
    if (paragraph.length) {
      result.push({ kind: 'paragraph', text: paragraph.join(' ') });
    }
    paragraph = [];
  };
  const endList = () => {
    if (stack.length) result.push({ kind: 'list', items: stack[0]!.items });
    stack = [];
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const item = LIST_ITEM.exec(line);
    if (item) {
      endParagraph();
      const indent = item[1]!.length;
      const entry: Item = {
        text: item[3]!,
        ordered: /\d/.test(item[2]!),
        children: [],
      };
      if (!stack.length) stack.push({ indent, items: [] });
      while (stack.length > 1 && indent < stack.at(-1)!.indent) stack.pop();
      const top = stack.at(-1)!;
      const parent = top.items.at(-1);
      if (indent > top.indent && parent) {
        stack.push({ indent, items: parent.children });
      }
      stack.at(-1)!.items.push(entry);
      continue;
    }
    if (!line.trim()) {
      endParagraph();
      continue;
    }
    // A wrapped line carries on the list item above it.
    if (stack.length && /^\s/.test(line)) {
      const last = stack.at(-1)!.items.at(-1)!;
      last.text += ` ${line.trim()}`;
      continue;
    }
    endList();
    const heading = HEADING.exec(line);
    if (heading) {
      endParagraph();
      result.push({
        kind: 'heading',
        level: heading[1]!.length,
        text: heading[2]!.replace(/\s+#+\s*$/, ''),
      });
      continue;
    }
    paragraph.push(line.trim());
  }
  endParagraph();
  endList();
  return result;
}

function List({ items, id }: { items: Item[]; id: string }) {
  const Tag = items[0]?.ordered ? 'ol' : 'ul';
  return (
    <Tag
      className={cn(
        'flex flex-col gap-1 pl-5',
        Tag === 'ol' ? 'list-decimal' : 'list-disc',
      )}
    >
      {items.map((item, index) => {
        const key = `${id}-${index}`;
        return (
          <li key={key}>
            {inline(item.text, key)}
            {item.children.length > 0 && (
              <div className="mt-1">
                <List items={item.children} id={key} />
              </div>
            )}
          </li>
        );
      })}
    </Tag>
  );
}

// In order: an escaped character, [label](url) (a url may hold one level of
// parentheses), **bold**, *italic*, `code`. Escapes inside the others are
// skipped over, then handled when their contents are.
const INLINE =
  /\\([\\`*_{}[\]()#+\-.!])|\[((?:\\.|[^\]\\])+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*((?:\\.|[^\\])+?)\*\*|\*(?!\s)((?:\\.|[^*\\])+?)\*|`([^`]+)`/g;

function inline(text: string, id: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    const [whole, escaped, label, href, bold, em, code] = match;
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const key = `${id}-${match.index}`;
    if (escaped !== undefined) {
      nodes.push(escaped);
    } else if (label !== undefined) {
      nodes.push(
        /^https?:\/\//i.test(href!) ? (
          <a
            key={key}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="rounded-row underline decoration-border-strong/40 underline-offset-2 hover:decoration-ink"
          >
            {inline(label, key)}
          </a>
        ) : (
          <span key={key}>{inline(label, key)}</span>
        ),
      );
    } else if (bold !== undefined) {
      nodes.push(
        <strong key={key} className="font-semibold">
          {inline(bold, key)}
        </strong>,
      );
    } else if (em !== undefined) {
      nodes.push(<em key={key}>{inline(em, key)}</em>);
    } else {
      nodes.push(
        <code key={key} className="font-mono text-mono">
          {code}
        </code>,
      );
    }
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
