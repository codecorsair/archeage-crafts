import type { Catalog } from './types';
import { ICON_VECTOR_LENGTH, type VisualReference } from './screenshot-references';
import { detectSlots } from './screenshot-slots';
export type RecognizedSlot = {
    id: string;
    panelId: string;
    imageName: string;
    thumbnail: string;
    /** Normalized slot crop for this import session only; never persist this image. */
    sourceImage: string;
    vector: number[];
    count: number | null;
    countUncertain: boolean;
    candidates: {
        itemId: string;
        score: number;
    }[];
    itemId: string | null;
    needsReview: boolean;
};
export type RecognizedPanel = {
    id: string;
    container: 'bag' | 'storage' | null;
    slots: RecognizedSlot[];
};
const canvas = (width: number, height = width) => { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; };
function context(c: HTMLCanvasElement) { const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx)
    throw new Error('Canvas is unavailable in this browser.'); return ctx; }
function checkAbort(signal?: AbortSignal) { signal?.throwIfAborted(); }
async function yieldRow(signal?: AbortSignal) { await new Promise<void>(resolve => setTimeout(resolve, 0)); checkAbort(signal); }
async function loadImage(url: string, signal?: AbortSignal): Promise<HTMLImageElement> {
    checkAbort(signal);
    return new Promise((resolve, reject) => {
        const image = new Image();
        const cleanup = () => { image.onload = null; image.onerror = null; signal?.removeEventListener('abort', abort); };
        const abort = () => { cleanup(); image.src = ''; reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')); };
        image.onload = () => { cleanup(); resolve(image); };
        image.onerror = () => { cleanup(); reject(new Error('Unable to decode image. Use a valid PNG, JPEG or WebP image.')); };
        signal?.addEventListener('abort', abort, { once: true });
        image.src = url;
    });
}
function descriptor(source: CanvasImageSource, x: number, y: number, size: number) {
    const c = canvas(24), ctx = context(c);
    ctx.drawImage(source, x, y, size, size, 0, 0, 24, 24);
    const rgba = ctx.getImageData(0, 0, 24, 24).data;
    const values = new Float32Array(24 * 24 * 3);
    // Remove slowly varying background/grade glow while retaining icon texture and color.
    for (let yy = 0; yy < 24; yy++)
        for (let xx = 0; xx < 24; xx++)
            for (let k = 0; k < 3; k++) {
                let sum = 0, n = 0;
                for (let dy = -3; dy <= 3; dy++)
                    for (let dx = -3; dx <= 3; dx++) {
                        const nx = xx + dx, ny = yy + dy;
                        if (nx >= 0 && nx < 24 && ny >= 0 && ny < 24) {
                            sum += rgba[(ny * 24 + nx) * 4 + k];
                            n++;
                        }
                    }
                values[(yy * 24 + xx) * 3 + k] = rgba[(yy * 24 + xx) * 4 + k] - sum / n;
            }
    // Quantity text is not part of item identity; ignore its lower-right area.
    for (let yy = 17; yy < 24; yy++)
        for (let xx = 11; xx < 24; xx++)
            for (let k = 0; k < 3; k++)
                values[(yy * 24 + xx) * 3 + k] = 0;
    let norm = Math.hypot(...values);
    return Array.from(values, v => v / (norm || 1));
}
const dot = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
function bounds(data: ArrayLike<number>, w: number, h: number) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++)
            if (data[y * w + x]) {
                x0 = Math.min(x0, x);
                y0 = Math.min(y0, y);
                x1 = Math.max(x1, x);
                y1 = Math.max(y1, y);
            }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
