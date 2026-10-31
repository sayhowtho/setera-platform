// Renders long-form training copy (stored as markdown in lib/) inside a
// Resources RCard. Supports only the subset our copy uses: #/##/### headings,
// > blockquotes (nested content allowed), **bold**, --- rules, and a lone ↓.
// A blockquote that contains a heading renders as the dark callout used for
// "The One Truth"-style summaries.

import React from 'react';

type Block =
  | { kind: 'h'; level: number; text: string }
  | { kind: 'p'; text: string }
  | { kind: 'hr' }
  | { kind: 'arrow' }
  | { kind: 'quote'; blocks: Block[] };

function parse(md: string): Block[] {
  const lines = md.split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (!t) { i++; continue; }
    if (t.startsWith('>')) {
      const inner: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        inner.push(lines[i].trim().replace(/^> ?/, ''));
        i++;
      }
      blocks.push({ kind: 'quote', blocks: parse(inner.join('\n')) });
      continue;
    }
    const h = t.match(/^(#{1,3}) (.*)$/);
    if (h) blocks.push({ kind: 'h', level: h[1].length, text: h[2] });
    else if (t === '---') blocks.push({ kind: 'hr' });
    else if (t === '↓') blocks.push({ kind: 'arrow' });
    else blocks.push({ kind: 'p', text: t });
    i++;
  }
  return blocks;
}

function inline(text: string, dark = false): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} style={{ color: dark ? '#fff' : '#0a1f13', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

function renderBlocks(blocks: Block[], dark = false): React.ReactNode[] {
  const body = dark ? 'rgba(255,255,255,0.8)' : '#374151';
  return blocks.map((b, i) => {
    switch (b.kind) {
      case 'h':
        if (b.level === 1) return <h2 key={i} style={{ color: '#0a1f13', fontSize: '16px', fontWeight: 800, letterSpacing: '0.02em', margin: i === 0 ? '0 0 14px 0' : '8px 0 14px 0', lineHeight: 1.35 }}>{b.text}</h2>;
        if (b.level === 2) return <h3 key={i} style={{ color: dark ? '#00d4aa' : '#0a1f13', fontSize: dark ? '15px' : '14px', fontWeight: 700, margin: '0 0 12px 0', lineHeight: 1.4 }}>{b.text}</h3>;
        return <h4 key={i} style={{ color: '#00d4aa', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '6px 0 10px 0' }}>{b.text}</h4>;
      case 'hr':
        return <hr key={i} style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '22px 0' }} />;
      case 'arrow':
        return <p key={i} style={{ color: '#00d4aa', fontSize: '18px', fontWeight: 700, margin: '0 0 10px 0' }}>↓</p>;
      case 'p':
        return <p key={i} style={{ color: body, fontSize: '13px', lineHeight: 1.7, margin: '0 0 10px 0' }}>{inline(b.text, dark)}</p>;
      case 'quote': {
        if (b.blocks.some(x => x.kind === 'h')) {
          return (
            <div key={i} style={{ backgroundColor: '#0f2318', borderRadius: '10px', padding: '20px 22px', margin: '0 0 12px 0' }}>
              {renderBlocks(b.blocks, true)}
            </div>
          );
        }
        return (
          <div key={i} style={{ backgroundColor: '#f0f4f1', borderLeft: '2px solid #00d4aa', padding: '8px 14px', margin: '0 0 8px 0', fontStyle: 'italic', fontSize: '13px', color: '#374151', lineHeight: 1.6 }}>
            {b.blocks.map((x, j) => x.kind === 'p' ? <p key={j} style={{ margin: 0 }}>{inline(x.text)}</p> : null)}
          </div>
        );
      }
    }
  });
}

export default function MarkdownResource({ markdown }: { markdown: string }) {
  return <div>{renderBlocks(parse(markdown))}</div>;
}
