const assert = require("chai").assert;
const rewire = require("rewire");

const cindyJS = rewire("../build/js/exposed.js");

const List = cindyJS.__get__("List");
const CSNumber = cindyJS.__get__("CSNumber");

// assert the spectrum of A equals `expected` (numbers are real eigenvalues,
// [re, im] pairs are complex ones) as a multiset, matching each expected value
// to its nearest computed eigenvalue within tolerance
function assertSpectrum(A, expected, tol) {
    tol = tol || 1e-6;
    const got = List.eig(A).value[0].value.map((z) => [z.value.real, z.value.imag]);
    const exp = expected.map((e) => (Array.isArray(e) ? e : [e, 0]));
    assert.equal(got.length, exp.length, "eigenvalue count");
    const used = new Array(got.length).fill(false);
    for (const e of exp) {
        let best = -1;
        let bestDist = Infinity;
        for (let j = 0; j < got.length; j++) {
            if (used[j]) continue;
            const d = Math.hypot(got[j][0] - e[0], got[j][1] - e[1]);
            if (d < bestDist) {
                bestDist = d;
                best = j;
            }
        }
        assert.isAtMost(bestDist, tol, "no computed eigenvalue near [" + e[0] + ", " + e[1] + "]");
        used[best] = true;
    }
}

// assert every eigenpair returned by eig() satisfies A v = lambda v
// (eig returns eigenvectors as the columns of res.value[1])
function assertEigenpairs(A, tol) {
    tol = tol || 1e-6;
    const res = List.eig(A);
    const vals = res.value[0].value;
    const V = res.value[1];
    const n = vals.length;
    for (let k = 0; k < n; k++) {
        const v = List.turnIntoCSList(V.value.map((row) => row.value[k]));
        if (List.abs(v).value.real < 1e-9) continue; // skip null/defective vectors
        const Av = List.productMV(A, v).value;
        const lv = v.value.map((e) => CSNumber.mult(vals[k], e));
        for (let i = 0; i < n; i++) {
            assert.closeTo(Av[i].value.real, lv[i].value.real, tol, "Av re k=" + k + " i=" + i);
            assert.closeTo(Av[i].value.imag, lv[i].value.imag, tol, "Av im k=" + k + " i=" + i);
        }
    }
}

