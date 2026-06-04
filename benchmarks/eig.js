// Microbenchmark: old vs new eigenvalue engine (List._helper.QRIteration).
// Both run against the SAME build, so the only variable is the algorithm:
//   old = naive full-matrix explicit shifted QR (up to 2500 iters)
//   new = closed forms for n<=3, Hessenberg + shifted Givens-QR for n>=4
// Usage: node benchmarks/eig.js <path-to-exposed.js> [label] [--json]
const rewire = require("rewire");
const path = require("path");
if (typeof navigator === "undefined") global.navigator = {};

const exposedPath = path.resolve(process.argv[2]);
const label = process.argv[3] || exposedPath;
const cjs = rewire(exposedPath);
const List = cjs.__get__("List");
const CSNumber = cjs.__get__("CSNumber");
const General = cjs.__get__("General");

const newQRIteration = List._helper.QRIteration;

// The previous implementation, verbatim, operating on the current build's
// primitives (getBlock/eig2/QRdecomp/... are shared; only the driver differs).
function oldQRIteration(A, maxIter) {
    let i;
    let AA = A;
    const cslen = CSNumber.real(AA.value.length);
    const Alen = cslen.value.real;
    let len = cslen.value.real;
    let Id = List.idMatrix(cslen, cslen);
    const erg = List.zeromatrix(cslen, cslen);
    let QQ = List.idMatrix(cslen, cslen);
    const mIter = maxIter ? maxIter : 2500;

    let QR, kap, shiftId, block, L1, L2, blockeigs, ann, dist1, dist2;
    let numDeflations = 0;
    const eigvals = new Array(len);
    for (i = 0; i < mIter; i++) {
        block = List._helper.getBlock(AA, [len - 2, len - 1], [len - 2, len - 1]);
        blockeigs = List.eig2(block);
        L1 = blockeigs.value[0];
        L2 = blockeigs.value[1];

        ann = AA.value[len - 1].value[len - 1];
        dist1 = CSNumber.abs(CSNumber.sub(ann, L1)).value.real;
        dist2 = CSNumber.abs(CSNumber.sub(ann, L2)).value.real;
        kap = dist1 < dist2 ? L1 : L2;

        Id = List.idMatrix(CSNumber.real(len), CSNumber.real(len));
        shiftId = List.scalmult(kap, Id);

        QR = List.QRdecomp(List.sub(AA, shiftId));

        AA = General.mult(QR.R, QR.Q);
        AA = List.add(AA, shiftId);

        QR.Q = List._helper.buildBlockMatrix(
            QR.Q,
            List.idMatrix(CSNumber.real(numDeflations), CSNumber.real(numDeflations))
        );
        QQ = General.mult(QQ, QR.Q);
        if (
            CSNumber.abs2(AA.value[AA.value.length - 1].value[AA.value[0].value.length - 2]).value.real < 1e-48 &&
            len > 1
        ) {
            eigvals[Alen - numDeflations - 1] = AA.value[len - 1].value[len - 1];
            for (i = 0; i < len; i++) {
                erg.value[len - 1].value[i] = AA.value[len - 1].value[i];
                erg.value[i].value[len - 1] = AA.value[i].value[len - 1];
            }
            AA = List._helper.getBlock(AA, [0, len - 2], [0, len - 2]);
            numDeflations++;
            len--;
        }
        if (len === 1) {
            erg.value[0].value[0] = AA.value[0].value[0];
            break;
        }
        if (List._helper.isUpperTriangular(AA)) {
            for (i = 0; i < len; i++) erg.value[i].value[i] = AA.value[i].value[i];
            break;
        }
    }
    return [erg, QQ];
}

// deterministic, diagonally dominant => distinct, well-conditioned spectrum so
// the old iteration converges quickly (a fair comparison, not a worst case)
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

// correctness: an engine is "ok" if sum(eigenvalues) == trace(A) (always true
// for a correct spectrum, regardless of conditioning)
function isCorrect(qr, A) {
    const n = A.value.length;
    let trace = 0;
    for (let i = 0; i < n; i++) trace += A.value[i].value[i].value.real;
    let sum = 0;
    for (const z of List.getDiag(qr(A)[0]).value) sum += z.value.real;
    return Math.abs(sum - trace) <= 1e-6 * (1 + Math.abs(trace));
}

const sizes = [3, 4, 6, 8, 16];
const out = {};
for (const complex of [false, true]) {
    for (const n of sizes) {
        const m = mat(n, complex);
        const key = `${n}x${n} ${complex ? "cplx" : "real"}`;
        out[key] = {
            old: bench(() => oldQRIteration(m)),
            new: bench(() => newQRIteration(m)),
            oldOk: isCorrect(oldQRIteration, m),
            newOk: isCorrect(newQRIteration, m),
        };
    }
}

if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ label, results: out }));
} else {
    const fmt = (n) =>
        n >= 1e6 ? (n / 1e6).toFixed(2) + " ms" : n >= 1e3 ? (n / 1e3).toFixed(1) + " µs" : n.toFixed(0) + " ns";
    console.log(`\neig (QRIteration) benchmark [${label}] — best of 5\n`);
    console.log(
        "  " +
            "case".padEnd(12) +
            "old".padStart(11) +
            "new".padStart(11) +
            "speedup".padStart(10) +
            "   correct(old/new)"
    );
    for (const [name, r] of Object.entries(out)) {
        const speedup = (r.old / r.new).toFixed(1) + "x";
        const ok = (b) => (b ? "ok" : "WRONG");
        console.log(
            "  " +
                name.padEnd(12) +
                fmt(r.old).padStart(11) +
                fmt(r.new).padStart(11) +
                speedup.padStart(10) +
                "   " +
                (ok(r.oldOk) + " / " + ok(r.newOk)).padStart(12)
        );
    }
    console.log("");
}
