var LCOptions = {};
// default number of coeff
LCOptions.n = 5;
LCOptions.eps = 1e-8;
// Coefficients of LC numbers: [a,q]
class LCCoeff {
    constructor(a, q) {
	this.a = new Complex(a);
	this.q = new Fraction(q);
    }
}

class LCNumber {
    constructor(coeffArr) {
	// initialize as 0*d^0(1*d^0)
	let c0= new Complex(0);
	let c1= new Complex(1);
	let q0 = new Fraction(0);
	let q1 = new Fraction(1);

	this.coeff = {
	    0 : new Complex(1)
	};
	this.front = new LCCoeff(0, 1);

	let sCoeffArr = coeffArr.sort((a, b) => a.q.sub(b.q));
	for (let el of coeffArr) {
	    if (Math.abs(el.a) < LCOptions.eps) continue;
	    if (el.q < this.minIdx) this.minIdx = el.q;
	    // toString implicitely called
	    this.coeff[el.q] = el.a;
	}
	this.normalize();
    }

    normalize() {
	let a = this.front.a;
	if (Math.abs(a) > LCOptions.eps) {
	    let newCoeff = {};
	    let q = this.front.q;
	    for (let el of this.coeff) {
		newCoeff[el.q - q] = el.a / a;
	    }
	    this.coeff = newCoeff;
	}
    }

    print(){
	return "5";
    }
}
