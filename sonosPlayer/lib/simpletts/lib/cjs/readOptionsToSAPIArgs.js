"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// module
exports.default = (options) => {
    return [
        // -10 -> 10
        "-r",
        String(Math.round(options.speed / 5) - 10),
        "-voice",
        "string" === typeof options.voice ? options.voice : options.voice.name,
        "-file",
        "string" === typeof options.file ? options.file : null
    ];
};
