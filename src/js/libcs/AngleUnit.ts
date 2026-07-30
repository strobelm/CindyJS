import { instanceInvocationArguments } from "../expose.js";
import { CSNumber, TWOPI } from "./CSNumber.js";

import { CSNum } from "../types.js";

const angleUnit = instanceInvocationArguments.angleUnit || "°";
const PERTWOPI = 1 / TWOPI;
const angleUnits = {
    rad: TWOPI,
    "°": 360,
    deg: 360,
    degree: 360,
    gra: 400,
    grad: 400,
    turn: 1,
    cyc: 1,
    rev: 1,
    rot: 1,
    π: 2,
    pi: 2,
    quad: 4,
};

type AngleUnit = keyof typeof angleUnits;
const angleUnitName = angleUnit.replace(/\s+/g, "") as AngleUnit; // unit may contain space

const angleroundingfactor = 1e1;

function niceangle(a: CSNum): string {
    const unit = angleUnits[angleUnitName];
    if (!unit) return CSNumber.niceprint({ ...a, usage: undefined });
    const num = CSNumber.niceprint(CSNumber.realmult(unit * PERTWOPI, a), unit > 200 ? angleroundingfactor : undefined);
    if (!num.includes("i*")) return num + angleUnit;
    return "(" + num + ")" + angleUnit;
}

function printNumber(a: CSNum): string {
    return a.usage === "Angle" ? niceangle(a) : CSNumber.niceprint(a);
}

export { niceangle, printNumber };
