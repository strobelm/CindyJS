/*
 * Property-based tests (fast-check) for the upgraded eigenvalue engine
 * (Hessenberg + shifted Givens-QR for n>=4, closed forms for n<=3) on the
 * `eig-implicit-qr` branch.
 *
 * Correctness is checked oracle-free, via invariants that pin the eigenvalues:
 *   - triangular matrix  => eigenvalue multiset == diagonal  (complete, any n)
 *   - sum of eigenvalues == trace(A)                          (e1)
 *   - sum of pairwise products == (tr^2 - tr(A^2))/2          (e2)
 *   - product of eigenvalues == det(A)                        (en)
 *   - each eigenvector v from eig() satisfies A v == lambda v
 */

const assert = require("chai").assert;
const fc = require("fast-check");
const rewire = require("rewire");

const cindyJS = rewire("../build/js/exposed.js");
const List = cindyJS.__get__("List");
const CSNumber = cindyJS.__get__("CSNumber");

//=== plain-JS complex helpers / conversions ===============================

const cAdd = (a, b) => ({ re: a.re + b.re, im: a.im + b.im });
const cMul = (a, b) => ({ re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re });

const toNum = (c) => CSNumber.complex(c.re, c.im);
const toMat = (m) => List.turnIntoCSList(m.map((r) => List.turnIntoCSList(r.map(toNum))));
const numOf = (cs) => ({ re: cs.value.real, im: cs.value.imag });

// relative tolerance: eigenvalues of dense matrices can be mildly ill-conditioned
const closeR = (a, b, rel) => {
    const s = Math.max(1, Math.abs(a.re), Math.abs(a.im), Math.abs(b.re), Math.abs(b.im));
    const t = (rel || 1e-6) * s;
    return Math.abs(a.re - b.re) <= t && Math.abs(a.im - b.im) <= t;
};

// sort complex numbers by (re, im) with rounding so ties are stable
const sortC = (arr) =>
    arr.slice().sort((x, y) => {
        const dr = Math.round((x.re - y.re) * 1e6);
        if (dr !== 0) return dr;
        return Math.round((x.im - y.im) * 1e6);
    });

const multisetClose = (a, b, rel) => {
    if (a.length !== b.length) return false;
    const sa = sortC(a),
        sb = sortC(b);
    return sa.every((x, i) => closeR(x, sb[i], rel));
};

const eigvalsOf = (A) => List.eig(A).value[0].value.map(numOf);

//=== arbitraries ==========================================================

const arbC = fc.record({
    re: fc.integer({ min: -5, max: 5 }),
    im: fc.integer({ min: -4, max: 4 }),
});
const arbMat = (n) => fc.array(fc.array(arbC, { minLength: n, maxLength: n }), { minLength: n, maxLength: n });

