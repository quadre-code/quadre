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
 * Used to validate whether type of unknown value is an integer.
 *
 * @param {*} value Value for which to validate its type
 * @return {boolean} true if value is a finite integer
 */
export function isInteger(value: any): boolean {
    // Validate value is a number
    if (typeof (value) !== "number" || isNaN(parseInt(value as any, 10))) {
        return false;
    }

    // Validate number is an integer
    if (Math.floor(value) !== value) {
        return false;
    }

    // Validate number is finite
    if (!isFinite(value)) {
        return false;
    }

    return true;
}

/**
 * Used to validate whether type of unknown value is an integer, and, if so,
 * is it within the option lower and upper limits.
 *
 * @param {*} value Value for which to validate its type
 * @param {number=} lowerLimit Optional lower limit (inclusive)
 * @param {number=} upperLimit Optional upper limit (inclusive)
 * @return {boolean} true if value is an interger, and optionally in specified range.
 */
export function isIntegerInRange(value: any, lowerLimit: number, upperLimit: number): boolean {
    // Validate value is an integer
    if (!isInteger(value)) {
        return false;
    }

    // Validate integer is in range
    const hasLowerLimt = (typeof (lowerLimit) === "number");
    const hasUpperLimt = (typeof (upperLimit) === "number");

    return ((!hasLowerLimt || value >= lowerLimit) && (!hasUpperLimt || value <= upperLimit));
}
