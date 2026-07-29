// Leaf module: mutable per-widget state that is read outside Setup.js while
// those modules are being evaluated. Keeping it here (instead of in Setup.js)
// removes all init-time edges into Setup, which is the composition root.
//
// The objects are created empty and filled in by Setup.js; consumers only ever
// mutate their properties, never rebind the exported names.

// The object returned from the public CindyJS function; Setup.js populates it.
const globalInstance = {};

// Callbacks run in reverse order when the widget shuts down.
const shutdownHooks = [];

export { globalInstance, shutdownHooks };
