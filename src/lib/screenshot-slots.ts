const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)]; };
function clusters(values: number[], tolerance: number) {
    const groups: number[][] = [];
    for (const value of [...values].sort((a, b) => a - b)) {
        const last = groups.at(-1);
        if (last && value - median(last) < tolerance)
            last.push(value);
        else
            groups.push([value]);
    }
    return groups.map(median);
}
export type SlotRect = {
    x: number;
    y: number;
    size: number;
    row: number;
    col: number;
};
export type SlotPanel = {
    slots: SlotRect[];
    columns: number;
    rows: number;
    score: number;
    firstY: number;
    left: number;
    step: number;
};
/** Coordinates are in the supplied (at most 2000px per side) raster, never screen coordinates. */
export function detectSlots(image: {
    width: number;
    height: number;
    data: Uint8ClampedArray;
}) {
    const { width, height, data: pixels } = image;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2000 || height > 2000 || !(pixels instanceof Uint8ClampedArray) || pixels.length !== width * height * 4)
        throw new Error('Invalid screenshot detection raster.');
    const scale = 1, gray = new Float32Array(width * height);
    for (let i = 0; i < gray.length; i++)
        gray[i] = pixels[i * 4] * .299 + pixels[i * 4 + 1] * .587 + pixels[i * 4 + 2] * .114;
    const segments = [];
    for (let y = 3; y < height - 3; y++) {
        let x = 0;
        const edge = (x: number) => Math.abs(gray[(y + 2) * width + x] - gray[(y - 2) * width + x]) > 12;
        while (x < width) {
            if (!edge(x)) {
                x++;
                continue;
            }
            const start = x;
            let last = x, gap = 0;
            while (x < width && gap <= 2) {
                if (edge(x)) {
                    last = x;
                    gap = 0;
                }
                else
                    gap++;
                x++;
            }
            if (last - start > 28 && last - start < 400)
                segments.push({ x: start, end: last, y, w: last - start });
        }
    }
    if (segments.length > 100000)
        throw new Error('Screenshot has too many edges to identify an inventory grid. Crop to the inventory panels.');
    const candidates = [];
    let comparisons = 0;
    for (let i = 0; i < segments.length; i++) {
        const top = segments[i];
        for (let j = i + 1; j < segments.length; j++) {
            if (++comparisons > 5_000_000 || candidates.length > 4096)
                throw new Error('Screenshot is too visually complex to identify a reliable inventory grid. Crop to the inventory panels.');
            const bottom = segments[j], h = bottom.y - top.y;
            if (h > top.w * 1.12)
                break;
            if (Math.abs(h - top.w) > top.w * .09 || Math.abs(bottom.x - top.x) > 4 || Math.abs(bottom.end - top.end) > 4)
                continue;
            let valid = true;
            for (const x of [top.x, top.end]) {
                if (x < 3 || x + 8 >= width) {
                    valid = false;
                    break;
                }
                let edges = 0, total = 0;
                for (let y = top.y + 5; y < bottom.y - 5; y++) {
                    let gradient = 0;
                    for (let dx = -3; dx <= 3; dx++)
                        gradient = Math.max(gradient, Math.abs(gray[y * width + x + dx] - gray[y * width + x + dx + 4]));
                    if (gradient > 10)
                        edges++;
                    total++;
                }
                if (edges / total < .65) {
                    valid = false;
                    break;
                }
            }
            if (valid)
                candidates.push({ x: top.x, y: top.y, w: top.w, h });
        }
    }
    const groups: {
        x: number;
        y: number;
        w: number;
        h: number;
    }[][] = [];
    for (const c of candidates) {
        const group = groups.find(g => { const a = g[0]; return Math.abs(c.x + c.w / 2 - a.x - a.w / 2) < c.w * .25 && Math.abs(c.y + c.h / 2 - a.y - a.h / 2) < c.h * .25 && Math.abs(c.w - a.w) < c.w * .2; });
        if (group)
            group.push(c);
        else
            groups.push([c]);
    }
    const rects = groups.map(g => ({ x: median(g.map(r => r.x)), y: median(g.map(r => r.y)), w: median(g.map(r => r.w)), h: median(g.map(r => r.h)) }));
    if (!rects.length)
        return { panels: [], diagnostics: { segments: segments.length, rects: 0 } };
    // Repeated same-size frames dominate a real inventory grid, unlike item details or scene texture.
    const cohort = rects.map(r => rects.filter(c => Math.abs(c.w - r.w) < r.w * .12)).sort((a, b) => b.length - a.length)[0];
    const tile = median(cohort.map(r => r.w));
    const neighbors = [];
    for (const a of cohort)
        for (const b of cohort) {
            const dx = b.x + b.w / 2 - a.x - a.w / 2, dy = b.y + b.h / 2 - a.y - a.h / 2;
            if (Math.abs(dy) < tile * .12 && dx > tile * .96 && dx < tile * 1.25)
                neighbors.push(dx);
        }
    if (!neighbors.length)
        return { panels: [], diagnostics: { segments: segments.length, rects: rects.length } };
    const step = median(neighbors), size = step * .94;
    const columns = clusters(cohort.map(r => r.x + r.w / 2), step * .2), panels: SlotPanel[] = [];
    const columnGroups: number[][] = [];
    for (const x of columns) {
        const last = columnGroups.at(-1);
        if (last && x - last[last.length - 1] < step * 1.5)
            last.push(x);
        else
            columnGroups.push([x]);
    }
    for (const columnGroup of columnGroups) {
        if (columnGroup.length < 3 || columnGroup.length > 12)
            continue;
        const members = cohort.filter(r => columnGroup.some(x => Math.abs(x - r.x - r.w / 2) < step * .2));
        const rows = clusters(members.map(r => r.y + r.h / 2), step * .25);
        if (rows.length < 2 || members.length < columnGroup.length * 1.5)
            continue;
        // Refine the shared row phase against actual dark frame borders, independently per panel.
        const firstGuess = rows[0] - size / 2, lastCenter = rows[rows.length - 1];
        let bestTop = firstGuess, bestScore = -Infinity;
        for (let offset = -Math.ceil(step * .08); offset <= Math.ceil(step * .08); offset++) {
            const first = firstGuess + offset;
            let score = 0, n = 0;
            const sample = (y: number, x0: number, x1: number) => { let sum = 0, count = 0; for (let x = Math.ceil(x0); x < x1; x++) {
                sum += gray[Math.round(y) * width + x];
                count++;
            } return sum / count; };
            for (let y = first; y + size < height && y < lastCenter; y += step) {
                if (y < 3)
                    continue;
                for (const center of columnGroup) {
                    const left = center - size / 2, x0 = left + size * .06, x1 = left + size * .94;
                    score += (sample(y + size * .07, x0, x1) + sample(y + size * .93, x0, x1) - sample(y + size * .01, x0, x1) - sample(y + size * .99, x0, x1)) / 2;
                    n++;
                }
            }
            if (n && score / n > bestScore) {
                bestScore = score / n;
                bestTop = first;
            }
        }
        const slots = [];
        for (let y = bestTop, row = 0; y + size <= height && y < lastCenter; y += step, row++)
            for (let col = 0; col < columnGroup.length; col++) {
                const x = columnGroup[col] - size / 2;
                if (x < 0 || y < 0 || x + size > width)
                    continue;
                slots.push({ x: x / scale, y: y / scale, size: size / scale, row, col });
            }
        panels.push({ slots, columns: columnGroup.length, rows: rows.length, score: bestScore, firstY: bestTop / scale, left: columnGroup[0] / scale, step: step / scale });
    }
    return { panels, diagnostics: { segments: segments.length, rects: rects.length, cohort: cohort.length, tile: tile / scale, step: step / scale } };
}
