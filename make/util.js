"use strict";

exports.pipe = function (src, dst) {
    return new Promise(function (resolve, reject) {
        src.on("error", reject).pipe(dst.on("error", reject).on("finish", resolve));
    });
};
