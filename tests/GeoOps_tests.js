var should = require("chai").should();
var rewire = require("rewire");

global.navigator = {};
var CindyJS = require("../build/js/Cindy.plain.js");
var cindyJS = rewire("../build/js/exposed.js");

var List = cindyJS.__get__("List");
var CSNumber = cindyJS.__get__("CSNumber");
var geoOps = cindyJS.__get__("geoOps");
var niceprint = cindyJS.__get__("niceprint");

function almostEqualVector(a, b) {
    return List._helper.isAlmostZero(a) == List._helper.isAlmostZero(b) && List.projectiveDistMinScal(a, b) < 1e-8;
}

function homog(expected) {
    if (!expected.ctype) expected = List.realVector(expected);
    return function (el) {
        if (!almostEqualVector(el.homog, expected)) niceprint(el.homog).should.equal(niceprint(expected));
    };
}

function homogPair(expected1, expected2) {
    if (!expected1.ctype) expected1 = List.realVector(expected1);
    if (!expected2.ctype) expected2 = List.realVector(expected2);
    return function (el) {
        var actual1 = el.results.value[0];
        var actual2 = el.results.value[1];
        if (
            !(
                (almostEqualVector(actual1, expected1) && almostEqualVector(actual2, expected2)) ||
                (almostEqualVector(actual1, expected2) && almostEqualVector(actual2, expected1))
            )
        )
            niceprint(el.results).should.equal(niceprint(List.turnIntoCSList([expected1, expected2])));
    };
}

function testGeo(geometry, verifier, done) {
    var initscript = 'use("verify");\nverify(' + geometry[geometry.length - 1].name + ")";
    function plugin(api) {
        api.defineFunction("verify", 1, function (args, modifs) {
            var el = api.evaluate(args[0]).value;
            try {
                verifier(el);
                done();
            } catch (err) {
                done(err);
            }
        });
    }
    plugin.apiVersion = 1;
    var data = {
        isNode: true,
        geometry: geometry,
        scripts: { init: initscript },
        plugins: { verify: plugin },
    };
    CindyJS(data);
}

function testEqualPoints(geometry, equalities, done) {
    var initscript =
        'use("verify");\n' +
        equalities
            .map(function (eq) {
                return "same(" + eq.replace("=", ", ") + ");\n";
            })
            .join("") +
        "done()";
    var error = null;
    function plugin(api) {
        api.defineFunction("same", 2, function (args, modifs) {
            if (error) return; // only report first error
            var el1 = api.evaluate(args[0]).value;
            var el2 = api.evaluate(args[1]).value;
            if (!almostEqualVector(el1.homog, el2.homog))
                error = new Error(el1.name + niceprint(el1.homog) + " != " + el2.name + niceprint(el2.homog));
        });
        api.defineFunction("done", 0, function (args, modifs) {
            done(error);
        });
    }
    plugin.apiVersion = 1;
    var data = {
        isNode: true,
        geometry: geometry,
        scripts: { init: initscript },
        plugins: { verify: plugin },
    };
    CindyJS(data);
}

//////////////////////////////////////////////////////////////////////
// Now come the test cases

describe("Free point", function () {
    it("must have the given coordinates", function (done) {
        testGeo([{ name: "A", type: "Free", pos: [12, 34] }], homog([-120, -340, -10]), done);
    });
});

describe("Angle bisector", function () {
    it("generic input", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [3, 2] },
                { name: "B", type: "Free", pos: [7, 5] },
                { name: "C", type: "Free", pos: [-9, 7] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([8, 1, -26], [1, -8, 13]),
            done
        );
    });
    it("finite identical", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [-3, 2] },
                { name: "B", type: "Free", pos: [6, 5] },
                { name: "C", type: "Free", pos: [3, 4] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([1, -3, 9], [3, 1, 7]),
            done
        );
    });
    it("parallel", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [3, 2, 0] },
                { name: "B", type: "Free", pos: [7, 5] },
                { name: "C", type: "Free", pos: [-9, 7] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([2, -3, 20], [0, 0, 1]),
            done
        );
    });
    it("identical with far point", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [3, 1, 0] },
                { name: "B", type: "Free", pos: [6, 5] },
                { name: "C", type: "Free", pos: [3, 4] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([1, -3, 9], [0, 0, 1]),
            done
        );
    });
    it("finite and infinite", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [3, 1, 0] },
                { name: "B", type: "Free", pos: [0, 1, 0] },
                { name: "C", type: "Free", pos: [3, 4, 1] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([0, 0, 1], [0, 0, 1]),
            done
        );
    });
    it("twice infinite", function (done) {
        testGeo(
            [
                { name: "A", type: "Free", pos: [3, 1, 0] },
                { name: "B", type: "Free", pos: [4, 5, 0] },
                { name: "C", type: "Free", pos: [1, 2, 0] },
                { name: "a", type: "Join", args: ["A", "B"] },
                { name: "b", type: "Join", args: ["A", "C"] },
                { name: "cd", type: "AngleBisector", args: ["a", "b", "A"] },
            ],
            homogPair([0, 0, 0], [0, 0, 0]),
            done
        );
    });
});

