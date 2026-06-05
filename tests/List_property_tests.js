/*
 * Property-based tests (fast-check) for the matrix/vector hot paths in
 * src/js/libcs/List.js.
 *
 * These cover:
 *   - scalproduct / productMV / productVM / productMM (inlined complex arithmetic)
 *   - List.mult dispatch (structural, not via isNumber{Vector,Matrix})
 *   - det / LUdecomp / LUsolve / getBlock / setBlock / copyMatrix (structural copies)
 *   - isUpperTriangular (transpose-free)
 * and the CSNumber shared singletons (zero/one/infinity/nan/z3a/z3b/cub*),
 * which are returned by reference and must never be mutated in place.
 *
 * Strategy: generate random complex matrices/vectors, compute the expected
 * result with an INDEPENDENT plain-JS reference, and compare against the
 * library output. Plus algebraic identities and aggressive non-mutation /
 * global-constant-integrity checks.
 */

const assert = require("chai").assert;
const fc = require("fast-check");
const rewire = require("rewire");

const cindyJS = rewire("../build/js/exposed.js");
const List = cindyJS.__get__("List");
const CSNumber = cindyJS.__get__("CSNumber");
const nada = cindyJS.__get__("nada");

const RUNS = 300;

//=== plain-JS complex reference arithmetic =================================

const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });
const cZero = () => ({ re: 0, im: 0 });

// reference products on arrays of {re,im}
function refDot(u, v) {
    let s = cZero();
    for (let i = 0; i < u.length; i++) s = cAdd(s, cMul(u[i], v[i]));
    return s;
}
function refMV(A, v) {
    return A.map((row) => refDot(row, v));
}
function refVM(v, B) {
    const n = B[0].length;
    const out = [];
    for (let j = 0; j < n; j++) {
        let s = cZero();
        for (let i = 0; i < v.length; i++) s = cAdd(s, cMul(v[i], B[i][j]));
        out.push(s);
    }
    return out;
}
function refMM(A, B) {
    const m = A.length,
        n = B[0].length,
        p = B.length;
    const out = [];
    for (let i = 0; i < m; i++) {
        const row = [];
        for (let j = 0; j < n; j++) {
            let s = cZero();
            for (let k = 0; k < p; k++) s = cAdd(s, cMul(A[i][k], B[k][j]));
            row.push(s);
        }
        out.push(row);
    }
    return out;
}
// reference determinant by Laplace expansion (exact for integer entries, small n)
function refDet(A) {
    const n = A.length;
    if (n === 1) return A[0][0];
    let det = cZero();
    for (let j = 0; j < n; j++) {
        const minor = A.slice(1).map((row) => row.filter((_, c) => c !== j));
        let term = cMul(A[0][j], refDet(minor));
        if (j % 2 === 1) term = cMul({ re: -1, im: 0 }, term);
        det = cAdd(det, term);
    }
    return det;
}

//=== conversion between plain JS and CindyJS structures ====================

const toNum = (c) => CSNumber.complex(c.re, c.im);
const toVec = (v) => List.turnIntoCSList(v.map(toNum));
const toMat = (m) => List.turnIntoCSList(m.map(toVec));

const numOf = (cs) => ({ re: cs.value.real, im: cs.value.imag });
const vecOf = (cs) => cs.value.map(numOf);
const matOf = (cs) => cs.value.map((r) => r.value.map(numOf));

//=== approximate equality =================================================

const EPS = 1e-9;
function cClose(a, b) {
    return Math.abs(a.re - b.re) <= EPS && Math.abs(a.im - b.im) <= EPS;
}
function vecClose(a, b) {
    return a.length === b.length && a.every((x, i) => cClose(x, b[i]));
}
function matClose(a, b) {
    return a.length === b.length && a.every((r, i) => vecClose(r, b[i]));
}

//=== arbitraries ==========================================================

// integer-valued complex entries keep reference arithmetic exact and avoid
// NaN/Infinity edge cases that would make comparison meaningless.
const arbC = fc.record({
    re: fc.integer({ min: -8, max: 8 }),
    im: fc.integer({ min: -6, max: 6 }),
});
const arbVec = (n) => fc.array(arbC, { minLength: n, maxLength: n });
const arbMat = (m, n) => fc.array(arbVec(n), { minLength: m, maxLength: m });
const dim = fc.integer({ min: 1, max: 5 });

// snapshot helper for mutation checks
const snap = (cs) => JSON.parse(JSON.stringify(cs));

