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

const EditorManager       = brackets.getModule("editor/EditorManager");
const QuickOpen           = brackets.getModule("search/QuickOpen");
const QuickOpenHelper     = brackets.getModule("search/QuickOpenHelper");
const CSSUtils            = brackets.getModule("language/CSSUtils");
const DocumentManager     = brackets.getModule("document/DocumentManager");
const StringMatch         = brackets.getModule("utils/StringMatch");


/**
 * Returns a list of information about selectors for a single document. This array is populated
 * by createSelectorList()
 * @return {?Array.<FileLocation>}
 */
function createSelectorList() {
    const doc = DocumentManager.getCurrentDocument();
    if (!doc) {
        return;
    }

    const docText = doc.getText();
    return CSSUtils.extractAllSelectors(docText, doc.getLanguage().getMode());
}


/**
 * @param {string} query what the user is searching for
 * @return {Array.<SearchResult>} sorted and filtered results that match the query
 */
function search(query, matcher) {
    let selectorList = matcher.selectorList;
    if (!selectorList) {
        selectorList = createSelectorList();
        matcher.selectorList = selectorList;
    }
    query = query.slice(query.indexOf("@") + 1, query.length);

    // Filter and rank how good each match is
    const filteredList = $.map(selectorList, function (itemInfo) {
        const searchResult = matcher.match(CSSUtils.getCompleteSelectors(itemInfo), query);
        if (searchResult) {
            searchResult.selectorInfo = itemInfo;
        }
        return searchResult;
    });

    // Sort based on ranking & basic alphabetical order
    StringMatch.basicMatchSort(filteredList);

    return filteredList;
}

/**
 * Scroll to the selected item in the current document (unless no query string entered yet,
 * in which case the topmost list item is irrelevant)
 * @param {?SearchResult} selectedItem
 * @param {string} query
 * @param {boolean} explicit False if this is only highlighted due to being at top of list after search()
 */
function itemFocus(selectedItem, query, explicit) {
    if (!selectedItem || (query.length < 2 && !explicit)) {
        return;
    }
    const selectorInfo = selectedItem.selectorInfo;

    const from = {line: selectorInfo.selectorStartLine, ch: selectorInfo.selectorStartChar};
    const to = {line: selectorInfo.selectorStartLine, ch: selectorInfo.selectorEndChar};
    EditorManager.getCurrentFullEditor().setSelection(from, to, true);
}

function itemSelect(selectedItem, query) {
    itemFocus(selectedItem, query, true);
}


QuickOpen.addQuickOpenPlugin(
    {
        name: "CSS Selectors",
        languageIds: ["css", "less", "scss"],
        search: search,
        match: QuickOpenHelper.match,
        itemFocus: itemFocus,
        itemSelect: itemSelect
    }
);

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
