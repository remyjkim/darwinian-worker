// ABOUTME: Composes stack-ordered persona entries into a fenced persona.md document and
// ABOUTME: parses fenced documents back into per-(card,entry) sections for diff and checkpoint.

export interface PersonaEntryContent {
  entry: string;
  content: string;
}

export interface OrderedCardPersona {
  card: string;
  entries: PersonaEntryContent[];
}

export interface PersonaSection {
  card: string;
  entry: string;
  content: string;
}

export interface ParsedPersona {
  sections: PersonaSection[];
  outsideFences: string[];
}

function startFence(card: string, entry: string) {
  return `<!-- drwn:persona:start card="${card}" entry="${entry}" -->`;
}

function endFence(card: string, entry: string) {
  return `<!-- drwn:persona:end card="${card}" entry="${entry}" -->`;
}

export function composePersona(cards: OrderedCardPersona[]): string | null {
  const blocks: string[] = [];
  for (const card of cards) {
    for (const { entry, content } of card.entries) {
      blocks.push(`${startFence(card.card, entry)}\n${content}${endFence(card.card, entry)}`);
    }
  }
  if (blocks.length === 0) {
    return null;
  }
  return `${blocks.join("\n\n")}\n`;
}

const START_FENCE_PATTERN = /<!-- drwn:persona:start card="([^"]+)" entry="([^"]+)" -->\n/g;

export function parsePersona(document: string): ParsedPersona {
  const sections: PersonaSection[] = [];
  const outsideFences: string[] = [];
  let cursor = 0;
  START_FENCE_PATTERN.lastIndex = 0;
  for (let match = START_FENCE_PATTERN.exec(document); match !== null; match = START_FENCE_PATTERN.exec(document)) {
    const [, card, entry] = match;
    const between = document.slice(cursor, match.index);
    if (between.trim().length > 0) {
      outsideFences.push(between.trim());
    }
    const contentStart = match.index + match[0].length;
    const close = endFence(card!, entry!);
    const closeIndex = document.indexOf(close, contentStart);
    if (closeIndex === -1) {
      outsideFences.push(document.slice(match.index).trim());
      cursor = document.length;
      break;
    }
    sections.push({ card: card!, entry: entry!, content: document.slice(contentStart, closeIndex) });
    cursor = closeIndex + close.length;
    START_FENCE_PATTERN.lastIndex = cursor;
  }
  const tail = document.slice(cursor);
  if (tail.trim().length > 0) {
    outsideFences.push(tail.trim());
  }
  return { sections, outsideFences };
}
