//==========================================
//      Pseudo random number generator
//==========================================
// Per-instance state: `seed` is "NO" until seedrandom() installs a numeric
// seed; until then rand() falls back to Math.random().

let seed = "NO";

function seedrandom(a) {
    a = a - Math.floor(a);
    a = a * 0.8 + 0.1;
    seed = a;
}

function rand() {
    if (seed === "NO") {
        return Math.random();
    }
    let a = seed;
    a = Math.sin(1000 * a) * 1000;
    a = a - Math.floor(a);
    seed = a;
    return a;
}

function randnormal() {
    const a = rand();
    const b = rand();
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
}

export { rand, randnormal, seedrandom };