describe("List.eig", function () {
    describe("closed-form path (n <= 3)", function () {
        it("1x1 matrix", function () {
            assertSpectrum(List.realMatrix([[7]]), [7]);
        });

        it("2x2 real eigenvalues", function () {
            assertSpectrum(
                List.realMatrix([
                    [2, 0],
                    [0, 3],
                ]),
                [2, 3]
            );
        });

        it("2x2 complex eigenvalues", function () {
            assertSpectrum(
                List.realMatrix([
                    [0, -1],
                    [1, 0],
                ]),
                [
                    [0, 1],
                    [0, -1],
                ]
            );
        });

        it("3x3 diagonal", function () {
            assertSpectrum(
                List.realMatrix([
                    [1, 0, 0],
                    [0, 2, 0],
                    [0, 0, 3],
                ]),
                [1, 2, 3]
            );
        });

        it("3x3 symmetric tridiagonal (2, 2 +/- sqrt 2)", function () {
            assertSpectrum(
                List.realMatrix([
                    [2, 1, 0],
                    [1, 2, 1],
                    [0, 1, 2],
                ]),
                [2, 2 - Math.SQRT2, 2 + Math.SQRT2]
            );
        });

        it("3x3 with a complex conjugate pair", function () {
            assertSpectrum(
                List.realMatrix([
                    [2, 0, 0],
                    [0, 0, -1],
                    [0, 1, 0],
                ]),
                [2, [0, 1], [0, -1]]
            );
        });

        it("3x3 defective Jordan block (eigenvalue 2, multiplicity 3)", function () {
            assertSpectrum(
                List.realMatrix([
                    [2, 1, 0],
                    [0, 2, 1],
                    [0, 0, 2],
                ]),
                [2, 2, 2]
            );
        });

        it("3x3 with a repeated eigenvalue (cubic fallback)", function () {
            // symmetric, spectrum {2, 2, 5}; the repeated root makes the closed-form
            // cubic non-finite, so this exercises the fallback to the iterative path
            assertSpectrum(
                List.realMatrix([
                    [3, 1, 1],
                    [1, 3, 1],
                    [1, 1, 3],
                ]),
                [2, 2, 5]
            );
        });
    });

    describe("iterative path (n >= 4)", function () {
        it("4x4 upper-triangular -> diagonal entries", function () {
            assertSpectrum(
                List.realMatrix([
                    [1, 2, 3, 4],
                    [0, 2, 5, 6],
                    [0, 0, 3, 7],
                    [0, 0, 0, 4],
                ]),
                [1, 2, 3, 4]
            );
        });

        it("4x4 lower-triangular -> diagonal entries", function () {
            assertSpectrum(
                List.realMatrix([
                    [5, 0, 0, 0],
                    [1, 6, 0, 0],
                    [2, 3, 7, 0],
                    [4, 1, 2, 8],
                ]),
                [5, 6, 7, 8]
            );
        });

        it("4x4 with two complex conjugate pairs (+/- i, +/- 2i)", function () {
            assertSpectrum(
                List.realMatrix([
                    [0, -1, 0, 0],
                    [1, 0, 0, 0],
                    [0, 0, 0, -2],
                    [0, 0, 2, 0],
                ]),
                [
                    [0, 1],
                    [0, -1],
                    [0, 2],
                    [0, -2],
                ]
            );
        });

        it("4x4 companion matrix of x^4 - 1 (the four 4th roots of unity)", function () {
            assertSpectrum(
                List.realMatrix([
                    [0, 0, 0, 1],
                    [1, 0, 0, 0],
                    [0, 1, 0, 0],
                    [0, 0, 1, 0],
                ]),
                [1, -1, [0, 1], [0, -1]]
            );
        });

        it("5x5 diagonal", function () {
            assertSpectrum(
                List.realMatrix([
                    [5, 0, 0, 0, 0],
                    [0, 4, 0, 0, 0],
                    [0, 0, 3, 0, 0],
                    [0, 0, 0, 2, 0],
                    [0, 0, 0, 0, 1],
                ]),
                [1, 2, 3, 4, 5]
            );
        });

        it("6x6 upper-triangular -> diagonal entries", function () {
            assertSpectrum(
                List.realMatrix([
                    [2, 1, 1, 1, 1, 1],
                    [0, 4, 1, 1, 1, 1],
                    [0, 0, 6, 1, 1, 1],
                    [0, 0, 0, 8, 1, 1],
                    [0, 0, 0, 0, 10, 1],
                    [0, 0, 0, 0, 0, 12],
                ]),
                [2, 4, 6, 8, 10, 12]
            );
        });
    });

    describe("eigenvectors satisfy A v = lambda v", function () {
        it("3x3 with distinct eigenvalues", function () {
            assertEigenpairs(
                List.realMatrix([
                    [2, 1, 0],
                    [0, 3, 1],
                    [0, 0, 5],
                ])
            );
        });

        it("4x4 dense", function () {
            assertEigenpairs(
                List.realMatrix([
                    [4, 1, 2, 0],
                    [0, 3, 1, 1],
                    [1, 0, 2, 3],
                    [2, 1, 0, 5],
                ]),
                1e-5
            );
        });
    });

    describe("spectral identities on a dense matrix", function () {
        const A = List.realMatrix([
            [4, 1, 2, 0],
            [0, 3, 1, 1],
            [1, 0, 2, 3],
            [2, 1, 0, 5],
        ]);

        it("sum of eigenvalues equals the trace", function () {
            const eigs = List.eig(A).value[0].value;
            let sum = 0;
            for (const z of eigs) sum += z.value.real;
            let trace = 0;
            for (let i = 0; i < A.value.length; i++) trace += A.value[i].value[i].value.real;
            assert.closeTo(sum, trace, 1e-6);
        });

        it("product of eigenvalues equals the determinant", function () {
            const eigs = List.eig(A).value[0].value;
            let prod = CSNumber.one;
            for (const z of eigs) prod = CSNumber.mult(prod, z);
            const det = List.det(A);
            assert.closeTo(prod.value.real, det.value.real, 1e-5);
            assert.closeTo(prod.value.imag, det.value.imag, 1e-5);
        });
    });
});
