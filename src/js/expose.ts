// nada is owned by the leaf module nada.js (one object per page, compared by
// identity); this seam only re-exports it.
// @ts-expect-error: Not yet typed
import { nada } from "./nada.js";

/* eslint no-var: off */
var instanceInvocationArguments = { angleUnit: undefined };
var document = {};
var window = { document };

// The page-global CindyJS function object. In the shipping bundle this is the
// real one, handed across the factory boundary (see expose.browser.js); here it
// is the inert stub that lets Setup.js be evaluated outside a browser. Only the
// two containers Setup.js touches unconditionally are modelled - registering
// plugins or loading scripts is nothing the node/test environment does.
var CindyJS: any = {
    instances: [] as any[],
    _pluginRegistry: {} as { [name: string]: any },
};

export { CindyJS, document, nada, window, instanceInvocationArguments };
