// Microbenchmark: old vs new eigenVECTOR computation in List.eig.
// Both run against the SAME build and the SAME (precomputed) eigenvalues, so the
// only variable is the eigenvector method:
//   old = null space of (A - lambda I) per eigenvalue, via rank-revealing QR
//   new = safeguarded inverse iteration, seeded by the eigenvalues
// Usage: node benchmarks/eigvec.js <path-to-exposed.js> [label] [--json]
const rewire = require("rewire");
const path = require("path");
if (typeof navigator === "undefined") global.navigator = {};

const exposedPath = path.resolve(process.argv[2]);
const label = process.argv[3] || exposedPath;
const cjs = rewire(exposedPath);
const List = cjs.__get__("List");
const CSNumber = cjs.__get__("CSNumber");

const eigvalsOf = (A) => List.sort1(List.getDiag(List._helper.QRIteration(A)[0]));

// previous method: per-eigenvalue null space of (A - lambda I) (rank-revealing QR)
function oldEigVecs(A, eigvals) {
    const n = A.value.length;
    const ID = List.idMatrix(CSNumber.real(n));
    const eigenvecs = List.turnIntoCSList(new Array(n));
    let nullS,
        xx,
        count = 0,
        sameEigVal = false,
        lastevec;
    for (let q = 0; q < n; q++) {
        if (sameEigVal) {
            xx = nullS.value[count];
        } else {
            const MM = List.sub(A, List.scalmult(eigvals.value[q], ID));
            nullS = List.nullSpace(MM);
            xx = nullS.value[0];
            if (xx !== undefined) lastevec = xx;
        }
        if (xx === undefined) xx = lastevec;
        eigenvecs.value[q] = List._helper.isAlmostZeroVec(xx) ? xx : List.scaldiv(List.abs(xx), xx);
        if (q < n - 1) {
            sameEigVal = CSNumber.abs(CSNumber.sub(eigvals.value[q], eigvals.value[q + 1])).value.real < 1e-6;
            count = sameEigVal ? count + 1 : 0;
        }
    }
    return List.transpose(eigenvecs);
}

// new method: safeguarded inverse iteration with cluster deflation
function newEigVecs(A, eigvals) {
    const n = A.value.length;
    const cols = new Array(n);
    let cluster = [];
    for (let q = 0; q < n; q++) {
        const lam = eigvals.value[q];
        const sameCluster =
            q > 0 &&
            CSNumber.abs(CSNumber.sub(lam, eigvals.value[q - 1])).value.real <
                1e-6 * (1 + CSNumber.abs(lam).value.real);
        if (!sameCluster) cluster = [];
        const v = List._helper.inverseIteration(A, lam, cluster);
        cols[q] = v;
        cluster.push(v);
    }
    return List.transpose(List.turnIntoCSList(cols));
}

// deterministic, diagonally dominant => distinct, well-conditioned spectrum
function mat(n, complex) {
    const rows = new Array(n);
    for (let i = 0; i < n; i++) {
        const row = new Array(n);
        for (let j = 0; j < n; j++) {
            const re = ((i * 31 + j * 17) % 7) - 3 + (i === j ? 6 * n : 0);
            const im = complex ? ((i * 13 + j * 23) % 5) - 2 : 0;
            row[j] = CSNumber.complex(re, im);
        }
        rows[i] = List.turnIntoCSList(row);
    }
    return List.turnIntoCSList(rows);
}

function bench(fn) {
    fn();
    let iters = 1;
    for (;;) {
        const s = process.hrtime.bigint();
        for (let i = 0; i < iters; i++) fn();
        const ms = Number(process.hrtime.bigint() - s) / 1e6;
        if (ms >= 40 || iters > 5000000) break;
        iters = Math.max(iters * 2, Math.ceil((iters * 45) / Math.max(ms, 0.001)));
    }
    const trials = iters <= 2 ? 3 : 5;
    let best = Infinity;
    for (let t = 0; t < trials; t++) {
        const s = process.hrtime.bigint();
        for (let i = 0; i < iters; i++) fn();
        const ns = Number(process.hrtime.bigint() - s) / iters;
        if (ns < best) best = ns;
    }
    return best;
}

// correctness: max residual ||A v - lambda v|| over the returned eigenvectors
function maxResidual(A, eigvals, V) {
    const n = A.value.length;
    let mx = 0;
    for (let k = 0; k < n; k++) {
        const v = List.turnIntoCSList(V.value.map((row) => row.value[k]));
        if (List.abs(v).value.real < 1e-9) continue;
        const r = List.sub(List.productMV(A, v), List.scalmult(eigvals.value[k], v));
        mx = Math.max(mx, List.abs(r).value.real);
    }
    return mx;
}

const sizes = [3, 4, 6, 8, 16];
const out = {};
for (const complex of [false, true]) {
    for (const n of sizes) {
        const m = mat(n, complex);
        const ev = eigvalsOf(m);
        const key = `${n}x${n} ${complex ? "cplx" : "real"}`;
        out[key] = {
            old: bench(() => oldEigVecs(m, ev)),
            new: bench(() => newEigVecs(m, ev)),
            oldRes: maxResidual(m, ev, oldEigVecs(m, ev)),
            newRes: maxResidual(m, ev, newEigVecs(m, ev)),
        };
    }
}

if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ label, results: out }));
} else {
    const fmt = (n) =>
        n >= 1e6 ? (n / 1e6).toFixed(2) + " ms" : n >= 1e3 ? (n / 1e3).toFixed(1) + " µs" : n.toFixed(0) + " ns";
    console.log(`\neigenvector benchmark [${label}] — best of 5\n`);
    console.log(
        "  " +
            "case".padEnd(12) +
            "old".padStart(11) +
            "new".padStart(11) +
            "speedup".padStart(10) +
            "   residual(old/new)"
    );
    for (const [name, r] of Object.entries(out)) {
        const speedup = (r.old / r.new).toFixed(1) + "x";
        console.log(
            "  " +
                name.padEnd(12) +
                fmt(r.old).padStart(11) +
                fmt(r.new).padStart(11) +
                speedup.padStart(10) +
                "   " +
                r.oldRes.toExponential(1) +
                " / " +
                r.newRes.toExponential(1)
        );
    }
    console.log("");
}
