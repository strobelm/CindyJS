// CindyScript JSON
var Json = {};
Json._helper = {};


Json.turnIntoCSJson = function(a) {
    return {
        "ctype": "JSON",
        "value": a
    };
};

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

Json._helper.niceprint = function(a, modifs, visitedMap) {
    if (a.ctype === "JSON") {
        return Json.niceprint(a, modifs, visitedMap);
    }
    if (a.ctype === "number" && a.value.imag === 0) {
        return a.value.real;
    }
    if (["boolean"].includes(a.ctype)) {
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

Json.niceprint = function(el, modifs, visitedMap) {
    // track visited elements for cycles
    if (!visitedMap) {
        visitedMap = {};
        visitedMap.level = 0;
        visitedMap.maxLevel = 1000;
        visitedMap.maxElVisit = 5000;
    }
    // track a new recursive call
    visitedMap.newLevel = true;
    visitedMap.level += 1;


    var keys = Object.keys(el.value).sort();
    var jsonString = "{" + keys.map(function(key) {
        // update visitedMap
        let elValKey = el.value[key];
        if (!visitedMap[elValKey]) {
            visitedMap[elValKey] = 1;
        } else {
            if (visitedMap[elValKey] > visitedMap.maxElVisit || visitedMap.level > visitedMap.maxLevel) {
                //console.log([visitedMap[elValKey], visitedMap.level]);
                console.log("Warning: We visited a key-value pair very often or encountered a very deeply nested dictionary. Dictionary is probably cyclic. Output will be probably incomplete.");
                return "\"" + key + "\"" + ":" + '"..."';
            }
            // update only once a recursive call
            if (visitedMap.newLevel) {
                visitedMap[elValKey] += 1;
                // update only once each function call
                visitedMap.newLevel = false;
            }
        }
        return "\"" + key + "\"" + ":" + Json._helper.niceprint(elValKey, modifs, visitedMap);
    }).join(", ") + "}";


    // pretty print 
    // to be valid JSON we need to replace single with double quotes
    jsonString = jsonString.replace(/'/g, '"');
    jsonString = JSON.stringify(JSON.parse(jsonString), null, 0);

    return jsonString;
};

Json._helper.handlePrintException = function(e) {
    if (e instanceof RangeError) {
        console.log("Warning: Dictionary string could not be generated! Probably large cyclic Dictionary!");
    } else if (e instanceof SyntaxError) {
        console.log("Warning: Dictionary string could not be parsed!");
    } else {
        console.log("Warning: Dictionary printing failed!");
    }

};
