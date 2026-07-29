"use strict";

// Loads a core source file (src/js/**) as a CommonJS module.
//
// The core sources are ES modules. Node's CommonJS loader chokes on that
// syntax, so the few build/test consumers that pull a single core file
// directly (Parser.js, in tests/Parser_tests.js and the `excomp` task) go
// through this helper, which strips the import/export annotations with babel
// before evaluating the file. Temporary bridge: it disappears once those
// consumers load the module graph instead.

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
