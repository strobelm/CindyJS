import { nada } from "expose";
import { CSNumber } from "libcs/CSNumber";
import { List } from "libcs/List";
import { niceprint } from "libcs/Essentials";

 function GeneralAdd (v0, v1) {
    if (v0.ctype === "void" && v1.ctype === "number") {
        // unary plus
        return v1;
    }
    if (v0.ctype === "void" && v1.ctype === "list") {
        // unary plus
        return v1;
    }
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.add(v0, v1);
    }
    if (v0.ctype === "string" || v1.ctype === "string") {
        return {
            ctype: "string",
            value: niceprint(v0) + niceprint(v1),
        };
    }

    if (v0.ctype === "list" && v1.ctype === "list") {
        return List.add(v0, v1);
    }
    return nada;
};
function GeneralSub (v0, v1) {
    if (v0.ctype === "void" && v1.ctype === "number") {
        // unary minus
        return CSNumber.neg(v1);
    }
    if (v0.ctype === "void" && v1.ctype === "list") {
        // unary minus
        return List.neg(v1);
    }
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.sub(v0, v1);
    }
    if (v0.ctype === "list" && v1.ctype === "list") {
        return List.sub(v0, v1);
    }
    return nada;
};

export {GeneralAdd, GeneralSub}