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

import type { HintObject } from "editor/CodeHintList";
import type { CodeHintProvider } from "editor/CodeHintManager";

// Load dependent modules
const AppInit             = brackets.getModule("utils/AppInit");
const CodeHintManager     = brackets.getModule("editor/CodeHintManager");
const HTMLUtils           = brackets.getModule("language/HTMLUtils");
const PreferencesManager  = brackets.getModule("preferences/PreferencesManager");
const Strings             = brackets.getModule("strings");
import * as HTMLTags from "text!HtmlTags.json";
import * as HTMLAttributes from "text!HtmlAttributes.json";
let tags;
let attributes;

// For unit testing
export let tagHintProvider: TagHints;
export let attrHintProvider: AttrHints;

interface Query {
    queryStr: any;
    tag?: string;
    attrName?: string;
    usedAttr?: Array<string>;
}

PreferencesManager.definePreference("codehint.TagHints", "boolean", true, {
    description: Strings.DESCRIPTION_HTML_TAG_HINTS
});

PreferencesManager.definePreference("codehint.AttrHints", "boolean", true, {
    description: Strings.DESCRIPTION_ATTR_HINTS
});

class TagHints implements CodeHintProvider {
    private exclusion;
    private tagInfo;
    private editor;

    /**
     * @constructor
     */
    constructor() {
        this.exclusion = null;
    }

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     */
    public updateExclusion(): void {
        let textAfterCursor;
        if (this.exclusion && this.tagInfo) {
            textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    }

    /**
     * Determines whether HTML tag hints are available in the current editor
     * context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non- null,
     * whether it is appropriate to do so.
     */
    public hasHints(editor, implicitChar): boolean {
        const pos = editor.getCursorPos();

        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        this.editor = editor;
        if (implicitChar === null) {
            if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
                if (this.tagInfo.position.offset >= 0) {
                    if (this.tagInfo.position.offset === 0) {
                        this.exclusion = this.tagInfo.tagName;
                    } else {
                        this.updateExclusion();
                    }
                    return true;
                }
            }
            return false;
        }

        if (implicitChar === "<") {
            this.exclusion = this.tagInfo.tagName;
            return true;
        }

        return false;
    }

    /**
     * Returns a list of availble HTML tag hints if possible for the current
     * editor context.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    public getHints(implicitChar) {
        let query;
        let result;

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, this.editor.getCursorPos());
        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            if (this.tagInfo.position.offset >= 0) {
                this.updateExclusion();
                query = this.tagInfo.tagName.slice(0, this.tagInfo.position.offset);
                result = $.map(tags, function (value, key) {
                    if (key.indexOf(query) === 0) {
                        return key;
                    }
                }).sort();

                return {
                    hints: result,
                    match: query,
                    selectInitial: true,
                    handleWideResults: false
                };
            }
        }

        return null;
    }

    /**
     * Inserts a given HTML tag hint into the current editor context.
     *
     * @param {string} hint
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    public insertHint(completion) {
        const start = {line: -1, ch: -1};
        const end = {line: -1, ch: -1};
        const cursor = this.editor.getCursorPos();
        let charCount = 0;

        if (this.tagInfo.position.tokenType === HTMLUtils.TAG_NAME) {
            const textAfterCursor = this.tagInfo.tagName.substr(this.tagInfo.position.offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = this.tagInfo.position.offset;
            } else {
                charCount = this.tagInfo.tagName.length;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - this.tagInfo.position.offset;
        end.ch = start.ch + charCount;

        if (this.exclusion || completion !== this.tagInfo.tagName) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
            this.exclusion = null;
        }

        return false;
    }
}

class AttrHints implements CodeHintProvider {
    private globalAttributes;
    private exclusion;
    private tagInfo;
    private editor;

    /**
     * @constructor
     */
    constructor() {
        this.globalAttributes = this.readGlobalAttrHints();
        this.exclusion = "";
    }

