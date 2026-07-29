import { nada } from "../expose.js";
import { csgeo } from "../Setup.js";
import { CSNumber } from "./CSNumber.js";
import { List } from "./List.js";
import { General } from "./General.js";
import { niceprint } from "./Essentials.js";

//==========================================
//      Namespace and Vars
//==========================================

const namespace = {};

// Initialize preset variables.
//
// Built on first access instead of at module scope: CSNumber, General and List
// sit in the same import cycle as this module, so under ESM they may not be
// evaluated yet while this file is. The concatenated build never noticed
// (there the whole closure is one scope), a module graph does. The values and
// the resulting `vars` object are identical either way - the first access
// still happens long before any CindyScript runs.
let presetVars = null;

Object.defineProperty(namespace, "vars", {
    configurable: true,
    enumerable: true,
    get: function () {
        if (presetVars === null) {
            const preset = {
                pi: CSNumber.real(Math.PI),
                π: CSNumber.real(Math.PI),
                i: CSNumber.complex(0, 1),
                true: General.bool(true),
                false: General.bool(false),
                "#": nada,
                nil: List.turnIntoCSList([]),
                newline: General.string("\n"),
                tab: General.string("\t"),
            };
            presetVars = [];
            for (const name in preset) presetVars[name] = [preset[name]];
        }
        return presetVars;
    },
    set: function (value) {
        presetVars = value;
    },
});

namespace.isVariable = function (name) {
    return this.vars.hasOwnProperty(name);
};

namespace.create = function (name) {
    if (this.vars.hasOwnProperty(name)) return this.vars[name];
    const v = [null];
    this.vars[name] = v;
    return v;
};

namespace.newvar = function (name) {
    const v = this.create(name);
    v.push(nada); // nada not null for deeper levels
    return v;
};

namespace.removevar = function (name) {
    const stack = this.vars[name];
    if (stack.length === 0) console.error("Removing non-existing " + name);
    stack.pop();
    if (stack.length === 0) console.warn("Removing last " + name);
};

namespace.setvar = function (name, val) {
    const stack = this.vars[name];
    if (stack.length === 0) console.error("Setting non-existing variable " + name);
    if (val === undefined) {
        console.error("Setting variable " + name + " to undefined value");
        val = nada;
    }
    if (val.ctype === "undefined") {
        stack[stack.length - 1] = val;
        return;
    }
    let erg = val;
    if (erg === null) erg = nada; // explicit setting does lift unset state
    stack[stack.length - 1] = erg;
};

namespace.undefinedWarning = {};

namespace.getvar = function (name) {
    const stack = this.vars[name] || [];
    if (stack.length === 0) console.error("Getting non-existing variable " + name);
    const erg = stack[stack.length - 1];
    if (erg === null) {
        if (csgeo.csnames.hasOwnProperty(name)) {
            return {
                ctype: "geo",
                value: csgeo.csnames[name],
            };
        } else {
            if (console && console.log && this.undefinedWarning[name] === undefined) {
                this.undefinedWarning[name] = true;
                console.log("Warning: Accessing undefined variable: " + name);
            }
        }
        return nada;
    }
    return erg;
};

namespace.dump = function (name) {
    const stack = this.vars[name];
    console.log("*** Dump " + name);

    for (let i = 0; i < stack.length; i++) {
        console.log(i + ":> " + niceprint(stack[i]));
    }
};

namespace.vstack = [];

namespace.pushVstack = function (v) {
    this.vstack.push(v);
};
namespace.popVstack = function () {
    this.vstack.pop();
};

namespace.cleanVstack = function () {
    const st = this.vstack;
    while (st.length > 0 && st[st.length - 1] !== "*") {
        this.removevar(st[st.length - 1]);
        st.pop();
    }
    if (st.length > 0) {
        st.pop();
    }
};

export { namespace };
