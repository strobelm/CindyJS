import { nada } from "expose";
import { CSNumber } from "libcs/CSNumber";
import { List } from "libcs/List";

const GeneralMult = function (v0, v1) {
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.mult(v0, v1);
    }
    if (v0.ctype === "number" && v1.ctype === "list") {
        return List.scalmult(v0, v1);
    }
    if (v0.ctype === "list" && v1.ctype === "number") {
        return List.scalmult(v1, v0);
    }
    if (v0.ctype === "list" && v1.ctype === "list") {
        return List.mult(v0, v1);
    }
    return nada;
};

function GeneralDiv (v0, v1) {
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.div(v0, v1);
    }
    if (v0.ctype === "list" && v1.ctype === "number") {
        return List.scaldiv(v1, v0);
    }
    return nada;
};

export {GeneralMult, GeneralDiv}
