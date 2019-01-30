// CindyScript JSON
var Json = {};
Json._helper = {};

Json.getField = function(obj, key) {
    if (obj.value && obj.value[key]) {
        return obj.value[key];
    }
    return nada;
};

Json.GenFromUserDataEl = function(el) {
    // key/obj are reversed due to the semantics of the ":" operator in CindyScript
    var key = el.obj;
    var obj = el.key;

    if (key.ctype !== "string") {
        console.log("Waning: JSON keys have to be strings.");
        return nada;
    }
    if (!obj) {
        console.log("Warning: JSON object not defined.");
        return {
            "key": key,
            "val": nada,
        };
    } else return {
        "key": key.value,
        "val": evaluate(obj)
    };
};

Json.niceprint = function(el) {
    var keys = Object.keys(el.value).sort();
    return "{\n" + keys.map(function(key) {
        return "\t" + key + ":" + "\t" + niceprint(el.value[key]);
    }).join(", \n") + "\n}";
};