    /**
     * @private
     * Parse the code hints from JSON data and extract all hints from property names.
     * @return {!Array.<string>} An array of code hints read from the JSON data source.
     */
    public readGlobalAttrHints = function () {
        return $.map(attributes, function (value, key) {
            if (value.global === "true") {
                return key;
            }
        });
    };

    /**
     * Helper function that determines the possible value hints for a given html tag/attribute name pair
     *
     * @param {{queryStr: string}} query
     * The current query
     *
     * @param {string} tagName
     * HTML tag name
     *
     * @param {string} attrName
     * HTML attribute name
     *
     * @return {!Array.<string>|$.Deferred}
     * The (possibly deferred) hints.
     */
    private _getValueHintsForAttr(query, tagName, attrName) {
        // We look up attribute values with tagName plus a slash and attrName first.
        // If the lookup fails, then we fall back to look up with attrName only. Most
        // of the attributes in JSON are using attribute name only as their properties,
        // but in some cases like "type" attribute, we have different properties like
        // "script/type", "link/type" and "button/type".
        let hints: Array<string> = [];

        const tagPlusAttr = tagName + "/" + attrName;
        const attrInfo = attributes[tagPlusAttr] || attributes[attrName];

        if (attrInfo) {
            if (attrInfo.type === "boolean") {
                hints = ["false", "true"];
            } else if (attrInfo.attribOption) {
                hints = attrInfo.attribOption;
            }
        }

        return hints;
    }

