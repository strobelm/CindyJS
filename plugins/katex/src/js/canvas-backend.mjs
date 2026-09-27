/**
 * Canvas backend for KaTeX.
 *
 * KaTeX lays formulas out as a tree of spans (`katex.__renderToHTMLTree`)
 * whose final geometry is determined by the browser's CSS engine together
 * with `katex.css`. This module re-implements the small subset of CSS that
 * KaTeX's output relies on, so the same tree can be drawn onto a 2D canvas.
 *
 * Most of the geometry is already explicit in the tree: glyph metrics, the
 * vertical offsets inside vlists (`top`, pstrut heights), glue as margins,
 * rule thicknesses as border widths, font sizes as `katex-sizing` classes.
 * What is left for us is the horizontal flow (widths come from measuring the
 * glyphs with the canvas' own `measureText`), text alignment inside vlists
 * and percentage widths such as fraction bars.
 *
 * Usage:
 *
 *     const tree = katex.__renderToHTMLTree(tex, options);
 *     const box = layout(tree, ctx, { fontSize: 24 });
 *     // ... make sure every font in box.fonts is loaded, then
 *     render(ctx, box, x, baselineY);
 *
 * `layout` only uses `ctx` for `measureText`; it saves and restores the
 * context state. Coordinates in the box are CSS pixels relative to the left
 * end of the formula's baseline, with y pointing down.
 */

// Font-size ratios of KaTeX's sizing classes (`reset-sizeN` / `sizeN`).
const SIZES = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.44, 1.728, 2.074, 2.488];

// Font properties set by classes, in the order of katex.scss, so that later
// rules override earlier ones just like the CSS cascade does for rules of
// equal specificity.
const FONT_CLASSES = [
    [["textbf"], { weight: "bold" }],
    [["textit"], { style: "italic" }],
    [["textrm"], { family: "KaTeX_Main" }],
    [["textsf"], { family: "KaTeX_SansSerif" }],
    [["texttt"], { family: "KaTeX_Typewriter" }],
    [["mathnormal"], { family: "KaTeX_Math", style: "italic" }],
    [["mathit"], { family: "KaTeX_Main", style: "italic" }],
    [["mathrm"], { style: "normal" }],
    [["mathbf"], { family: "KaTeX_Main", weight: "bold" }],
    [["boldsymbol"], { family: "KaTeX_Math", weight: "bold", style: "italic" }],
    [["amsrm"], { family: "KaTeX_AMS" }],
    [["mathbb", "textbb"], { family: "KaTeX_AMS" }],
    [["mathcal"], { family: "KaTeX_Caligraphic" }],
    [["mathfrak", "textfrak"], { family: "KaTeX_Fraktur" }],
    [["mathboldfrak", "textboldfrak"], { family: "KaTeX_Fraktur", weight: "bold" }],
    [["mathtt"], { family: "KaTeX_Typewriter" }],
    [["mathscr", "textscr"], { family: "KaTeX_Script" }],
    [["mathsf", "textsf"], { family: "KaTeX_SansSerif" }],
    [["mathboldsf", "textboldsf"], { family: "KaTeX_SansSerif", weight: "bold" }],
    [["mathsfit", "mathitsf", "textitsf"], { family: "KaTeX_SansSerif", style: "italic" }],
    [["mainrm"], { family: "KaTeX_Main", style: "normal" }],
];

// Horizontal padding and margins that katex.scss attaches to classes (in em).
const CLASS_BOX = {
    "x-arrow-pad": { paddingLeft: 0.5, paddingRight: 0.5 },
    "cd-arrow-pad": { paddingLeft: 0.55556, paddingRight: 0.27778 },
    boxpad: { paddingLeft: 0.3, paddingRight: 0.3 },
    "cancel-pad": { paddingLeft: 0.2, paddingRight: 0.2 },
    "cancel-lap": { marginLeft: -0.2, marginRight: -0.2 },
    anglpad: { paddingLeft: 0.03889, paddingRight: 0.03889 },
    angl: { marginRight: 0.03889 },
};

