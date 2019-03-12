class PSLQMatrix {
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

    get(idx) {
        return this._e[idx];
    }

    exchange(p1, p2) {
        [this._e[p1], this._e[p2]] = [this._e[p2], this._e[p1]];
    }

    invert() {
        let e = this._e;
        let det = -e[2] * e[4] * e[6] + e[1] * e[5] * e[6] + e[2] * e[3] * e[7] - e[0] * e[5] * e[7] - e[1] * e[3] * e[8] + e[0] * e[4] * e[8];

        let res = [(-e[4] * e[7] + e[4] * e[8]), (e[5] * e[6] - e[3] * e[8]), (-e[4] * e[6] + e[3] * e[7]), (e[2] * e[7] - e[1] * e[8]),
            (-e[2] * e[6] + e[0] * e[8]), (e[1] * e[6] - e[0] * e[7]), (-e[2] * e[4] + e[1] * e[5]), (e[2] * e[3] - e[0] * e[5]),
            (-e[1] * e[3] + e[0] * e[4])
        ];

        if (Math.abs(det) < 1e-10) {
            console.log("PSLQ: inverting singular matrix!")
        }
        this._e = res.map(e => e / det);
        return this;
    }


}
