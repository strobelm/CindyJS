let rewire = require("rewire");
let cindyJS = rewire('../build/js/exposed.js');

let List = cindyJS.__get__('List');
let CSNumber = cindyJS.__get__('CSNumber');
let PSLQMatrix = cindyJS.__get__('PSLQMatrix');
let assert = require("chai").assert;

let eps = 1e-8;

describe('PSLQ Matrix', function() {
    function compArr(arr1, arr2){
		const containsAll = (arr1, arr2) => 
                arr2.every(arr2Item => arr1.includes(arr2Item))

		const sameMembers = (arr1, arr2) => 
                        containsAll(arr1, arr2) && containsAll(arr2, arr1);

		return sameMembers(arr1, arr2); 
    }


	describe('initialization', function(){
    	it('initialization of PSLQMatrix object - unit matrix', function() {
    	    let pslqMat = new PSLQMatrix();
			assert(compArr(pslqMat._e, [ 1, 0, 0, 0, 1, 0, 0, 0, 1 ]));
    	});

    	it('initialization of PSLQMatrix object - nonunit matrix', function() {
			let init = [[1,2,3], [4,5,6], [7,8,9]];
    	    let pslqMat = new PSLQMatrix(init);
			assert(compArr(pslqMat._e, [ 1, 4, 7, 2, 5, 8, 3, 6, 9 ]));
    	});
	});

	describe('basic methods', function(){
		let pslqMat;

   		beforeEach(function() {
			let init = [[1,2,3], [4,5,6], [7,8,9]];
    	    pslqMat = new PSLQMatrix(init);
   		});

    	it('get', function() {
			assert(pslqMat.get(0), 1);
			assert(pslqMat.get(1), 4);
			assert(pslqMat.get(8), 9);
    	});

    	it('exchange', function() {
			pslqMat.exchange(0,1);
			assert(compArr(pslqMat._e, [ 4, 1, 7, 2, 5, 8, 3, 6, 9 ]));
    	});

    	it('swapRow', function() {
			pslqMat.swRow(0,2);
			assert(compArr(pslqMat._e, [3, 6, 9, 2, 5, 8, 4, 1, 7, ]));
    	});

    	it('swapCol', function() {
			pslqMat.swCol(0,2);
			assert(compArr(pslqMat._e, [ 3, 2, 1, 6, 5, 4, 9, 8, 7 ]));
    	});

    	it('getRow', function() {
			assert(compArr(pslqMat.getRow(0), [ 1,2,3 ]));
			assert.deepEqual(pslqMat.getRow(0), [1,2,3]);
    	});

        it('set 1-ary', function(){
			pslqMat.set([5,5,5,5,5,5,5,5,5]);
			assert(compArr(pslqMat._e, [ 5,5,5,5,5,5,5,5 ]));
        })

        it('set 2-ary', function(){
			pslqMat.set(0,10);
			pslqMat.set(8,10);
			assert(compArr(pslqMat._e, [ 10, 4, 7, 2, 5, 8, 3, 6, 10 ]));
        })
	});


	describe('linear algebra', function(){
    	it('invert', function() {
			let init = [[1,0,0], [0,5,0], [0,0,8]];
    	    pslqMat = new PSLQMatrix(init);
			pslqMat.invert();
			assert(compArr(pslqMat._e, [ 1, 0, 0, 0.2, 0, 0, 0, 0, 0.125 ]));
    	});

    	it('mult', function() {
			let initA = [[1,2,3], [4,5,6], [7,8,9]];
			let initB = [[9,8,7], [6,5,4], [3,2,1]];
    	    let matA= new PSLQMatrix(initA);
    	    let matB = new PSLQMatrix(initB);
    	    let matC = new PSLQMatrix();
            PSLQMatrix.mult(matA, matB, matC)

			assert(compArr(matC._e, [30, 84, 138, 24, 69, 114, 18, 54, 90]));
    	});

    	it('transpose', function() {
			let init = [[1,2,3], [4,5,6], [7,8,9]];
    	    let mat = new PSLQMatrix(init);
            mat.transpose();

			assert.deepEqual(mat._e, [1,2,3,4,5,6,7,8,9]);
    	});

    	it('VMmult', function() {
			let init = [[1,2,3], [4,5,6], [7,8,9]];
    	    let mat = new PSLQMatrix(init);
            let vec = [1,2,3];
            let u = [];
            PSLQMatrix.VMmult(vec, mat, u)

			assert.deepEqual(u, [30 , 36, 42]);
    	});
	});

});
