/*
 * Copyright (c) 2015 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import type { CodeHintProvider } from "editor/CodeHintManager";
import type { SearchResult } from "utils/StringMatch";

// Load dependencies.
const AppInit             = brackets.getModule("utils/AppInit");
const CodeHintManager     = brackets.getModule("editor/CodeHintManager");
const PreferencesManager  = brackets.getModule("preferences/PreferencesManager");
const StringMatch         = brackets.getModule("utils/StringMatch");
const ExtensionUtils      = brackets.getModule("utils/ExtensionUtils");
const EditorManager       = brackets.getModule("editor/EditorManager");
const LanguageManager     = brackets.getModule("language/LanguageManager");
const JSONUtils           = brackets.getModule("language/JSONUtils");
const Strings             = brackets.getModule("strings");
const ThemeManager        = brackets.getModule("view/ThemeManager");
const CodeInspection      = brackets.getModule("language/CodeInspection");
const _                   = brackets.getModule("thirdparty/lodash");
let languages           = LanguageManager.getLanguages();
let isPrefDocument      = false;
let isPrefHintsEnabled  = false;

// For unit tests only.
export let hintProvider: PrefsCodeHints;

interface Option {
    type: string | null;
    description: null;
    values: null;
    valueType?: string;
}

interface PrefsSearchResult extends SearchResult {
    type?: string | null;
    description?: string | null;
}

// Stores data of preferences used by Brackets and its core/thirdparty extensions.
let data = {
    language: {
        type: "object",
        description: Strings.DESCRIPTION_LANGUAGE
    },
    path: {
        type: "object",
        description: Strings.DESCRIPTION_PATH
    }
};

const stringMatcherOptions = {
    preferPrefixMatches: true
};

// List of parent keys for which no key hints will be provided.
const parentKeyBlacklist = [
    "language.fileExtensions",
    "language.fileNames",
    "path"
];

// Define a preference for code hinting.
PreferencesManager.definePreference("codehint.PrefHints", "boolean", true, {
    description: Strings.DESCRIPTION_PREF_HINTS
});

/**
 * @private
 *
 * Determines whether or not the current document is a preferences document and
 * user has enabled code hints
 *
 * @return {Boolean}
 */
function _isPrefHintsEnabled() {
    return (isPrefDocument &&
            PreferencesManager.get("showCodeHints") !== false &&
            PreferencesManager.get("codehint.PrefHints") !== false);
}

/**
 * @private
 *
 * Determines whether or not the name of a file matches the preferences files
 *
 * @param {!Document} document
 * @return {Boolean}
 */
function _isPrefDocument(document) {
    return (/^\.?brackets\.json$/).test(document.file._name);
}

// Set listeners on preference, editor and language changes.
PreferencesManager.on("change", "showCodeHints", function () {
    isPrefHintsEnabled = _isPrefHintsEnabled();
});
PreferencesManager.on("change", "codehint.PrefHints", function () {
    isPrefHintsEnabled = _isPrefHintsEnabled();
});
(EditorManager as any).on("activeEditorChange", function (e, editor) {
    if (editor) {
        isPrefDocument = _isPrefDocument(editor.document);
    }
    isPrefHintsEnabled = _isPrefHintsEnabled();
});
(LanguageManager as any).on("languageAdded", function () {
    languages = LanguageManager.getLanguages();
});

/*
    * Returns a sorted and formatted list of hints with the query substring
    * highlighted.
    *
    * @param {Array.<Object>} hints - the list of hints to format
    * @param {string} query - querystring used for highlighting matched
    *      portions of each hint
    * @return {Array.jQuery} sorted Array of jQuery DOM elements to insert
    */
function formatHints(hints, query) {
    const hasMetadata = hints.some(function (token) {
        return token.type || token.description;
    });

    StringMatch.basicMatchSort(hints);
    return hints.map(function (token) {
        const $hintItem = $("<span>").addClass("brackets-pref-hints");
        const $hintObj  = $("<span>").addClass("hint-obj");

        // highlight the matched portion of each hint
        if (token.stringRanges) {
            token.stringRanges.forEach(function (item) {
                if (item.matched) {
                    $hintObj.append($("<span>")
                        .text(item.text)
                        .addClass("matched-hint"));
                } else {
                    $hintObj.append(item.text);
                }
            });
        } else {
            $hintObj.text(token.value);
        }

        $hintItem.append($hintObj);

        if (hasMetadata) {
            $hintItem.data("type", token.type);
            if (token.description) {
                $hintItem.append($("<span>")
                    .addClass("hint-description")
                    .text(token.description));
            }
        }
        return $hintItem;
    });
}

