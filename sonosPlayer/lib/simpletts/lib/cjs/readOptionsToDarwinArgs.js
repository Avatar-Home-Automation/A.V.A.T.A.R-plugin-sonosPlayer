"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

exports.default = (options) => {
    let speed = 180;
    if (options.speed > 50) {
        speed = 180 + ((options.speed - 50) * 2.6)
    } else if (options.speed < 50) {
        speed = 180 - ((50 - options.speed) * 2.6)
    } 
    return [
        "-r",
        String(speed),
        "string" === typeof options.voice ? options.voice : options.voice.name,
        "-o",
        options.file
    ];
};
