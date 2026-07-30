/*
 * Dictionaries map CindyScript values to CindyScript values.
 * Since values are immutable and support equality testing,
 * they can be easily used as keys.
 *
 * Internally the map is an object with properties
 * whose names are stringified versions of the CindyScript keys.
 * The values are objects which hold the original key and value.
 * To keep overhead low, avoid deeply nested data structures as keys.
 */

const Dict = {};

// `report`, if given, is called with the offending value when x (or, for a list
// key, one of its elements) is not a usable key. Callers that can reach a
// user-supplied key pass a reporter that writes the message to their instance's
// CindyScript console; callers whose keys are provably strings pass nothing.
// Keeping the sink a parameter is what keeps this file free of interpreter and
// per-instance imports.
Dict.key = function (x, report) {
    if (x.ctype === "string") return "s" + x.value.length + ":" + x.value + ";";
    if (x.ctype === "number") return "n" + x.value.real + "," + x.value.imag + ";";
    if (x.ctype === "list") return "l" + x.value.length + ":" + x.value.map((e) => Dict.key(e, report)).join(",") + ";";
    if (x.ctype === "boolean") return "b" + x.value + ";";
    if (x.ctype === "dict") {
        const keys = Object.keys(x.value).sort();
        return "d" + keys.length + ":" + keys.join(",") + ";";
    }
    if (x.ctype !== "undefined" && report) report(x);
    return "undef";
};

// Dictionary creation is a two-step process:
// one creates a dictionary (empty or cloned), then adds entries to it.
// During this process, the dictionary is considered mutable.
// But as for all other CindyJS data structures, once the construction
// is complete and other code gains access to the dictionary,
// the dictionary is considered immutable.

Dict.create = function () {
    return {
        ctype: "dict",
        value: {}, // or Map or Object.create(null)?
    };
};

Dict.clone = function (dict) {
    const res = Dict.create();
    for (const key in dict.value) if (dict.value.hasOwnProperty(key)) res.value[key] = dict.value[key];
    return res;
};

// Modifying operation
Dict.put = function (dict, key, value, report) {
    dict.value[Dict.key(key, report)] = {
        key,
        value,
    };
};

Dict.get = function (dict, key, dflt, report) {
    const kv = dict.value[Dict.key(key, report)];
    if (kv) return kv.value; // check kv.key?
    return dflt;
};

// `print` is the value printer to render the entries with; Essentials.niceprint
// is the only caller. Passed in rather than imported, see Dict.key.
Dict.niceprint = function (dict, print) {
    return (
        "{" +
        Object.keys(dict.value)
            .sort()
            .map(function (key) {
                const kv = dict.value[key];
                return print(kv.key) + ":" + print(kv.value);
            })
            .join(", ") +
        "}"
    );
};

export { Dict };
