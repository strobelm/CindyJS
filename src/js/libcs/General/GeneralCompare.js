import { CSNumber } from "libcs/CSNumber";
import { List } from "libcs/List";
import { General } from "../General";

const GeneralCompare = function (a, b) {
    if (a.ctype !== b.ctype) {
        return General.order[a.ctype] - General.order[b.ctype];
    }
    if (a.ctype === "number") {
        return CSNumber._helper.compare(a, b);
    }
    if (a.ctype === "list") {
        return List._helper.compare(a, b);
    }
    if (a.ctype === "geo") {
        if (a.value.name === b.value.name) {
            return 0;
        }
        if (a.value.name < b.value.name) {
            return -1;
        }
        return 1;
    }
    if (a.ctype === "string") {
        if (a.value === b.value) {
            return 0;
        }
        if (a.value < b.value) {
            return -1;
        }
        return 1;
    }
    if (a.ctype === "boolean") {
        if (a.value === b.value) {
            return 0;
        }
        if (a.value === false) {
            return -1;
        }
        return 1;
    }
};

const GeneralIsLessThan = function (a, b) {
    return GeneralCompare(a, b) === -1;
};
const GeneralIsEqual = function (a, b) {
    return GeneralCompare(a, b) === 0;
};
const GeneralCompareResults = function (a, b) {
    return GeneralCompare(a.result, b.result);
};


const GeneralMax = function (v0, v1) {
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.max(v0, v1);
    }
    if (v0.ctype === "list" && v1.ctype === "list") {
        return List.max(v0, v1);
    }
    return nada;
};

const GeneralMin = function (v0, v1) {
    if (v0.ctype === "number" && v1.ctype === "number") {
        return CSNumber.min(v0, v1);
    }
    if (v0.ctype === "list" && v1.ctype === "list") {
        return List.min(v0, v1);
    }
    return nada;
};

export {GeneralCompare, GeneralIsEqual, GeneralIsLessThan, GeneralCompareResults, GeneralMin, GeneralMax}
