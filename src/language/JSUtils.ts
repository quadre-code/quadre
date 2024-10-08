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

/**
 * Set of utilities for simple parsing of JS text.
 */

import * as _ from "lodash";
import * as Acorn from "acorn";
import * as AcornLoose from "thirdparty/acorn/acorn_loose";
import * as ASTWalker from "thirdparty/acorn/walk";

// Load brackets modules
import * as CodeMirror from "codemirror";
import * as Async from "utils/Async";
import * as DocumentManager from "document/DocumentManager";
import ChangedDocumentTracker = require("document/ChangedDocumentTracker");
import * as FileSystem from "filesystem/FileSystem";
import * as FileUtils from "file/FileUtils";
import * as PerfUtils from "utils/PerfUtils";
import * as StringUtils from "utils/StringUtils";

interface FunctionInfo {
    offsetStart: number;
    label: string | null;
    location: {
        start: {
            line: number;
            column: number;
        };
        end: {
            line: number;
            column: number;
        };
    };

    offsetEnd?: number;
    lineStart?: number;
    lineEnd?: number;
}

interface FunctionInfoMap {
    [functionName: string]: Array<FunctionInfo>;
}

interface FileInfo extends FileLike {
    JSUtils?: {
        functions: FunctionInfoMap;
        timestamp: Date;
    };
}

interface DocInfoMap {
    doc?: DocumentManager.Document;
    fileInfo?: FileInfo;
    functions: FunctionInfoMap;
}

interface DocInfoArray {
    doc?: DocumentManager.Document;
    fileInfo?: FileInfo;
    functions: Array<FunctionInfo>;
}

interface MatchingFunctions {
    name: string | undefined;
    label: string | null;
    lineStart: number | undefined;
    lineEnd: number | undefined;
    nameLineStart: number;
    nameLineEnd: number;
    columnStart: number;
    columnEnd: number;
}

interface RangeResult {
    document: DocumentManager.Document;
    name: string;
    lineStart: number;
    lineEnd: number;
}

export interface FileLike {
    name: string;
    fullPath: string;
}

/**
 * Tracks dirty documents between invocations of findMatchingFunctions.
 * @type {ChangedDocumentTracker}
 */
const _changedDocumentTracker = new ChangedDocumentTracker();

/**
 * @private
 * Return an object mapping function name to offset info for all functions in the specified text.
 * Offset info is an array, since multiple functions of the same name can exist.
 * @param {!string} text Document text
 * @return {Object.<string, Array.<{offsetStart: number, offsetEnd: number}>}
 */
function _findAllFunctionsInText(text: string): FunctionInfoMap {
    let AST;
    const results: FunctionInfoMap = {};
    let functionName;
    let resultNode;
    let memberPrefix;

    PerfUtils.markStart((PerfUtils as any).JSUTILS_REGEXP);

    try {
        AST = Acorn.parse(text, {locations: true});
    } catch (e) {
        AST = AcornLoose.parse_dammit(text, {locations: true});
    }

    function _addResult(node, offset?: number, prefix?: string): void {
        memberPrefix = prefix ? prefix + " - " : "";
        resultNode = node.id || node.key || node;
        functionName = resultNode.name;
        if (!Array.isArray(results[functionName])) {
            results[functionName] = [];
        }

        results[functionName].push(
            {
                offsetStart: offset || node.start,
                label: memberPrefix ? memberPrefix + functionName : null,
                location: resultNode.loc
            }
        );
    }

    ASTWalker.simple(AST, {
        /*
            function <functionName> () {}
        */
        FunctionDeclaration: function (node) {
            // As acorn_loose marks identifier names with '✖' under erroneous declarations
            // we should have a check to discard such 'FunctionDeclaration' nodes
            if (node.id.name !== "✖") {
                _addResult(node);
            }
        },
        /*
            class <className> () {}
        */
        ClassDeclaration: function (node) {
            _addResult(node);
            ASTWalker.simple(node, {
                /*
                    class <className> () {
                        <methodName> () {

                        }
                    }
                */
                MethodDefinition: function (methodNode) {
                    _addResult(methodNode, methodNode.key.start, node.id.name);
                }
            });
        },
        /*
            var <functionName> = function () {}

            or

            var <functionName> = () => {}
        */
        VariableDeclarator: function (node) {
            if (node.init && (node.init.type === "FunctionExpression" || node.init.type === "ArrowFunctionExpression")) {
                _addResult(node);
            }
        },
        /*
            SomeFunction.prototype.<functionName> = function () {}
        */
        AssignmentExpression: function (node) {
            if (node.right && node.right.type === "FunctionExpression") {
                if (node.left && node.left.type === "MemberExpression" && node.left.property) {
                    _addResult(node.left.property);
                }
            }
        },
        /*
            {
                <functionName>: function() {}
            }
        */
        Property: function (node) {
            if (node.value && node.value.type === "FunctionExpression") {
                if (node.key && node.key.type === "Identifier") {
                    _addResult(node.key);
                }
            }
        },
        /*
            <functionName>: function() {}
        */
        LabeledStatement: function (node) {
            if (node.body && node.body.type === "FunctionDeclaration") {
                if (node.label) {
                    _addResult(node.label);
                }
            }
        }
    });

    PerfUtils.addMeasurement((PerfUtils as any).JSUTILS_REGEXP);

    return results;
}

