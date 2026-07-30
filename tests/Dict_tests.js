var assert = require("chai").assert;

var { nada, Dict, General, List } = require("../build/js/exposed.cjs");

describe("Dictionary", function () {
    it("can hold a value", function () {
        var d = Dict.create();
        Dict.put(d, General.wrap("thekey"), General.wrap(42));
        var v = Dict.get(d, General.wrap("the" + "key"));
        assert(v.value.real == 42);
    });
    it("returns default for unsed", function () {
        var d = Dict.create();
        Dict.put(d, General.wrap("otherkey"), General.wrap(42));
        var v = Dict.get(d, General.wrap("the" + "key"), nada);
        assert(v === nada);
    });
    it("can use numbers as keys", function () {
        var d = Dict.create();
        Dict.put(d, General.wrap(123), General.wrap(42));
        var v = Dict.get(d, General.wrap(123));
        assert(v.value.real == 42);
    });
    it("does not stringify", function () {
        var d = Dict.create();
        Dict.put(d, General.wrap("123"), General.wrap(42));
        var v = Dict.get(d, General.wrap(123), null);
        assert(v === null);
    });
});

describe("Dictionary: malformed keys", function () {
    var badKey = { ctype: "geo", value: { name: "A" } };

    it("reports a malformed key to the reporter it was given", function () {
        var d = Dict.create();
        var reported = [];
        Dict.put(d, badKey, General.wrap(42), function (x) {
            reported.push(x);
        });
        assert.deepEqual(reported, [badKey]);
    });

    // Dict.key recurses into list keys. The recursion must forward the reporter
    // explicitly: passing Dict.key itself to Array.prototype.map would bind the
    // array index to `report`, so a malformed element would call a number.
    it("reports a malformed key nested inside a list key", function () {
        var d = Dict.create();
        var reported = [];
        var key = List.turnIntoCSList([General.wrap(1), badKey, General.wrap("x")]);
        Dict.put(d, key, General.wrap(42), function (x) {
            reported.push(x);
        });
        assert.deepEqual(reported, [badKey]);
    });

    it("stays silent when no reporter is given", function () {
        var d = Dict.create();
        var key = List.turnIntoCSList([General.wrap(1), badKey]);
        Dict.put(d, key, General.wrap(42));
        assert(Dict.get(d, key, nada).value.real === 42);
    });
});
