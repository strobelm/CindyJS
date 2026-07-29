"use strict";

// Loads the QuickHull3D plugin's classes for tests/quick_hull_tests.js and
// tests/Vector_tests.js.
//
// QuickHull3D is a LEGACY plugin (see MODERNIZATION.md "scope decisions"): its
// sources carry no imports or exports and rely on being compiled into one
// shared scope by the Closure Compiler, exactly like the core used to be. The
// tests used to reach into them with a module-reflection helper, loading every
// file as its own module and then hand-wiring the cross-file references back
// together by injection - eight files, six manual re-injections, and a scope
// that no build ever produces.
//
// Since step 7b of MODERNIZATION.md that helper is gone from the project, so
// this file does the straightforward thing instead: it concatenates the plugin's
// sources into ONE function scope, which is precisely the scope the shipping
// build/js/QuickHull3D.js has, and returns the constructors the tests name.
// Plugin.js is left out; it calls CindyJS.registerPlugin, which is the plugin
// API and not what these unit tests exercise.

const fs = require("fs");
const path = require("path");

// The order of the "quickhull3d" task in make/build.js, minus Plugin.js. Every
// cross-file reference is a call-time one, so the order is documentation.
const files = ["QuickHull3D", "Vector", "HalfEdge", "Vertex", "VertexList", "Face", "FaceList"];

const source = files
    .map((name) =>
        fs.readFileSync(path.join(__dirname, "..", "plugins", "QuickHull3D", "src", "js", name + ".js"), "utf-8")
    )
    .join("\n");

// `new Function` rather than the `vm` module on purpose: the tests compare
// values with chai, so the objects must come from this realm.
const exported = ["QuickHull3D", "Vector", "VectorOperations"];
module.exports = new Function(source + "\nreturn { " + exported.join(", ") + " };")();