    /**
     * Check whether the exclusion is still the same as text after the cursor.
     * If not, reset it to null.
     *
     * @param {boolean} attrNameOnly
     * true to indicate that we update the exclusion only if the cursor is inside an attribute name context.
     * Otherwise, we also update exclusion for attribute value context.
     */
    public updateExclusion(attrNameOnly) {
        if (this.exclusion && this.tagInfo) {
            const tokenType = this.tagInfo.position.tokenType;
            const offset = this.tagInfo.position.offset;
            let textAfterCursor;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                textAfterCursor = this.tagInfo.attr.name.substr(offset);
            } else if (!attrNameOnly && tokenType === HTMLUtils.ATTR_VALUE) {
                textAfterCursor = this.tagInfo.attr.value.substr(offset);
            }
            if (!CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                this.exclusion = null;
            }
        }
    }

    /**
     * Determines whether HTML attribute hints are available in the current
     * editor context.
     *
     * @param {Editor} editor
     * A non-null editor object for the active window.
     *
     * @param {string} implicitChar
     * Either null, if the hinting request was explicit, or a single character
     * that represents the last insertion and that indicates an implicit
     * hinting request.
     *
     * @return {boolean}
     * Determines whether the current provider is able to provide hints for
     * the given editor context and, in case implicitChar is non-null,
     * whether it is appropriate to do so.
     */
    public hasHints(editor, implicitChar) {
        const pos = editor.getCursorPos();
        let query;

        this.editor = editor;
        this.tagInfo = HTMLUtils.getTagInfo(editor, pos);
        const tokenType = this.tagInfo.position.tokenType;
        const offset = this.tagInfo.position.offset;
        if (implicitChar === null) {
            query = null;

            if (tokenType === HTMLUtils.ATTR_NAME) {
                if (offset >= 0) {
                    query = this.tagInfo.attr.name.slice(0, offset);
                }
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                if (this.tagInfo.position.offset >= 0) {
                    query = this.tagInfo.attr.value.slice(0, offset);
                } else {
                    // We get negative offset for a quoted attribute value with some leading whitespaces
                    // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                    // So just set the queryStr to an empty string.
                    query = "";
                }

                // If we're at an attribute value, check if it's an attribute name that has hintable values.
                if (this.tagInfo.attr.name) {
                    const hints = this._getValueHintsForAttr({queryStr: query},
                        this.tagInfo.tagName,
                        this.tagInfo.attr.name);
                    if (hints instanceof Array) {
                        // If we got synchronous hints, check if we have something we'll actually use
                        let foundPrefix = false;
                        for (const hint of hints) {
                            if (hint.indexOf(query) === 0) {
                                foundPrefix = true;
                                break;
                            }
                        }
                        if (!foundPrefix) {
                            query = null;
                        }
                    }
                }
            }

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME && offset === 0) {
                    this.exclusion = this.tagInfo.attr.name;
                } else {
                    this.updateExclusion(false);
                }
            }

            return query !== null;
        }

        if (implicitChar === " " || implicitChar === "'" ||
                implicitChar === "\"" || implicitChar === "=") {
            if (tokenType === HTMLUtils.ATTR_NAME) {
                this.exclusion = this.tagInfo.attr.name;
            }
            return true;
        }

        return false;
    }

    /**
     * Returns a list of availble HTML attribute hints if possible for the
     * current editor context.
     *
     * @return {jQuery.Deferred|{
     *              hints: Array.<string|jQueryObject>,
     *              match: string,
     *              selectInitial: boolean,
     *              handleWideResults: boolean}}
     * Null if the provider wishes to end the hinting session. Otherwise, a
     * response object that provides:
     * 1. a sorted array hints that consists of strings
     * 2. a string match that is used by the manager to emphasize matching
     *    substrings when rendering the hint list
     * 3. a boolean that indicates whether the first result, if one exists,
     *    should be selected by default in the hint list window.
     * 4. handleWideResults, a boolean (or undefined) that indicates whether
     *    to allow result string to stretch width of display.
     */
    public getHints(implicitChar) {
        const cursor = this.editor.getCursorPos();
        const query: Query = {queryStr: null};
        let result: Array<any> = [];

        this.tagInfo = HTMLUtils.getTagInfo(this.editor, cursor);
        const tokenType = this.tagInfo.position.tokenType;
        const offset = this.tagInfo.position.offset;
        if (tokenType === HTMLUtils.ATTR_NAME || tokenType === HTMLUtils.ATTR_VALUE) {
            query.tag = this.tagInfo.tagName;

            if (offset >= 0) {
                if (tokenType === HTMLUtils.ATTR_NAME) {
                    query.queryStr = this.tagInfo.attr.name.slice(0, offset);
                } else {
                    query.queryStr = this.tagInfo.attr.value.slice(0, offset);
                    query.attrName = this.tagInfo.attr.name;
                }
                this.updateExclusion(false);
            } else if (tokenType === HTMLUtils.ATTR_VALUE) {
                // We get negative offset for a quoted attribute value with some leading whitespaces
                // as in <a rel= "rtl" where the cursor is just to the right of the "=".
                // So just set the queryStr to an empty string.
                query.queryStr = "";
                query.attrName = this.tagInfo.attr.name;
            }

            query.usedAttr = HTMLUtils.getTagAttributes(this.editor, cursor);
        }

        if (query.tag && query.queryStr !== null) {
            const tagName = query.tag;
            const attrName = query.attrName;
            const filter = query.queryStr;
            let unfiltered = [];
            let hints;

            if (attrName) {
                hints = this._getValueHintsForAttr(query, tagName, attrName);
            } else if (tags && tags[tagName] && tags[tagName].attributes) {
                unfiltered = tags[tagName].attributes.concat(this.globalAttributes);
                hints = $.grep(unfiltered, function (attr, i) {
                    return $.inArray(attr, query.usedAttr!) < 0;
                });
            }

            if (hints instanceof Array && hints.length) {
                console.assert(!result.length);
                result = $.map(hints, function (item) {
                    if (item.indexOf(filter) === 0) {
                        return item;
                    }
                }).sort();
                return {
                    hints: result,
                    match: query.queryStr,
                    selectInitial: true,
                    handleWideResults: false
                };
            }

            if (hints instanceof Object && hints.hasOwnProperty("done")) { // Deferred hints
                const deferred = $.Deferred<HintObject<string>>();
                hints.done((asyncHints) => {
                    deferred.resolveWith(this, [{
                        hints: asyncHints,
                        match: query.queryStr,
                        selectInitial: true,
                        handleWideResults: false
                    }]);
                });
                return deferred;
            }
        }

        return null;
    }

    /**
     * Inserts a given HTML attribute hint into the current editor context.
     *
     * @param {string} hint
     * The hint to be inserted into the editor context.
     *
     * @return {boolean}
     * Indicates whether the manager should follow hint insertion with an
     * additional explicit hint request.
     */
    public insertHint(completion) {
        const cursor = this.editor.getCursorPos();
        const start = {line: -1, ch: -1};
        const end = {line: -1, ch: -1};
        const tokenType = this.tagInfo.position.tokenType;
        const offset = this.tagInfo.position.offset;
        let charCount = 0;
        let insertedName = false;
        let replaceExistingOne = this.tagInfo.attr.valueAssigned;
        let endQuote = "";
        let shouldReplace = true;
        let textAfterCursor;

        if (tokenType === HTMLUtils.ATTR_NAME) {
            textAfterCursor = this.tagInfo.attr.name.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                replaceExistingOne = false;
            } else {
                charCount = this.tagInfo.attr.name.length;
            }
            // Append an equal sign and two double quotes if the current attr is not an empty attr
            // and then adjust cursor location before the last quote that we just inserted.
            if (!replaceExistingOne && attributes && attributes[completion] &&
                    attributes[completion].type !== "flag") {
                completion += "=\"\"";
                insertedName = true;
            } else if (completion === this.tagInfo.attr.name) {
                shouldReplace = false;
            }
        } else if (tokenType === HTMLUtils.ATTR_VALUE) {
            textAfterCursor = this.tagInfo.attr.value.substr(offset);
            if (CodeHintManager.hasValidExclusion(this.exclusion, textAfterCursor)) {
                charCount = offset;
                // Set exclusion to null only after attribute value insertion,
                // not after attribute name insertion since we need to keep it
                // for attribute value insertion.
                this.exclusion = null;
            } else {
                charCount = this.tagInfo.attr.value.length;
            }

            if (!this.tagInfo.attr.hasEndQuote) {
                endQuote = this.tagInfo.attr.quoteChar;
                if (endQuote) {
                    completion += endQuote;
                } else if (offset === 0) {
                    completion = "\"" + completion + "\"";
                }
            } else if (completion === this.tagInfo.attr.value) {
                shouldReplace = false;
            }
        }

        end.line = start.line = cursor.line;
        start.ch = cursor.ch - offset;
        end.ch = start.ch + charCount;

        if (shouldReplace) {
            if (start.ch !== end.ch) {
                this.editor.document.replaceRange(completion, start, end);
            } else {
                this.editor.document.replaceRange(completion, start);
            }
        }

        if (insertedName) {
            this.editor.setCursorPos(start.line, start.ch + completion.length - 1);

            // Since we're now inside the double-quotes we just inserted,
            // immediately pop up the attribute value hint.
            return true;
        }

        if (tokenType === HTMLUtils.ATTR_VALUE && this.tagInfo.attr.hasEndQuote) {
            // Move the cursor to the right of the existing end quote after value insertion.
            this.editor.setCursorPos(start.line, start.ch + completion.length + 1);
        }

        return false;
    }
}

AppInit.appReady(function () {
    // Parse JSON files
    tags = JSON.parse(HTMLTags);
    attributes = JSON.parse(HTMLAttributes);

    // Register code hint providers
    tagHintProvider = new TagHints();
    attrHintProvider = new AttrHints();
    CodeHintManager.registerHintProvider(tagHintProvider, ["html"], 0);
    CodeHintManager.registerHintProvider(attrHintProvider, ["html"], 0);
});
