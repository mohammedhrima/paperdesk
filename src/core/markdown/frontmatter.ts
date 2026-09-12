import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const FENCE = '---';

export interface SplitDocument {
  /** Parsed YAML frontmatter, or an empty object when the file has none. */
  readonly data: Record<string, unknown>;
  /** Everything after the closing fence. */
  readonly body: string;
}

/**
 * Separates a leading YAML frontmatter block from the Markdown that follows.
 *
 * Malformed or unparseable frontmatter is treated as ordinary content rather
 * than an error: a note is a user's file first, and refusing to open it would
 * be worse than showing the raw text.
 */
export function splitFrontmatter(source: string): SplitDocument {
  // Editors on Windows sometimes prefix files with a byte-order mark.
  const normalized = source.replace(/^\uFEFF/, '');
  if (!normalized.startsWith(`${FENCE}\n`) && !normalized.startsWith(`${FENCE}\r\n`)) {
    return { data: {}, body: normalized };
  }

  const closing = normalized.match(/\r?\n---[ \t]*(\r?\n|$)/);
  if (!closing?.index) return { data: {}, body: normalized };

  const rawYaml = normalized.slice(normalized.indexOf('\n') + 1, closing.index);
  const body = normalized.slice(closing.index + closing[0].length);

  try {
    const data: unknown = parseYaml(rawYaml);
    const isPlainObject = typeof data === 'object' && data !== null && !Array.isArray(data);
    return { data: isPlainObject ? (data as Record<string, unknown>) : {}, body };
  } catch {
    return { data: {}, body: normalized };
  }
}

/**
 * Renders a frontmatter block, or an empty string when there is nothing to
 * record. Keys with `undefined` values are dropped rather than serialized.
 */
export function renderFrontmatter(data: Record<string, unknown>): string {
  const entries = Object.entries(data).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return '';

  const yaml = stringifyYaml(Object.fromEntries(entries), { lineWidth: 0 }).trimEnd();
  return `${FENCE}\n${yaml}\n${FENCE}\n`;
}
