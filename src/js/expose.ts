import { Nada } from "./types.js";

/* eslint no-var: off */
var instanceInvocationArguments = { angleUnit: undefined };
var document = {};
var window = { document };
var nada: Nada = { ctype: "undefined" };

export { document, nada, window, instanceInvocationArguments };
