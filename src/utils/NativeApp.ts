/*
 * Copyright (c) 2012 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import * as Async from "utils/Async";
import FileSystemError = require("filesystem/FileSystemError");

/**
 * @private
 * Map an fs error code to a FileError.
 */
function _browserErrToFileError(err: string): FileSystemError {
    if (err === brackets.fs.ERR_NOT_FOUND) {
        return FileSystemError.NOT_FOUND;
    }

    // All other errors are mapped to the generic "unknown" error
    return FileSystemError.UNKNOWN;
}

const liveBrowserOpenedPIDs: Array<any> = [];

/**
 * Open the given URL in the user's system browser, optionally enabling debugging.
 * @param {string} url The URL to open.
 * @param {boolean=} enableRemoteDebugging Whether to turn on remote debugging. Default false.
 * @return {$.Promise}
 */
export function openLiveBrowser(url: string, enableRemoteDebugging: boolean): JQueryPromise<number> {
    const result = $.Deferred<number>();

    brackets.app.openLiveBrowser(url, !!enableRemoteDebugging, function onRun(err, pid) {
        if (!err) {
            // Undefined ids never get removed from list, so don't push them on
            if (pid !== undefined) {
                liveBrowserOpenedPIDs.push(pid);
            }
            result.resolve(pid);
        } else {
            result.reject(_browserErrToFileError(err));
        }
    });

    return result.promise();
}

/**
 *
 * @return {$.Promise}
 */
export function closeLiveBrowser(pid: number): JQueryPromise<void> {
    const result = $.Deferred<void>();

    if (isNaN(pid)) {
        pid = 0;
    }
    brackets.app.closeLiveBrowser(function (err) {
        if (!err) {
            const i = liveBrowserOpenedPIDs.indexOf(pid);
            if (i !== -1) {
                liveBrowserOpenedPIDs.splice(i, 1);
            }
            result.resolve();
        } else {
            result.reject(_browserErrToFileError(err));
        }
    }, pid);

    return result.promise();
}

/**
 * Closes all the browsers that were tracked on open
 * TODO: does not seem to work on Windows
 * @return {$.Promise}
 */
export function closeAllLiveBrowsers(): JQueryPromise<void> {
    // make a copy incase the array is edited as we iterate
    const closeIDs = liveBrowserOpenedPIDs.concat();
    return Async.doSequentially(closeIDs, closeLiveBrowser, false);
}

/**
 * Opens a URL in the system default browser
 */
export function openURLInDefaultBrowser(url: string): void {
    brackets.app.openURLInDefaultBrowser(url);
}
