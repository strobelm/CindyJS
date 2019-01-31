// CindyScript JSON
var Json = {};
Json._helper = {};

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

Json.niceprint = function(el) {
    var keys = Object.keys(el.value).sort();
    var jsonString = "{" + keys.map(function(key) {
        return "\"" + key + "\"" + ":" + Json._helper.niceprint(el.value[key]);
    }).join(", ") + "}";

    // to be valid JSON we need to replace single with double quotes
    jsonString = jsonString.replace(/'/g, '"');

    // pretty print 
    try {
        jsonString = JSON.stringify(JSON.parse(jsonString), null, 2);
    } catch (e) {
        console.log("Warning: JSON string could not be parsed!");
        console.log(e);
    }

    return jsonString;
};
