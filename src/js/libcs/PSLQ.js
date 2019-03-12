class PSLQMatrix {
    // overloaded constructor
    constructor(m) {
        if (m) {
            this._e = [];
            this._e[0] = m[0][0];
            this._e[1] = m[1][0];
            this._e[2] = m[2][0];
            this._e[3] = m[0][1];
            this._e[4] = m[1][1];
            this._e[5] = m[2][1];
            this._e[6] = m[0][2];
            this._e[7] = m[1][2];
            this._e[8] = m[2][2];
        } else {
            this._e = [1, 0, 0, 0, 1, 0, 0, 0, 1];
        }
    }

    clone() {
        let mat = [...this._e];
        return PSLQMatrix(mat);
    }

    get(idx) {
        return this._e[idx];
    }

    getRow(i) {
        let _e = this._e;
        return [_e[i], _e[3 + i], _e[6 + i]];
    }

    // overloaded
    // 1-ary set internal matrix _e with i
    // 2-ary set index i to value
    set(i, value) {
        if (arguments.length === 1)
            this._e = i;
        if (arguments.length === 2)
            this._e[i] = value;
    }

    // swap values in internal matrix
    exchange(idx1, idx2) {
        [this._e[idx1], this._e[idx2]] = [this._e[idx2], this._e[idx1]];
    }

    invert() {
        let e = this._e;
        let det = -e[2] * e[4] * e[6] + e[1] * e[5] * e[6] + e[2] * e[3] * e[7] - e[0] * e[5] * e[7] - e[1] * e[3] * e[8] + e[0] * e[4] * e[8];

        let res = [(-e[4] * e[7] + e[4] * e[8]), (e[5] * e[6] - e[3] * e[8]), (-e[4] * e[6] + e[3] * e[7]), (e[2] * e[7] - e[1] * e[8]),
            (-e[2] * e[6] + e[0] * e[8]), (e[1] * e[6] - e[0] * e[7]), (-e[2] * e[4] + e[1] * e[5]), (e[2] * e[3] - e[0] * e[5]),
            (-e[1] * e[3] + e[0] * e[4])
        ];

        if (Math.abs(det) < 1e-10) {
            console.log("PSLQ: inverting singular matrix!");
        }
        this._e = res.map(e => e / det);
        return this;
    }

    swRow(a, b) {
        let offset = 0;
        while (offset < 9) {
            this.exchange(offset + a, offset + b);
            offset += 3;
        }
    }

    swCol(a, b) {
        for (let i = 0; i < 3; ++i)
            this.exchange(3 * a + i, 3 * b + i);
    }

    static mult(A, B, C) {
        let res = [A.get(0) * B.get(0) + A.get(3) * B.get(1) + A.get(6) * B.get(2), A.get(1) * B.get(0) + A.get(4) * B.get(1) + A.get(7) * B.get(2),
            A.get(2) * B.get(0) + A.get(5) * B.get(1) + A.get(8) * B.get(2),

            A.get(0) * B.get(3) + A.get(3) * B.get(4) + A.get(6) * B.get(5), A.get(1) * B.get(3) + A.get(4) * B.get(4) + A.get(7) * B.get(5),
            A.get(2) * B.get(3) + A.get(5) * B.get(4) + A.get(8) * B.get(5),

            A.get(0) * B.get(6) + A.get(3) * B.get(7) + A.get(6) * B.get(8), A.get(1) * B.get(6) + A.get(4) * B.get(7) + A.get(7) * B.get(8),
            A.get(2) * B.get(6) + A.get(5) * B.get(7) + A.get(8) * B.get(8),
        ];

        C.set(res);
    }

    getString() {
        let e = this._e;
        return "/" + e[0] + "\t " + e[3] + "\t " + e[6] + "\\\n" + "|" + e[1] + "\t " + e[4] + "\t " + e[7] + "|\n" + "\\" + e[2] + "\t " + e[5] + "\t " + e[8] +
            "/\n";
    }

    transpose() {
        this.exchange(1, 3);
        this.exchange(2, 6);
        this.exchange(5, 7);
        return this;
    }

    // v * M = u
    static VMmult(v, M, u) {
        u[0] = M.get(0) * v[0] + M.get(1) * v[1] + M.get(2) * v[2];
        u[1] = M.get(3) * v[0] + M.get(4) * v[1] + M.get(5) * v[2];
        u[2] = M.get(6) * v[0] + M.get(7) * v[1] + M.get(8) * v[2];
    }


}
