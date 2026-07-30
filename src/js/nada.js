// The shared "undefined" value of the CindyScript type system.
//
// A leaf module (step 8 of MODERNIZATION.md), hoisted into the once-bundle:
// nada is compared by identity (`=== nada` / `!== nada`) across the core, so
// there must be exactly ONE object per page. CindyJS.js re-exports it (which
// is how the newInstance wrapper threads it to expose.browser.js as
// __cindyNada), expose.ts re-exports it for the node/test graph, and the
// data-layer modules import it from here directly so their import closure
// stays free of the per-instance environment seam.
const nada = {
    ctype: "undefined",
};

export { nada };
