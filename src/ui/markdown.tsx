import type { ReactNode } from "react";

/** Inline: **bold** and [text](https://…) links. Everything else is plain text (no HTML). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) out.push(<strong key={m.index}>{m[1]}</strong>);
    else
      out.push(
        <a key={m.index} href={m[3]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
          {m[2]}
        </a>,
      );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** The small markdown subset briefs use: ## headings, bullet lists, paragraphs. Safe by construction. */
export function Markdown({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`l${blocks.length}`} className="grid list-disc gap-1 pl-5">
        {list.map((li, i) => (
          <li key={i}>{inline(li)}</li>
        ))}
      </ul>,
    );
    list = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      list.push(bullet[1]);
      continue;
    }
    flush();
    const h = /^#{1,4}\s+(.*)$/.exec(line);
    if (h) blocks.push(<h3 key={`h${blocks.length}`} className="pt-2 font-semibold">{inline(h[1])}</h3>);
    else if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
  }
  flush();
  return <div className="grid gap-2">{blocks}</div>;
}