describe("List property-based tests (fast-check)", function () {
    this.timeout(20000);

    //------------------------------------------------------------------
    // Multiplication correctness vs independent reference
    //------------------------------------------------------------------
    describe("multiplication matches independent reference", function () {
        it("scalproduct (vec·vec)", function () {
            fc.assert(
                fc.property(dim, (n) => {
                    return (
                        fc.assert(
                            fc.property(arbVec(n), arbVec(n), (u, v) => {
                                const got = numOf(List.scalproduct(toVec(u), toVec(v)));
                                return cClose(got, refDot(u, v));
                            }),
                            { numRuns: 40 }
                        ) === undefined
                    );
                }),
                { numRuns: 12 }
            );
        });

        it("productMV (mat·vec)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    (m, n) =>
                        fc.assert(
                            fc.property(arbMat(m, n), arbVec(n), (A, v) =>
                                vecClose(vecOf(List.productMV(toMat(A), toVec(v))), refMV(A, v))
                            ),
                            { numRuns: 30 }
                        ) === undefined
                ),
                { numRuns: 15 }
            );
        });

        it("productVM (vec·mat)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    (p, n) =>
                        fc.assert(
                            fc.property(arbVec(p), arbMat(p, n), (v, B) =>
                                vecClose(vecOf(List.productVM(toVec(v), toMat(B))), refVM(v, B))
                            ),
                            { numRuns: 30 }
                        ) === undefined
                ),
                { numRuns: 15 }
            );
        });

        it("productMM (mat·mat)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    (m, p, n) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, n), (A, B) =>
                                matClose(matOf(List.productMM(toMat(A), toMat(B))), refMM(A, B))
                            ),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 20 }
            );
        });
    });

    //------------------------------------------------------------------
    // List.mult dispatch: must route to the right product (structural test)
    //------------------------------------------------------------------
    describe("List.mult dispatches correctly", function () {
        it("vec·vec -> scalar dot", function () {
            fc.assert(
                fc.property(
                    dim,
                    (n) =>
                        fc.assert(
                            fc.property(arbVec(n), arbVec(n), (u, v) =>
                                cClose(numOf(List.mult(toVec(u), toVec(v))), refDot(u, v))
                            ),
                            { numRuns: 30 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("mat·vec, vec·mat, mat·mat agree with reference", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    (m, p, n) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbVec(p), arbMat(p, n), (A, v, B) => {
                                const mv = vecClose(vecOf(List.mult(toMat(A), toVec(v))), refMV(A, v));
                                const vm = vecClose(vecOf(List.mult(toVec(v), toMat(B))), refVM(v, B));
                                const mm = matClose(matOf(List.mult(toMat(A), toMat(B))), refMM(A, B));
                                return mv && vm && mm;
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 18 }
            );
        });

        it("dimension mismatch returns nada", function () {
            // mat (m x p) · vec(q) with q != p must be nada
            fc.assert(
                fc.property(arbMat(3, 2), arbVec(3), (A, v) => List.mult(toMat(A), toVec(v)) === nada),
                { numRuns: 20 }
            );
        });
    });

    //------------------------------------------------------------------
    // Algebraic identities
    //------------------------------------------------------------------
    describe("algebraic identities", function () {
        it("A·(B·v) == (A·B)·v  (associativity)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    (m, p, q) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, q), arbVec(q), (A, B, v) => {
                                const lhs = vecOf(List.mult(toMat(A), List.mult(toMat(B), toVec(v))));
                                const rhs = vecOf(List.mult(List.mult(toMat(A), toMat(B)), toVec(v)));
                                return vecClose(lhs, rhs);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 15 }
            );
        });

        it("A·I == A and I·A == A", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    (m, n) =>
                        fc.assert(
                            fc.property(arbMat(m, n), (A) => {
                                const I = List.idMatrix(CSNumber.real(n));
                                const Im = List.idMatrix(CSNumber.real(m));
                                const right = matClose(matOf(List.mult(toMat(A), I)), A);
                                const left = matClose(matOf(List.mult(Im, toMat(A))), A);
                                return right && left;
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("det matches Laplace reference (square)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), (A) => cClose(numOf(List.det(toMat(A))), refDet(A))),
                            { numRuns: 40 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("LUdet matches det", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), (A) => {
                                // LUdet is LU-based and returns a non-finite value on
                                // singular matrices (a zero pivot); skip those, as the
                                // other determinant tests do. The cofactor det and the
                                // dedicated singular-matrix test cover that case.
                                if (Math.hypot(refDet(A).re, refDet(A).im) < 1e-6) return true;
                                const M = toMat(A);
                                return cClose(numOf(List.LUdet(M)), numOf(List.det(M)));
                            }),
                            { numRuns: 30 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("det(A·B) == det(A)·det(B)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), arbMat(n, n), (A, B) => {
                                const dAB = numOf(List.det(List.mult(toMat(A), toMat(B))));
                                const dA = numOf(List.det(toMat(A)));
                                const dB = numOf(List.det(toMat(B)));
                                return cClose(dAB, cMul(dA, dB));
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("LUsolve: A·x == b for non-singular A", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), arbVec(n), (A, b) => {
                                const M = toMat(A);
                                // skip near-singular systems (reference det ~ 0)
                                if (Math.hypot(refDet(A).re, refDet(A).im) < 1e-6) return true;
                                const x = List.LUsolve(M, toVec(b));
                                const recon = vecOf(List.mult(M, x));
                                return vecClose(recon, b);
                            }),
                            { numRuns: 30 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });

    //------------------------------------------------------------------
    // getBlock / setBlock / copyMatrix
    //------------------------------------------------------------------
    describe("block helpers", function () {
        it("getBlock extracts the inclusive sub-block", function () {
            fc.assert(
                fc.property(arbMat(5, 5), fc.nat(4), fc.nat(4), fc.nat(4), fc.nat(4), (A, a, b, c, d) => {
                    const m0 = Math.min(a, b),
                        m1 = Math.max(a, b);
                    const n0 = Math.min(c, d),
                        n1 = Math.max(c, d);
                    const block = matOf(List._helper.getBlock(toMat(A), [m0, m1], [n0, n1]));
                    const expected = A.slice(m0, m1 + 1).map((row) => row.slice(n0, n1 + 1));
                    return matClose(block, expected);
                }),
                { numRuns: RUNS }
            );
        });

        it("setBlock places B and leaves the rest intact", function () {
            fc.assert(
                fc.property(arbMat(4, 4), arbMat(2, 2), fc.nat(2), fc.nat(2), (A, B, r, c) => {
                    const out = matOf(List._helper.setBlock(toMat(A), toMat(B), [r, c]));
                    const expected = A.map((row) => row.slice());
                    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) expected[r + i][c + j] = B[i][j];
                    return matClose(out, expected);
                }),
                { numRuns: RUNS }
            );
        });

        it("copyMatrix is a deep, independent copy", function () {
            fc.assert(
                fc.property(arbMat(4, 4), (A) => {
                    const M = toMat(A);
                    const C = List._helper.copyMatrix(M);
                    // equal values
                    if (!matClose(matOf(C), A)) return false;
                    // structurally independent: rows and entries are different objects
                    if (C === M || C.value === M.value) return false;
                    for (let i = 0; i < A.length; i++) {
                        if (C.value[i] === M.value[i] || C.value[i].value === M.value[i].value) return false;
                    }
                    // mutating the copy must not touch the original
                    C.value[0].value[0] = CSNumber.complex(999, 999);
                    return cClose(numOf(M.value[0].value[0]), A[0][0]);
                }),
                { numRuns: RUNS }
            );
        });
    });

    //------------------------------------------------------------------
    // Non-mutation of inputs (JSON-clone removals must stay safe)
    //------------------------------------------------------------------
    describe("operations never mutate their inputs", function () {
        const checkNoMutation = (genArgs, op) =>
            fc.assert(
                fc.property(genArgs, (args) => {
                    const before = args.map(snap);
                    op(...args);
                    return args.every((a, i) => JSON.stringify(a) === JSON.stringify(before[i]));
                }),
                { numRuns: 80 }
            );

        const squareMat = (n) => arbMat(n, n).map(toMat);

        it("det", function () {
            checkNoMutation(fc.tuple(squareMat(4)), (A) => List.det(A));
        });
        it("LUdecomp", function () {
            checkNoMutation(fc.tuple(squareMat(4)), (A) => List.LUdecomp(A));
        });
        it("LUsolve (matrix and rhs)", function () {
            checkNoMutation(fc.tuple(squareMat(3), arbVec(3).map(toVec)), (A, b) => List.LUsolve(A, b));
        });
        it("productMM", function () {
            checkNoMutation(fc.tuple(squareMat(3), squareMat(3)), (A, B) => List.productMM(A, B));
        });
        it("getBlock", function () {
            checkNoMutation(fc.tuple(squareMat(4)), (A) => List._helper.getBlock(A, [1], [1]));
        });
        it("setBlock", function () {
            checkNoMutation(fc.tuple(squareMat(4), squareMat(2)), (A, B) => List._helper.setBlock(A, B, [1, 1]));
        });
        it("QRdecomp", function () {
            checkNoMutation(fc.tuple(squareMat(3)), (A) => List.QRdecomp(A));
        });
    });

    //------------------------------------------------------------------
    // isUpperTriangular rewrite equivalence
    //------------------------------------------------------------------
    describe("isUpperTriangular equivalence", function () {
        it("matches the transpose-based definition", function () {
            fc.assert(
                fc.property(arbMat(4, 4), (A) => {
                    const M = toMat(A);
                    const got = List._helper.isUpperTriangular(M);
                    // reference: lower-triangular of transpose == every below-diagonal entry ~0
                    const ref = A.every((row, r) =>
                        row.every((e, c) => c >= r || (Math.abs(e.re) < 1e-10 && Math.abs(e.im) < 1e-10))
                    );
                    return got === ref;
                }),
                { numRuns: RUNS }
            );
        });

        it("recognises genuinely upper-triangular matrices", function () {
            fc.assert(
                fc.property(arbMat(4, 4), (A) => {
                    const U = A.map((row, r) => row.map((e, c) => (c >= r ? e : cZero())));
                    return List._helper.isUpperTriangular(toMat(U)) === true;
                }),
                { numRuns: RUNS }
            );
        });
    });

    //------------------------------------------------------------------
    // Shared-singleton integrity (the CSNumber.ts change)
    //------------------------------------------------------------------
    describe("CSNumber shared constants are never corrupted", function () {
        // encode each numeric field as a string so Infinity/NaN survive (plain
        // JSON would collapse both to null, hiding a corruption between them)
        const enc = (x) => String(x);
        const encNum = (cs) => `${enc(cs.value.real)}|${enc(cs.value.imag)}`;
        const encList = (cs) => cs.value.map(encNum).join(",");
        const constSnap = () => ({
            zero: encNum(CSNumber.zero),
            one: encNum(CSNumber.one),
            infinity: encNum(CSNumber.infinity),
            nan: encNum(CSNumber.nan),
            z3a: encNum(CSNumber._helper.z3a),
            z3b: encNum(CSNumber._helper.z3b),
            cub1: encList(CSNumber._helper.cub1),
            cub2: encList(CSNumber._helper.cub2),
            cub3: encList(CSNumber._helper.cub3),
        });

        const expected = {
            zero: { ctype: "number", value: { real: 0, imag: 0 } },
            one: { ctype: "number", value: { real: 1, imag: 0 } },
            infinity: { ctype: "number", value: { real: Infinity, imag: Infinity } },
        };

        it("constants hold their defined values after a heavy random workload", function () {
            // NaN serialises to null in JSON, but the reference test below is enough
            assert.deepStrictEqual(JSON.parse(JSON.stringify(CSNumber.zero)), expected.zero);
            assert.deepStrictEqual(JSON.parse(JSON.stringify(CSNumber.one)), expected.one);

            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    fc.array(arbC, { minLength: 0, maxLength: 16 }),
                    (n, _entries) => {
                        const before = constSnap();
                        // run a broad battery of operations that internally reference
                        // the shared constants (idMatrix, det, LU, inverse, products)
                        return (
                            fc.assert(
                                fc.property(arbMat(n, n), arbVec(n), (A, b) => {
                                    const M = toMat(A);
                                    List.det(M);
                                    List.LUdecomp(M);
                                    List.mult(M, M);
                                    List.mult(M, toVec(b));
                                    List.idMatrix(CSNumber.real(n));
                                    if (Math.hypot(refDet(A).re, refDet(A).im) > 1e-6) {
                                        List.LUsolve(M, toVec(b));
                                    }
                                    return true;
                                }),
                                { numRuns: 20 }
                            ) === undefined && JSON.stringify(constSnap()) === JSON.stringify(before)
                        );
                    }
                ),
                { numRuns: 10 }
            );

            // and still correct at the very end (Infinity/NaN can't round-trip
            // through JSON, so check those fields directly)
            assert.deepStrictEqual(JSON.parse(JSON.stringify(CSNumber.zero)), expected.zero);
            assert.deepStrictEqual(JSON.parse(JSON.stringify(CSNumber.one)), expected.one);
            assert.strictEqual(CSNumber.infinity.value.real, Infinity);
            assert.strictEqual(CSNumber.infinity.value.imag, Infinity);
            assert.isTrue(Number.isNaN(CSNumber.nan.value.real) && Number.isNaN(CSNumber.nan.value.imag));
        });
    });
});

//==========================================================================
// Degenerate / boundary cases
//==========================================================================
describe("List degenerate & boundary cases (fast-check)", function () {
    this.timeout(20000);

    const EMPTY = List.turnIntoCSList([]);
    const isNum = (cs) => cs !== nada && cs.ctype === "number";

    // A correct determinant of an *exactly* singular Gaussian-integer matrix is 0.
    // Numeric routines may legitimately surface that rank deficiency as a 0/0 ->
    // NaN/Inf (e.g. LUdet hitting a zero pivot). What must NEVER happen is a
    // spurious *finite non-zero* determinant (magnitude >= 1 for integer inputs).
    const detIndicatesSingular = (cs) => {
        if (cs === nada) return true;
        const v = cs.value;
        return !Number.isFinite(v.real) || !Number.isFinite(v.imag) || Math.hypot(v.real, v.imag) < 0.5;
    };

    //------------------------------------------------------------------
    // Empty operands (the `length === 0` branch added to List.mult)
    //------------------------------------------------------------------
    describe("empty operands", function () {
        it("empty·empty is the scalar 0 (degenerate dot product)", function () {
            const r = List.mult(EMPTY, EMPTY);
            assert.isTrue(isNum(r));
            assert.deepStrictEqual(numOf(r), { re: 0, im: 0 });
            // and scalproduct agrees
            assert.deepStrictEqual(numOf(List.scalproduct(EMPTY, EMPTY)), { re: 0, im: 0 });
        });

        it("empty·non-empty and non-empty·empty are nada (both orders)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbVec(n), (v) => {
                                return List.mult(EMPTY, toVec(v)) === nada && List.mult(toVec(v), EMPTY) === nada;
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 8 }
            );
        });

        it("scalproduct of mismatched lengths is nada", function () {
            fc.assert(
                fc.property(fc.integer({ min: 1, max: 5 }), fc.integer({ min: 1, max: 5 }), (m, n) => {
                    if (m === n) return true; // only test the mismatch
                    return (
                        fc.assert(
                            fc.property(arbVec(m), arbVec(n), (u, v) => List.scalproduct(toVec(u), toVec(v)) === nada),
                            { numRuns: 15 }
                        ) === undefined
                    );
                }),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // 1×1 / single-element shapes (smallest non-empty case for every path)
    //------------------------------------------------------------------
    describe("size-1 shapes", function () {
        it("1-element vectors multiply to a scalar dot, distinct from 1×1 matrices", function () {
            fc.assert(
                fc.property(arbC, arbC, (a, b) => {
                    // [a]·[b] -> scalar a*b
                    const dot = List.mult(toVec([a]), toVec([b]));
                    if (!cClose(numOf(dot), cMul(a, b))) return false;
                    // [[a]]·[[b]] -> [[a*b]] (matrix)
                    const mm = List.mult(toMat([[a]]), toMat([[b]]));
                    if (!matClose(matOf(mm), [[cMul(a, b)]])) return false;
                    // [[a]]·[b] -> [a*b] (vector)
                    const mv = List.mult(toMat([[a]]), toVec([b]));
                    return vecClose(vecOf(mv), [cMul(a, b)]);
                }),
                { numRuns: RUNS }
            );
        });

        it("det / LUdet of a 1×1 matrix is the entry itself", function () {
            fc.assert(
                fc.property(arbC, (a) => {
                    const M = toMat([[a]]);
                    return cClose(numOf(List.det(M)), a) && cClose(numOf(List.LUdet(M)), a);
                }),
                { numRuns: RUNS }
            );
        });

        it("isUpperTriangular is vacuously true for empty and 1×1", function () {
            assert.strictEqual(List._helper.isUpperTriangular(EMPTY), true);
            fc.assert(
                fc.property(arbC, (a) => List._helper.isUpperTriangular(toMat([[a]])) === true),
                { numRuns: 50 }
            );
        });
    });

    //------------------------------------------------------------------
    // Zero matrices / vectors
    //------------------------------------------------------------------
    describe("zero structures", function () {
        const zeros = (m, n) => Array.from({ length: m }, () => Array.from({ length: n }, () => ({ re: 0, im: 0 })));

        it("products against a zero matrix/vector are all zero", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    fc.integer({ min: 1, max: 4 }),
                    (m, n) =>
                        fc.assert(
                            fc.property(arbMat(m, n), arbVec(n), (A, v) => {
                                const Z = toVec(zeros(1, n)[0]); // zero vector of length n
                                const mz = vecOf(List.mult(toMat(A), Z));
                                const allZeroVec = mz.every((c) => cClose(c, { re: 0, im: 0 }));
                                const ZM = toMat(zeros(n, n));
                                const mzm = matOf(List.mult(ZM, ZM));
                                const allZeroMat = mzm.every((r) => r.every((c) => cClose(c, { re: 0, im: 0 })));
                                return allZeroVec && allZeroMat;
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("det of a zero matrix is 0", function () {
            fc.assert(
                fc.property(fc.integer({ min: 1, max: 5 }), (n) =>
                    cClose(numOf(List.det(toMat(zeros(n, n)))), { re: 0, im: 0 })
                ),
                { numRuns: 5 }
            );
        });
    });

    //------------------------------------------------------------------
    // Singular (rank-deficient) matrices: det == 0
    //------------------------------------------------------------------
    describe("singular matrices", function () {
        it("a matrix with a duplicated row has det 0 (det and LUdet)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 5 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), fc.nat(100), fc.nat(100), (A, i, j) => {
                                const r1 = i % n;
                                let r2 = j % n;
                                if (r2 === r1) r2 = (r2 + 1) % n;
                                const S = A.map((row) => row.slice());
                                S[r2] = S[r1].slice(); // duplicate row -> singular
                                const M = toMat(S);
                                // det is exactly 0; LUdet must at least not claim non-singular
                                return (
                                    cClose(numOf(List.det(M)), { re: 0, im: 0 }) && detIndicatesSingular(List.LUdet(M))
                                );
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 8 }
            );
        });

        it("a matrix with an all-zero row has det 0", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 5 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), fc.nat(100), (A, k) => {
                                const S = A.map((row) => row.slice());
                                S[k % n] = S[k % n].map(() => ({ re: 0, im: 0 }));
                                return cClose(numOf(List.det(toMat(S))), { re: 0, im: 0 });
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 8 }
            );
        });
    });

    //------------------------------------------------------------------
    // Dimension mismatches: every product path must return nada
    //------------------------------------------------------------------
    describe("dimension mismatches return nada", function () {
        it("productMV / productVM / productMM / mult reject incompatible shapes", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    fc.integer({ min: 1, max: 4 }),
                    fc.integer({ min: 1, max: 4 }),
                    fc.integer({ min: 1, max: 4 }),
                    (m, p, q, n) => {
                        if (p === q) return true; // need an actual mismatch on the contracted dim
                        return (
                            fc.assert(
                                fc.property(arbMat(m, p), arbVec(q), arbMat(q, n), (A, v, B) => {
                                    const mv = List.productMV(toMat(A), toVec(v)) === nada;
                                    const vm = List.productVM(toVec(v), toMat(A)) === nada; // len(v)=q != rows(A)=m? only if q!=m
                                    const mm = List.productMM(toMat(A), toMat(B)) === nada; // cols(A)=p != rows(B)=q
                                    const dispatch = List.mult(toMat(A), toVec(v)) === nada;
                                    // vm is only guaranteed nada when q != m; guard it
                                    return mv && mm && dispatch && (q === m || vm);
                                }),
                                { numRuns: 15 }
                            ) === undefined
                        );
                    }
                ),
                { numRuns: 15 }
            );
        });
    });

    //------------------------------------------------------------------
    // getBlock / setBlock at the boundaries
    //------------------------------------------------------------------
    describe("block helpers at boundaries", function () {
        it("getBlock of the full index range reproduces the matrix", function () {
            fc.assert(
                fc.property(arbMat(4, 4), (A) => matClose(matOf(List._helper.getBlock(toMat(A), [0, 3], [0, 3])), A)),
                { numRuns: 100 }
            );
        });

        it("getBlock of a single cell, the first row, and the last column", function () {
            fc.assert(
                fc.property(arbMat(4, 4), fc.nat(3), fc.nat(3), (A, r, c) => {
                    const cell = matOf(List._helper.getBlock(toMat(A), [r, r], [c, c]));
                    if (!matClose(cell, [[A[r][c]]])) return false;
                    const firstRow = matOf(List._helper.getBlock(toMat(A), [0, 0], [0, 3]));
                    if (!matClose(firstRow, [A[0]])) return false;
                    const lastCol = matOf(List._helper.getBlock(toMat(A), [0, 3], [3, 3]));
                    return matClose(
                        lastCol,
                        A.map((row) => [row[3]])
                    );
                }),
                { numRuns: 100 }
            );
        });

        it("setBlock overwriting the entire matrix yields B; single-cell set is local", function () {
            fc.assert(
                fc.property(arbMat(3, 3), arbMat(3, 3), arbC, fc.nat(2), fc.nat(2), (A, B, x, r, c) => {
                    const full = matOf(List._helper.setBlock(toMat(A), toMat(B), [0, 0]));
                    if (!matClose(full, B)) return false;
                    const one = matOf(List._helper.setBlock(toMat(A), toMat([[x]]), [r, c]));
                    const expected = A.map((row) => row.slice());
                    expected[r][c] = x;
                    return matClose(one, expected);
                }),
                { numRuns: 100 }
            );
        });

        it("copyMatrix handles single-row and single-column matrices", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }),
                    (k) =>
                        fc.assert(
                            fc.property(arbMat(1, k), arbMat(k, 1), (rowMat, colMat) => {
                                const cr = matOf(List._helper.copyMatrix(toMat(rowMat)));
                                const cc = matOf(List._helper.copyMatrix(toMat(colMat)));
                                return matClose(cr, rowMat) && matClose(cc, colMat);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 8 }
            );
        });
    });
});

