var conjectures = [];

function guessIncidences(el) {
    if (guessIncidences.hasOwnProperty(el.kind))
        guessIncidences[el.kind](el);
}

guessIncidences.P = function(p) {
    csgeo.lines.forEach(function(l) {
        var conjecture = incidentPL(p, l);
        if (conjecture.holds())
            conjectures.push(conjecture);
    });
    csgeo.conics.forEach(function(c) {
        var conjecture = incidentPC(p, c);
        if (conjecture.holds())
            conjectures.push(conjecture);
    });
};

guessIncidences.L = function(l) {
    csgeo.points.forEach(function(p) {
        var conjecture = incidentPL(p, l);
        if (conjecture.holds())
            conjectures.push(conjecture);
    });
};

guessIncidences.S = guessIncidences.L;

guessIncidences.C = function(c) {
    csgeo.points.forEach(function(p) {
        var conjecture = incidentPC(p, c);
        if (conjecture.holds())
            conjectures.push(conjecture);
    });
};

function applyIncidence(a, b) {
    return function() {
        a.incidences.push(b.name);
        b.incidences.push(a.name);
    };
}

function incidentPL(p, l) {
    return {
        getInvolved: function() {
            return [p.name, l.name];
        },
        toString: function() {
            return "point " + p.name + " incident line " + l.name;
        },
        apply: applyIncidence(p, l),
        holds: function() {
            var pn = List.scaldiv(List.abs(p.homog), p.homog);
            var ln = List.scaldiv(List.abs(l.homog), l.homog);
            var prod = CSNumber.abs(List.scalproduct(pn, ln));
            return (prod.value.real < CSNumber.eps);
        }
    };
}

function incidentPC(p, c) {
    return {
        getInvolved: function() {
            return [p.name, c.name];
        },
        toString: function() {
            return "point " + p.name + " incident conic " + c.name;
        },
        apply: applyIncidence(p, c),
        holds: function() {
            var erg = General.mult(c.matrix, p.homog);
            erg = General.mult(p.homog, erg);
            erg = CSNumber.abs(erg);
            return (erg.value.real < CSNumber.eps);
        }
    };
}

function checkConjectures() {
    var debug = false;
    if (debug) console.log("conjectures", conjectures.length);
    if (conjectures.length === 0) return;
    //backupGeo
    stateArrays.prover.set(stateIn);

    var nummoves = 3;

    // filter free objects which are involved in conjectures
    var involved;

    var recalcInvolved = function() {
        involved = {};
        conjectures.forEach(function(con) {
            var invs = con.getInvolved();
            var incis;
            invs.forEach(function(el) {
//            for(el in invs){
                if (!involved[el]) {
                    involved[el] = true;
                    // also add incidences of involved objects
                    incis = findAllIncis(el, {});
 //                   incis.forEach(function(i) {
                    for(i in incis){
                        if (!involved[el]) involved[i] = true;
                    };
                }
            });
        });
    };

    // recursively find all incidences to an geo object
    var findAllIncis = function(name, map) {
        // get all incidences we don't already know
        //var nincis = el.incidences.filter(function(iels) {
        //    return !map[iels.name];
        //});
        //if (nincis.length === 0) return map;
        // add new incidences
        //nincis.forEach(function(ii) {
        //    map[ii] = true;
        //});
        var el = csgeo.csnames[name];
        var len = Object.keys(map).length;
//        for(i in el.incidences) map[ii] = true;
        el.incidences.forEach(function(ii){ map[ii]= true;});
        if(len === Object.keys(map).length) return map;
        // recursive call
        //nincis.forEach(function(nel) {
        for(nel in nincis) findAllIncis(nel, map);
        //});
        return map;
    };

    recalcInvolved();

    // for jshint move the function definition outside loop 
    var checkCon = function(con) {
        return con.holds();
    };

    // add defining elements 
    //involved.forEach(function(inv) {
    for(var inv in involved){
        console.log(inv);
        var args = csgeo.csnames[inv].args;
        if (typeof(n) === 'undefined') return;
        for(arg in args) involved[arg] = true;
//        n.forEach(function(name) {
//            if (involved.indexOf(csgeo.csnames[name]) < 0)
//                involved.push(csgeo.csnames[name]);
//        });
    };

    var emove, nconject = conjectures.length;
    for (var kk = 0; kk < nummoves; kk++) {
        for(name in involved){
            var el = csgeo.csnames[name];
        //for (var oo = 0; oo < involved.length; oo++) {
        //    var el = involved[oo];
            if (!el.pinned && geoOps[el.type].isMovable) {
                if (debug) console.log("prover: moving element", el.name);
                // get random move and move free element
                emove = geoOps[el.type].getRandomMove(el);
                movepointscr(el, emove.value, emove.type);
                // check if conjecture still holds
                conjectures = conjectures.filter(checkCon);
            }
        }
        recalcInvolved();
    }

    if (debug) {
        console.log("dropped ", nconject - conjectures.length, " conjectures");
    }


    //restoreGeo
    if (!debug) {
        stateIn.set(stateArrays.prover);
        recalcAll();
    }


    for (var i = 0; i < conjectures.length; ++i) {
        conjectures[i].apply();
    }
    conjectures = [];
    if (debug) {
        csgeo.gslp.forEach(function(el) {
            console.log(el.name, el.incidences);
        });
    }
}
