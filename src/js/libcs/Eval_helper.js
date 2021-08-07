import { myfunctions, evalmyfunctions } from "libcs/Essentials";
import { evaluator } from "libcs/Evaluator";
import { nada } from "expose";
import { csconsole } from "Setup";
import { List } from "libcs/List";

var eval_helper = {};

eval_helper.evaluate = function (name, args, modifs) {
    if (myfunctions.hasOwnProperty(name)) return evalmyfunctions(name, args, modifs);
    var f = evaluator[name];
    if (f) return f(args, modifs);
    // This following is legacy code, and should be removed
    // once all functions are converted to their arity-aware form.
    // Unless we introduce something like variadic functions.
    var n = name.lastIndexOf("$");
    if (n !== -1) {
        n = name.substr(0, n);
        f = evaluator[n];
        if (f) return f(args, modifs);
    }
    csconsole.err("Called undefined function " + n + " (as " + name + ")");
    return nada;
};

eval_helper.equals = function (v0, v1) {
    //Und nochmals un-OO
    if (v0.ctype === "number" && v1.ctype === "number") {
        return {
            ctype: "boolean",
            value: v0.value.real === v1.value.real && v0.value.imag === v1.value.imag,
        };
    }
    if (v0.ctype === "string" && v1.ctype === "string") {
        return {
            ctype: "boolean",
            value: v0.value === v1.value,
        };
    }
    if (v0.ctype === "boolean" && v1.ctype === "boolean") {
        return {
            ctype: "boolean",
            value: v0.value === v1.value,
        };
    }
    if (v0.ctype === "list" && v1.ctype === "list") {
        var erg = List.equals(v0, v1);
        return erg;
    }
    if (v0.ctype === "geo" && v1.ctype === "geo") {
        return {
            ctype: "boolean",
            value: v0.value === v1.value,
        };
    }
    return {
        ctype: "boolean",
        value: false,
    };
};

export { eval_helper };
