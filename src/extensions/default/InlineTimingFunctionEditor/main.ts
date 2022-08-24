/*
 * Copyright (c) 2013 - 2017 Adobe Systems Incorporated. All rights reserved.
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
 */

/*
 * The timing function canvas and editing code was adapted from Lea Verou's cubic-bezier project:
 * - https://github.com/LeaVerou/cubic-bezier (cubic-bezier.com)
 *
 * The canvas exceeds the top and bottom of main grid so y-value of points can be
 * dragged outside of the 0-1 range.
 *
 *   . . . . . .
 *   .         .
 *   +---------+
 *   |         |
 *   |         |
 *   |         |
 *   |         |
 *   +---------+ <-- main grid has height of 150
 *   .         .
 *   . . . . . . <-- canvas has height of 300 (extra 75 above/below)
 *
 */

/// <amd-dependency path="module" name="module"/>

// Brackets modules
const EditorManager       = brackets.getModule("editor/EditorManager");
const ExtensionUtils      = brackets.getModule("utils/ExtensionUtils");
const Strings             = brackets.getModule("strings");
const Mustache            = brackets.getModule("thirdparty/mustache/mustache");

import { InlineTimingFunctionEditor } from "InlineTimingFunctionEditor";
import * as TimingFunctionUtils from "TimingFunctionUtils";
import * as Localized from "text!Localized.css";


// Functions


/**
 * Prepare hostEditor for an InlineTimingFunctionEditor at pos if possible.
 * Return editor context if so; otherwise null.
 *
 * @param {Editor} hostEditor
 * @param {{line:Number, ch:Number}} pos
 * @return {timingFunction:{?string}, reason:{?string}, start:{?TextMarker}, end:{?TextMarker}}
 */
function prepareEditorForProvider(hostEditor, pos) {
    const cm = hostEditor._codeMirror;

    const sel = hostEditor.getSelection();
    if (sel.start.line !== sel.end.line) {
        return {timingFunction: null, reason: null};
    }

    const cursorLine = hostEditor.document.getLine(pos.line);

    // code runs several matches complicated patterns, multiple times, so
    // first do a quick, simple check to see make sure we may have a match
    if (!cursorLine.match(/cubic-bezier|linear|ease|step/)) {
        return {timingFunction: null, reason: null};
    }

    let currentMatch = TimingFunctionUtils.timingFunctionMatch(cursorLine, false);
    if (!currentMatch) {
        return {timingFunction: null, reason: Strings.ERROR_TIMINGQUICKEDIT_INVALIDSYNTAX};
    }

    // check for subsequent matches, and use first match after pos
    let lineOffset = 0;
    const matchLength = ((currentMatch.originalString && currentMatch.originalString.length) || currentMatch[0].length);
    while (pos.ch > (currentMatch.index + matchLength + lineOffset)) {
        const restOfLine = cursorLine.substring(currentMatch.index + matchLength + lineOffset);
        const newMatch = TimingFunctionUtils.timingFunctionMatch(restOfLine, false);

        if (newMatch) {
            lineOffset += (currentMatch.index + matchLength);
            currentMatch = $.extend(true, [], newMatch);
        } else {
            break;
        }
    }

    currentMatch.lineOffset = lineOffset;

    const startPos = {line: pos.line, ch: lineOffset + currentMatch.index};
    const endPos   = {line: pos.line, ch: lineOffset + currentMatch.index + matchLength};

    const startBookmark = cm.setBookmark(startPos);
    const endBookmark   = cm.setBookmark(endPos);

    // Adjust selection to the match so that the inline editor won't
    // get dismissed while we're updating the timing function.
    hostEditor.setSelection(startPos, endPos);

    return {
        timingFunction: currentMatch,
        start: startBookmark,
        end: endBookmark
    };
}

/**
 * Registered as an inline editor provider: creates an InlineTimingFunctionEditor
 * when the cursor is on a timing function value.
 *
 * @param {!Editor} hostEditor
 * @param {!{line:Number, ch:Number}} pos
 * @return {?$.Promise} synchronously resolved with an InlineWidget, or
 *         {string} if timing function with invalid syntax is detected at pos, or
 *         null if there's no timing function at pos.
 */
// Export for unit tests only
export function inlineTimingFunctionEditorProvider(hostEditor, pos) {
    const context = prepareEditorForProvider(hostEditor, pos);

    if (!context.timingFunction) {
        return context.reason || null;
    }

    const inlineTimingFunctionEditor = new InlineTimingFunctionEditor(context.timingFunction, context.start, context.end);
    inlineTimingFunctionEditor.load(hostEditor);

    const result = $.Deferred();
    result.resolve(inlineTimingFunctionEditor);
    return result.promise();
}

/**
 * Initialization code
 */
function init() {
    // Load our stylesheet
    ExtensionUtils.loadStyleSheet(module, "main.less");
    ExtensionUtils.addEmbeddedStyleSheet(Mustache.render(Localized, Strings));

    EditorManager.registerInlineEditProvider(inlineTimingFunctionEditorProvider);
}

init();
