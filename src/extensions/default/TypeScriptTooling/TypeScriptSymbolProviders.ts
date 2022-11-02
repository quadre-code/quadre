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

import type { StringMatcher, SearchResult } from "utils/StringMatch";

const EditorManager = brackets.getModule("editor/EditorManager");
const QuickOpen = brackets.getModule("search/QuickOpen");
const Commands = brackets.getModule("command/Commands");
const CommandManager = brackets.getModule("command/CommandManager");
const PathConverters = brackets.getModule("languageTools/PathConverters");
const BaseProvider = brackets.getModule("languageTools/DefaultProviders").BaseProvider;

const SymbolKind = QuickOpen.SymbolKind;

interface Range {
    start: RangePos;
    end: RangePos;
}

interface RangePos {
    line: number;
    character: number;
}

interface SelectionRange {
    from: CodeMirror.Position;
    to: CodeMirror.Position;
}

interface SymbolInfoSearchResult extends SearchResult {
    symbolInfo?: any;
}


function convertRangePosToEditorPos(rangePos: RangePos): CodeMirror.Position {
    return {
        line: rangePos.line,
        ch: rangePos.character
    };
}

class SymbolInformation {
    public label;
    public fullPath;
    public selectionRange;
    public type;
    public scope;
    public isDocumentSymbolRequest;

    constructor(label, fullPath, selectionRange, type, scope, isDocumentSymbolRequest) {
        this.label = label;
        this.fullPath = fullPath;
        this.selectionRange = selectionRange;
        this.type = type;
        this.scope = scope;
        this.isDocumentSymbolRequest = isDocumentSymbolRequest;
    }
}

function createList(list: Array<any>, isDocumentSymbolRequest?: boolean): Array<SymbolInformation> {
    const newlist: Array<SymbolInformation> = [];
    for (const symbolInfo of list) {
        const label = symbolInfo.name;
        const type = SymbolKind[symbolInfo.kind.toString()];
        let fullPath: string | null = null;
        let selectionRange: SelectionRange | null = null;
        const scope = symbolInfo.containerName;
        let range: Range | null = null;

        if (!isDocumentSymbolRequest) {
            fullPath = PathConverters.uriToPath(symbolInfo.location.uri);
        } else {
            if (symbolInfo.selectionRange) {
                range = symbolInfo.selectionRange;
                selectionRange = {
                    from: convertRangePosToEditorPos(range!.start),
                    to: convertRangePosToEditorPos(range!.end)
                };
            }
        }

        if (!selectionRange) {
            range = symbolInfo.location.range;
            selectionRange = {
                from: convertRangePosToEditorPos(range!.start),
                to: convertRangePosToEditorPos(range!.end)
            };
        }

        newlist.push(new SymbolInformation(label, fullPath, selectionRange, type, scope, isDocumentSymbolRequest));
    }

    return newlist;
}

function transFormToSymbolList(query, matcher: StringMatcher, results, isDocumentSymbolRequest?: boolean): Array<SymbolInfoSearchResult> {
    const list = createList(results, isDocumentSymbolRequest);

    // Filter and rank how good each match is
    const filteredList = $.map(list, function (symbolInfo) {
        const searchResult: SymbolInfoSearchResult | undefined = matcher.match(symbolInfo!.label, query);
        if (searchResult) {
            searchResult.symbolInfo = symbolInfo;
        }
        return searchResult!;
    });

    // Sort based on ranking & basic alphabetical order
    QuickOpen.basicMatchSort(filteredList);

    return filteredList;
}

/**
 * Provider for Document Symbols
 */
export class DocumentSymbolsProvider extends BaseProvider {
    constructor(client) {
        super(client);
    }

    public match(query: string): boolean {
        return query.startsWith("@");
    }

    public search(query, matcher): JQueryDeferred<Array<SymbolInfoSearchResult>> {
        if (!this.client) {
            return $.Deferred<Array<SymbolInfoSearchResult>>().reject();
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.documentSymbolProvider) {
            return $.Deferred<Array<SymbolInfoSearchResult>>().reject();
        }

        const editor = EditorManager.getActiveEditor()!;
        const docPath = editor.document.file._path;
        const retval = $.Deferred<Array<SymbolInfoSearchResult>>();
        query = query.slice(1);

        this.client.requestSymbolsForDocument({
            filePath: docPath
        }).done(function (results) {
            const resultList = transFormToSymbolList(query, matcher, results, true);
            retval.resolve(resultList);
        });

        return retval;
    }

    public itemFocus(selectedItem, query, explicit): void {
        if (!selectedItem || (query.length < 2 && !explicit)) {
            return;
        }

        const range = selectedItem.symbolInfo.selectionRange;
        EditorManager.getCurrentFullEditor().setSelection(range.from, range.to, true);
    }

    public itemSelect(selectedItem, query): void {
        this.itemFocus(selectedItem, query, true);
    }

    public resultsFormatter(item, query): string {
        const displayName = QuickOpen.highlightMatch(item);
        query = query.slice(1);

        if (item.symbolInfo.scope) {
            return "<li>" + displayName + " (" + item.symbolInfo.type + ")" + "<br /><span class='quick-open-path'>" + item.symbolInfo.scope + "</span></li>";
        }
        return "<li>" + displayName + " (" + item.symbolInfo.type + ")" + "</li>";
    }
}

/**
 * Provider for Project Symbols
 */
export class ProjectSymbolsProvider extends BaseProvider {
    constructor(client) {
        super(client);
    }

    public match(query: string): boolean {
        return query.startsWith("#");
    }

    public search(query, matcher): JQueryDeferred<Array<SymbolInfoSearchResult>> {
        if (!this.client) {
            return $.Deferred<Array<SymbolInfoSearchResult>>().reject();
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.workspaceSymbolProvider) {
            return $.Deferred<Array<SymbolInfoSearchResult>>().reject();
        }

        const retval = $.Deferred<Array<SymbolInfoSearchResult>>();
        query = query.slice(1);

        this.client.requestSymbolsForWorkspace({
            query: query
        }).done(function (results) {
            const resultList = transFormToSymbolList(query, matcher, results);
            retval.resolve(resultList);
        });

        return retval;
    }

    public itemFocus(selectedItem, query, explicit): void {
        if (!selectedItem || (query.length < 2 && !explicit)) {
            return;
        }
    }

    public itemSelect(selectedItem, query): void {
        const fullPath = selectedItem.symbolInfo.fullPath;
        const range = selectedItem.symbolInfo.selectionRange;

        if (fullPath) {
            CommandManager.execute(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {
                fullPath: fullPath
            })
                .done(function () {
                    if (range.from) {
                        const editor = EditorManager.getCurrentFullEditor();
                        editor.setCursorPos(range.from.line, range.from.ch, true);
                    }
                });
        }
    }

    public resultsFormatter(item, query): string {
        const displayName = QuickOpen.highlightMatch(item);
        query = query.slice(1);

        if (item.symbolInfo.scope) {
            return "<li>" + displayName + " (" + item.symbolInfo.type + ")" + "<br /><span class='quick-open-path'>" + item.symbolInfo.scope + "</span><br /><br /><span class='quick-open-path'>" + item.symbolInfo.fullPath + "</span></li>";
        }
        return "<li>" + displayName + " (" + item.symbolInfo.type + ")" + "<br /><br /><span class='quick-open-path'>" + item.symbolInfo.fullPath + "</span></li>";
    }
}