// Classes whose rendering needs features this backend does not implement
// yet. The nodes are skipped and reported in `box.unsupported`.
const UNSUPPORTED_CLASSES = new Set([
    "hide-tail",
    "katex-stretchy",
    "halfarrow-left",
    "halfarrow-right",
    "brace-left",
    "brace-center",
    "brace-right",
    "katex-tag",
    "katex-newline",
    "reflectbox",
    "fbox",
    "fcolorbox",
    "angl",
    "katex-hdashline",
    "cd-vert-arrow",
    "cd-label-left",
    "cd-label-right",
]);

// Elements with `display: inline-block` in katex.scss. Everything else
// that is not a vlist table is an inline span.
const INLINE_BLOCK_CLASSES = new Set([
    "katex-base",
    "katex-strut",
    "frac-line",
    "overline-line",
    "underline-line",
    "katex-hline",
    "mspace",
    "katex-rule",
    "nulldelimiter",
    "vertical-separator",
    "arraycolsep",
]);

// Rules that are drawn as a bottom border across their full width.
const LINE_CLASSES = new Set(["frac-line", "overline-line", "underline-line", "katex-hline"]);

// katex.scss also gives rules `min-height: 1px` to keep Chrome from dropping
// them. That makes \rule one pixel taller than TeX would, so it is only
// emulated along with the other pixel-level browser behaviour (pixelRatio).
const MIN_HEIGHT_CLASSES = new Set([
    "frac-line",
    "overline-line",
    "underline-line",
    "katex-hline",
    "katex-hdashline",
    "katex-rule",
]);

// Box drawing ops. All coordinates are relative to the box origin, which is
// the left end of its baseline.
//   { type: "text", x, y, text, font, color, shadow }  (shadow: {dx, dy} or null)
//   { type: "rect", x, y, w, h, color, edge }  (a filled rule or background;
//        `edge` names the side a border belongs to, for pixel snapping)

const parsedStyles = new WeakMap();

/**
 * The inline style of a node: its `style` object merged with a `style`
 * attribute, which is where \htmlStyle puts its CSS text.
 */
function styleOf(node) {
    const attr = node.attributes && node.attributes.style;
    if (!attr) return node.style || {};
    let style = parsedStyles.get(node);
    if (!style) {
        style = Object.assign({}, node.style);
        for (const decl of attr.split(";")) {
            const i = decl.indexOf(":");
            if (i < 0) continue;
            const name = decl.slice(0, i).trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            style[name] = decl.slice(i + 1).trim();
        }
        parsedStyles.set(node, style);
    }
    return style;
}

function hasClass(node, name) {
    return node.classes !== undefined && node.classes.indexOf(name) !== -1;
}

// Classifies domTree nodes by shape rather than by constructor name, which
// minifiers are free to mangle.
function kind(node) {
    if (typeof node.text === "string" && node.children === undefined) return "symbol";
    if (node.pathName !== undefined) return "path";
    if (node.src !== undefined && node.alt !== undefined) return "img";
    if (node.classes === undefined) return node.children === undefined ? "line" : "svg";
    return "span";
}

/**
 * Parses a CSS length as emitted by KaTeX. Returns pixels, or null for
 * values we cannot resolve (percentages are handled by the callers).
 */
function length(value, em) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "number") return value * em;
    const m = /^(-?[\d.]+(?:e-?\d+)?)(em|px)?$/.exec(String(value).trim());
    if (!m) return null;
    const n = parseFloat(m[1]);
    if (m[2] === "px") return n;
    if (m[2] === undefined && n !== 0) return null;
    return n * em;
}

function percentage(value) {
    const m = /^(-?[\d.]+)%$/.exec(String(value || "").trim());
    return m ? parseFloat(m[1]) / 100 : null;
}

/**
 * Computes the inherited and non-inherited style properties of a node,
 * given its parent's computed style and its ancestor chain.
 */
