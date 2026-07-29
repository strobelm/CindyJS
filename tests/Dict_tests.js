var assert = require("chai").assert;

var { nada, Dict, General } = require("../build/js/exposed.cjs");

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