// Given the start offset of a function definition (before the opening brace), find
// the end offset for the function (the closing "}"). Returns the position one past the
// close brace. Properly ignores braces inside comments, strings, and regexp literals.
export function _getFunctionEndOffset(text: string, offsetStart: number): number {
    const mode = CodeMirror.getMode({}, "javascript");
    const state = CodeMirror.startState(mode);
    let stream: CodeMirror.StringStream;
    let style;
    let token: string;
    let curOffset = offsetStart;
    const length = text.length;
    let blockCount = 0;
    let lineStart;
    let foundStartBrace = false;

    // Get a stream for the next line, and update curOffset and lineStart to point to the
    // beginning of that next line. Returns false if we're at the end of the text.
    function nextLine(): boolean {
        if (stream) {
            curOffset++; // account for \n
            if (curOffset >= length) {
                return false;
            }
        }
        lineStart = curOffset;
        let lineEnd = text.indexOf("\n", lineStart);
        if (lineEnd === -1) {
            lineEnd = length;
        }
        stream = new CodeMirror.StringStream(text.slice(curOffset, lineEnd));
        return true;
    }

    // Get the next token, updating the style and token to refer to the current
    // token, and updating the curOffset to point to the end of the token (relative
    // to the start of the original text).
    function nextToken(): boolean {
        if (curOffset >= length) {
            return false;
        }
        if (stream) {
            // Set the start of the next token to the current stream position.
            stream.start = stream.pos;
        }
        while (!stream || stream.eol()) {
            if (!nextLine()) {
                return false;
            }
        }
        style = mode.token!(stream, state);
        token = stream.current();
        curOffset = lineStart + stream.pos;
        return true;
    }

    while (nextToken()) {
        if (style !== "comment" && style !== "regexp" && style !== "string" && style !== "string-2") {
            if (token! === "{") {
                foundStartBrace = true;
                blockCount++;
            } else if (token! === "}") {
                blockCount--;
            }
        }

        // blockCount starts at 0, so we don't want to check if it hits 0
        // again until we've actually gone past the start of the function body.
        if (foundStartBrace && blockCount <= 0) {
            return curOffset;
        }
    }

    // Shouldn't get here, but if we do, return the end of the text as the offset.
    return length;
}

/**
 * @private
 * Computes function offsetEnd, lineStart and lineEnd. Appends a result record to rangeResults.
 * @param {!Document} doc
 * @param {!string} functionName
 * @param {!Array.<{offsetStart: number, offsetEnd: number}>} functions
 * @param {!Array.<{document: Document, name: string, lineStart: number, lineEnd: number}>} rangeResults
 */
function _computeOffsets(doc: DocumentManager.Document, functionName: string, functions: Array<FunctionInfo>, rangeResults: Array<RangeResult>): void {
    const text    = doc.getText()!;
    const lines   = StringUtils.getLines(text);

    functions.forEach(function (funcEntry) {
        if (!funcEntry.offsetEnd) {
            PerfUtils.markStart((PerfUtils as any).JSUTILS_END_OFFSET);

            funcEntry.offsetEnd = _getFunctionEndOffset(text, funcEntry.offsetStart);
            funcEntry.lineStart = StringUtils.offsetToLineNum(lines, funcEntry.offsetStart);
            funcEntry.lineEnd   = StringUtils.offsetToLineNum(lines, funcEntry.offsetEnd);

            PerfUtils.addMeasurement((PerfUtils as any).JSUTILS_END_OFFSET);
        }

        rangeResults.push({
            document:   doc,
            name:       functionName,
            lineStart:  funcEntry.lineStart!,
            lineEnd:    funcEntry.lineEnd!
        });
    });
}

/**
 * @private
 * Read a file and build a function list. Result is cached in fileInfo.
 * @param {!FileInfo} fileInfo File to parse
 * @param {!$.Deferred} result Deferred to resolve with all functions found and the document
 */
