var rewire = require("rewire");
var cindyJS = rewire("../build/js/exposed.js");
var CSNumber = cindyJS.__get__("CSNumber");

test("adds 1 + 2 to equal 3", () => {
    const one = CSNumber.real(1);
    const two = CSNumber.real(2);
    expect(CSNumber.add(one, two)).toEqual(CSNumber.real(3));
});