function computeStyle(node, parent, ancestors) {
    const cs = {
        family: parent.family,
        style: parent.style,
        weight: parent.weight,
        size: parent.size,
        color: parent.color,
        textAlign: parent.textAlign,
        multDelim: parent.multDelim,
        textShadow: parent.textShadow,
    };
    const classes = node.classes || [];
    const has = (name) => classes.indexOf(name) !== -1;

    for (const [names, props] of FONT_CLASSES) {
        if (names.some(has)) Object.assign(cs, props);
    }

    if ((has("katex-sizing") || has("fontsize-ensurer")) && classes.length > 1) {
        let from = null;
        let to = null;
        for (const c of classes) {
            let m = /^reset-size(\d+)$/.exec(c);
            if (m) from = +m[1];
            m = /^size(\d+)$/.exec(c);
            if (m) to = +m[1];
        }
        if (from !== null && to !== null) cs.size *= SIZES[to - 1] / SIZES[from - 1];
    }

    if (has("delimsizing")) {
        for (let i = 1; i <= 4; ++i) if (has("size" + i)) cs.family = "KaTeX_Size" + i;
        if (has("mult")) cs.multDelim = true;
    }
    const parentNode = ancestors[ancestors.length - 1];
    if (cs.multDelim && parentNode) {
        if (hasClass(parentNode, "delim-size1")) cs.family = "KaTeX_Size1";
        if (hasClass(parentNode, "delim-size4")) cs.family = "KaTeX_Size4";
    }
    if (has("op-symbol")) {
        if (has("small-op")) cs.family = "KaTeX_Size1";
        if (has("large-op")) cs.family = "KaTeX_Size2";
    }

    // text-align
    const grandParent = ancestors[ancestors.length - 2];
    if (has("msupsub") || has("svg-align")) cs.textAlign = 0;
    if (grandParent && hasClass(grandParent, "mfrac")) cs.textAlign = 0.5;
    if (has("vlist-t") && parentNode) {
        if (hasClass(parentNode, "op-limits") || hasClass(parentNode, "katex-accent")) cs.textAlign = 0.5;
        if (hasClass(parentNode, "col-align-c")) cs.textAlign = 0.5;
        if (hasClass(parentNode, "col-align-l")) cs.textAlign = 0;
        if (hasClass(parentNode, "col-align-r")) cs.textAlign = 1;
    }
    if (has("x-arrow") || has("mover") || has("munder")) cs.textAlign = 0.5;

    const style = styleOf(node);
    if (style.color) cs.color = style.color;

    const em = cs.size;
    if (style.textShadow) {
        // Used by \pmb. The blur (a fraction of a pixel) is ignored.
        const [dx, dy] = style.textShadow.split(/\s+/).map((v) => length(v, em));
        cs.textShadow = dx === null || dy === null ? null : { dx, dy };
    }
    const box = {
        marginLeft: 0,
        marginRight: 0,
        paddingLeft: 0,
        paddingRight: 0,
    };
    for (const c of classes) {
        const extra = CLASS_BOX[c];
        if (extra) for (const k in extra) box[k] += extra[k] * em;
    }
    if (has("katex-root") && parentNode && hasClass(parentNode, "sqrt")) {
        box.marginLeft += (5 / 18) * em;
        box.marginRight -= (10 / 18) * em;
    }
    for (const k of ["marginLeft", "marginRight", "paddingLeft", "paddingRight"]) {
        const v = length(style[k], em);
        if (v !== null) box[k] = v;
    }
    cs.box = box;
    cs.em = em;
    return cs;
}

function fontString(cs) {
    return `${cs.style || "normal"} ${cs.weight || "normal"} ${cs.size}px ${cs.family}`;
}

class Layout {
    constructor(ctx, pixelRatio) {
        this.ctx = ctx;
        this.pixelRatio = pixelRatio;
        this.fonts = new Set();
        this.unsupported = new Set();
    }

    measure(text, font) {
        this.ctx.font = font;
        return this.ctx.measureText(text).width;
    }