function _readFile(fileInfo: FileInfo, result: JQueryDeferred<DocInfoMap>): void {
    DocumentManager.getDocumentForPath(fileInfo.fullPath)
        .done(function (doc) {
            const allFunctions = _findAllFunctionsInText(doc!.getText()!);

            // Cache the result in the fileInfo object
            fileInfo.JSUtils = {
                functions: allFunctions,
                timestamp: doc!.diskTimestamp!,
            };

            result.resolve({doc: doc!, functions: allFunctions});
        })
        .fail(function (error) {
            result.reject(error);
        });
}

/**
 * Determines if the document function cache is up to date.
 * @param {FileInfo} fileInfo
 * @return {$.Promise} A promise resolved with true with true when a function cache is available for the document. Resolves
 *   with false when there is no cache or the cache is stale.
 */
function _shouldGetFromCache(fileInfo: FileInfo): JQueryPromise<boolean> {
    const result = $.Deferred<boolean>();
    const isChanged = _changedDocumentTracker.isPathChanged(fileInfo.fullPath);

    if (isChanged && fileInfo.JSUtils) {
        // See if it's dirty and in the working set first
        const doc = DocumentManager.getOpenDocumentForPath(fileInfo.fullPath);

        if (doc && doc.isDirty) {
            result.resolve(false);
        } else {
            // If a cache exists, check the timestamp on disk
            const file = FileSystem.getFileForPath(fileInfo.fullPath);

            file.stat(function (err, stat) {
                if (!err) {
                    result.resolve(fileInfo.JSUtils!.timestamp.getTime() === stat!.mtime.getTime());
                } else {
                    result.reject(err);
                }
            });
        }
    } else {
        // Use the cache if the file did not change and the cache exists
        result.resolve(!isChanged && !!fileInfo.JSUtils);
    }

    return result.promise();
}

/**
 * @private
 * Compute lineStart and lineEnd for each matched function
 * @param {!Array.<{doc: Document, fileInfo: FileInfo, functions: Array.<offsetStart: number, offsetEnd: number>}>} docEntries
 * @param {!string} functionName
 * @param {!Array.<document: Document, name: string, lineStart: number, lineEnd: number>} rangeResults
 * @return {$.Promise} A promise resolved with an array of document ranges to populate a MultiRangeInlineEditor.
 */
function _getOffsetsForFunction(docEntries: Array<DocInfoMap>, functionName: string): JQueryPromise<Array<RangeResult>> {
    // Filter for documents that contain the named function
    const result              = $.Deferred<Array<RangeResult>>();
    const matchedDocuments: Array<DocInfoArray> = [];
    const rangeResults: Array<RangeResult> = [];

    docEntries.forEach(function (docEntry) {
        // Need to call _.has here since docEntry.functions could have an
        // entry for "hasOwnProperty", which results in an error if trying
        // to invoke docEntry.functions.hasOwnProperty().
        if (_.has(docEntry.functions, functionName)) {
            const functionsInDocument = docEntry.functions[functionName];
            matchedDocuments.push({doc: docEntry.doc, fileInfo: docEntry.fileInfo, functions: functionsInDocument});
        }
    });

    Async.doInParallel(matchedDocuments, function (docEntry) {
        const doc         = docEntry.doc;
        const oneResult   = $.Deferred();

        // doc will be undefined if we hit the cache
        if (!doc) {
            DocumentManager.getDocumentForPath(docEntry.fileInfo!.fullPath)
                .done(function (fetchedDoc) {
                    _computeOffsets(fetchedDoc!, functionName, docEntry.functions, rangeResults);
                })
                .always(function () {
                    oneResult.resolve();
                });
        } else {
            _computeOffsets(doc, functionName, docEntry.functions, rangeResults);
            oneResult.resolve();
        }

        return oneResult.promise();
    }).done(function () {
        result.resolve(rangeResults);
    });

    return result.promise();
}

/**
 * Resolves with a record containing the Document or FileInfo and an Array of all
 * function names with offsets for the specified file. Results may be cached.
 * @param {FileInfo} fileInfo
 * @return {$.Promise} A promise resolved with a document info object that
 *   contains a map of all function names from the document and each function's start offset.
 */
function _getFunctionsForFile(fileInfo: FileInfo): JQueryPromise<DocInfoMap> {
    const result = $.Deferred<DocInfoMap>();

    _shouldGetFromCache(fileInfo)
        .done(function (useCache) {
            if (useCache) {
                // Return cached data. doc property is undefined since we hit the cache.
                // _getOffsets() will fetch the Document if necessary.
                result.resolve({/*doc: undefined,*/fileInfo: fileInfo, functions: fileInfo.JSUtils!.functions});
            } else {
                _readFile(fileInfo, result);
            }
        }).fail(function (err) {
            result.reject(err);
        });

    return result.promise();
}