describe("eig eigenvalue engine (fast-check)", function () {
    this.timeout(30000);

    //------------------------------------------------------------------
    // Triangular matrices: eigenvalues are exactly the diagonal.
    // This is a *complete* correctness check for any dimension.
    //------------------------------------------------------------------
    describe("triangular => eigenvalues are the diagonal", function () {
        it("upper-triangular, n = 1..6", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                // zero the strictly-lower part
                                const U = M.map((row, i) => row.map((e, j) => (j >= i ? e : { re: 0, im: 0 })));
                                const diag = U.map((row, i) => row[i]);
                                return multisetClose(eigvalsOf(toMat(U)), diag, 1e-6);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("lower-triangular, n = 1..6", function () {
            // A lower-triangular matrix is non-normal, so Hessenberg+QR recomputes
            // its eigenvalues with error ~ eps^(1/m) for an m-fold repeated value
            // (inherent conditioning, true of any backward-stable solver). To test
            // the reduction *pipeline* tightly, force a distinct, well-separated
            // diagonal (spacing 12 > max perturbation 10) -> well-conditioned spectrum.
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const Lo = M.map((row, i) =>
                                    row.map((e, j) => {
                                        if (j > i) return { re: 0, im: 0 };
                                        if (j === i) return { re: 12 * (i + 1) + e.re, im: e.im }; // distinct diagonal
                                        return e; // random strictly-lower part (exercises the reduction)
                                    })
                                );
                                const diag = Lo.map((row, i) => row[i]);
                                return multisetClose(eigvalsOf(toMat(Lo)), diag, 1e-6);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // Characteristic-polynomial coefficients (Newton/Vieta) for dense matrices
    //------------------------------------------------------------------
    describe("eigenvalues match char-poly coefficients of dense matrices", function () {
        const traceOf = (A) => {
            let t = { re: 0, im: 0 };
            for (let i = 0; i < A.value.length; i++) t = cAdd(t, numOf(A.value[i].value[i]));
            return t;
        };

        it("sum(lambda) == trace(A)   (n = 1..6)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const A = toMat(M);
                                const sum = eigvalsOf(A).reduce(cAdd, { re: 0, im: 0 });
                                return closeR(sum, traceOf(A), 1e-5);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("prod(lambda) == det(A)   (n = 1..6)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const A = toMat(M);
                                const prod = eigvalsOf(A).reduce(cMul, { re: 1, im: 0 });
                                return closeR(prod, numOf(List.det(A)), 1e-4);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });

        it("sum_{i<j} lambda_i lambda_j == (tr^2 - tr(A^2))/2   (e2, n = 2..6)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const A = toMat(M);
                                const ev = eigvalsOf(A);
                                // e2 from eigenvalues
                                let e2 = { re: 0, im: 0 };
                                for (let i = 0; i < ev.length; i++)
                                    for (let j = i + 1; j < ev.length; j++) e2 = cAdd(e2, cMul(ev[i], ev[j]));
                                // e2 from matrix: (tr^2 - tr(A^2)) / 2
                                const tr = traceOf(A);
                                const A2 = List.mult(A, A);
                                const trA2 = traceOf(A2);
                                const e2mat = {
                                    re: (cMul(tr, tr).re - trA2.re) / 2,
                                    im: (cMul(tr, tr).im - trA2.im) / 2,
                                };
                                return closeR(e2, e2mat, 1e-4);
                            }),
                            { numRuns: 25 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // Eigenvector residual: A v == lambda v for the vectors eig() returns.
    // NOTE: eig() returns eigenvectors as the COLUMNS of res.value[1]
    // (it transposes before returning), so column k pairs with eigenvalue k.
    //------------------------------------------------------------------
    describe("eig() eigenpairs satisfy A v == lambda v", function () {
        const columnK = (V, k) => List.turnIntoCSList(V.value.map((row) => row.value[k]));

        it("residual is ~0 for each returned eigenvector (n = 2..6)", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 2, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const A = toMat(M);
                                const res = List.eig(A);
                                const vals = res.value[0].value;
                                const V = res.value[1];
                                for (let k = 0; k < n; k++) {
                                    const v = columnK(V, k);
                                    const lam = vals[k];
                                    if (List.abs(v).value.real < 1e-9) continue; // skip null/defective vectors
                                    const Av = List.mult(A, v).value.map(numOf);
                                    const lv = v.value.map((e) => cMul(numOf(lam), numOf(e)));
                                    for (let i = 0; i < Av.length; i++) if (!closeR(Av[i], lv[i], 1e-4)) return false;
                                }
                                return true;
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 12 }
            );
        });
    });

    //------------------------------------------------------------------
    // Transpose invariance of the spectrum
    //------------------------------------------------------------------
    describe("spectrum invariants", function () {
        // A and A^T share the exact same spectrum. The computed spectra agree to
        // working precision for well-conditioned eigenvalues; for dense matrices
        // with (near-)defective clusters, individual eigenvalues are only
        // conditioning-accurate (~1e-3), so we use a tolerance that still catches
        // any genuinely wrong eigenvalue (which would be off by O(1)).
        it("eig(A^T) multiset == eig(A) multiset", function () {
            fc.assert(
                fc.property(
                    fc.integer({ min: 1, max: 6 }),
                    (n) =>
                        fc.assert(
                            fc.property(arbMat(n), (M) => {
                                const A = toMat(M);
                                return multisetClose(eigvalsOf(A), eigvalsOf(List.transpose(A)), 1e-2);
                            }),
                            { numRuns: 20 }
                        ) === undefined
                ),
                { numRuns: 10 }
            );
        });
    });
});