//==========================================================================
// More algebraic identities (ring/linear-algebra laws)
//==========================================================================
describe("List more algebraic identities (fast-check)", function () {
    this.timeout(30000);

    // plain-JS complex helpers beyond the ones at module scope
    const cSub = (a, b) => ({ re: a.re - b.re, im: a.im - b.im });
    const cNeg = (a) => ({ re: -a.re, im: -a.im });
    const cPow = (a, k) => {
        let r = { re: 1, im: 0 };
        for (let i = 0; i < k; i++) r = cMul(r, a);
        return r;
    };
    // relative tolerance for identities whose magnitude can grow (powers, division)
    const closeR = (a, b) => {
        const s = Math.max(1, Math.abs(a.re), Math.abs(a.im), Math.abs(b.re), Math.abs(b.im));
        return Math.abs(a.re - b.re) <= 1e-6 * s && Math.abs(a.im - b.im) <= 1e-6 * s;
    };
    const vecCloseR = (a, b) => a.length === b.length && a.every((x, i) => closeR(x, b[i]));
    const matCloseR = (a, b) => a.length === b.length && a.every((r, i) => vecCloseR(r, b[i]));

    const idMat = (n) => matOf(List.idMatrix(CSNumber.real(n)));

    //------------------------------------------------------------------
    // Distributivity of multiplication over addition
    //------------------------------------------------------------------
    describe("distributivity", function () {
        it("A·(B+C) == A·B + A·C  (matrix)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    (m, p, n) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, n), arbMat(p, n), (A, B, C) => {
                                const lhs = matOf(List.mult(toMat(A), List.add(toMat(B), toMat(C))));
                                const rhs = matOf(
                                    List.add(List.mult(toMat(A), toMat(B)), List.mult(toMat(A), toMat(C)))
                                );
                                return matClose(lhs, rhs);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("(A+B)·v == A·v + B·v  and  A·(u+v) == A·u + A·v", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    (m, n) =>
                        fc.assert(
                            fc.property(arbMat(m, n), arbMat(m, n), arbVec(n), arbVec(n), (A, B, u, v) => {
                                const right = vecClose(
                                    vecOf(List.mult(List.add(toMat(A), toMat(B)), toVec(u))),
                                    vecOf(List.add(List.mult(toMat(A), toVec(u)), List.mult(toMat(B), toVec(u))))
                                );
                                const left = vecClose(
                                    vecOf(List.mult(toMat(A), List.add(toVec(u), toVec(v)))),
                                    vecOf(List.add(List.mult(toMat(A), toVec(u)), List.mult(toMat(A), toVec(v))))
                                );
                                return right && left;
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // Scalar homogeneity & matrix associativity
    //------------------------------------------------------------------
    describe("homogeneity & associativity", function () {
        it("(α·A)·B == α·(A·B) == A·(α·B)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    arbC,
                    (m, p, n, alpha) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, n), (A, B) => {
                                const a = toNum(alpha);
                                const base = List.mult(toMat(A), toMat(B));
                                const scaled = matOf(List.scalmult(a, base));
                                const left = matOf(List.mult(List.scalmult(a, toMat(A)), toMat(B)));
                                const right = matOf(List.mult(toMat(A), List.scalmult(a, toMat(B))));
                                return matClose(left, scaled) && matClose(right, scaled);
                            }),
                            { numRuns: 18 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("(A·B)·C == A·(B·C)  (matrix associativity)", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    dim,
                    (m, p, q, n) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, q), arbMat(q, n), (A, B, C) => {
                                const lhs = matOf(List.mult(List.mult(toMat(A), toMat(B)), toMat(C)));
                                const rhs = matOf(List.mult(toMat(A), List.mult(toMat(B), toMat(C))));
                                return matClose(lhs, rhs);
                            }),
                            { numRuns: 15 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // Transpose laws
    //------------------------------------------------------------------
    describe("transpose laws", function () {
        it("(Aᵀ)ᵀ == A  and  (A+B)ᵀ == Aᵀ+Bᵀ", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    (m, n) =>
                        fc.assert(
                            fc.property(arbMat(m, n), arbMat(m, n), (A, B) => {
                                const invol = matClose(matOf(List.transpose(List.transpose(toMat(A)))), A);
                                const addT = matClose(
                                    matOf(List.transpose(List.add(toMat(A), toMat(B)))),
                                    matOf(List.add(List.transpose(toMat(A)), List.transpose(toMat(B))))
                                );
                                return invol && addT;
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("(A·B)ᵀ == Bᵀ·Aᵀ", function () {
            fc.assert(
                fc.property(
                    dim,
                    dim,
                    dim,
                    (m, p, n) =>
                        fc.assert(
                            fc.property(arbMat(m, p), arbMat(p, n), (A, B) => {
                                const lhs = matOf(List.transpose(List.mult(toMat(A), toMat(B))));
                                const rhs = matOf(List.mult(List.transpose(toMat(B)), List.transpose(toMat(A))));
                                return matClose(lhs, rhs);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("det(Aᵀ) == det(A)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), (A) =>
                                cClose(numOf(List.det(List.transpose(toMat(A)))), numOf(List.det(toMat(A))))
                            ),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });

    //------------------------------------------------------------------
    // Determinant laws
    //------------------------------------------------------------------
    describe("determinant laws", function () {
        it("det(I) == 1", function () {
            fc.assert(
                fc.property(fc.integer({ min: 1, max: 6 }), (n) =>
                    cClose(numOf(List.det(List.idMatrix(CSNumber.real(n)))), { re: 1, im: 0 })
                ),
                { numRuns: 6 }
            );
        });

        it("det(α·A) == αⁿ·det(A)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 4 }),
                    arbC,
                    (n, alpha) =>
                        fc.assert(
                            fc.property(arbMat(n, n), (A) => {
                                const a = toNum(alpha);
                                const lhs = numOf(List.det(List.scalmult(a, toMat(A))));
                                const rhs = cMul(cPow(alpha, n), numOf(List.det(toMat(A))));
                                return closeR(lhs, rhs);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("swapping two rows negates the determinant", function () {
            fc.assert(
                fc.property(fc.integer({ min: 2, max: 5 }), fc.nat(100), fc.nat(100), (n, i, j) => {
                    const r1 = i % n;
                    let r2 = j % n;
                    if (r2 === r1) r2 = (r2 + 1) % n;
                    return (
                        fc.assert(
                            fc.property(arbMat(n, n), (A) => {
                                const S = A.map((row) => row.slice());
                                const t = S[r1];
                                S[r1] = S[r2];
                                S[r2] = t;
                                return cClose(numOf(List.det(toMat(S))), cNeg(numOf(List.det(toMat(A)))));
                            }),
                            { numRuns: 20 }
                        ) === undefined
                    );
                }),
                { numRuns: 10 }
            );
        });

        it("det of an upper-triangular matrix is the product of its diagonal", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 5 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n, n), (A) => {
                                const U = A.map((row, r) => row.map((e, c) => (c >= r ? e : cZero())));
                                let prod = { re: 1, im: 0 };
                                for (let k = 0; k < n; k++) prod = cMul(prod, U[k][k]);
                                return cClose(numOf(List.det(toMat(U))), prod);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });

    //------------------------------------------------------------------
    // scalproduct bilinearity / symmetry
    //------------------------------------------------------------------
    describe("scalproduct is a symmetric bilinear form", function () {
        it("⟨u,v⟩ == ⟨v,u⟩  (symmetry)", function () {
            fc.assert(
                fc.property(
                    dim,
                    (n) =>
                        fc.assert(
                            fc.property(arbVec(n), arbVec(n), (u, v) =>
                                cClose(
                                    numOf(List.scalproduct(toVec(u), toVec(v))),
                                    numOf(List.scalproduct(toVec(v), toVec(u)))
                                )
                            ),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("⟨α·u, v+w⟩ == α·(⟨u,v⟩ + ⟨u,w⟩)  (linearity)", function () {
            fc.assert(
                fc.property(
                    dim,
                    arbC,
                    (n, alpha) =>
                        fc.assert(
                            fc.property(arbVec(n), arbVec(n), arbVec(n), (u, v, w) => {
                                const a = toNum(alpha);
                                const lhs = numOf(
                                    List.scalproduct(List.scalmult(a, toVec(u)), List.add(toVec(v), toVec(w)))
                                );
                                const rhs = cMul(
                                    alpha,
                                    cAdd(
                                        numOf(List.scalproduct(toVec(u), toVec(v))),
                                        numOf(List.scalproduct(toVec(u), toVec(w)))
                                    )
                                );
                                return cClose(lhs, rhs);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });

    //------------------------------------------------------------------
    // Inverse laws (non-singular matrices)
    //------------------------------------------------------------------
    describe("matrix inverse", function () {
        const nonSingular = (n) => arbMat(n, n).filter((A) => Math.hypot(refDet(A).re, refDet(A).im) > 1);

        it("A·A⁻¹ == I == A⁻¹·A", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(nonSingular(n), (A) => {
                                const M = toMat(A);
                                const inv = List.inverse(M);
                                const right = matCloseR(matOf(List.mult(M, inv)), idMat(n));
                                const left = matCloseR(matOf(List.mult(inv, M)), idMat(n));
                                return right && left;
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });

        it("det(A⁻¹) == 1/det(A)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 4 }),
                    (n) =>
                        fc.assert(
                            fc.property(nonSingular(n), (A) => {
                                const M = toMat(A);
                                const dInv = numOf(List.det(List.inverse(M)));
                                const d = numOf(List.det(M));
                                // 1/d  (complex reciprocal)
                                const denom = d.re * d.re + d.im * d.im;
                                const recip = { re: d.re / denom, im: -d.im / denom };
                                return closeR(dInv, recip);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });

    //------------------------------------------------------------------
    // Cross product (3-vectors)
    //------------------------------------------------------------------
    describe("cross product (3-vectors)", function () {
        const arb3 = arbVec(3);

        it("a×b == -(b×a)  and  a×a == 0", function () {
            fc.assert(
                fc.property(arb3, arb3, (a, b) => {
                    const ab = vecOf(List.cross(toVec(a), toVec(b)));
                    const ba = vecOf(List.cross(toVec(b), toVec(a))).map(cNeg);
                    const aa = vecOf(List.cross(toVec(a), toVec(a)));
                    return vecClose(ab, ba) && aa.every((c) => cClose(c, cZero()));
                }),
                { numRuns: RUNS }
            );
        });

        it("a·(a×b) == 0  (orthogonality)", function () {
            fc.assert(
                fc.property(arb3, arb3, (a, b) =>
                    cClose(numOf(List.scalproduct(toVec(a), List.cross(toVec(a), toVec(b)))), cZero())
                ),
                { numRuns: RUNS }
            );
        });

        it("a·(b×c) == det([a;b;c])  (scalar triple product)", function () {
            fc.assert(
                fc.property(arb3, arb3, arb3, (a, b, c) => {
                    const triple = numOf(List.scalproduct(toVec(a), List.cross(toVec(b), toVec(c))));
                    const det = numOf(List.det(toMat([a, b, c])));
                    return cClose(triple, det);
                }),
                { numRuns: RUNS }
            );
        });
    });
});
