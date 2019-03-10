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
 *
 */

/**
 * Manages tickmarks shown along the scrollbar track.
 * NOT yet intended for use by anyone other than the FindReplace module.
 * It is assumed that markers are always clear()ed when switching editors.
 */

import * as _ from "lodash";

import * as WorkspaceManager from "view/WorkspaceManager";
import { DispatcherEvents } from "utils/EventDispatcher";


/**
 * Editor the markers are currently shown for, or null if not shown
 * @type {?Editor}
 */
let editor;

/**
 * Top of scrollbar track area, relative to top of scrollbar
 * @type {number}
 */
let trackOffset;

/**
 * Height of scrollbar track area
 * @type {number}
 */
let trackHt;

/**
 * Text positions of markers
 * @type {!Array.<{line: number, ch: number}>}
 */
let marks = [];

/**
 * Tickmark markCurrent() last called on, or null if never called / called with -1.
 * @type {?jQueryObject}
 */
let $markedTickmark;

/**
 * Vertical space above and below the scrollbar
 * @type {number}
 */
let scrollbarTrackOffset;

switch (brackets.platform) {
    case "win": // Custom scrollbar CSS has no gap around the track
        scrollbarTrackOffset = 0;
        break;
    case "mac": // Native scrollbar has padding around the track
        scrollbarTrackOffset = 4;
        break;
    case "linux": // Custom scrollbar CSS has assymmetrical gap; this approximates it
        scrollbarTrackOffset = 2;
        break;
}

/**
 * Vertical space above and below the scrollbar.
 * @return {number} amount Value in pixels
 */
export function getScrollbarTrackOffset() {
    return scrollbarTrackOffset;
}

/**
 * Sets how much vertical space there's above and below the scrollbar, which depends
 * on the OS and may also be affected by extensions
 * @param {number} offset Value in pixels
 */
export function setScrollbarTrackOffset(offset) {
    scrollbarTrackOffset = offset;
}

function _getScrollbar(editor) {
    // Be sure to select only the direct descendant, not also elements within nested inline editors
    return $(editor.getRootElement()).children(".CodeMirror-vscrollbar");
}

/** Measure scrollbar track */
function _calcScaling() {
    const $sb = _getScrollbar(editor);

    trackHt = $sb[0].offsetHeight;

    if (trackHt > 0) {
        trackOffset = getScrollbarTrackOffset();
        trackHt -= trackOffset * 2;
    } else {
        // No scrollbar: use the height of the entire code content
        const codeContainer = $(editor.getRootElement()).find("> .CodeMirror-scroll > .CodeMirror-sizer > div > .CodeMirror-lines > div")[0];
        trackHt = codeContainer.offsetHeight;
        trackOffset = codeContainer.offsetTop;
    }
}

/** Add all the given tickmarks to the DOM in a batch */
function _renderMarks(posArray) {
    let html = "";
    const cm = editor._codeMirror;
    const editorHt = cm.getScrollerElement().scrollHeight;

    // We've pretty much taken these vars and the getY function from CodeMirror's annotatescrollbar addon
    // https://github.com/codemirror/CodeMirror/blob/master/addon/scroll/annotatescrollbar.js
    const wrapping = cm.getOption("lineWrapping");
    const singleLineH = wrapping && cm.defaultTextHeight() * 1.5;
    let curLine = null;
    let curLineObj = null;

    function getY(cm, pos) {
        if (curLine !== pos.line) {
            curLine = pos.line;
            curLineObj = cm.getLineHandle(curLine);
        }
        if (wrapping && (curLineObj as any).height > singleLineH) {
            return cm.charCoords(pos, "local").top;
        }
        return cm.heightAtLine(curLineObj, "local");
    }

    posArray.forEach(function (pos) {
        const cursorTop = getY(cm, pos);
        let top = Math.round(cursorTop / editorHt * trackHt) + trackOffset;
        top--;  // subtract ~1/2 the ht of a tickmark to center it on ideal pos

        html += "<div class='tickmark' style='top:" + top + "px'></div>";
    });
    $(".tickmark-track", editor.getRootElement()).append($(html));
}


/**
 * Clear any markers in the editor's tickmark track, but leave it visible. Safe to call when
 * tickmark track is not visible also.
 */
export function clear() {
    if (editor) {
        $(".tickmark-track", editor.getRootElement()).empty();
        marks = [];
        $markedTickmark = null;
    }
}

/** Add or remove the tickmark track from the editor's UI */
export function setVisible(curEditor, visible) {
    // short-circuit no-ops
    if ((visible && curEditor === editor) || (!visible && !editor)) {
        return;
    }

    if (visible) {
        console.assert(!editor);
        editor = curEditor;

        // Don't support inline editors yet - search inside them is pretty screwy anyway (#2110)
        if (editor.isTextSubset()) {
            return;
        }

        const $sb = _getScrollbar(editor);
        const $overlay = $("<div class='tickmark-track'></div>");
        $sb.parent().append($overlay);

        _calcScaling();

        // Update tickmarks during editor resize (whenever resizing has paused/stopped for > 1/3 sec)
        (WorkspaceManager as unknown as DispatcherEvents).on("workspaceUpdateLayout.ScrollTrackMarkers", _.debounce(function () {
            if (marks.length) {
                _calcScaling();
                $(".tickmark-track", editor.getRootElement()).empty();
                _renderMarks(marks);
            }
        }, 300));

    } else {
        console.assert(editor === curEditor);
        $(".tickmark-track", curEditor.getRootElement()).remove();
        editor = null;
        marks = [];
        (WorkspaceManager as unknown as DispatcherEvents).off("workspaceUpdateLayout.ScrollTrackMarkers");
    }
}

/**
 * Add tickmarks to the editor's tickmark track, if it's visible
 * @param curEditor {!Editor}
 * @param posArray {!Array.<{line:Number, ch:Number}>}
 */
export function addTickmarks(curEditor, posArray) {
    console.assert(editor === curEditor);

    marks = marks.concat(posArray);
    _renderMarks(posArray);
}

/** @param {number} index Either -1, or an index into the array passed to addTickmarks() */
export function markCurrent(index) {
    // Remove previous highlight first
    if ($markedTickmark) {
        $markedTickmark.removeClass("tickmark-current");
        $markedTickmark = null;
    }
    if (index !== -1) {
        $markedTickmark = $(".tickmark-track > .tickmark", editor.getRootElement()).eq(index).addClass("tickmark-current");
    }
}

// Private helper for unit tests
export function _getTickmarks() {
    return marks;
}
