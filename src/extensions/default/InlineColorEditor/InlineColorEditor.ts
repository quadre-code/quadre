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

import type { MarkerRange, TextMarker } from "codemirror";

const InlineWidget         = brackets.getModule("editor/InlineWidget").InlineWidget;
import { ColorEditor } from "ColorEditor";
const ColorUtils           = brackets.getModule("utils/ColorUtils");


/** @const @type {number} */
const MAX_USED_COLORS = 7;

/** @type {number} Global var used to provide a unique ID for each color editor instance's _origin field. */
let lastOriginId = 1;

/** Comparator to sort by which colors are used the most */
function _colorSort(a, b) {
    if (a.count === b.count) {
        return 0;
    }
    if (a.count > b.count) {
        return -1;
    }
    if (a.count < b.count) {
        return 1;
    }

    return undefined;
}

/**
 * Inline widget containing a ColorEditor control
 */
export class InlineColorEditor extends InlineWidget {
    /** @type {!ColorPicker} ColorPicker instance */
    public colorEditor: ColorEditor | null = null;

    /** @type {!string} Current value of the color picker control */
    private _color = null;

    /**
     * Range of code we're attached to; _marker.find() may by null if sync is lost.
     * @type {!CodeMirror.TextMarker}
     */
    private _marker: TextMarker | null = null;

    /** @type {boolean} True while we're syncing a color picker change into the code editor */
    private _isOwnChange: boolean | null = null;

    /** @type {boolean} True while we're syncing a code editor change into the color picker */
    private _isHostChange: boolean | null = null;

    /** @type {number} ID used to identify edits coming from this inline widget for undo batching */
    private _origin: string | null = null;

    /**
     * @constructor
     * @param {!string} color  Initially selected color
     * @param {!CodeMirror.TextMarker} marker
     */
    constructor(color, marker) {
        super();

        this._color = color;
        this._marker = marker;
        this._isOwnChange = false;
        this._isHostChange = false;
        this._origin = "+InlineColorEditor_" + (lastOriginId++);

        this._handleColorChange = this._handleColorChange.bind(this);
        this._handleHostDocumentChange = this._handleHostDocumentChange.bind(this);
    }

    /**
     * Returns the current text range of the color we're attached to, or null if
     * we've lost sync with what's in the code.
     * @return {?{start:{line:number, ch:number}, end:{line:number, ch:number}}}
     */
    public getCurrentRange() {
        const pos = this._marker && this._marker.find();

        const start = pos && (pos as MarkerRange).from;
        if (!start) {
            return null;
        }

        let end: any = (pos as MarkerRange).to;
        if (!end) {
            end = {line: start.line};
        }

        // Even if we think we have a good range end, we want to run the
        // regexp match to see if there's a valid match that extends past the marker.
        // This can happen if the user deletes the end of the existing color and then
        // types some more.

        const line = this.hostEditor!.document.getLine(start.line);
        const matches = line.substr(start.ch).match(ColorUtils.COLOR_REGEX);

        // Note that end.ch is exclusive, so we don't need to add 1 before comparing to
        // the matched length here.
        if (matches && (end.ch === undefined || end.ch - start.ch < matches[0].length)) {
            end.ch = start.ch + matches[0].length;
            this._marker!.clear();
            this._marker = this.hostEditor!._codeMirror.markText(start, end);
        }

        if (end.ch === undefined) {
            // We were unable to resync the marker.
            return null;
        }

        return {start: start, end: end};
    }

    /**
     * When the color picker's selected color changes, update text in code editor
     * @param {!string} colorString
     */
    private _handleColorChange(colorString) {
        const self = this;
        if (colorString !== this._color) {
            const range = this.getCurrentRange();

            if (!range) {
                return;
            }

            // Don't push the change back into the host editor if it came from the host editor.
            if (!this._isHostChange) {
                const endPos = {
                    line: range.start.line,
                    ch: range.start.ch + colorString.length
                };
                this._isOwnChange = true;
                this.hostEditor!.document.batchOperation(function () {
                    // Replace old color in code with the picker's color, and select it
                    self.hostEditor!.setSelection(range.start, range.end); // workaround for #2805
                    self.hostEditor!.document.replaceRange(colorString, range.start, range.end, self._origin);
                    self.hostEditor!.setSelection(range.start, endPos);
                    if (self._marker) {
                        self._marker.clear();
                        self._marker = self.hostEditor!._codeMirror.markText(range.start, endPos);
                    }
                });
                this._isOwnChange = false;
            }

            this._color = colorString;
        }
    }

    /**
     * @override
     * @param {!Editor} hostEditor
     */
    public load(hostEditor) {
        super.load(hostEditor);

        // Create color picker control
        const allColorsInDoc = this.hostEditor!.document.getText()!.match(ColorUtils.COLOR_REGEX);
        const swatchInfo = this._collateColors(allColorsInDoc, MAX_USED_COLORS);
        this.colorEditor = new ColorEditor(this.$htmlContent, this._color, this._handleColorChange, swatchInfo);
    }

    /**
     * @override
     * Perform sizing & focus once we've been added to Editor's DOM
     */
    public onAdded() {
        super.onAdded();

        const doc = this.hostEditor!.document;
        doc.addRef();
        doc.on("change", this._handleHostDocumentChange);

        this.hostEditor!.setInlineWidgetHeight(this, this.colorEditor!.getRootElement().outerHeight(), true);

        this.colorEditor!.focus();
    }

    /**
     * @override
     * Called whenever the inline widget is closed, whether automatically or explicitly
     */
    public onClosed() {
        super.onClosed();

        if (this._marker) {
            this._marker.clear();
        }

        const doc = this.hostEditor!.document;
        doc.off("change", this._handleHostDocumentChange);
        doc.releaseRef();
        this.colorEditor!.destroy();
    }

    /**
     * Counts how many times each color in originalArray occurs (ignoring case) and
     * retuns the top 'maxLength' number of unique colors.
     * @param {!Array.<string>} originalArray
     * @param {number} maxLength
     * @return {!Array.<{value:string, count:number}>}
     */
    private _collateColors(originalArray, maxLength) {
        // Maps from lowercase color name to swatch info (user-case color name & occurrence count)
        /* @type {Object.<string, {value:string, count:number}>} */
        const colorInfo = {};

        // Count how many times each color is used
        originalArray.forEach(function (originalColor) {
            const key = originalColor.toLowerCase();
            if (colorInfo[key]) {
                colorInfo[key].count++;
            } else {
                colorInfo[key] = { value: originalColor, count: 1 };
            }
        });

        // Convert to an array
        const uniqueColors = $.map(colorInfo, function (info) {
            return info;
        });

        // Sort by most-used and return the top N
        uniqueColors.sort(_colorSort);
        return uniqueColors.slice(0, maxLength);
    }

    /**
     * When text in the code editor changes, update color picker to reflect it
     */
    private _handleHostDocumentChange() {
        // Don't push the change into the color editor if it came from the color editor.
        if (this._isOwnChange) {
            return;
        }

        const range = this.getCurrentRange();
        if (range) {
            const newColor = this.hostEditor!.document.getRange(range.start, range.end);
            if (newColor !== this._color) {
                if (this.colorEditor!.isValidColor(newColor)) { // only update the editor if the color string is valid
                    this._isHostChange = true;
                    this.colorEditor!.setColorFromString(newColor);
                    this._isHostChange = false;
                }
            }
        } else {
            // The edit caused our range to become invalid. Close the editor.
            this.close();
        }
    }
}
