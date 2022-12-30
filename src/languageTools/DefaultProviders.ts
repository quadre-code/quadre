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

/// <amd-dependency path="module" name="module"/>

import * as _ from "lodash";
import * as EditorManager from "editor/EditorManager";
import * as DocumentManager from "document/DocumentManager";
import * as ExtensionUtils from "utils/ExtensionUtils";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as TokenUtils from "utils/TokenUtils";
import * as StringMatch from "utils/StringMatch";
import * as CodeInspection from "language/CodeInspection";
import * as PathConverters from "languageTools/PathConverters";

const matcher = new StringMatch.StringMatcher({
    preferPrefixMatches: true
});

ExtensionUtils.loadStyleSheet(module, "styles/default_provider_style.css");

function formatTypeDataForToken($hintObj, token) {
    $hintObj.addClass("brackets-hints-with-type-details");
    if (token.detail) {
        if (token.detail.trim() !== "?") {
            if (token.detail.length < 30) {
                $("<span>" + token.detail.split("->").join(":").toString().trim() + "</span>").appendTo($hintObj).addClass("brackets-hints-type-details");
            }
            $("<span>" + token.detail.split("->").join(":").toString().trim() + "</span>").appendTo($hintObj).addClass("hint-description");
        }
    } else {
        if (token.keyword) {
            $("<span>keyword</span>").appendTo($hintObj).addClass("brackets-hints-keyword");
        }
    }
    if (token.documentation) {
        $hintObj.attr("title", token.documentation);
        $("<span></span>").text(token.documentation.trim()).appendTo($hintObj).addClass("hint-doc");
    }
}

function filterWithQueryAndMatcher(hints, query) {
    const matchResults = $.map(hints, function (hint) {
        const searchResult = matcher.match(hint.label, query);
        if (searchResult) {
            for (const key in hint) {
                if (_.has(hint, key)) {
                    searchResult[key] = hint[key];
                }
            }
        }

        return searchResult;
    });

    return matchResults;
}

export abstract class BaseProvider {
    public client;

    constructor(client) {
        this.client = client;
    }

    public setClient(client) {
        if (client) {
            this.client = client;
        }
    }
}

export class CodeHintsProvider extends BaseProvider {
    public query;
    public ignoreQuery;

    constructor(client) {
        super(client);

        this.query = "";
        this.ignoreQuery = ["-", "->", ">", ":", "::", "(", "()", ")", "[", "[]", "]", "{", "{}", "}"];
    }

    public hasHints(editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.completionProvider) {
            return false;
        }

        return true;
    }

    public getHints(implicitChar) {
        if (!this.client) {
            return null;
        }

        const editor = EditorManager.getActiveEditor()!;
        const pos = editor.getCursorPos();
        const docPath = editor.document.file._path;
        const $deferredHints = $.Deferred();
        const self = this;

        this.client.requestHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            const context = TokenUtils.getInitialContext(editor._codeMirror, pos);
            const hints: Array<any> = [];

            self.query = context.token.string.slice(0, context.pos.ch - context.token.start);
            if (msgObj) {
                const res = msgObj.items;
                const filteredHints = filterWithQueryAndMatcher(res, self.query);

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
                        $fHint.text(element.label);
                    }

                    $fHint.data("token", element);
                    formatTypeDataForToken($fHint, element);
                    hints.push($fHint);
                });
            }

            $deferredHints.resolve({
                "hints": hints
            });
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    }

    public insertHint($hint) {
        const editor = EditorManager.getActiveEditor()!;
        const cursor = editor.getCursorPos();
        const token = $hint.data("token");
        const query = this.query;
        const shouldIgnoreQuery = this.ignoreQuery.includes(query);
        const inclusion = shouldIgnoreQuery ? "" : query;
        let start = {
            line: cursor.line,
            ch: cursor.ch - inclusion.length
        };
        let end = {
            line: cursor.line,
            ch: cursor.ch
        };

        let txt = token.label;
        if (token.textEdit && token.textEdit.newText) {
            txt = token.textEdit.newText;
            start = {
                line: token.textEdit.range.start.line,
                ch: token.textEdit.range.start.character
            };
            end = {
                line: token.textEdit.range.end.line,
                ch: token.textEdit.range.end.character
            };
        }

        if (editor) {
            editor.document.replaceRange(txt, start, end);
        }
        // Return false to indicate that another hinting session is not needed
        return false;
    }
}

