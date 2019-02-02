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

/**
 * Defines hooks to assist with module initialization.
 *
 * This module defines 3 methods for client modules to attach callbacks:
 *    - htmlReady - When the main application template is rendered
 *    - extensionsLoaded - When the extension manager has loaded all extensions
 *    - appReady - When Brackets completes loading all modules and extensions
 *
 * These are *not* jQuery events. Each method is similar to $(document).ready
 * in that it will call the handler immediately if brackets is already done
 * loading.
 */

/*
 * Fires when the base htmlContent/main-view.html is loaded
 * @type {string}
 * @const
 */
export const HTML_READY  = "htmlReady";

/*
 * Fires when all extensions are loaded
 * @type {string}
 * @const
 */
export const APP_READY   = "appReady";

/*
 * Fires after extensions have been loaded
 * @type {string}
 * @const
 */
export const EXTENSIONS_LOADED = "extensionsLoaded";

/*
 * Map of each state's trigger
 * @type {Object.<string, boolean>}
 * @private
 */
const _status      = { HTML_READY : false, APP_READY : false, EXTENSIONS_LOADED: false };

/*
 * Map of callbacks to states
 * @type {Object.<string, Array.<function()>>}
 * @private
 */
const _callbacks   = {};

_callbacks[HTML_READY]        = [];
_callbacks[APP_READY]         = [];
_callbacks[EXTENSIONS_LOADED] = [];


/*
 * calls the specified handler inside a try/catch handler
 * @param {function()} handler - the callback to call
 * @private
 */
function _callHandler(handler) {
    try {
        // TODO (issue 1034): We *could* use a $.Deferred for this, except deferred objects enter a broken
        // state if any resolution callback throws an exception. Since third parties (e.g. extensions) may
        // add callbacks to this, we need to be robust to exceptions
        handler();
    } catch (e) {
        console.error("Exception when calling a 'brackets done loading' handler: " + e);
        console.log(e.stack);
    }
}

/*
 * dispatches the event by calling all handlers registered for that type
 * @param {string} type - the event type to dispatch (APP_READY, EXTENSIONS_READY, HTML_READY)
 * @private
 */
// Unit Test API
export function _dispatchReady(type) {
    let i;
    const myHandlers = _callbacks[type];

    // mark this status complete
    _status[type] = true;

    for (i = 0; i < myHandlers.length; i++) {
        _callHandler(myHandlers[i]);
    }

    // clear all callbacks after being called
    _callbacks[type] = [];
}

/*
 * adds a callback to the list of functions to call for the specified event type
 * @param {string} type - the event type to dispatch (APP_READY, EXTENSIONS_READY, HTML_READY)
 * @param {function} handler - callback funciton to call when the event is triggered
 * @private
 */
function _addListener(type, handler) {
    if (_status[type]) {
        _callHandler(handler);
    } else {
        _callbacks[type].push(handler);
    }
}

/**
 * Adds a callback for the ready hook. Handlers are called after
 * htmlReady is done, the initial project is loaded, and all extensions are
 * loaded.
 * @param {function} handler - callback function to call when the event is fired
 */
export function appReady(handler) {
    _addListener(APP_READY, handler);
}

/**
 * Adds a callback for the htmlReady hook. Handlers are called after the
 * main application html template is rendered.
 * @param {function} handler - callback function to call when the event is fired
 */
export function htmlReady(handler) {
    _addListener(HTML_READY, handler);
}

/**
 * Adds a callback for the extensionsLoaded hook. Handlers are called after the
 * extensions have been loaded
 * @param {function} handler - callback function to call when the event is fired
 */
export function extensionsLoaded(handler) {
    _addListener(EXTENSIONS_LOADED, handler);
}
