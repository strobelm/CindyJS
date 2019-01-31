"use strict";
var should = require("chai").should();
var rewire = require("rewire");

global.navigator = {};
var CindyJS = require("../build/js/Cindy.plain.js");

var cdy = CindyJS({
            isNode: true,
            csconsole: null,
            geometry: [
                {name:"A", type:"Free", pos:[0,0]},
                {name:"B", type:"Free", pos:[1,1]},
                {name:"C", type:"Free", pos:[1,2]},
            ],
        });

function itCmd(command, expected) {
    it(command, function() {
        String(cdy.niceprint(cdy.evalcs(command))).should.equal(expected);
    });
}

function getJSONStr() {
return "{\"age\":30, \"bool\":false, \"cars\":[{\n \"models\": [\n  \"Fiesta\",\n  \"Focus\",\n  \"Mustang\"\n ],\n \"name\": \"Ford\"\n}, {\n \"models\": [\n  \"320\",\n  \"X3\",\n  \"X5\"\n ],\n \"name\": \"BMW\"\n}, {\n \"models\": [\n  \"500\",\n  \"Panda\"\n ],\n \"name\": \"Fiat\"\n}], \"name\":\"Joe\"}"
}

describe("JSON basic getter / setter", function(){
    before(function(){
        cdy.evalcs('circ = circle(A,1);');
        cdy.evalcs('json = ' + getJSONStr());
        cdy.evalcs('json.test = circ;');
        cdy.evalcs('json.undef = undef;');
        }
    );

    itCmd('json.name', 'Joe');
    itCmd('json.bool', 'false');
    itCmd('json.undef', '___');
    itCmd('json.age', '30');
    itCmd('((json.cars)_1).models_2', 'Focus');
    itCmd('json.test', 'circle');
});

describe("JSON geo objects", function(){
    before(function(){
        cdy.evalcs('geojson = {"pt1": A, "pt2": B, "pt3" : C};');
        }
    );

    itCmd('(geojson.pt1).xy', '[0, 0]');
    itCmd('geojson.pt1 = C; (geojson.pt1).xy', '[1, 2]');
});
