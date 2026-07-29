"use strict";

// Loads a core source file (src/js/**) as a CommonJS module.
//
// The core sources carry ES module import/export annotations which the concat
// build strips (see tools/cat.js). Node's CommonJS loader chokes on that
// syntax, so the few build/test consumers that pull a single core file
// directly (Parser.js) go through this helper, which applies the very same
// babel transform before evaluating the file. Temporary bridge: it disappears
// once the core is consumed as real ES modules.

const fs = require("fs");
const babel = require("@babel/core");

function requireSrc(file) {
    const src = babel.transformSync(fs.readFileSync(file, "utf-8"), {
        plugins: ["remove-import-export"],
        retainLines: true,
    }).code;
    const module = { exports: {} };
    new Function("module", "exports", "require", src)(module, module.exports, require);
    return module.exports;
}

module.exports = requireSrc;
