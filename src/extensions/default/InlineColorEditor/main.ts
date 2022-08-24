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

/// <amd-dependency path="module" name="module"/>

const EditorManager       = brackets.getModule("editor/EditorManager");
const ExtensionUtils      = brackets.getModule("utils/ExtensionUtils");
import { InlineColorEditor } from "InlineColorEditor";
const ColorUtils          = brackets.getModule("utils/ColorUtils");


/**
 * Prepare hostEditor for an InlineColorEditor at pos if possible. Return
 * editor context if so; otherwise null.
 *
 * @param {Editor} hostEditor
 * @param {{line:Number, ch:Number}} pos
 * @return {?{color:String, marker:TextMarker}}
 */
// export for use by other InlineColorEditors
export function prepareEditorForProvider(hostEditor, pos) {
    const sel = hostEditor.getSelection();
    if (sel.start.line !== sel.end.line) {
        return null;
    }

    const colorRegEx = new RegExp(ColorUtils.COLOR_REGEX);
    const cursorLine = hostEditor.document.getLine(pos.line);

    let match;
    let start;
    let end;

    // Loop through each match of colorRegEx and stop when the one that contains pos is found.
    do {
        match = colorRegEx.exec(cursorLine);
        if (match) {
            start = match.index;
            end = start + match[0].length;
        }
    } while (match && (pos.ch < start || pos.ch > end));

    if (!match) {
        return null;
    }

    // Adjust pos to the beginning of the match so that the inline editor won't get
    // dismissed while we're updating the color with the new values from user's inline editing.
    pos.ch = start;
    const endPos = {line: pos.line, ch: end};

    const marker = hostEditor._codeMirror.markText(pos, endPos);
    hostEditor.setSelection(pos, endPos);

    return {
        color: match[0],
        marker: marker
    };
}

/**
 * Registered as an inline editor provider: creates an InlineEditorColor when the cursor
 * is on a color value (in any flavor of code).
 *
 * @param {!Editor} hostEditor
 * @param {!{line:Number, ch:Number}} pos
 * @return {?$.Promise} synchronously resolved with an InlineWidget, or null if there's
 *      no color at pos.
 */
// Export for unit tests only
export function inlineColorEditorProvider(hostEditor, pos) {
    const context = prepareEditorForProvider(hostEditor, pos);

    if (!context) {
        return null;
    }

    const inlineColorEditor = new InlineColorEditor(context.color, context.marker);
    inlineColorEditor.load(hostEditor);

    const result = $.Deferred();
    result.resolve(inlineColorEditor);
    return result.promise();
}


// Initialize extension
ExtensionUtils.loadStyleSheet(module, "css/main.less");

EditorManager.registerInlineEditProvider(inlineColorEditorProvider);
