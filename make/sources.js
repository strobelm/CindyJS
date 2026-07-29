"use strict";

// Source lists for the tasks in make/build.js that still concatenate files.
//
// Until Phase 1 step 7b this file also held the concatenation order of the core
// (`libcs`/`libgeo`/`liblab`/`inclosure`/`ours`/`srcs`) - that order WAS the
// dependency graph. It now lives in src/js/index.js as a real import list, and
// the core artifacts are esbuild bundles, so only the non-module inputs remain
// here.

// Vendored third-party scripts. They are not part of the module graph: they
// publish globals (ClipperLib, enableInlineVideo) that the core reads without
// importing, so tools/build-cindy.js prepends them to build/js/Cindy.js
// verbatim, outside the bundle wrapper.
exports.lib = [
    "node_modules/iphone-inline-video/dist/iphone-inline-video.min.js",
    "lib/clipper/clipper.js",
    "node_modules/es6-shim/es6-shim.min.js",
];

// CindyScript sources compiled to JavaScript by tools/cs2js.js (task "cs2js").
exports.cssrc = [];

exports.scss = ["src/scss/CindyJS.scss"];

exports.ifs = ["src/js/ifs/worker.js", "src/js/ifs/ifs.asm.js"];
