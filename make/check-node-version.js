"use strict";

var v = process.version;
v = v.replace(/^v/, "");
v = v.split(".");
v = v.map(function (s) {
    return parseInt(s);
});
var a = v[0];
// The build tools use native fetch and stream.Readable.fromWeb,
// and the project targets current LTS releases (see package.json engines).
if (a < 20) {
    console.error("Node 20 or later required. Version " + process.version + " found");
    process.exit(1);
}
