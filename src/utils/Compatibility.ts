/*
 * Copyright (c) 2014 - 2017 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2018 - present The quadre code authors. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/**
 * Compatibility shims for running Brackets in various environments, browsers.
 */

// [IE10] String.prototype missing trimRight() and trimLeft()
if (!String.prototype.trimRight) {
    String.prototype.trimRight = function (): string { return this.replace(/\s+$/, ""); };
}
if (!String.prototype.trimLeft) {
    String.prototype.trimLeft = function (): string { return this.replace(/^\s+/, ""); };
}

// Feature detection for Error.stack. Not all browsers expose it
// and Brackets assumes it will be a non-null string.
if (typeof (new Error()).stack === "undefined") {
    Error.prototype.stack = "";
}

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