    /**
     * Lays out a node as part of a horizontal list. Returns a box
     * `{width, height, depth, ops, dependsOnWidth}` whose width includes the
     * node's horizontal margins; ops are relative to the box's left edge
     * (outer margin edge) on the baseline.
     *
     * `cbWidth` is the width of the containing block, used to resolve
     * percentage widths; it is null while computing intrinsic widths.
     */
    node(node, parentStyle, ancestors, cbWidth, inlineBlock) {
        switch (kind(node)) {
            case "symbol":
                return this.symbol(node, parentStyle, ancestors);
            case "span":
                return this.span(node, parentStyle, ancestors, cbWidth, inlineBlock);
            default:
                this.unsupported.add(kind(node));
                return emptyBox();
        }
    }

    symbol(node, parentStyle, ancestors) {
        const cs = computeStyle(node, parentStyle, ancestors);
        const text = node.text;
        const box = emptyBox();
        if (text === "" || text === "​") return this.decorate(box, node, cs);
        const font = fontString(cs);
        this.fonts.add(font);
        const width = this.measure(text, font);
        box.ops.push({ type: "text", x: 0, y: 0, text, font, color: cs.color, shadow: cs.textShadow });
        box.width = width + Math.max(0, node.italic || 0) * cs.em;
        // KaTeX rescales the height and depth of a node that carries sizing
        // classes to the em of its parent.
        box.height = (node.height || 0) * parentStyle.size;
        box.depth = (node.depth || 0) * parentStyle.size;
        return this.decorate(box, node, cs);
    }

    span(node, parentStyle, ancestors, cbWidth, inlineBlock) {
        for (const c of node.classes || []) {
            if (UNSUPPORTED_CLASSES.has(c)) {
                this.unsupported.add("." + c);
                return emptyBox();
            }
        }
        const cs = computeStyle(node, parentStyle, ancestors);
        const inner = ancestors.concat([node]);
        const style = styleOf(node);

        if (hasClass(node, "vlist-t")) return this.decorate(this.vlistTable(node, cs, inner), node, cs);
        if (hasClass(node, "llap") || hasClass(node, "rlap") || hasClass(node, "clap")) {
            return this.decorate(this.lap(node, cs, inner), node, cs);
        }
        if (hasClass(node, "katex-thinbox")) {
            // An inline-flex row of zero width whose content overflows.
            const box = this.hlist(node.children || [], cs, inner, 0, true);
            box.width = 0;
            box.hasLine = true;
            return this.decorate(box, node, cs);
        }

        const isInlineBlock =
            inlineBlock || INLINE_BLOCK_CLASSES.has((node.classes || []).find((c) => INLINE_BLOCK_CLASSES.has(c)));
        if (!isInlineBlock) {
            // Inline span: its children simply continue the horizontal list.
            const box = this.hlist(node.children || [], cs, inner, cbWidth);
            box.width += cs.box.paddingLeft + cs.box.paddingRight;
            shift(box, cs.box.paddingLeft, 0);
            return this.decorate(box, node, cs);
        }

        // Inline-block.
        let width = null;
        let dependsOnWidth = false;
        const pct = percentage(style.width);
        if (pct !== null || LINE_CLASSES.has(node.classes.find((c) => LINE_CLASSES.has(c)))) {
            dependsOnWidth = true;
            width = cbWidth === null ? 0 : (pct === null ? 1 : pct) * cbWidth;
        } else {
            width = length(style.width, cs.em);
        }
        if (hasClass(node, "nulldelimiter")) width = 0.12 * cs.em;
        if (hasClass(node, "accent-body") && !hasClass(node, "accent-full") && ancestors.some(isAccent)) width = 0;
        const minWidth = length(style.minWidth, cs.em);

        const content = this.hlist(node.children || [], cs, inner, width);
        dependsOnWidth = dependsOnWidth || content.dependsOnWidth;
        const contentWidth = Math.max(width === null ? content.width : width, minWidth || 0);

        const borders = {
            top: length(style.borderTopWidth, cs.em) || 0,
            right: length(style.borderRightWidth, cs.em) || 0,
            bottom: length(style.borderBottomWidth, cs.em) || 0,
            left: length(style.borderLeftWidth, cs.em) || 0,
        };
        const bw = length(style.borderWidth, cs.em);
        if (bw !== null) borders.top = borders.right = borders.bottom = borders.left = bw;
        if (hasClass(node, "katex-sout")) borders.bottom = 0.08 * cs.em;
        if (this.pixelRatio) {
            // Browsers use whole device pixels for border widths already
            // during layout.
            for (const side in borders) borders[side] = snapBorder(borders[side], this.pixelRatio);
        }

        let height = length(style.height, cs.em);
        if (this.pixelRatio && node.classes.some((c) => MIN_HEIGHT_CLASSES.has(c))) height = Math.max(height || 0, 1);

        const box = emptyBox();
        box.dependsOnWidth = dependsOnWidth;
        const left = cs.box.paddingLeft + borders.left;
        const outerWidth = left + contentWidth + cs.box.paddingRight + borders.right;
        box.width = outerWidth;
        const hasContent = content.ops.length > 0 || content.hasLine;
        if (hasContent && height === null) {
            // The baseline is that of the contained line.
            box.ops = content.ops;
            shift(box, left, 0);
            box.height = content.height + borders.top;
            box.depth = content.depth + borders.bottom;
            box.hasLine = true;
        } else {
            // No line box (or a fixed height): the bottom margin edge sits
            // on the baseline.
            const h = (height === null ? 0 : height) + borders.top + borders.bottom;
            box.height = h;
            box.depth = 0;
            if (hasContent) {
                box.ops = content.ops;
                shift(box, left, -borders.bottom);
            }
        }
        const color = cs.color;
        const bottom = hasContent && height === null ? content.depth + borders.bottom : 0;
        const top = bottom - box.height - box.depth;
        const rect = (x, y, w, h, edge, c) => {
            // Borders of an empty box are not painted.
            if (w > 0 && h > 0) box.ops.push({ type: "rect", x, y, w, h, color: c, edge });
        };
        if (style.backgroundColor) rect(0, top, outerWidth, bottom - top, null, style.backgroundColor);
        if (borders.bottom) rect(0, bottom - borders.bottom, outerWidth, borders.bottom, "bottom", color);
        if (borders.top) rect(0, top, outerWidth, borders.top, "top", color);
        if (borders.left) rect(0, top, borders.left, bottom - top, "left", color);
        if (borders.right) rect(outerWidth - borders.right, top, borders.right, bottom - top, "right", color);

        return this.decorate(box, node, cs);
    }

