export const SCREENSHOT_REFERENCES_KEY = 'archeage-craft.screenshot-references.v1';
export const ICON_VECTOR_LENGTH = 24 * 24 * 3;
export const MAX_VISUAL_REFERENCES = 64;
const MAX_REFERENCE_CHARS = 2_000_000;

export type VisualReference = {
  itemId: string;
  vector: number[];
  thumbnail: string;
};

/** Learned artwork is separate from stock. Corrupt caches must not be silently overwritten. */
export function parseVisualReferences(value: string | null, validIds: ReadonlySet<string>): VisualReference[] {
  if (value === null) return [];
  if (value.length > MAX_REFERENCE_CHARS) throw new Error('Saved icon references exceed the size limit.');
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 1 || !('references' in parsed) || !Array.isArray(parsed.references) || parsed.references.length > MAX_VISUAL_REFERENCES) {
    throw new Error('Invalid saved icon references.');
  }
  const seen = new Set<string>();
  return parsed.references.map((reference: unknown) => {
    if (!reference || typeof reference !== 'object' || !('itemId' in reference) || typeof reference.itemId !== 'string' || !validIds.has(reference.itemId) || seen.has(reference.itemId) || !('vector' in reference) || !Array.isArray(reference.vector) || reference.vector.length !== ICON_VECTOR_LENGTH || reference.vector.some((value: unknown) => typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1) || !('thumbnail' in reference) || typeof reference.thumbnail !== 'string' || reference.thumbnail.length > 24_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(reference.thumbnail)) {
      throw new Error('Invalid saved icon reference.');
    }
    const vector: number[] = reference.vector;
    const norm = Math.hypot(...vector);
    if (norm < 0.9 || norm > 1.1) throw new Error('Invalid saved icon reference vector.');
    seen.add(reference.itemId);
    return { itemId: reference.itemId, vector, thumbnail: reference.thumbnail };
  });
}

export function serializeVisualReferences(references: readonly VisualReference[], validIds: ReadonlySet<string>): string {
  const value = JSON.stringify({ version: 1, references });
  parseVisualReferences(value, validIds);
  return value;
}

/** Keep one corrected in-game icon per item; retain the bundled artwork as an alternate. */
export function rememberVisualReference(references: readonly VisualReference[], reference: VisualReference): VisualReference[] {
  const next = references.filter((entry) => entry.itemId !== reference.itemId);
  if (next.length >= MAX_VISUAL_REFERENCES) throw new Error(`At most ${MAX_VISUAL_REFERENCES} corrected icons can be remembered. Remove a reference before adding another.`);
  return [...next, reference];
}