export class ParameterHintsProvider extends BaseProvider {
    constructor(client) {
        super(client);
    }

    public hasParameterHints(editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.signatureHelpProvider) {
            return false;
        }

        return true;
    }

    public getParameterHints() {
        if (!this.client) {
            return null;
        }

        const editor = EditorManager.getActiveEditor()!;
        const pos = editor.getCursorPos();
        const docPath = editor.document.file._path;
        const $deferredHints = $.Deferred();

        this.client.requestParameterHints({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            const paramList: Array<any> = [];
            let label;
            let activeParameter;
            if (msgObj) {
                const res = msgObj.signatures;
                activeParameter = msgObj.activeParameter;
                if (res && res.length) {
                    res.forEach(function (element) {
                        label = element.documentation;
                        const param = element.parameters;
                        param.forEach(function (ele) {
                            paramList.push({
                                label: ele.label,
                                documentation: ele.documentation
                            });
                        });
                    });

                    $deferredHints.resolve({
                        parameters: paramList,
                        currentIndex: activeParameter,
                        functionDocumentation: label
                    });
                } else {
                    $deferredHints.reject();
                }
            } else {
                $deferredHints.reject();
            }
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    }
}

/**
 * Utility function to make the jump
 * @param   {Object} curPos - target postion for the cursor after the jump
 */
function setJumpPosition(curPos) {
    EditorManager.getCurrentFullEditor().setCursorPos(curPos.line, curPos.ch, true);
}

export class JumpToDefProvider extends BaseProvider {
    constructor(client) {
        super(client);
    }

    public canJumpToDef(editor, implicitChar) {
        if (!this.client) {
            return false;
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.definitionProvider) {
            return false;
        }

        return true;
    }

    /**
     * Method to handle jump to definition feature.
     */
    public doJumpToDef() {
        if (!this.client) {
            return null;
        }

        const editor = EditorManager.getFocusedEditor()!;
        const pos = editor.getCursorPos();
        const docPath = editor.document.file._path;
        const docPathUri = PathConverters.pathToUri(docPath);
        const $deferredHints = $.Deferred();

        this.client.gotoDefinition({
            filePath: docPath,
            cursorPos: pos
        }).done(function (msgObj) {
            // For Older servers
            if (Array.isArray(msgObj)) {
                msgObj = msgObj[msgObj.length - 1];
            }

            if (msgObj && msgObj.range) {
                const docUri = msgObj.uri;
                const startCurPos: any = {};
                startCurPos.line = msgObj.range.start.line;
                startCurPos.ch = msgObj.range.start.character;

                if (docUri !== docPathUri) {
                    const documentPath = PathConverters.uriToPath(docUri);
                    CommandManager.execute(Commands.FILE_OPEN, {
                        fullPath: documentPath
                    })
                        .done(function () {
                            setJumpPosition(startCurPos);
                            $deferredHints.resolve();
                        });
                } else { // definition is in current document
                    setJumpPosition(startCurPos);
                    $deferredHints.resolve();
                }
            }
        }).fail(function () {
            $deferredHints.reject();
        });

        return $deferredHints;
    }
}

export class LintingProvider extends BaseProvider {
    private _results: Map<string, any>;
    private _promiseMap: Map<string, JQueryDeferred<unknown>>;
    public _validateOnType: boolean;

    constructor(client) {
        super(client);

        this._results = new Map();
        this._promiseMap = new Map();
        this._validateOnType = false;
    }

    public clearExistingResults(filePath?: string): void {
        const filePathProvided = !!filePath;

        if (filePathProvided) {
            this._results.delete(filePath!);
            this._promiseMap.delete(filePath!);
        } else {
            // clear all results
            this._results.clear();
            this._promiseMap.clear();
        }
    }

    /**
     * Publish the diagnostics information related to current document
     * @param   {Object} msgObj - json object containing information associated with 'textDocument/publishDiagnostics' notification from server
     */
    public setInspectionResults(msgObj) {
        const diagnostics = msgObj.diagnostics;
        const filePath = PathConverters.uriToPath(msgObj.uri);
        const errors = diagnostics.map(function (obj) {
            return {
                pos: {
                    line: obj.range.start.line,
                    ch: obj.range.start.character
                },
                message: obj.message,
                type: (obj.severity === 1 ? CodeInspection.Type.ERROR : (obj.severity === 2 ? CodeInspection.Type.WARNING : CodeInspection.Type.META))
            };
        });

        this._results.set(filePath, {
            errors: errors
        });
        if (this._promiseMap.get(filePath)) {
            this._promiseMap.get(filePath)!.resolve(this._results.get(filePath));
            this._promiseMap.delete(filePath);
        }
        if (this._validateOnType) {
            const editor = EditorManager.getActiveEditor();
            const docPath = editor ? editor.document.file._path : "";
            if (filePath === docPath) {
                CodeInspection.requestRun();
            }
        }
    }

    public getInspectionResultsAsync(fileText, filePath) {
        const result = $.Deferred();

        if (this._results.get(filePath)) {
            return result.resolve(this._results.get(filePath));
        }
        this._promiseMap.set(filePath, result);
        return result;
    }

    public getInspectionResults(fileText, filePath) {
        return this._results.get(filePath);
    }
}

export function serverRespToSearchModelFormat(msgObj) {
    const referenceModel: any = {};
    const result = $.Deferred();

    if (!(msgObj && msgObj.length && msgObj.cursorPos)) {
        return result.reject();
    }
    referenceModel.results = {};
    referenceModel.numFiles = 0;
    let fulfilled = 0;
    msgObj.forEach(function (element, i) {
        const filePath = PathConverters.uriToPath(element.uri);
        DocumentManager.getDocumentForPath(filePath)
            .done(function (doc: any) {
                const startRange = {line: element.range.start.line, ch: element.range.start.character};
                const endRange = {line: element.range.end.line, ch: element.range.end.character};
                const match = {
                    start: startRange,
                    end: endRange,
                    highlightOffset: 0,
                    line: doc.getLine(element.range.start.line)
                };
                if (!referenceModel.results[filePath]) {
                    referenceModel.numFiles = referenceModel.numFiles + 1;
                    referenceModel.results[filePath] = {"matches": []};
                }
                if (!referenceModel.queryInfo || msgObj.cursorPos.line === startRange.line) {
                    referenceModel.queryInfo = doc.getRange(startRange, endRange);
                }
                referenceModel.results[filePath].matches.push(match);
            }).always(function () {
                fulfilled++;
                if (fulfilled === msgObj.length) {
                    referenceModel.numMatches = msgObj.length;
                    referenceModel.allResultsAvailable = true;
                    result.resolve(referenceModel);
                }
            });
    });
    return result.promise();
}

export class ReferencesProvider extends BaseProvider {
    constructor(client) {
        super(client);
    }

    public hasReferences() {
        if (!this.client) {
            return false;
        }

        const serverCapabilities = this.client.getServerCapabilities();
        if (!serverCapabilities || !serverCapabilities.referencesProvider) {
            return false;
        }

        return true;
    }

    public getReferences(hostEditor, curPos) {
        const editor = hostEditor || EditorManager.getActiveEditor();
        const pos = curPos || editor ? editor.getCursorPos() : null;
        const docPath = editor.document.file._path;
        const result = $.Deferred();

        if (this.client) {
            this.client.findReferences({
                filePath: docPath,
                cursorPos: pos
            }).done(function (msgObj) {
                if (msgObj && msgObj.length) {
                    msgObj.cursorPos = pos;
                    serverRespToSearchModelFormat(msgObj)
                        .done(result.resolve)
                        .fail(result.reject);
                } else {
                    result.reject();
                }
            }).fail(function () {
                result.reject();
            });
            return result.promise();
        }
        return result.reject();
    }
}