describe("IntersectLC helper", function () {
    it("must not return null vector just because one result has x == 0", function () {
        var circle = List.turnIntoCSList([
            List.realVector([1, 0, 2]),
            List.realVector([0, 1, 3]),
            List.realVector([2, 3, 9]),
        ]);
        var line = List.realVector([0, -2, -6]);
        var pts = geoOps._helper.IntersectLC(line, circle);
        pts.should.be.an("array");
        pts.should.have.length(2);
        var p1 = List.normalizeZ(pts[0]);
        var p2 = List.normalizeZ(pts[1]);
        if (p1.value[0].value.real > p2.value[0].value.real) {
            var tmp = p2;
            p2 = p1;
            p1 = tmp;
        }
        p1.value[0].value.real.should.be.approximately(-4, 1e-12);
        p1.value[0].value.imag.should.be.approximately(0, 1e-12);
        p1.value[1].value.real.should.be.approximately(-3, 1e-12);
        p1.value[1].value.imag.should.be.approximately(0, 1e-12);
        p2.value[0].value.real.should.be.approximately(0, 1e-12);
        p2.value[0].value.imag.should.be.approximately(0, 1e-12);
        p2.value[1].value.real.should.be.approximately(-3, 1e-12);
        p2.value[1].value.imag.should.be.approximately(0, 1e-12);
    });
});

describe("Möbius Transformations", function () {
    it("TrMoebius", function (done) {
        testEqualPoints(
            [
                { name: "A1", type: "RandomPoint" },
                { name: "B1", type: "RandomPoint" },
                { name: "C1", type: "RandomPoint" },
                { name: "A2", type: "RandomPoint" },
                { name: "B2", type: "RandomPoint" },
                { name: "C2", type: "RandomPoint" },
                { name: "Tr1", type: "TrMoebius", args: ["A1", "A2", "B1", "B2", "C1", "C2"] },
                { name: "A3", type: "TrMoebiusP", args: ["Tr1", "A1"] },
                { name: "B3", type: "TrMoebiusP", args: ["Tr1", "B1"] },
                { name: "C3", type: "TrMoebiusP", args: ["Tr1", "C1"] },
            ],
            ["A2=A3", "B2=B3", "C2=C3"],
            done
        );
    });
    it("TrInverseMoebius", function (done) {
        testEqualPoints(
            [
                { name: "A1", type: "RandomPoint" },
                { name: "B1", type: "RandomPoint" },
                { name: "C1", type: "RandomPoint" },
                { name: "A2", type: "RandomPoint" },
                { name: "B2", type: "RandomPoint" },
                { name: "C2", type: "RandomPoint" },
                { name: "Tr1", type: "TrMoebius", args: ["A1", "A2", "B1", "B2", "C1", "C2"] },
                { name: "Tr2", type: "TrInverseMoebius", args: ["Tr1"] },
                { name: "A4", type: "TrMoebiusP", args: ["Tr2", "A2"] },
                { name: "B4", type: "TrMoebiusP", args: ["Tr2", "B2"] },
                { name: "C4", type: "TrMoebiusP", args: ["Tr2", "C2"] },
            ],
            ["A1=A4", "B1=B4", "C1=C4"],
            done
        );
    });
    it("TrReflectionC", function (done) {
        testEqualPoints(
            [
                { name: "M", type: "RandomPoint" },
                { name: "A", type: "RandomPoint" },
                { name: "C", type: "CircleMP", args: ["M", "A"] },
                { name: "Tr", type: "TrReflectionC", args: ["C"] },
                { name: "P1", type: "RandomPoint" },
                { name: "P2", type: "TrMoebiusP", args: ["Tr", "P1"] },
                { name: "P3", type: "TrMoebiusP", args: ["Tr", "P2"] },
                { name: "g1", type: "Join", args: ["M", "P1"] },
                { name: "g2", type: "Join", args: ["P1", "P2"] },
            ],
            ["P1=P3", "g1=g2"],
            done
        );
    });
});

