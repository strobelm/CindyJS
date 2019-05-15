LCOptions = {};
// default number of coeff
LCOptions.n = 5;
LCOptions.eps = 1e-8;
// Coefficients of LC numbers: [a,q]
class LCCoeff {
    constructor(a, q) {
        this.a = a;
        this.q = q;
    }
}

class LCNumber {
    constructor(coeffArr) {
        this.coeff = {};

        let minIdx = Infinity;
        for (let el of coeffArr) {
            if (Math.abs(el.a) < LCOptions.eps) continue;
            if (el.q < minIdx) minIdx = el.q;
            // toString implicitely called
            this.coeff[el.q] = el.a;
        }
        this.normalize(minIdx);
    }
}