/**
 * @private
 * Get all functions for each FileInfo.
 * @param {Array.<FileInfo>} fileInfos
 * @return {$.Promise} A promise resolved with an array of document info objects that each
 *   contain a map of all function names from the document and each function's start offset.
 */
function _getFunctionsInFiles(fileInfos: Array<FileInfo>): JQueryPromise<Array<DocInfoMap>> {
    const result      = $.Deferred<Array<DocInfoMap>>();
    const docEntries: Array<DocInfoMap> = [];

    PerfUtils.markStart((PerfUtils as any).JSUTILS_GET_ALL_FUNCTIONS);

    Async.doInParallel(fileInfos, function (fileInfo) {
        const oneResult = $.Deferred<void>();

        _getFunctionsForFile(fileInfo)
            .done(function (docInfo) {
                docEntries.push(docInfo!);
            })
            .always(function (error) {
                // If one file fails, continue to search
                oneResult.resolve();
            });

        return oneResult.promise();
    }).always(function () {
        // Reset ChangedDocumentTracker now that the cache is up to date.
        _changedDocumentTracker.reset();

        PerfUtils.addMeasurement((PerfUtils as any).JSUTILS_GET_ALL_FUNCTIONS);
        result.resolve(docEntries);
    });

    return result.promise();
}

/**
 * Return all functions that have the specified name, searching across all the given files.
 *
 * @param {!String} functionName The name to match.
 * @param {!Array.<File>} fileInfos The array of files to search.
 * @param {boolean=} keepAllFiles If true, don't ignore non-javascript files.
 * @return {$.Promise} that will be resolved with an Array of objects containing the
 *      source document, start line, and end line (0-based, inclusive range) for each matching function list.
 *      Does not addRef() the documents returned in the array.
 */
export function findMatchingFunctions(functionName: string, fileInfos: Array<FileLike>, keepAllFiles?: boolean): JQueryPromise<Array<RangeResult>> {
    const result  = $.Deferred<Array<RangeResult>>();
    let jsFiles: Array<FileLike> = [];

    if (!keepAllFiles) {
        // Filter fileInfos for .js files
        jsFiles = fileInfos.filter(function (fileInfo) {
            return FileUtils.getFileExtension(fileInfo.fullPath).toLowerCase() === "js";
        });
    } else {
        jsFiles = fileInfos;
    }

    // RegExp search (or cache lookup) for all functions in the project
    _getFunctionsInFiles(jsFiles).done(function (docEntries) {
        // Compute offsets for all matched functions
        _getOffsetsForFunction(docEntries!, functionName).done(function (rangeResults) {
            result.resolve(rangeResults);
        });
    });

    return result.promise();
}

/**
 * Finds all instances of the specified searchName in "text".
 * Returns an Array of Objects with start and end properties.
 *
 * @param text {!String} JS text to search
 * @param searchName {!String} function name to search for
 * @return {Array.<{offset:number, functionName:string}>}
 *      Array of objects containing the start offset for each matched function name.
 */
export function findAllMatchingFunctionsInText(text: string, searchName: string): Array<MatchingFunctions> {
    const allFunctions = _findAllFunctionsInText(text);
    const result: Array<MatchingFunctions> = [];
    const lines = text.split("\n");

    _.forEach(allFunctions, function (functions, functionName) {
        if (functionName === searchName || searchName === "*") {
            functions.forEach(function (funcEntry) {
                const endOffset = _getFunctionEndOffset(text, funcEntry.offsetStart);
                result.push({
                    name: functionName,
                    label: funcEntry.label,
                    lineStart: StringUtils.offsetToLineNum(lines, funcEntry.offsetStart),
                    lineEnd: StringUtils.offsetToLineNum(lines, endOffset),
                    nameLineStart: funcEntry.location.start.line - 1,
                    nameLineEnd: funcEntry.location.end.line - 1,
                    columnStart: funcEntry.location.start.column,
                    columnEnd: funcEntry.location.end.column
                });
            });
        }
    });

    return result;
}

PerfUtils.createPerfMeasurement("JSUTILS_GET_ALL_FUNCTIONS", "Parallel file search across project");
PerfUtils.createPerfMeasurement("JSUTILS_REGEXP", "RegExp search for all functions");
PerfUtils.createPerfMeasurement("JSUTILS_END_OFFSET", "Find end offset for a single matched function");
