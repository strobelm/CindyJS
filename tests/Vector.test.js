var rewire = require("rewire");

var cindyJS = rewire("../build/js/exposed.js");

var VOps = rewire("../plugins/QuickHull3D/src/js/Vector.js");
var Vector = VOps.__get__("Vector");
var VO = VOps.__get__("VectorOperations");

describe("Vector operations", () => {
    var v1, v2, result, expected, s;

    describe("result is vector", () => {
        beforeEach(() => {
            v1 = new Vector(1, 2, 3);
            v2 = new Vector(0.5, 3, 7);
            s = 2;
        });

        afterEach(() => {
            expect(result.x).toBe(expected.x);
            expect(result.y).toBe(expected.y);
            expect(result.z).toBe(expected.z);
        });

        it("initialization", () => {
            result = new Vector(1, 2, 3);
            expected = { x: 1, y: 2, z: 3 };
        });

        it("add", () => {
            result = VO.add(v1, v2);
            expected = { x: 1.5, y: 5, z: 10 };
        });

        it("sub", () => {
            result = VO.sub(v1, v2);
            expected = { x: 0.5, y: -1, z: -4 };
        });

        it("scalmult", () => {
            result = VO.scalmult(s, v1);
            expected = { x: 2, y: 4, z: 6 };
        });

        it("scaldiv", () => {
            result = VO.scaldiv(s, v1);
            expected = { x: 0.5, y: 1, z: 1.5 };
        });

        it("normalize", () => {
            var norm = Math.sqrt(14);
            result = VO.normalize(v1);
            expected = { x: 1 / norm, y: 2 / norm, z: 3 / norm };
        });

        it("try to normalize already normalized", () => {
            v1 = { x: 1 + 1e-16, y: 0, z: 0 };
            result = VO.normalize(v1);
            expected = v1;
        });

        it("cross", () => {
            result = VO.cross(v1, v2);
            expected = { x: 5, y: -5.5, z: 2 };
        });
    });

    describe("result is scalar", () => {
        beforeEach(() => {
            v1 = new Vector(1, 2, 3);
            v2 = new Vector(0.5, 3, 7);
            s = 2;
        });

        afterEach(() => {
            expect(result).toBe(expected);
        });

        it("abs2", () => {
            result = VO.abs2(v1);
            expected = 14;
        });

        it("abs", () => {
            result = VO.abs(v1);
            expected = Math.sqrt(14);
        });

        it("distance2", () => {
            result = VO.distance2(v1, v2);
            expected = 17.25;
        });

        it("distance", () => {
            result = VO.distance(v1, v2);
            expected = Math.sqrt(17.25);
        });

        it("scalproduct", () => {
            result = VO.scalproduct(v1, v2);
            expected = 27.5;
        });
    });
});
