import { myfunctions, evalmyfunctions } from "libcs/Essentials";
import { evaluator } from "libcs/Evaluator";
import { nada } from "expose";
import { csconsole } from "Setup";
//import { List } from "libcs/List";
//import { General } from "libcs/General";
import { CSNumber } from "libcs/CSNumber";
import { evaluate, evaluateAndVal } from "libcs/Evaluator";
import { namespace } from "libcs/Namespace";

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


eval_helper.genericListMathGen = function (name, op, emptyval) {
    evaluator[name + "$1"] = function (args, modifs) {
        var v0 = evaluate(args[0]);
        if (v0.ctype !== "list") {
            return nada;
        }
        var li = v0.value;
        if (li.length === 0) {
            return emptyval;
        }

        var erg = li[0];
        for (var i = 1; i < li.length; i++) {
            erg = op(erg, li[i]);
        }
        return erg;
    };
    var name$3 = name + "$3";
    evaluator[name + "$2"] = function (args, modifs) {
        return evaluator[name$3]([args[0], null, args[1]]);
    };
    evaluator[name$3] = function (args, modifs) {
        var v0 = evaluateAndVal(args[0]);
        if (v0.ctype !== "list") {
            return nada;
        }
        var li = v0.value;
        if (li.length === 0) {
            return emptyval;
        }

        var lauf = "#";
        if (args[1] !== null) {
            if (args[1].ctype === "variable") {
                lauf = args[1].name;
            }
        }

        namespace.newvar(lauf);
        namespace.setvar(lauf, li[0]);
        var erg = evaluate(args[2]);
        for (var i = 1; i < li.length; i++) {
            namespace.setvar(lauf, li[i]);
            var b = evaluate(args[2]);
            erg = op(erg, b);
        }
        namespace.removevar(lauf);
        return erg;
    };
};


export { eval_helper };
