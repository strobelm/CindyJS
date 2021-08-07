import { nada } from "expose";
import { CSNumber } from "libcs/CSNumber";
import { List } from "libcs/List";
import { Dict } from "libcs/Dict";

//==========================================
//      Things that apply to several types
//==========================================
  var General = {};
General._helper = {};

General.order = {
    undefined: 0,
    boolean: 1,
    number: 2,
    term: 3,
    atomic: 4,
    variable: 5,
    geo: 6,
    string: 7,
    list: 8,
};

General.string = function (s) {
    return {
        ctype: "string",
        value: s,
    };
};

General.bool = function (b) {
    return {
        ctype: "boolean",
        value: b,
    };
};

General.not = function (v) {
    return General.bool(!v.value);
};


General.wrap = function (v) {
    if (typeof v === "number") {
        return CSNumber.real(v);
    }
    if (typeof v === "object" && v.length !== undefined) {
        //evtl in List ziehen
        var li = [];
        for (var i = 0; i < v.length; i++) {
            li[i] = General.wrap(v[i]);
        }
        return List.turnIntoCSList(li);
    }
    if (typeof v === "string") {
        return {
            ctype: "string",
            value: v,
        };
    }
    if (typeof v === "boolean") {
        return {
            ctype: "boolean",
            value: v,
        };
    }
    return nada;
};

General.unwrap = function (v) {
    if (typeof v !== "object" || v === null) {
        return v;
    }
    if (Array.isArray(v)) {
        return v.map(General.unwrap);
    }
    switch (v.ctype) {
        case "string":
        case "boolean":
            return v.value;
        case "number":
            if (v.value.imag === 0) return v.value.real;
            return {
                r: v.value.real,
                i: v.value.imag,
            };
        case "list":
            return v.value.map(General.unwrap);
        default:
            return null;
    }
};

General.withUsage = function (v, usage) {
    // shallow copy with possibly new usage
    return {
        ctype: v.ctype,
        value: v.value,
        usage: usage,
    };
};

General.wrapJSON = function (data) {
    switch (typeof data) {
        case "number":
            return CSNumber.real(data);
        case "string":
            return General.string(data);
        case "boolean":
            return General.bool(data);
        case "object":
            if (data === null) return nada;
            if (Array.isArray(data)) return List.turnIntoCSList(data.map(General.wrapJSON));
            var d = Dict.create();
            for (var k in data) Dict.put(d, General.string(k), General.wrapJSON(data[k]));
            return d;
        default:
            console.log("Failed to convert " + typeof data + " to CindyJS data type");
            return nada;
    }
};

General.identity = function (x) {
    return x;
};

General.deeplyEqual = function (a, b) {
    if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return a === b;
    var cnt = 0;
    var k;
    for (k in a) {
        ++cnt;
        if (!(k in b && General.deeplyEqual(a[k], b[k]))) return false;
    }
    for (k in b) --cnt;
    return cnt === 0;
};

export { General };
