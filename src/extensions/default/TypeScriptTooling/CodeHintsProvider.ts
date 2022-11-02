/*
 * Copyright (c) 2019 - 2021 Adobe. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
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
import type { Editor } from "editor/Editor";
import type { CodeHintsProvider as TCodeHintsProvider } from "languageTools/DefaultProviders";
import type { SearchResult } from "utils/StringMatch";

const _ = brackets.getModule("thirdparty/lodash");

const DefaultProviders = brackets.getModule("languageTools/DefaultProviders");
const EditorManager = brackets.getModule("editor/EditorManager");
const TokenUtils = brackets.getModule("utils/TokenUtils");
const StringMatch = brackets.getModule("utils/StringMatch");
const matcher = new StringMatch.StringMatcher({
    preferPrefixMatches: true
});

const hintType = {
    "2": "Method",
    "3": "Function",
    "4": "Constructor",
    "6": "Variable",
    "7": "Class",
    "8": "Interface",
    "9": "Module",
    "10": "Property",
    "14": "Keyword",
    "21": "Constant"
};

function setStyleAndCacheToken($hintObj: JQuery, token: SearchResult): void {
    $hintObj.addClass("brackets-hints-with-type-details");
    $hintObj.data("completionItem", token);
}

function filterWithQueryAndMatcher(hints: Array<any>, query: string): Array<SearchResult> {
    const matchResults = $.map(hints, function (hint) {
        const searchResult = matcher.match(hint.label, query);
        if (searchResult) {
            for (const key in hint) {
                if (_.has(hint, key)) {
                    searchResult[key] = hint[key];
                }
            }
        }

        return searchResult!;
    });

    return matchResults;
}

export class CodeHintsProvider implements CodeHintProvider {
    private defaultCodeHintProviders: TCodeHintsProvider;

    constructor(client) {
        this.defaultCodeHintProviders = new DefaultProviders.CodeHintsProvider(client);
    }

    public setClient(client): void {
        this.defaultCodeHintProviders.setClient(client);
    }

    public hasHints(editor: Editor, implicitChar: string | null): boolean {
        return this.defaultCodeHintProviders.hasHints(editor, implicitChar);
    }

    public getHints(implicitChar: string | null): JQueryDeferred<HintObject<string | JQuery>> | null {
        if (!this.defaultCodeHintProviders.client) {
            return null;
        }

        const editor = EditorManager.getActiveEditor()!;
        const pos = editor.getCursorPos();
        const docPath = editor.document.file._path;
        const $deferredHints = $.Deferred<HintObject<string | JQuery>>();
        const self = this.defaultCodeHintProviders;
        const client = this.defaultCodeHintProviders.client;

        // Make sure the document is in sync with the server
        client.notifyTextDocumentChanged({
            filePath: docPath,
            fileContent: editor.document.getText()
        });
        client.requestHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            const context = TokenUtils.getInitialContext(editor._codeMirror, pos);
            const hints: Array<JQuery> = [];

            self.query = context.token.string.slice(0, context.pos.ch - context.token.start);
            if (msgObj) {
                const res = msgObj.items || [];
                const trimmedQuery = self.query.trim();
                const hasIgnoreCharacters = self.ignoreQuery.includes(implicitChar) || self.ignoreQuery.includes(trimmedQuery);
                const isExplicitInvokation = implicitChar === null;

                let filteredHints: Array<SearchResult> = [];
                if (hasIgnoreCharacters || (isExplicitInvokation && !trimmedQuery)) {
                    filteredHints = filterWithQueryAndMatcher(res, "");
                } else {
                    filteredHints = filterWithQueryAndMatcher(res, self.query);
                }

                StringMatch.basicMatchSort(filteredHints);
                filteredHints.forEach(function (element) {
                    const $fHint = $("<span>")
                        .addClass("brackets-hints");

                    if (element.stringRanges) {
                        element.stringRanges.forEach(function (item) {
                            if (item.matched) {
                                $fHint.append($("<span>")
                                    .append(_.escape(item.text))
                                    .addClass("matched-hint"));
                            } else {
                                $fHint.append(_.escape(item.text));
                            }
                        });
                    } else {
                        $fHint.text(element.label!);
                    }

                    $fHint.data("token", element);
                    setStyleAndCacheToken($fHint, element);
                    hints.push($fHint);
                });
            }

            const token = self.query;
            $deferredHints.resolve({
                "hints": hints,
                "enableDescription": true,
                "selectInitial": token && /\S/.test(token) && isNaN(parseInt(token, 10)) // If the active token is blank then don't put default selection
            });
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    }

    public insertHint($hint: JQuery): boolean {
        return this.defaultCodeHintProviders.insertHint($hint);
    }

    public updateHintDescription($hint: JQuery, $hintDescContainer: JQuery): void {
        const $hintObj = $hint.find(".brackets-hints-with-type-details");
        const token = $hintObj.data("completionItem");
        const $desc = $("<div>");

        if (!token) {
            $hintDescContainer.empty();
            return;
        }

        if (token.detail) {
            if (token.detail.trim() !== "?") {
                $("<div>" + token.detail.split("->").join(":").toString().trim() + "</div>").appendTo($desc).addClass("codehint-desc-type-details");
            }
        } else {
            if (hintType[token.kind]) {
                $("<div>" + hintType[token.kind] + "</div>").appendTo($desc).addClass("codehint-desc-type-details");
            }
        }
        if (token.documentation) {
            $("<div></div>").html(token.documentation.trim()).appendTo($desc).addClass("codehint-desc-documentation");
        }

        // To ensure CSS reflow doesn't cause a flicker.
        $hintDescContainer.empty();
        $hintDescContainer.append($desc);
    }
}
