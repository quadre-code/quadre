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

/// <amd-dependency path="module" name="module"/>

// Core modules
const _                    = brackets.getModule("thirdparty/lodash");
const EditorManager        = brackets.getModule("editor/EditorManager");
const FileSystem           = brackets.getModule("filesystem/FileSystem");
const FileUtils            = brackets.getModule("file/FileUtils");
const CSSUtils             = brackets.getModule("language/CSSUtils");
const HTMLUtils            = brackets.getModule("language/HTMLUtils");
const ExtensionUtils       = brackets.getModule("utils/ExtensionUtils");
const HealthLogger         = brackets.getModule("utils/HealthLogger");

// Extension modules
import InlineDocsViewer = require("InlineDocsViewer");


/*
    * Caches docs promises
    */
const promiseCache = {};

/**
 * Lazily loads JSON docs files. Returns a Promise the is resolved with the parsed Object, or
 * rejected if the file is missing/corrupt.
 * @param {string} fileName JSON file to load
 * @return {!$.Promise}
 */
function getDocs(fileName) {
    if (!promiseCache[fileName]) {
        const result = $.Deferred();

        const path = ExtensionUtils.getModulePath(module, fileName);
        const file = FileSystem.getFileForPath(path);

        FileUtils.readAsText(file)
            .done(function (text) {
                let jsonData;
                try {
                    jsonData = JSON.parse(text!);
                } catch (ex) {
                    console.error("Malformed documentation database: ", ex);
                    result.reject();
                }
                result.resolve(jsonData);  // ignored if we already reject()ed above
            })
            .fail(function (err) {
                console.error("Unable to load documentation database: ", err);
                result.reject();
            });

        promiseCache[fileName] = result.promise();
    }

    return promiseCache[fileName];
}


/**
 * Inline docs provider.
 *
 * @param {!Editor} editor
 * @param {!{line:Number, ch:Number}} pos
 * @return {?$.Promise} resolved with an InlineWidget; null if we're not going to provide anything
 */
function inlineProvider(hostEditor, pos) {
    let jsonFile: string;
    const propQueue: Array<string> = []; // priority queue of propNames to try
    const langId = hostEditor.getLanguageForSelection().getId();
    const supportedLangs = {
        "css": true,
        "scss": true,
        "less": true,
        "html": true
    };
    const isQuickDocAvailable = langId ? supportedLangs[langId] : -1; // fail if langId is falsy

    // Only provide docs when cursor is in supported language
    if (!isQuickDocAvailable) {
        return null;
    }

    // Send analytics data for Quick Doc open
    HealthLogger.sendAnalyticsData(
        "cssQuickDoc",
        "usage",
        "quickDoc",
        "open"
    );

    // Only provide docs if the selection is within a single line
    const sel = hostEditor.getSelection();
    if (sel.start.line !== sel.end.line) {
        return null;
    }

    if (langId === "html") { // HTML
        jsonFile = "html.json";
        let propInfo = HTMLUtils.getTagInfo(hostEditor, sel.start);
        if (propInfo.position.tokenType === HTMLUtils.ATTR_NAME && propInfo.attr && propInfo.attr.name) {
            // we're on an HTML attribute (and not on its value)
            propQueue.push(propInfo.attr.name.toLowerCase());
        }
        if (propInfo.tagName) { // we're somehow on an HTML tag (no matter where exactly)
            propInfo = propInfo.tagName.toLowerCase();
            propQueue.push("<" + propInfo + ">");
        }
    } else { // CSS-like language
        jsonFile = "css.json";
        const propInfo = CSSUtils.getInfoAtPos(hostEditor, sel.start);
        if (propInfo.name) {
            propQueue.push(propInfo.name);
            // remove possible vendor prefixes
            propQueue.push(propInfo.name.replace(/^-(?:webkit|moz|ms|o)-/, ""));
        }
    }

    // Are we on a supported property? (no matter if info is available for the property)
    if (propQueue.length) {
        const result = $.Deferred();

        // Load JSON file if not done yet
        getDocs(jsonFile)
            .done(function (docs) {
                // Construct inline widget (if we have docs for this property)

                let displayName;
                let propDetails;
                const propName = _.find(propQueue, function (propName) { // find the first property where info is available
                    return docs.hasOwnProperty(propName);
                });

                if (propName) {
                    propDetails = docs[propName];
                    displayName = propName.substr(propName.lastIndexOf("/") + 1);
                }
                if (propDetails) {
                    const inlineWidget = new InlineDocsViewer(displayName, propDetails);
                    inlineWidget.load(hostEditor);
                    result.resolve(inlineWidget);
                } else {
                    result.reject();
                }
            })
            .fail(function () {
                result.reject();
            });

        return result.promise();
    }

    return null;
}

// Register as inline docs provider
EditorManager.registerInlineDocsProvider(inlineProvider);

export const _getDocs         = getDocs;
export const _inlineProvider  = inlineProvider;