function normalize(data: ArrayLike<number>, w: number, h: number, b: {
    x: number;
    y: number;
    w: number;
    h: number;
}) {
    const out = new Float32Array(16 * 24);
    for (let y = 0; y < 24; y++)
        for (let x = 0; x < 16; x++)
            out[y * 16 + x] = data[Math.min(h - 1, b.y + Math.floor(y * b.h / 24)) * w + Math.min(w - 1, b.x + Math.floor(x * b.w / 16))];
    return out;
}
type Digit = {
    d: number;
    vector: Float32Array;
};
let digitTemplates: Digit[] | undefined;
function getDigits() {
    if (digitTemplates)
        return digitTemplates;
    const digits: Digit[] = [];
    for (const font of ['Arial', 'Roboto', 'sans-serif', 'Tahoma'])
        for (const weight of ['normal', 'bold'])
            for (let d = 0; d < 10; d++) {
                const c = canvas(50, 60), ctx = context(c);
                ctx.font = `${weight} 38px ${font}`;
                ctx.fillStyle = 'white';
                ctx.fillText(String(d), 5, 45);
                const rgba = ctx.getImageData(0, 0, 50, 60).data, data = Array.from({ length: 3000 }, (_, i) => rgba[i * 4 + 3] > 140 ? 1 : 0), b = bounds(data, 50, 60);
                digits.push({ d, vector: normalize(data, 50, 60, b!) });
            }
    digitTemplates = digits;
    return digits;
}
function readQuantity(slot: HTMLCanvasElement) {
    const digits = getDigits();
    const c = canvas(90, 42), ctx = context(c);
    ctx.drawImage(slot, slot.width * .43, slot.height * .73, slot.width * .55, slot.height * .25, 0, 0, 90, 42);
    const rgba = ctx.getImageData(0, 0, 90, 42).data;
    const data: number[] = Array.from({ length: 90 * 42 }, (_, i) => { const [r, g, b] = rgba.slice(i * 4, i * 4 + 3); return Math.min(r, g, b) > 120 && Math.max(r, g, b) - Math.min(r, g, b) < 45 ? 1 : 0; });
    // Keep only connected white components reaching the quantity baseline.
    // Bright icon fragments above the text must not become leading digits.
    const visited = new Uint8Array(data.length), clean = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        if (!data[i] || visited[i])
            continue;
        const queue = [i];
        visited[i] = 1;
        let minY = 42, maxY = 0;
        for (let q = 0; q < queue.length; q++) {
            const index = queue[q], x = index % 90, y = Math.floor(index / 90);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy, next = ny * 90 + nx;
                    if (nx >= 0 && nx < 90 && ny >= 0 && ny < 42 && data[next] && !visited[next]) {
                        visited[next] = 1;
                        queue.push(next);
                    }
                }
        }
        if (maxY >= 32 && maxY - minY >= 12)
            for (const index of queue)
                clean[index] = 1;
    }
    for (let i = 0; i < data.length; i++)
        data[i] = clean[i];
    const spans = [];
    let start = -1;
    for (let x = 0; x <= 90; x++) {
        const present = x < 90 && Array.from({ length: 42 }, (_, y) => data[y * 90 + x]).reduce((a, b) => a + b, 0) >= 2;
        if (present && start < 0)
            start = x;
        if (!present && start >= 0) {
            if (x - start >= 2)
                spans.push([start, x]);
            start = -1;
        }
    }
    const recognized = [];
    for (const [x0, x1] of spans) {
        const part = data.map((v, i) => i % 90 >= x0 && i % 90 < x1 ? v : 0), b = bounds(part, 90, 42);
        if (!b || b.h < 12)
            continue;
        const v = normalize(part, 90, 42, b);
        const ranked = digits.map(t => ({ ...t, error: t.vector.reduce((sum, a, i) => sum + Math.abs(a - v[i]), 0) / v.length })).sort((a, b) => a.error - b.error);
        recognized.push(ranked[0]);
    }
    return { text: recognized.map(r => r.d).join(''), error: Math.max(0, ...recognized.map(r => r.error)) };
}
type Template = {
    vector: number[];
    itemIds: string[];
    kind: 'bundled' | 'learned';
};
/** Rank artwork across crop scales, keeping alternate references from competing with themselves. */
function colorProfile(vector: readonly number[]) {
    const channels = [0, 0, 0];
    for (let index = 0; index < vector.length; index++)
        channels[index % 3] += Math.max(0, vector[index]);
    const total = channels[0] + channels[1] + channels[2];
    return channels.map(channel => total ? channel / total : 0);
}
export function rankScreenshotArtwork(vectors: readonly number[][], templates: readonly Template[], learnedVectors: readonly number[][] = vectors) {
    const scores = new Map<string, number>();
    let bestTemplate: Template | undefined, bestScore = -Infinity;
    for (const template of templates) {
        const referenceColor = template.kind === 'learned' ? colorProfile(template.vector) : null;
        for (const vector of template.kind === 'learned' ? learnedVectors : vectors) {
            if (referenceColor) {
                const color = colorProfile(vector);
                if (color.some((channel, index) => Math.abs(channel - referenceColor[index]) > .05))
                    continue;
            }
            const score = dot(vector, template.vector);
            // Screenshot references need a near-exact match, not just a similar silhouette.
            // Rejected references must not influence either candidates or the review margin.
            if (template.kind === 'learned' && score < .90)
                continue;
            if (score > bestScore) {
                bestScore = score;
                bestTemplate = template;
            }
            for (const itemId of template.itemIds)
                scores.set(itemId, Math.max(scores.get(itemId) ?? -Infinity, score));
        }
    }
    return {
        candidates: Array.from(scores, ([itemId, score]) => ({ itemId, score })).sort((a, b) => b.score - a.score),
        ambiguous: (bestTemplate?.itemIds.length ?? 0) > 1,
    };
}
function slotArtwork(slot: HTMLCanvasElement, templates: readonly Template[], signal?: AbortSignal) {
    checkAbort(signal);
    const vectors = [.78, .84, .9].map(crop => {
        const size = 154 * crop, pad = (154 - size) / 2;
        return descriptor(slot, pad, pad, size);
    });
    // Small pixel-phase differences between panel columns must not defeat saved artwork.
    // Extra descriptors compete only with learned references, never bundled templates.
    const learnedVectors = [...vectors];
    if (templates.some(template => template.kind === 'learned')) {
        const size = 154 * .84, pad = (154 - size) / 2;
        const coarse = [];
        for (const dx of [-4, -2, 0, 2, 4])
            for (const dy of [-4, -2, 0, 2, 4]) {
                const vector = descriptor(slot, pad + dx, pad + dy, size);
                coarse.push({ dx, dy, vector });
                learnedVectors.push(vector);
            }
        // Refine only promising references. Half-pixel sampling matters after image scaling:
        // exact Chrome crops need a (2, .5) shift for the supplied second-panel Gnoll Fur.
        const refined = new Set<string>();
        for (const template of templates.filter(template => template.kind === 'learned')) {
            const best = coarse.reduce((best, candidate) => dot(candidate.vector, template.vector) > dot(best.vector, template.vector) ? candidate : best);
            const score = dot(best.vector, template.vector);
            if (score < .6 || score >= .90)
                continue;
            for (const dx of [-1, -.5, 0, .5, 1])
                for (const dy of [-1, -.5, 0, .5, 1]) {
                    const x = best.dx + dx, y = best.dy + dy, key = `${x}:${y}`;
                    if (refined.has(key))
                        continue;
                    refined.add(key);
                    learnedVectors.push(descriptor(slot, pad + x, pad + y, size));
                }
        }
    }
    checkAbort(signal);
    return rankScreenshotArtwork(vectors, templates, learnedVectors);
}
/** Match runtime-only normalized PNG crops without fetching assets or reading quantities. */
export async function matchScreenshotReferences(sourceImage: string, references: readonly VisualReference[], signal?: AbortSignal): Promise<string | null> {
    checkAbort(signal);
    // Check the PNG signature and IHDR before decoding so even compressed oversized images
    // cannot allocate an unreasonable raster. Only our normalized 154px crops are accepted.
    const prefix = 'data:image/png;base64,';
    if (!sourceImage.startsWith(prefix) || sourceImage.length > 256 * 1024)
        throw new Error('Expected a locally generated normalized slot PNG.');
    const encoded = sourceImage.slice(prefix.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
        throw new Error('Invalid slot PNG encoding.');
    const header = Uint8Array.from(atob(encoded.slice(0, 44)), char => char.charCodeAt(0));
    const signature = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    if (header.length < 24 || signature.some((byte, index) => header[index] !== byte))
        throw new Error('Invalid slot PNG header.');
    const dimensions = new DataView(header.buffer);
    if (dimensions.getUint32(16) !== 154 || dimensions.getUint32(20) !== 154)
        throw new Error('Slot PNG must be normalized to 154 × 154 pixels.');
    const templates: Template[] = references
        .filter(ref => ref.vector.length === ICON_VECTOR_LENGTH && ref.vector.every(Number.isFinite))
        .map(ref => ({ itemIds: [ref.itemId], vector: ref.vector, kind: 'learned' }));
    if (!templates.length)
        return null;
    const image = await loadImage(sourceImage, signal);
    checkAbort(signal);
    if (image.naturalWidth !== 154 || image.naturalHeight !== 154)
        throw new Error('Slot PNG must be normalized to 154 × 154 pixels.');
    const slot = canvas(154);
    context(slot).drawImage(image, 0, 0);
    const { candidates, ambiguous } = slotArtwork(slot, templates, signal);
    const best = candidates[0];
    return best && !ambiguous && best.score >= .90 && best.score - (candidates[1]?.score ?? -1) >= .04 ? best.itemId : null;
}
async function loadTemplates(catalog: Catalog, learned: readonly VisualReference[], signal?: AbortSignal) {
    const byIcon = new Map<string, string[]>();
    for (const item of catalog.items) {
        if (!item.icon)
            continue;
        const ids = byIcon.get(item.icon) ?? [];
        ids.push(item.id);
        byIcon.set(item.icon, ids);
    }
    const templates: Template[] = [];
    // Sequential loading bounds decoded image memory and observes cancellation between assets.
    for (const [icon, itemIds] of byIcon) {
        checkAbort(signal);
        const base = new URL(import.meta.env.BASE_URL, window.location.href);
        const url = new URL(`icons/${icon}`, base);
        if (url.origin !== window.location.origin || !url.pathname.startsWith(new URL('icons/', base).pathname))
            throw new Error('Catalog icon must be a bundled same-origin image.');
        const response = await fetch(url, { signal, redirect: 'error' });
        if (!response.ok)
            throw new Error(`Could not load bundled icon ${icon}.`);
        const blob = await response.blob(), objectUrl = URL.createObjectURL(blob);
        try {
            const im = await loadImage(objectUrl, signal), c = canvas(128), ctx = context(c);
            ctx.fillStyle = '#171717';
            ctx.fillRect(0, 0, 128, 128);
            ctx.drawImage(im, 0, 0, 128, 128);
            templates.push({ itemIds, vector: descriptor(c, 0, 0, 128), kind: 'bundled' });
        }
        finally {
            URL.revokeObjectURL(objectUrl);
        }
    }
    const ids = new Set(catalog.items.map(item => item.id));
    for (const ref of learned)
        if (ids.has(ref.itemId) && ref.vector.length === ICON_VECTOR_LENGTH)
            templates.push({ itemIds: [ref.itemId], vector: ref.vector, kind: 'learned' });
    if (!templates.length)
        throw new Error('No catalog icon templates are available.');
    checkAbort(signal);
    return templates;
}
/** Local-only recognition. Nothing is persisted or written to inventory here. */
export async function analyzeScreenshot(file: File, catalog: Catalog, learned: readonly VisualReference[], signal?: AbortSignal): Promise<{
    panels: RecognizedPanel[];
    warnings: string[];
}> {
    checkAbort(signal);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type))
        throw new Error('Choose a PNG, JPEG or WebP screenshot.');
    if (file.size === 0 || file.size > 32 * 1024 * 1024)
        throw new Error('Screenshot must be nonempty and no larger than 32 MB.');
    // Verify file magic as well as MIME, so SVG and other active image formats cannot enter decoding.
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    checkAbort(signal);
    const png = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
    const jpeg = header[0] === 255 && header[1] === 216 && header[2] === 255;
    const webp = String.fromCharCode(...header.slice(0, 4)) === 'RIFF' && String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
    if (!(file.type === 'image/png' ? png : file.type === 'image/jpeg' ? jpeg : webp))
        throw new Error('Screenshot contents do not match its image format.');
    const objectUrl = URL.createObjectURL(file);
    try {
        const image = await loadImage(objectUrl, signal);
        checkAbort(signal);
        if (image.naturalWidth * image.naturalHeight > 32000000)
            throw new Error('Screenshot exceeds the 32 million decoded pixel limit.');
        const scale = Math.min(1, 2000 / image.naturalWidth, 2000 / image.naturalHeight);
        const raster = canvas(Math.round(image.naturalWidth * scale), Math.round(image.naturalHeight * scale));
        const ctx = context(raster);
        ctx.drawImage(image, 0, 0, raster.width, raster.height);
        await yieldRow(signal);
        const detection = detectSlots(ctx.getImageData(0, 0, raster.width, raster.height));
        if (!detection.panels.length)
            throw new Error('No complete inventory grid found. Include at least two full rows and three columns, with visible slot borders.');
        const templates = await loadTemplates(catalog, learned, signal);
        const warnings = ['Only complete detected rows are included. Clipped rows are excluded; screenshot completeness is not guaranteed.'];
        // Real screenshot checks show quantity mistakes at ~55px native pitch, despite readable icons.
        const lowResolution = detection.panels.some(panel => panel.step / scale < 75);
        if (lowResolution)
            warnings.push('Low-resolution quantity text requires manual review.');
        const panels: RecognizedPanel[] = [];
        for (const [panelIndex, panel] of detection.panels.entries()) {
            const panelId = `panel-${panelIndex + 1}`;
            const result: RecognizedPanel = { id: panelId, container: detection.panels.length === 2 ? (panelIndex === 0 ? 'bag' : 'storage') : null, slots: [] };
            let previousRow = -1;
            for (const rect of panel.slots) {
                if (rect.row !== previousRow) {
                    await yieldRow(signal);
                    previousRow = rect.row;
                }
                const slot = canvas(154), slotCtx = context(slot);
                slotCtx.drawImage(image, rect.x / scale, rect.y / scale, rect.size / scale, rect.size / scale, 0, 0, 154, 154);
                const pixels = slotCtx.getImageData(0, 0, 154, 154).data;
                let sum = 0, squares = 0;
                for (let i = 0; i < pixels.length; i += 4) {
                    const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
                    sum += value;
                    squares += value * value;
                }
                const n = pixels.length / 4;
                if (Math.sqrt(Math.max(0, squares / n - (sum / n) ** 2)) < 18)
                    continue;
                const { candidates: ranked, ambiguous } = slotArtwork(slot, templates, signal);
                const best = ranked[0], confidence = best?.score ?? -1;
                const margin = confidence - (ranked[1]?.score ?? -1);
                const qty = readQuantity(slot), parsed = Number(qty.text);
                const count = qty.text && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
                const countUncertain = count === null || qty.error > .23 || lowResolution;
                const thumb = canvas(64);
                context(thumb).drawImage(slot, 0, 0, 64, 64);
                const size = 154 * .84, pad = (154 - size) / 2;
                result.slots.push({ id: `${panelId}-${rect.row}-${rect.col}`, panelId, imageName: file.name, thumbnail: thumb.toDataURL('image/png'), sourceImage: slot.toDataURL('image/png'), vector: descriptor(slot, pad, pad, size), count, countUncertain, candidates: ranked.slice(0, 5), itemId: confidence < .42 || ambiguous ? null : best.itemId, needsReview: confidence < .42 || margin < .04 || ambiguous || countUncertain });
            }
            panels.push(result);
        }
        if (!panels.some(panel => panel.slots.length))
            throw new Error('No occupied slots could be read. An empty or unreadable screenshot cannot replace inventory.');
        checkAbort(signal);
        return { panels, warnings };
    }
    finally {
        URL.revokeObjectURL(objectUrl);
    }
}
