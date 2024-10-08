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

/// <amd-dependency path="module" name="module"/>

const _               = brackets.getModule("thirdparty/lodash");
const AnimationUtils  = brackets.getModule("utils/AnimationUtils");
const ExtensionUtils  = brackets.getModule("utils/ExtensionUtils");
const Strings         = brackets.getModule("strings");

let $span: JQuery | null = null;
let errorCount = 0;
let _attached  = false;
let _windowOnError;
let _consoleError;
let _consoleClear;

ExtensionUtils.loadStyleSheet(module, "styles.css");

function showDeveloperTools() {
    try {
        brackets.app.showDeveloperTools();
    } catch (err) {
        console.error(err);
    }
}

function handleClick(event) {
    if (event.shiftKey) {
        window.console.clear();
    } else {
        showDeveloperTools();
    }
}

function refreshIndicator() {
    // never show 0 errors
    if (!_attached || errorCount === 0) {
        // hide notifier if it was attached previously
        // but errorCount was cleared or it was disabled
        if ($span) {
            $span.parent().hide();
        }
        return;
    }

    // update span if it was created before
    if ($span) {
        $span.text(errorCount).parent().show();
        return;
    }

    // create the span
    $span = $("<span>").text(errorCount);
    $("<div>")
        .attr("id", "error-counter")
        .attr("title", Strings.CMD_SHOW_DEV_TOOLS + "\u2026")
        .text(Strings.ERRORS + ": ")
        .append($span)
        .on("click", handleClick)
        .insertBefore("#status-bar .spinner");
}

const blink = _.debounce(function () {
    AnimationUtils.animateUsingClass($span!.parent()[0], "flash", 1500);
}, 100);

function incErrorCount() {
    errorCount++;
    blink();
    refreshIndicator();
}

function clearErrorCount() {
    errorCount = 0;
    refreshIndicator();
}

function attachFunctions() {
    if (_attached) {
        return;
    }

    _attached      = true;
    _windowOnError = window.onerror;
    _consoleError  = window.console.error;
    _consoleClear  = window.console.clear;

    // https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers.onerror
    window.onerror = function (errorMsg, url, lineNumber) {
        incErrorCount();
        if (_windowOnError) {
            return _windowOnError(errorMsg, url, lineNumber);
        }
        // return false means that we didn't handle this error and it should run the default handler
        return false;
    };

    window.console.error = function () {
        incErrorCount();
        const args = Array.prototype.slice.call(arguments);
        // The next two lines are useful while developing to print stack traces.
        // var err = new Error();
        // args.push(err);
        return _consoleError.apply(window.console, args);
    };

    window.console.clear = function () {
        clearErrorCount();
        return _consoleClear.apply(window.console, arguments);
    };
}

function detachFunctions() {
    if (!_attached) {
        return;
    }

    _attached            = false;
    window.onerror       = _windowOnError;
    window.console.error = _consoleError;
    window.console.clear = _consoleClear;
}

export function toggle(bool) {
    if (bool) {
        attachFunctions();
    } else {
        detachFunctions();
    }
    refreshIndicator();
}
