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
}