    /**
     * Applies the properties shared by all boxes: horizontal margins,
     * `position: relative` offsets and `vertical-align`.
     */
    decorate(box, node, cs) {
        const style = styleOf(node);
        const dy =
            -(length(style.verticalAlign, cs.em) || 0) +
            (length(style.top, cs.em) || 0) -
            (length(style.bottom, cs.em) || 0);
        const dx = length(style.left, cs.em) || 0;
        shift(box, cs.box.marginLeft + dx, dy);
        box.width += cs.box.marginLeft + cs.box.marginRight;
        return box;
    }

    hlist(children, cs, ancestors, cbWidth, inlineBlocks) {
        const box = emptyBox();
        for (const child of children) {
            const b = this.node(child, cs, ancestors, cbWidth, inlineBlocks);
            append(box, b);
        }
        return box;
    }

    /**
     * A vlist is an inline-table whose first cell contains one block per
     * item. Each block is `position: relative` with a `top` offset and holds
     * a pstrut (an inline-block of known height whose bottom lies on the
     * line's baseline) followed by the item. The cell's bottom edge is the
     * table's baseline, so the item's baseline ends up at `top + pstrut`
     * below the vlist's baseline.
     */
    vlistTable(node, cs, ancestors) {
        const rows = node.children || [];
        const box = emptyBox();
        if (rows.length === 0) return box;
        const rowStyle = computeStyle(rows[0], cs, ancestors);
        const rowAncestors = ancestors.concat([rows[0]]);
        const cell = rows[0].children[0];
        const cellStyle = computeStyle(cell, rowStyle, rowAncestors);
        const cellAncestors = rowAncestors.concat([cell]);

        const items = [];
        for (const wrapper of cell.children || []) {
            const ws = computeStyle(wrapper, cellStyle, cellAncestors);
            const wrapperAncestors = cellAncestors.concat([wrapper]);
            let pstrut = 0;
            const content = [];
            for (const child of wrapper.children || []) {
                if (hasClass(child, "pstrut")) {
                    const ps = computeStyle(child, ws, wrapperAncestors);
                    pstrut = length(styleOf(child).height, ps.em) || 0;
                } else {
                    content.push(child);
                }
            }
            const line = this.hlist(content, ws, wrapperAncestors, null, true);
            const top = length(styleOf(wrapper).top, ws.em) || 0;
            items.push({ wrapper, ws, wrapperAncestors, content, line, baseline: top + pstrut });
        }

        let cellWidth = 0;
        for (const item of items) {
            const m = item.ws.box;
            cellWidth = Math.max(cellWidth, m.marginLeft + item.line.width + m.marginRight);
        }

        for (const item of items) {
            const m = item.ws.box;
            const available = cellWidth - m.marginLeft - m.marginRight;
            let line = item.line;
            if (line.dependsOnWidth) line = this.hlist(item.content, item.ws, item.wrapperAncestors, available, true);
            const x = m.marginLeft + item.ws.textAlign * Math.max(0, available - line.width);
            for (const op of line.ops) box.ops.push(moved(op, x, item.baseline));
            box.height = Math.max(box.height, line.height - item.baseline);
            box.depth = Math.max(box.depth, line.depth + item.baseline);
        }

        box.width = cellWidth;
        const cellHeight = length(styleOf(cell).height, cellStyle.em);
        if (cellHeight !== null) box.height = Math.max(box.height, cellHeight);
        if (rows.length > 1) {
            const depthCell = rows[1].children[0];
            const depthHeight = length(styleOf(depthCell).height, cellStyle.em);
            if (depthHeight !== null) box.depth = Math.max(box.depth, depthHeight);
        }
        box.hasLine = true;
        return box;
    }

