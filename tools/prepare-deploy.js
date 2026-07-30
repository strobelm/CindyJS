"use strict";

var fs = require("fs");
var path = require("path");
var ppath = path.posix;
var url = require("url");
var child_process = require("child_process");

var inDir = "build/js";
var outDir = "build/deploy";
var head = null;

var handlers = {
    // Smoke-check artifact of the ESM entry (make esmbundle), never shipped.
    "Cindy.esm-check.js": false,
    "Cindy.js": subst,
    "Cindy.js.map": map,
    "Cindy3D.js": true,
    "Cindy3D.js.map": map,
    "CindyGL.js": true,
    "CindyGL.js.map": map,
    "CindyPrint.js": true,
    "CindyPrint.js.map": map,
    "CindyPrintWorker.js": true,
    "CindyPrintWorker.js.map": map,
    "csg.js": false,
    "CindyLeap.js": true,
    "CindyLeap.js.map": map,
    "leap-0.6.4.js": false,
    "CindyXR.js": true,
    "CindyXR.js.map": map,
    "QuickHull3D.js": true,
    "QuickHull3D.js.map": map,
    "CindyJS.css": true,
    "CindyJS.css.map": map,
    "Compiled.js": false,
    "ComplexCurves.js": true,
    "ComplexCurves.js.map": false,
    "ComplexCurves.plugin.js": false,
    // Consumed by the esbuild builds as a `define`; a build input, never
    // shipped.
    "Version.json": false,
    "WEB-INF": false,
    "c3dres.js": false,
    "cglres.js": false,
    // The unit-test bundle (make exposed), never shipped.
    "exposed.cjs": false,
    "ifs.js": true,
    "ifs.js.map": true,
    images: true,
    katex: true,
    "katex-plugin.js": true,
    midi: true,
    "midi-plugin.js": true,
    "pako.min.js": true,
    quickhull3d: true,
    soundfonts: true,
    "symbolic.js": true,
    "webfont.js": true,
};

var exitStatus = 0;

process.once("beforeExit", function () {
    process.exit(exitStatus);
});

function check(err) {
    if (err) {
        console.error(err.stack);
        exitStatus = 1;
    }
}

child_process.execFile("git", ["rev-parse", "HEAD"], function (err, stdout, stderr) {
    if (err) {
        console.log(stdout);
        console.error(stderr);
        throw err;
    }
    var match = /^([0-9a-f]{40})\r?\n?$/.exec(stdout);
    if (!match) throw Error("Not a valid commit id: " + stdout);
    head = match[1];
    fs.readdir(inDir, lsDir);
});

function lsDir(err, files) {
    if (err) throw err;
    files.forEach(function (filename) {
        var inFile = path.join(inDir, filename);
        var handler = handlers[filename];
        if (handler === undefined) {
            console.error("Don't know whether to keep " + filename);
            exitStatus = 2;
            return;
        }
        if (handler === false) return;
        if (handler === true) {
            fs.stat(inFile, copy.bind(null, inFile, path.join(outDir, filename)));
            return;
        }
        fs.readFile(inFile, handler.bind(null, filename));
    });
}

function subst(name, err, content) {
    if (err) throw err;
    content = content.toString();
    content = content.replace(/\$gitid\$/, head);
    fs.writeFile(path.join(outDir, name), content, check);
}

var mapKeys = ["version", "file", "sourceRoot", "sources", "sourcesContent", "names", "mappings"];
mapKeys.reverse(); // so that missing keys (indexOf returns -1) go to the end

function map(name, err, content) {
    if (err) throw err;
    var map = JSON.parse(content.toString());
    if ("lineCount" in map) {
        map.x_google_linecount = map.lineCount;
        delete map.lineCount;
    }
    var root = map.sourceRoot || ".";
    map.sourceRoot = "https://raw.githubusercontent.com/CindyJS/CindyJS/" + head + "/";
    map.sources = map.sources.map(function (src) {
        if (/^ \[synthetic:.*\] $/.test(src)) return src;
        // Already repo-relative (that is how the Closure-built maps spelled
        // vendored sources); anything else still has to be resolved against
        // build/js below - esbuild writes "../../node_modules/..." there.
        if (/^lib\/|^node_modules\//.test(src)) return src;
        if (/^build\/ts/.test(src)) return src;
        return ppath.normalize(ppath.join("build/js", root, src));
    });
    // Embedding the sources makes the deployed map self-contained: sourceRoot
    // points at raw.githubusercontent, which is fine for a browsable checkout
    // but not for a file the browser must fetch cross-origin. Since the core
    // artifact is minified, a map without content is close to useless.
    //
    // Every entry is repo-relative at this point, so "does the file exist"
    // is the whole rule. It used to be "starts with build/", which was true in
    // the Closure world (the core was compiled out of generated build/js
    // copies) but leaves every src/js module of the esbuild artifact blank.
    map.sourcesContent = map.sources.map(function (src) {
        if (/^ \[synthetic:.*\] $/.test(src)) return null;
        if (/^build\/js\/src\/com\/google/.test(src)) return null;
        if (src.startsWith("..") || !fs.existsSync(src)) return null;
        return fs.readFileSync(src, "utf-8");
    });
    var keys = Object.keys(map);
    keys.sort(function (a, b) {
        return mapKeys.indexOf(b) - mapKeys.indexOf(a) || (a > b ? 1 : a < b ? -1 : 0);
    });
    content =
        "{" +
        keys
            .map(function (key) {
                return JSON.stringify(key) + ":" + JSON.stringify(map[key]);
            })
            .join(",\n ") +
        "}\n";
    fs.writeFile(path.join(outDir, name), content, check);
}

function copy(inPath, outPath, err, stats) {
    if (err) throw err;
    if (stats.isDirectory()) {
        copyDir(inPath, outPath);
    } else {
        fs.createReadStream(inPath).pipe(fs.createWriteStream(outPath));
    }
}

function copyDir(inPath, outPath) {
    var created = false,
        filesList = null;
    fs.mkdir(outPath, function (err) {
        if (err) throw err;
        created = true;
        if (filesList) next();
    });
    fs.readdir(inPath, function (err, files) {
        if (err) throw err;
        filesList = files;
        if (created) next();
    });
    function next() {
        filesList.forEach(function (filename) {
            var inFile = path.join(inPath, filename);
            var outFile = path.join(outPath, filename);
            fs.stat(inFile, copy.bind(null, inFile, outFile));
        });
    }
}
