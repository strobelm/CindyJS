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
	});

	describe('invert', function(){
    	it('invert', function() {
			let init = [[1,0,0], [0,5,0], [0,0,8]];
    	    pslqMat = new PSLQMatrix(init);
			pslqMat.invert();
			assert(compArr(pslqMat._e, [ 1, 0, 0, 0.2, 0, 0, 0, 0, 0.125 ]));
    	});
	});

});
