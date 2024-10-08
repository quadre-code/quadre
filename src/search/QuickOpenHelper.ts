/*
 * Copyright (c) 2016 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import type { SearchResult } from "utils/StringMatch";

import * as EditorManager from "editor/EditorManager";

/**
 * @param {string} query what the user is searching for
 * @param {boolean} returns true if this plug-in wants to provide results for this query
 */
export function match(query: string): boolean {
    return (query[0] === "@");
}

/**
 * Scroll to the selected item in the current document (unless no query string entered yet,
 * in which case the topmost list item is irrelevant)
 * @param {?SearchResult} selectedItem
 * @param {string} query
 * @param {boolean} explicit False if this is only highlighted due to being at top of list after search()
 */
export function itemFocus(selectedItem: SearchResult, query: string, explicit: boolean): void {
    if (!selectedItem || (query.length < 2 && !explicit)) {
        return;
    }
    const fileLocation = selectedItem.fileLocation!;

    const from = {line: fileLocation.line, ch: fileLocation.chFrom};
    const to = {line: fileLocation.line, ch: fileLocation.chTo};
    EditorManager.getCurrentFullEditor()!.setSelection(from, to, true);
}

/**
 * Scroll to the selected item in the current document (unless no query string entered yet,
 * in which case the topmost list item is irrelevant)
 * @param {?SearchResult} selectedItem
 * @param {string} query
 */
export function itemSelect(selectedItem: SearchResult, query: string): void {
    itemFocus(selectedItem, query, true);
}