    /**
     * \llap, \rlap and \clap: a zero-width box whose `.katex-inner` is
     * absolutely positioned (at its static position, so it shares the
     * baseline) and aligned to the right, left or center of that point. A
     * `.katex-fix` inline-block provides the line box.
     */
    lap(node, cs, ancestors) {
        const box = emptyBox();
        box.hasLine = true;
        for (const child of node.children || []) {
            if (!hasClass(child, "katex-inner")) continue;
            const is = computeStyle(child, cs, ancestors);
            const inner = this.hlist(child.children || [], is, ancestors.concat([child]), null);
            let x = 0;
            if (hasClass(node, "llap")) x = -inner.width;
            if (hasClass(node, "clap")) x = -inner.width / 2;
            for (const op of inner.ops) box.ops.push(moved(op, x, 0));
            box.height = Math.max(box.height, inner.height);
            box.depth = Math.max(box.depth, inner.depth);
        }
        return box;
    }
}

function isAccent(node) {
    return hasClass(node, "katex-accent");
}

function snapBorder(width, pixelRatio) {
    const device = width * pixelRatio;
    if (device <= 0) return 0;
    return (device < 1 ? 1 : Math.floor(device)) / pixelRatio;
}

function emptyBox() {
    return { width: 0, height: 0, depth: 0, ops: [], dependsOnWidth: false, hasLine: false };
}

function moved(op, dx, dy) {
    const copy = Object.assign({}, op);
    copy.x += dx;
    copy.y += dy;
    return copy;
}

function shift(box, dx, dy) {
    if (dx === 0 && dy === 0) return;
    box.ops = box.ops.map((op) => moved(op, dx, dy));
    box.height -= dy;
    box.depth += dy;
}

function append(box, b) {
    for (const op of b.ops) box.ops.push(moved(op, box.width, 0));
    box.width += b.width;
    box.height = Math.max(box.height, b.height);
    box.depth = Math.max(box.depth, b.depth);
    box.dependsOnWidth = box.dependsOnWidth || b.dependsOnWidth;
    box.hasLine = box.hasLine || b.hasLine || b.ops.length > 0;
}

