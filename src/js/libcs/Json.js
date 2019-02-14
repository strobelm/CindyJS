// CindyScript JSON
var Json = {};
Json._helper = {};

Json._helper.ShallowClone = function(o) {
    var out, v, key;
    out = Array.isArray(o) ? [] : {};
    for (key in o) {
        v = o[key];
        out[key] = v;
    }
    return out;
};

Json._helper.DeepClone = function(o) {
    var out, v, key;
    out = Array.isArray(o) ? [] : {};
    for (key in o) {
        v = o[key];
        out[key] = (typeof v === "object" && v !== null) ? Json._helper.DeepClone(v) : v;
    }
    return out;
};

Json.getField = function(obj, key) {
    if (obj.value && obj.value[key]) {
        return obj.value[key];
    }
    return nada;
};

Json.setField = function(where, field, what) {
    where[field] = what;
};

Json.GenFromUserDataEl = function(el) {
    // key/obj are reversed due to the semantics of the ":" operator in CindyScript
    var key = el.obj;
    var obj = el.key;

    if (!key || key.ctype !== "string") {
        console.log("Error: JSON keys have to be strings.");
        return nada;
    }
    if (!obj) {
        console.log("Warning: JSON object not defined.");
        return {
            "key": key.value,
            "val": nada,
        };
    } else return {
        "key": key.value,
        "val": evaluate(obj)
    };
};

Json._helper.GenJSONAtom = function(key, val) {
    return {
        "ctype": "JSONAtom",
        "value": {
            'key': key,
            'value': val
        }
    };
};

Json._helper.niceprint = function(a) {
    if (a.ctype === "JSON") {
        return Json.niceprint(a);
    }
    if (a.ctype === "number" && a.value.imag === 0) {
        return a.value.real;
    }
    if (a.ctype === "boolean") {
        return a.value;
    }
    if (a.ctype === 'list') {
        var erg = "[";
        for (var i = 0; i < a.value.length; i++) {
            erg = erg + Json._helper.niceprint(evaluate(a.value[i]));
            if (i !== a.value.length - 1) {
                erg = erg + ', ';
            }

        }
        return erg + "]";
    }

    return "\"" + String(niceprint(a)) + "\"";
};

Json.Atomniceprint = function(el) {
    return "\{" + el.value.key + ":" + niceprint(el.value.value) + "\}";
};

Json.niceprint = function(el) {
    var keys = Object.keys(el.value).sort();
    var jsonString = "{" + keys.map(function(key) {
        return "\"" + key + "\"" + ":" + Json._helper.niceprint(el.value[key]);
    }).join(", ") + "}";

    // to be valid JSON we need to replace single with double quotes
    jsonString = jsonString.replace(/'/g, '"');

    // pretty print 
    try {
        jsonString = JSON.stringify(JSON.parse(jsonString), null, 0);
        //jsonString = jsonString.replace(/,/g, ", ").replace(/:/g, " : "); // add whitespace
    } catch (e) {
        console.log("Warning: JSON string could not be parsed!");
        console.log(e);
    }

    return jsonString;
};
