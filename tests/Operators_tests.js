var should = require("chai").should();

global.navigator = {};
var CindyJS = require("../build/js/Cindy.js");

var cdy = CindyJS({
    isNode: true,
    csconsole: null,
    geometry: [],
});

function itCmd(command, expected) {
    it(command, function () {
        String(cdy.niceprint(cdy.evalcs(command))).should.equal(expected);
    });
}

describe("Operators: format", function () {
    itCmd("format(1.23456, 0)", "1");
    itCmd("format(1.23456, 1)", "1.2");

    itCmd("format(1.23456, -1)", "1");

    // modifiers
    itCmd('format(1.23456, 2, delimiter->",")', "1,23");
    itCmd('format(exp(2*pi*i), 2, delimiter->",", truncate->false)', "1,00");
    itCmd('format(exp(2*pi*i), 2, delimiter->",", truncate->true)', "1");
});

describe("Operators: reverse", function () {
    itCmd("reverse([1, 2, 3])", "[3, 2, 1]");
    itCmd('reverse("Hello")', "olleH");
});

describe("Operators: if", function () {
    itCmd('isundefined(if(blabla,"a","b"))', "true");
    itCmd('if(true,"a","b")', "a");
    itCmd('if(false,"a","b")', "b");
});

describe("Operators: angles", function () {
    itCmd("-45°", "-45°");
    itCmd("round(37°/15°) * 15°", "30°");
    itCmd("mod(456°, 360°)", "96°");
});

describe("Operators: sequence", function () {
    itCmd("-2.5..2.5", "[-2, -1, 0, 1, 2]");
    itCmd("-1.1..1.4", "[-1, 0, 1]");
    itCmd("-1.9..1.6", "[-1, 0, 1]");
    itCmd("sum(1..10)", "55");
});

describe("Operators: length", function () {
    itCmd("length([1,2,3])", "3");
    itCmd('length("1234")', "4");
    itCmd("length(42)", "1");
    itCmd("length(var)", "0");
    itCmd("variable=1;length(variable)", "1");
});

describe("Operators: arithmetic", function () {
    itCmd("1+2*3", "7");
    itCmd("(1+2)*3", "9");
    itCmd("5-2-1", "2");
    itCmd("-(2+3)", "-5");
    itCmd("2^3", "8");
    itCmd("(-3)^2", "9");
    itCmd("7/2", "3.5");
});

describe("Operators: comparisons", function () {
    itCmd("1<2", "true");
    itCmd("2<=2", "true");
    itCmd("3>4", "false");
    itCmd("3>=2", "true");
});

describe("Operators: is...", function () {
    itCmd("isundefined(nada)", "true");
    itCmd("isundefined(5)", "false");
    itCmd("isbool(nada)", "false");
    itCmd("isbool(4)", "false");
    itCmd("isbool(isundefined(nada))", "true");
    itCmd("isbool(false)", "true");
    itCmd("iseven(0)", "true");
    itCmd("iseven(1)", "false");
    itCmd("iseven(-1)", "false");
    itCmd("iseven(1.5)", "false");
    itCmd("iseven(2)", "true");
    itCmd("iseven(-2)", "true");
    itCmd("isodd(0)", "false");
    itCmd("isodd(1)", "true");
    itCmd("isodd(-1)", "true");
    itCmd("isodd(1.5)", "false");
    itCmd("isodd(2)", "false");
    itCmd("isodd(-2)", "false");
    itCmd("isinteger(1)", "true");
    itCmd("isinteger(-0.0)", "true");
    itCmd("isinteger(i)", "false");
    itCmd("isinteger(pi)", "false");
    itCmd("isinteger(1.5)", "false");
    itCmd("isreal(pi)", "true");
    itCmd("isreal(i)", "false");
    itCmd("isreal(1)", "true");
    itCmd('isreal("1")', "false");
    itCmd("iscomplex(0)", "true");
    itCmd("iscomplex(i)", "true");
    itCmd('isstring("Test")', "true");
    itCmd('isstring(["1","2","3"])', "false");
    itCmd('islist("Test")', "false");
    itCmd('islist(["1","2","3"])', "true");
    itCmd("ismatrix([1,2,3])", "false");
    itCmd("ismatrix([[1,2],[4,5]])", "true");
    itCmd("ismatrix([[1,2],[4,5,6]])", "false");
    itCmd("ismatrix([[[1,2],[4,5]],[[5,6],[7,8]]])", "true");
    itCmd("isjson(nada)", "false");
    itCmd("isjson({})", "true");
    itCmd("isjson([])", "false");
    itCmd('isjson("Test")', "false");
    itCmd('isjson("0")', "false");
});

describe("Operators: removeAt", function () {
    before(function () {
        cdy.evalcs("aList = [1,2,3,4,5,6,7,8,9,10];");
    });

    itCmd("removeAt(aList,0)", "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
    itCmd("removeAt(aList,11)", "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
    itCmd("removeAt(aList,10)", "[1, 2, 3, 4, 5, 6, 7, 8, 9]");
    itCmd("removeAt(aList,1)", "[2, 3, 4, 5, 6, 7, 8, 9, 10]");
    itCmd("removeAt(aList,5)", "[1, 2, 3, 4, 6, 7, 8, 9, 10]");
    itCmd("removeAt(aList,3);aList", "[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]");
});

// The + operator concatenates when either side is a string, but that case does
// NOT live in the data layer: General.add is numeric/structural only, and
// Operators.js wraps it with the printing case (addOrConcat). Pinning both
// halves keeps the split from silently drifting back.
describe("Operators: string concatenation is an operator-layer concern", function () {
    var { nada, General } = require("../build/js/exposed.cjs");

    it("General.add returns nada for two strings", function () {
        General.add(General.wrap("a"), General.wrap("b")).should.equal(nada);
    });
    it("General.add returns nada for string + number", function () {
        General.add(General.wrap("a"), General.wrap(1)).should.equal(nada);
        General.add(General.wrap(1), General.wrap("a")).should.equal(nada);
    });

    itCmd('"a"+"b"', "ab");
    itCmd('"a"+1', "a1");
    itCmd('1+"a"', "1a");
    // Unary plus on a string: the void operand falls through the unary-plus
    // cases (which want a number or a list) into the concatenation case, and
    // niceprint renders the void as "_?_". Long-standing behaviour, verified
    // unchanged against the pre-split build; pinned here because the split
    // moved the branch that produces it.
    itCmd('+"abc"', "_?_abc");
    itCmd("+5", "5");
    itCmd("+[1,2]", "[1, 2]");
    itCmd('"a"+[1,2]', "a[1, 2]");
    itCmd('sum(["a","b","c"])', "abc");
    itCmd('sum([1,2,"c"])', "3c");
    itCmd("1+2", "3");
    itCmd("[1,2]+[3,4]", "[4, 6]");
});

describe("Operators: print", function () {
    itCmd("text(1)", "1");
    itCmd("text(nada)", "___");
    itCmd('text("Hello, World!")', "Hello, World!");
    itCmd('text("Hello, World!",quote->true)', '"Hello, World!"');
    itCmd('text(unicode(34)+"Test"+unicode(34))', '"Test"');
    itCmd('text(unicode(34)+"Test"+unicode(34),quote->true)', '"""Test"""');
    itCmd('text(["a","b",{"c":1,"d":["e","f"]}])', "[a, b, {c:1, d:[e, f]}]");
    itCmd('text(["a","b",{"c":1,"d":["e","f"]}],quote->true)', '["a", "b", {"c":1, "d":["e", "f"]}]');
});