class PrefsCodeHints implements CodeHintProvider {
    private ctxInfo;
    private editor;

    /**
     * @constructor
     */
    constructor() {
        this.ctxInfo = null;

        // Add all the preferences defined except the excluded ones.
        const preferences = PreferencesManager.getAllPreferences();
        Object.keys(preferences).forEach(function (pref) {
            const preference = preferences[pref];
            if (preference.excludeFromHints) {
                return;
            }
            data[pref] = $.extend(data[pref], preference);

            // If child keys found, add them.
            if (preference.keys) {
                data[pref].keys = _.clone(preference.keys);
            }
        });
    }

    /**
     * Determines whether or not hints are available in the current context
     *
     * @param {!Editor} editor
     * @param {String} implicitChar
     * @return {Boolean}
     */
    public hasHints(editor, implicitChar) {
        if (isPrefHintsEnabled && editor.getModeForSelection() === "application/json") {
            this.editor = editor;
            this.ctxInfo = JSONUtils.getContextInfo(this.editor, this.editor.getCursorPos(), true);

            if (this.ctxInfo && this.ctxInfo.tokenType) {
                // Disallow hints for blacklisted keys.
                if (this.ctxInfo.tokenType === JSONUtils.TOKEN_KEY &&
                        parentKeyBlacklist.indexOf(this.ctxInfo.parentKeyName) !== -1) {
                    return false;
                }
                return true;
            }
        }
        return false;
    }

    /**
     * Returns a list of hints available in the current context
     *
     * @param {String} implicitChar
     * @return {!{hints: Array.<jQueryObject>, match: string, selectInitial: boolean, handleWideResults: boolean}}
     */
    public getHints(implicitChar) {
        let hints: Array<any> = [];
        let query;
        let keys;
        let values;
        let option: Option = {type: null, description: null, values: null};

        const ctxInfo = this.ctxInfo = JSONUtils.getContextInfo(this.editor, this.editor.getCursorPos(), true);

        if (ctxInfo && ctxInfo.token) {
            query = JSONUtils.stripQuotes(ctxInfo.token.string.substr(0, ctxInfo.offset)).trim();
            if (JSONUtils.regexAllowedChars.test(query)) {
                query = "";
            }

            if (ctxInfo.tokenType === JSONUtils.TOKEN_KEY) {
                // Provide hints for keys

                // Get options for parent key else use general options.
                if (data[ctxInfo.parentKeyName!] && data[ctxInfo.parentKeyName!].keys) {
                    keys = data[ctxInfo.parentKeyName!].keys;
                } else if (ctxInfo.parentKeyName === "language") {
                    keys = languages;
                    option.type = "object";
                } else {
                    keys = data;
                }

                hints = $.map(Object.keys(keys), function (key: string) {
                    if (ctxInfo.exclusionList.indexOf(key) === -1) {
                        const match: PrefsSearchResult = StringMatch.stringMatch(key, query, stringMatcherOptions);
                        if (match) {
                            match.type = keys[key].type || option.type;
                            match.description = keys[key].description || null;
                            return match;
                        }
                    }

                    return undefined;
                });
            } else if (ctxInfo.tokenType === JSONUtils.TOKEN_VALUE) {
                // Provide hints for values.

                // Get the key from data.
                if (data[ctxInfo.parentKeyName!] && data[ctxInfo.parentKeyName!].keys &&
                        data[ctxInfo.parentKeyName!].keys[ctxInfo.keyName]) {
                    option = data[ctxInfo.parentKeyName!].keys[ctxInfo.keyName];
                } else if (data[ctxInfo.keyName!]) {
                    option = data[ctxInfo.keyName!];
                }

                // Get the values depending on the selected key.
                if (option && option.type === "boolean") {
                    values = ["false", "true"];
                } else if (option && option.values && (["number", "string"].indexOf(option.type!) !== -1 ||
                                                        (option.type === "array" && ctxInfo.isArray))) {
                    values = option.values;
                } else if (ctxInfo.isArray && ctxInfo.keyName === "linting.prefer" && languages[ctxInfo.parentKeyName!]) {
                    values = CodeInspection.getProviderIDsForLanguage(ctxInfo.parentKeyName!);
                } else if (ctxInfo.keyName === "themes.theme") {
                    values = ThemeManager.getAllThemes().map(function (theme) {
                        return theme.name;
                    });
                } else if (ctxInfo.parentKeyName === "language.fileExtensions" ||
                            ctxInfo.parentKeyName === "language.fileNames") {
                    values = Object.keys(languages);
                } else {
                    return null;
                }

                // Convert integers to strings, so StringMatch.stringMatch can match it.
                if (option.type === "number" || option.valueType === "number") {
                    values = values.map(function (val) {
                        return val.toString();
                    });
                }

                // filter through the values.
                hints = $.map(values, function (value) {
                    const match: PrefsSearchResult = StringMatch.stringMatch(value, query, stringMatcherOptions);
                    if (match) {
                        match.type = option.valueType || option.type;
                        match.description = option.description || null;
                        return match;
                    }

                    return undefined;
                });
            }

            return {
                hints: formatHints(hints, query),
                match: null,
                selectInitial: true,
                handleWideResults: false
            };
        }
        return null;
    }