describe("TrCompose", function () {
    function directMoebiusTrafo(name) {
        var P = [0, 1, 2, 3].map(function (i) {
            return name + "_P" + i;
        });
        return [
            { name: P[0], type: "RandomPoint" },
            { name: P[1], type: "RandomPoint" },
            { name: P[2], type: "RandomPoint" },
            { name: P[3], type: "RandomPoint" },
            { name: name, type: "TrMoebius", args: [P[0], P[0], P[1], P[1], P[2], P[3]] },
        ];
    }

    function reverseMoebiusTrafo(name) {
        return [
            { name: name + "_M", type: "RandomPoint" },
            { name: name + "_P", type: "RandomPoint" },
            { name: name + "_C", type: "CircleMP", args: [name + "_M", name + "_P"] },
            { name: name, type: "TrReflectionC", args: [name + "_C"] },
        ];
    }

    function directEuclideanTrafo(name) {
        var P = [0, 1, 2, 3].map(function (i) {
            return name + "_P" + i;
        });
        return [
            { name: P[0], type: "RandomPoint" },
            { name: P[1], type: "RandomPoint" },
            { name: P[2], type: "RandomPoint" },
            { name: P[3], type: "RandomPoint" },
            { name: name, type: "TrSimilarity", args: P },
        ];
    }

    function reverseEuclideanTrafo(name) {
        return [
            { name: name + "_L", type: "RandomLine" },
            { name: name, type: "TrReflectionL", args: [name + "_L"] },
        ];
    }

    function testTrCompose(gen1, gen2, done) {
        var geometry = gen1("Tr1").concat(gen2("Tr2"), [
            { name: "Tr3", type: "TrCompose", args: ["Tr1", "Tr2"] },
            { name: "P1", type: "RandomPoint" },
            { name: "P2", type: "Transform", args: ["Tr1", "P1"] },
            { name: "P3", type: "Transform", args: ["Tr2", "P2"] },
            { name: "P4", type: "Transform", args: ["Tr3", "P1"] },
        ]);
        testEqualPoints(geometry, ["P3=P4"], done);
    }

    it("TrComposeTrTr direct direct", function (done) {
        testTrCompose(directEuclideanTrafo, directEuclideanTrafo, done);
    });
    it("TrComposeTrTr direct reverse", function (done) {
        testTrCompose(directEuclideanTrafo, reverseEuclideanTrafo, done);
    });
    it("TrComposeTrTr reverse direct", function (done) {
        testTrCompose(reverseEuclideanTrafo, directEuclideanTrafo, done);
    });
    it("TrComposeTrTr reverse reverse", function (done) {
        testTrCompose(reverseEuclideanTrafo, reverseEuclideanTrafo, done);
    });

    it("TrComposeMtMt direct direct", function (done) {
        testTrCompose(directMoebiusTrafo, directMoebiusTrafo, done);
    });
    it("TrComposeMtMt direct reverse", function (done) {
        testTrCompose(directMoebiusTrafo, reverseMoebiusTrafo, done);
    });
    it("TrComposeMtMt reverse direct", function (done) {
        testTrCompose(reverseMoebiusTrafo, directMoebiusTrafo, done);
    });
    it("TrComposeMtMt reverse reverse", function (done) {
        testTrCompose(reverseMoebiusTrafo, reverseMoebiusTrafo, done);
    });

    it("TrComposeTrMt direct direct", function (done) {
        testTrCompose(directEuclideanTrafo, directMoebiusTrafo, done);
    });
    it("TrComposeTrMt direct reverse", function (done) {
        testTrCompose(directEuclideanTrafo, reverseMoebiusTrafo, done);
    });
    it("TrComposeTrMt reverse direct", function (done) {
        testTrCompose(reverseEuclideanTrafo, directMoebiusTrafo, done);
    });
    it("TrComposeTrMt reverse reverse", function (done) {
        testTrCompose(reverseEuclideanTrafo, reverseMoebiusTrafo, done);
    });

    it("TrComposeMtTr direct direct", function (done) {
        testTrCompose(directMoebiusTrafo, directEuclideanTrafo, done);
    });
    it("TrComposeMtTr direct reverse", function (done) {
        testTrCompose(directMoebiusTrafo, reverseEuclideanTrafo, done);
    });
    it("TrComposeMtTr reverse direct", function (done) {
        testTrCompose(reverseMoebiusTrafo, directEuclideanTrafo, done);
    });
    it("TrComposeMtTr reverse reverse", function (done) {
        testTrCompose(reverseMoebiusTrafo, reverseEuclideanTrafo, done);
    });
});

