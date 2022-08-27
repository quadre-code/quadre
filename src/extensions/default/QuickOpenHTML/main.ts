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

const QuickOpen           = brackets.getModule("search/QuickOpen");
const QuickOpenHelper     = brackets.getModule("search/QuickOpenHelper");
const DocumentManager     = brackets.getModule("document/DocumentManager");
const StringMatch         = brackets.getModule("utils/StringMatch");


/**
 * FileLocation class
 * @constructor
 * @param {string} fullPath
 * @param {number} line
 * @param {number} chFrom column start position
 * @param {number} chTo column end position
 * @param {string} id
 */
class FileLocation {
    public fullPath;
    public line;
    public chFrom;
    public chTo;
    public id;

    constructor(fullPath, line, chFrom, chTo, id) {
        this.fullPath = fullPath;
        this.line = line;
        this.chFrom = chFrom;
        this.chTo = chTo;
        this.id = id;
    }
}

/**
 * Returns a list of information about ID's for a single document. This array is populated
 * by createIDList()
 * @type {?Array.<FileLocation>}
 */
function createIDList() {
    const doc = DocumentManager.getCurrentDocument();
    if (!doc) {
        return;
    }

    const idList: Array<FileLocation> = [];
    const docText = doc.getText()!;
    const lines = docText.split("\n");

    const regex = new RegExp(/\s+id\s*?=\s*?["'](.*?)["']/gi);

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let info;
        // tslint:disable-next-line:no-conditional-assignment
        while ((info = regex.exec(line)) !== null) {
            const id = info[1];
            // TODO: this doesn't handle id's that share the
            // same portion of a name on the same line or when
            // the id and value are on different lines
            const chFrom = line.indexOf(id);
            const chTo = chFrom + id.length;
            idList.push(new FileLocation(null, i, chFrom, chTo, id));
        }
    }
    return idList;
}


/**
 * @param {string} query what the user is searching for
 * @return {Array.<SearchResult>} sorted and filtered results that match the query
 */
function search(query, matcher) {
    let idList = matcher.idList;
    if (!idList) {
        idList = createIDList();
        matcher.idList = idList;
    }
    query = query.slice(query.indexOf("@") + 1, query.length);

    // Filter and rank how good each match is
    const filteredList = $.map(idList, function (fileLocation: FileLocation) {
        const searchResult = matcher.match(fileLocation.id, query);
        if (searchResult) {
            searchResult.fileLocation = fileLocation;
        }
        return searchResult;
    });

    // Sort based on ranking & basic alphabetical order
    StringMatch.basicMatchSort(filteredList);

    return filteredList;
}

QuickOpen.addQuickOpenPlugin(
    {
        name: "html ids",
        languageIds: ["html"],
        search: search,
        match: QuickOpenHelper.match,
        itemFocus: QuickOpenHelper.itemFocus,
        itemSelect: QuickOpenHelper.itemSelect
    }
);

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
