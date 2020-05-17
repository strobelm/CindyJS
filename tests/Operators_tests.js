var should = require("chai").should();
var rewire = require("rewire");

global.navigator = {};
var CindyJS = require("../build/js/Cindy.plain.js");

var cdy = CindyJS({
    isNode: true,
    csconsole: null,
    geometry: [
        {name: "A", type: "Free", pos: [3, -4.0, 0], color: [0.0, 1.0, 0.0], drawtrace: true, tracelength: 136, traceskip: 3, pinned: true, labeled: true, size: 11.0, printname: "ALabel"}
    ],
});

function itCmd(command, expected) {
    it(command, function () {
        String(cdy.niceprint(cdy.evalcs(command))).should.equal(expected);
    });
}

describe("Operators: format", function () {
    itCmd('format(1.23456, 0)', '1');
    itCmd('format(1.23456, 1)', '1.2');

    itCmd('format(1.23456, -1)', '1');

    // modifiers
    itCmd('format(1.23456, 2, delimiter->",")', '1,23');
    itCmd('format(exp(2*pi*i), 2, delimiter->",", truncate->false)', '1,00');
    itCmd('format(exp(2*pi*i), 2, delimiter->",", truncate->true)', '1');
});

describe("Inspect", function () {
    describe("Inspect(<arg>)", function () {
        itCmd('inspect([1,2,3])', '___');
        itCmd('inspect("nada")', '___');
        itCmd('inspect("A")', '[name, type, pos, color, drawtrace, tracelength, traceskip, pinned, labeled, size, printname, kind, stateIdx, incidences, isshowing, movable, alpha, noborder, border, tracedim, _traces, _traces_index, _traces_tick, param, homog]');
    });
    describe("Inspect(<arg>, <arg>)", function () {
        itCmd('inspect("nada", "rien")', '___');
        itCmd('inspect("A", "pos")', '[3, -4, 0]');
        itCmd('inspect("A", "None")', '___');
    });
    describe("Inspect(<arg>, <arg>, <arg>)", function () {
        itCmd('inspect("nada", "rien", "nix")', '___');
        itCmd('inspect("A", "homog", [1,0,0]); A.homog', '[1, 0, 0]');
        itCmd('inspect("A", "color", [1,1,1]); A.color', '[1, 1, 1]');
    });
});