describe("All GeoOps", function () {
    it("movable ops must have all required methods", function () {
        for (var type in geoOps) {
            var op = geoOps[type];
            if (op && op.isMovable) {
                ["getParamFromState", "getParamForInput", "putParamToState", "updatePosition"].forEach(function (meth) {
                    op.should.respondTo(meth, type + " should respond to " + meth);
                });
            }
        }
    });
});

describe("Conics not determined by their input", function () {
    // Their formulas yield rounding noise. Tracing used to follow that noise
    // with ever smaller steps, up to its refinement limit, so without the fix
    // these tests take seconds each (and fail on their assertions).
    this.timeout(5000);

    function P(name, x, y) {
        return { name: name, type: "Free", pos: [x, y] };
    }

    function J(name, p, q) {
        return { name: name, type: "Join", args: [p, q] };
    }

    // the two conics X and Y of the set S = type(args)
    function conics(type, args) {
        return [
            { name: "S", type: type, args: args },
            { name: "X", type: "SelectConic", args: ["S"], index: 1 },
            { name: "Y", type: "SelectConic", args: ["S"], index: 2 },
        ];
    }

    function widget(geometry) {
        return CindyJS({ isNode: true, csconsole: false, geometry: geometry });
    }

    // undefined: NaN, or the zero matrix
    function isUndefined(cdy, name) {
        var m = cdy.evalcs(name + ".matrix");
        return List._helper.isNaN(m) || List.abs(m).value.real === 0;
    }

    function undefinedCount(cdy) {
        return (isUndefined(cdy, "X") ? 1 : 0) + (isUndefined(cdy, "Y") ? 1 : 0);
    }

    // inputs of a conic with pole A and polar a, through B, tangent to c and d
    var poleAndTangents = [
        P("A", 0, 2),
        P("A1", -1, 0.5),
        P("A2", 1, 0.3),
        J("a", "A1", "A2"),
        P("B", 1.5, 1),
        P("C1", -2, -1),
        P("C2", 2, -1),
        J("c", "C1", "C2"),
        P("D1", -2, -0.5),
        P("D2", 2, -1),
        J("d", "D1", "D2"),
    ];

    it("tangent to the same line twice: one of the two is undefined", function () {
        var cdy = widget(poleAndTangents.concat(conics("ConicBy1Pol1P2L", ["A", "a", "B", "c", "c"])));
        cdy.evalcs("B.xy=(1.4,1.2)");
        undefinedCount(cdy).should.equal(1);
    });

    it("through a point on the polar: one of the two is undefined", function () {
        var cdy = widget(poleAndTangents.concat(conics("ConicBy1Pol1P2L", ["A", "a", "A1", "c", "d"])));
        cdy.evalcs("A1.xy=(-1.1,0.6)");
        undefinedCount(cdy).should.equal(1);
    });

    it("tangent to two lines that come to coincide and separate again", function () {
        var cdy = widget(poleAndTangents.concat(conics("ConicBy1Pol1P2L", ["A", "a", "B", "c", "d"])));
        undefinedCount(cdy).should.equal(0);
        cdy.evalcs("D1.xy=(-2,-1)");
        undefinedCount(cdy).should.equal(1);
        cdy.evalcs("D1.xy=(-2,-0.7)");
        undefinedCount(cdy).should.equal(0);
    });

    it("tangent to the same line twice when loaded, then to two lines", function () {
        var geometry = poleAndTangents.slice();
        geometry[8] = P("D1", -2, -1); // d = c
        var cdy = widget(geometry.concat(conics("ConicBy1Pol1P2L", ["A", "a", "B", "c", "d"])));
        undefinedCount(cdy).should.equal(1);
        cdy.evalcs("D1.xy=(-2,-0.9)");
        cdy.evalcs("D1.xy=(-2,-0.8)");
        undefinedCount(cdy).should.equal(0);
    });

    it("close to special input: both are defined", function () {
        // B almost on the polar, and c almost d: determined, if sensitive
        var cdy = widget(poleAndTangents.concat(conics("ConicBy1Pol1P2L", ["A", "a", "B", "c", "d"])));
        cdy.evalcs("B.xy=(-1+1e-7,0.5)");
        undefinedCount(cdy).should.equal(0);
        cdy.evalcs("B.xy=(1.5,1)");
        cdy.evalcs("D1.xy=(-2,-1+1e-7)");
        undefinedCount(cdy).should.equal(0);
    });

    it("through the same point twice (polar pair, two points, line): one is undefined", function () {
        var cdy = widget(poleAndTangents.concat(conics("ConicBy1Pol2P1L", ["A", "a", "B", "B", "d"])));
        cdy.evalcs("B.xy=(1.4,1.2)");
        undefinedCount(cdy).should.equal(1);
    });

    it("pole on the tangent (polar pair, two points, line): one is undefined", function () {
        var cdy = widget(
            poleAndTangents.concat(
                [P("C", -1.5, 1.7), J("e", "A", "D2")],
                conics("ConicBy1Pol2P1L", ["A", "a", "B", "C", "e"])
            )
        );
        cdy.evalcs("A.xy=(0.1,2.1)");
        undefinedCount(cdy).should.equal(1);
    });

    var fourPoints = [
        P("A", -1, 0),
        P("B", 1, 0.5),
        P("C", 0, 2),
        P("D", 0.5, -1),
        P("L1", -2, -1),
        P("L2", 2, -1.5),
        J("l", "L1", "L2"),
    ];

    it("through the same point twice, tangent to a line: both are undefined", function () {
        var cdy = widget(fourPoints.concat(conics("ConicBy4p1l", ["A", "B", "C", "C", "l"])));
        cdy.evalcs("A.xy=(-1.2,0.1)");
        undefinedCount(cdy).should.equal(2);
    });

    it("through two points of the tangent: both are undefined", function () {
        var cdy = widget(fourPoints.concat([J("m", "A", "C")], conics("ConicBy4p1l", ["A", "B", "C", "D", "m"])));
        cdy.evalcs("B.xy=(1.1,0.4)");
        undefinedCount(cdy).should.equal(2);
    });

    it("circle through the same point twice: undefined", function () {
        var cdy = widget([
            P("A", -1.1, 0.3),
            P("C", 0.7, 2.1),
            { name: "K", type: "CircleBy3", args: ["A", "C", "C"] },
        ]);
        cdy.evalcs("A.xy=(-1.2,0.4)");
        isUndefined(cdy, "K").should.equal(true);
    });

    it("intersections with a conic that is undefined from the start", function () {
        // X is not determined (A on d); what is computed from it is traced as
        // from any zero solution
        var cdy = widget(
            [P("A", 0, 3), P("A1", 1, 2), P("B", 1, 0), P("C", -1, 1), J("d", "A", "A1")].concat(
                [{ name: "a", type: "HorizontalLine", pos: [0, 1, 0] }],
                conics("ConicBy1Pol2P1L", ["A", "a", "B", "C", "d"]),
                [{ name: "I", type: "IntersectLC", args: ["a", "X"] }]
            )
        );
        cdy.evalcs("B.xy=(1.1,0.1)");
        undefinedCount(cdy).should.equal(1);
    });

    it("tangent to the same line twice (point, four lines): both are undefined", function () {
        var cdy = widget(
            fourPoints.concat(
                [J("g", "A", "B"), J("h", "B", "C"), J("k", "C", "D"), P("Q", 0.2, 0.3)],
                conics("ConicBy1p4l", ["Q", "g", "h", "h", "k"])
            )
        );
        cdy.evalcs("Q.xy=(0.3,0.2)");
        undefinedCount(cdy).should.equal(2);
    });
});