    /**
     * Inserts a completion at current position
     *
     * @param {!String} completion
     * @return {Boolean}
     */
    public insertHint(completion) {
        const ctxInfo = JSONUtils.getContextInfo(this.editor, this.editor.getCursorPos(), false, true)!;
        const pos     = this.editor.getCursorPos();
        const start   = {line: -1, ch: -1};
        const end     = {line: -1, ch: -1};
        let startChar;
        let quoteChar;
        let type;

        if (completion.jquery) {
            type = completion.data("type");
            completion = completion.find(".hint-obj").text();
        }
        start.line = end.line = pos.line;

        if (ctxInfo.tokenType === JSONUtils.TOKEN_KEY) {
            startChar = ctxInfo.token!.string.charAt(0);

            // Get the quote char.
            if (/^['"]$/.test(startChar)) {
                quoteChar = startChar;
            }

            // Put quotes around completion.
            completion = quoteChar + completion + quoteChar;

            // Append colon and braces, brackets and quotes.
            if (!ctxInfo.shouldReplace) {
                completion += ": ";

                switch (type) {
                    case "object":
                        completion += "{}";
                        break;

                    case "array":
                        completion += "[]";
                        break;

                    case "string":
                        completion += "\"\"";
                        break;
                }
            }

            start.ch = pos.ch - ctxInfo.offset;
            end.ch = ctxInfo.token!.end;
            this.editor.document.replaceRange(completion, start, end);

            // Place cursor inside the braces, brackets or quotes.
            if (["object", "array", "string"].indexOf(type) !== -1) {
                this.editor.setCursorPos(start.line, start.ch + completion.length - 1);

                // Start a new session in case it is an array or string.
                if (type !== "object" && !ctxInfo.shouldReplace) {
                    return true;
                }
                return false;
            }
            return true;
        }

        if (ctxInfo.tokenType === JSONUtils.TOKEN_VALUE) {
            // In case the current token is a white-space, start and end will be same.
            if (JSONUtils.regexAllowedChars.test(ctxInfo.token!.string)) {
                start.ch = end.ch = pos.ch;
            } else if (ctxInfo.shouldReplace) {
                start.ch = ctxInfo.token!.start;
                end.ch = ctxInfo.token!.end;
            } else {
                start.ch = pos.ch - ctxInfo.offset;
                end.ch = ctxInfo.token!.end;
            }

            if (!type || type === "string") {
                startChar = ctxInfo.token!.string.charAt(0);
                if (/^['"]$/.test(startChar)) {
                    quoteChar = startChar;
                } else {
                    quoteChar = "\"";
                }
                completion = quoteChar + completion + quoteChar;
            }

            this.editor.document.replaceRange(completion, start, end);
            return false;
        }

        return false;
    }
}

/**
 * @private
 *
 * `isPrefHintsEnabled` must be set to true to allow code hints
 *
 * It also loads a set of preferences that we need for running unit tests, this
 * will not break unit tests in case we add new preferences in the future.
 *
 * @param {!Document} testDocument
 * @param {!Object} testPreferences
 */
// Export for unit tests only.
export function _setupTestEnvironment(testDocument, testPreferences) {
    isPrefHintsEnabled = _isPrefDocument(testDocument);
    data = testPreferences;
}

AppInit.appReady(function () {
    hintProvider = new PrefsCodeHints();
    CodeHintManager.registerHintProvider(hintProvider, ["json"], 0);
    ExtensionUtils.loadStyleSheet(module, "styles/brackets-prefs-hints.css");
});