/**
 * Lays out a tree returned by `katex.__renderToHTMLTree`.
 *
 * @param tree the root node (`span.katex`, possibly inside `.katex-display`)
 * @param ctx a 2D canvas context, used for measuring text
 * @param options.fontSize the font size in CSS pixels of the `.katex`
 *        element, i.e. of one TeX em (`katex.css` makes this 1.21 times the
 *        surrounding font size)
 * @param options.pixelRatio if given, device pixels per CSS pixel: rule and
 *        border thicknesses are then rounded to device pixels and rules get
 *        katex.css's `min-height: 1px`, as in browsers,
 *        which keeps the layout identical to KaTeX's HTML output when drawing
 *        without rotation or scaling
 * @returns a box `{width, height, depth, ops, fonts, unsupported}`; `fonts`
 *        lists the CSS font strings that need to be loaded before rendering
 */
export function layout(tree, ctx, options) {
    const root = {
        family: "KaTeX_Main",
        style: "normal",
        weight: "normal",
        size: options.fontSize,
        color: null,
        textAlign: 0,
        multDelim: false,
        textShadow: null,
    };
    const engine = new Layout(ctx, options.pixelRatio || null);
    ctx.save();
    let box;
    try {
        // `.katex` sets the font size to 1.21em; we take fontSize to mean the
        // size inside, so the root's own font rules are applied without it.
        box = engine.hlist(tree.children || [], root, [tree], null);
    } finally {
        ctx.restore();
    }
    return {
        width: box.width,
        height: box.height,
        depth: box.depth,
        ops: box.ops,
        fonts: Array.from(engine.fonts),
        unsupported: Array.from(engine.unsupported),
    };
}

/**
 * Draws a laid-out box with its baseline starting at (x, y). Ops without an
 * explicit color use the context's current fill style.
 */
export function render(ctx, box, x, y) {
    ctx.save();
    try {
        const fill = ctx.fillStyle;
        ctx.textAlign = "left";
        ctx.textBaseline = "alphabetic";
        const t = ctx.getTransform();
        // Rules are snapped to device pixels the way browsers snap borders,
        // but only when that is meaningful, i.e. for axis-aligned transforms.
        const snap = t.b === 0 && t.c === 0 && t.a > 0 && t.d > 0;
        for (const op of box.ops) {
            ctx.fillStyle = op.color === null || op.color === undefined ? fill : op.color;
            if (op.type === "text") {
                ctx.font = op.font;
                if (op.shadow) ctx.fillText(op.text, x + op.x + op.shadow.dx, y + op.y + op.shadow.dy);
                ctx.fillText(op.text, x + op.x, y + op.y);
            } else if (op.type === "rect") {
                if (snap) snappedRect(ctx, t, x + op.x, y + op.y, op.w, op.h, op.edge);
                else ctx.fillRect(x + op.x, y + op.y, op.w, op.h);
            }
        }
    } finally {
        ctx.restore();
    }
}

// Browsers paint boxes with their edges rounded to device pixels, and
// borders with whole device pixel widths (at least one pixel), so thin rules
// stay crisp instead of being smeared over two rows.
function snappedRect(ctx, t, x, y, w, h, edge) {
    let [x0, x1] = snapSpan(t.a * x + t.e, t.a * w, edge === "left" ? 1 : edge === "right" ? -1 : 0);
    let [y0, y1] = snapSpan(t.d * y + t.f, t.d * h, edge === "top" ? 1 : edge === "bottom" ? -1 : 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.restore();
}

// Snaps the interval [start, start + size] to whole pixels. For a border
// (anchor != 0) the thickness is floored and measured from the outer edge:
// the start for anchor 1, the end for anchor -1.
function snapSpan(start, size, anchor) {
    if (anchor === 0) {
        const a = Math.round(start);
        return [a, Math.max(a + 1, Math.round(start + size))];
    }
    const thickness = size < 1 ? 1 : Math.floor(size);
    if (anchor > 0) {
        const a = Math.round(start);
        return [a, a + thickness];
    }
    const b = Math.round(start + size);
    return [b - thickness, b];
}
