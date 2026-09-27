/**
 * TeX macros defined specifically for Cinderella / CindyJS, for use with
 * current KaTeX versions.
 *
 * This is the table from katex-plugin.js (written against KaTeX 0.7) minus
 * the workarounds that KaTeX has since made obsolete: `\operatorname` is
 * supported natively now, so it must no longer be mapped to `\text`.
 */
export const macros = {
    "\\mbox": "\\text",
    "\\lamda": "\\lambda",
    "\\my": "\\mu",
    "\\ny": "\\nu",
    "\\ypsilon": "\\upsilon",
    "\\Alpha": "\\mathrm{A}",
    "\\Beta": "\\mathrm{B}",
    "\\Epsilon": "\\mathrm{E}",
    "\\Zeta": "\\mathrm{Z}",
    "\\Eta": "\\mathrm{H}",
    "\\Iota": "\\mathrm{I}",
    "\\Kappa": "\\mathrm{K}",
    "\\Lamda": "\\Lambda",
    "\\Mu": "\\mathrm{M}",
    "\\My": "\\Mu",
    "\\Nu": "\\mathrm{N}",
    "\\Ny": "\\Nu",
    "\\Omicron": "\\mathrm{O}",
    "\\Rho": "\\mathrm{P}",
    "\\Tau": "\\mathrm{T}",
    "\\Ypsilon": "\\Upsilon",
    "\\Chi": "\\mathrm{X}",
    "\\dots": "\\ldots",
    "\\C": "\\mathbb{C}",
    "\\H": "\\mathbb{H}",
    "\\N": "\\mathbb{N}",
    "\\P": "\\mathbb{P}",
    "\\Q": "\\mathbb{Q}",
    "\\R": "\\mathbb{R}",
    "\\Z": "\\mathbb{Z}",
    "\\slash": "/",
    "\\arccot": "\\operatorname{arccot}",
    "\\arcsec": "\\operatorname{arcsec}",
    "\\arccsc": "\\operatorname{arccsc}",
};

/** Source rewriting applied before parsing, as done by katex-plugin.js. */
export function preprocess(tex) {
    return tex.replace(/°/g, "\\degree");
}
