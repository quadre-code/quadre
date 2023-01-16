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

/*
 * Throughout this file, the term "outer scope" is used to refer to the outer-
 * most/global/root Scope objects for particular file. The term "inner scope"
 * is used to refer to a Scope object that is reachable via the child relation
 * from an outer scope.
 */

/// <amd-dependency path="module" name="module"/>

import type { EditorChange } from "codemirror";
import type { Document } from "document/Document";
import type Directory = require("filesystem/Directory");
import type File = require("filesystem/File");
import type FileSystemEntry = require("filesystem/FileSystemEntry");

import * as _ from "lodash";

import * as CodeMirror from "thirdparty/CodeMirror/lib/codemirror";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Dialogs from "widgets/Dialogs";
import * as DocumentManager from "document/DocumentManager";
import * as EditorManager from "editor/EditorManager";
import * as FileSystem from "filesystem/FileSystem";
import * as FileUtils from "file/FileUtils";
import * as LanguageManager from "language/LanguageManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as ProjectManager from "project/ProjectManager";
import * as Strings from "strings";
import * as StringUtils from "utils/StringUtils";
import NodeDomain = require("utils/NodeDomain");
import InMemoryFile = require("document/InMemoryFile");
import { DispatcherEvents } from "utils/EventDispatcher";

import * as HintUtils from "JSUtils/HintUtils";
import * as MessageIds from "JSUtils/MessageIds";
import Preferences = require("JSUtils/Preferences");
import Session = require("JSUtils/Session");

interface DocumentChange {
    to: number;
    from: number;
}

interface Config {
    debug: boolean;
    noReset: boolean;
}

interface FileInfo {
    type: typeof MessageIds[keyof typeof MessageIds];
    name: string;
    offsetLines: number;
    text: string;
}

const ternEnvironment: Array<any> = [];
const pendingTernRequests = {};
const builtinFiles        = ["ecmascript.json", "browser.json", "jquery.json"];
const builtinLibraryNames: Array<string> = [];
let isDocumentDirty     = false;
let _hintCount          = 0;
let currentModule: TernModule;
let documentChanges: DocumentChange | null = null;     // bounds of document changes
let preferences: Preferences;
let deferredPreferences: JQueryDeferred<void> | null = null;

const _bracketsPath       = FileUtils.getNativeBracketsDirectoryPath();
const _modulePath         = FileUtils.getNativeModuleDirectoryPath(module);
const _nodePath           = "node/TernNodeDomain";
const _domainPath         = [_bracketsPath, _modulePath, _nodePath].join("/");


const MAX_HINTS           = 30;  // how often to reset the tern server
const LARGE_LINE_CHANGE   = 100;
const LARGE_LINE_COUNT    = 10000;
const OFFSET_ZERO         = {line: 0, ch: 0};

let config = {} as unknown as Config;

/**
 *  An array of library names that contain JavaScript builtins definitions.
 *
 * @return {Array.<string>} - array of library  names.
 */
export function getBuiltins(): Array<string> {
    return builtinLibraryNames;
}

/**
 * Read in the json files that have type information for the builtins, dom,etc
 */
function initTernEnv(): void {
    const initialPath = _bracketsPath.substr(0, _bracketsPath.lastIndexOf("/"));
    const path = [initialPath, "node_modules/tern/defs/"].join("/");
    const files = builtinFiles;

    files.forEach(function (i) {
        FileSystem.resolve(path + i, function (err, file) {
            if (!err) {
                FileUtils.readAsText(file).done(function (text) {
                    const library = JSON.parse(text!);
                    builtinLibraryNames.push(library["!name"]);
                    ternEnvironment.push(library);
                }).fail(function (error) {
                    console.log("failed to read tern config file " + i, error);
                });
            } else {
                console.log("failed to resolve tern config file " + i, err);
            }
        });
    });
}

initTernEnv();

/**
 *  Init preferences from a file in the project root or builtin
 *  defaults if no file is found;
 *
 *  @param {string=} projectRootPath - new project root path. Only needed
 *  for unit tests.
 */
function initPreferences(projectRootPath?: string): void {

    // Reject the old preferences if they have not completed.
    if (deferredPreferences && deferredPreferences.state() === "pending") {
        deferredPreferences.reject();
    }

    deferredPreferences = $.Deferred();
    const pr = ProjectManager.getProjectRoot();

    // Open preferences relative to the project root
    // Normally there is a project root, but for unit tests we need to
    // pass in a project root.
    if (pr) {
        projectRootPath = pr.fullPath;
    } else if (!projectRootPath) {
        console.log("initPreferences: projectRootPath has no value");
    }

    const path = projectRootPath + Preferences.FILE_NAME;

    FileSystem.resolve(path, function (err, file) {
        if (!err) {
            FileUtils.readAsText(file).done(function (text) {
                let configObj = null;
                try {
                    configObj = JSON.parse(text!);
                } catch (e) {
                    // continue with null configObj which will result in
                    // default settings.
                    console.log("Error parsing preference file: " + path);
                    if (e instanceof SyntaxError) {
                        console.log(e.message);
                    }
                }
                preferences = new Preferences(configObj);
                deferredPreferences!.resolve();
            }).fail(function (error) {
                preferences = new Preferences();
                deferredPreferences!.resolve();
            });
        } else {
            preferences = new Preferences();
            deferredPreferences!.resolve();
        }
    });
}

/**
 * Will initialize preferences only if they do not exist.
 *
 */
function ensurePreferences(): void {
    if (!deferredPreferences) {
        initPreferences();
    }
}

/**
 * Send a message to the tern module - if the module is being initialized,
 * the message will not be posted until initialization is complete
 */
export function postMessage(msg: Record<string, any>): void {
    if (currentModule) {
        currentModule.postMessage(msg);
    }
}

/**
 * Test if the directory should be excluded from analysis.
 *
 * @param {!string} path - full directory path.
 * @return {boolean} true if excluded, false otherwise.
 */
function isDirectoryExcluded(path: string): boolean {
    const excludes = preferences.getExcludedDirectories();

    if (!excludes) {
        return false;
    }

    let testPath = ProjectManager.makeProjectRelativeIfPossible(path);
    testPath = FileUtils.stripTrailingSlash(testPath);

    return excludes.test(testPath);
}

/**
 * Test if the file path is in current editor
 *
 * @param {string} filePath file path to test for exclusion.
 * @return {boolean} true if in editor, false otherwise.
 */
function isFileBeingEdited(filePath: string): boolean | null {
    const currentEditor   = EditorManager.getActiveEditor();
    const currentDoc      = currentEditor && currentEditor.document;

    return (currentDoc && currentDoc.file.fullPath === filePath);
}

/**
 * Test if the file path is an internal exclusion.
 *
 * @param {string} path file path to test for exclusion.
 * @return {boolean} true if excluded, false otherwise.
 */
function isFileExcludedInternal(path: string): boolean {
    // The detectedExclusions are files detected to be troublesome with current versions of Tern.
    // detectedExclusions is an array of full paths.
    const detectedExclusions = PreferencesManager.get("jscodehints.detectedExclusions") || [];
    if (detectedExclusions && detectedExclusions.indexOf(path) !== -1) {
        return true;
    }

    return false;
}

/**
 * Test if the file should be excluded from analysis.
 *
 * @param {!File} file - file to test for exclusion.
 * @return {boolean} true if excluded, false otherwise.
 */
function isFileExcluded(file: File): boolean {
    if (file.name[0] === ".") {
        return true;
    }

    const languageID = LanguageManager.getLanguageForPath(file.fullPath).getId();
    if (languageID !== HintUtils.LANGUAGE_ID) {
        return true;
    }

    const excludes = preferences.getExcludedFiles();
    if (excludes && excludes.test(file.name)) {
        return true;
    }

    if (isFileExcludedInternal(file.fullPath)) {
        return true;
    }

    return false;
}

/**
 * Add a pending request waiting for the tern-module to complete.
 * If file is a detected exclusion, then reject request.
 *
 * @param {string} file - the name of the file
 * @param {{line: number, ch: number}} offset - the offset into the file the request is for
 * @param {string} type - the type of request
 * @return {jQuery.Promise} - the promise for the request
 */
export function addPendingRequest(file: string, offset: CodeMirror.Position, type: string): JQueryPromise<any> {
    let requests;
    const key = file + "@" + offset.line + "@" + offset.ch;
    let $deferredRequest;

    // Reject detected exclusions
    if (isFileExcludedInternal(file)) {
        return ($.Deferred()).reject().promise();
    }

    if (_.has(pendingTernRequests, key)) {
        requests = pendingTernRequests[key];
    } else {
        requests = {};
        pendingTernRequests[key] = requests;
    }

    if (_.has(requests, type)) {
        $deferredRequest = requests[type];
    } else {
        requests[type] = $deferredRequest = $.Deferred();
    }
    return $deferredRequest.promise();
}

/**
 * Get any pending $.Deferred object waiting on the specified file and request type
 * @param {string} file - the file
 * @param {{line: number, ch: number}} offset - the offset into the file the request is for
 * @param {string} type - the type of request
 * @return {jQuery.Deferred} - the $.Deferred for the request
 */
function getPendingRequest(file: string, offset: CodeMirror.Position, type: string): JQueryDeferred<any> | undefined {
    const key = file + "@" + offset.line + "@" + offset.ch;
    if (_.has(pendingTernRequests, key)) {
        const requests = pendingTernRequests[key];
        const requestType = requests[type];

        delete pendingTernRequests[key][type];

        if (!Object.keys(requests).length) {
            delete pendingTernRequests[key];
        }

        return requestType;
    }

    return undefined;
}

/**
 * @param {string} file a relative path
 * @return {string} returns the path we resolved when we tried to parse the file, or undefined
 */
export function getResolvedPath(file: string): string {
    return currentModule.getResolvedPath(file);
}

/**
 * Get a Promise for the definition from TernJS, for the file & offset passed in.
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset - the offset in the file the hints should be calculate at
 * @return {jQuery.Promise} - a promise that will resolve to definition when
 *      it is done
 */
function getJumptoDef(fileInfo: FileInfo, offset: CodeMirror.Positioin): JQueryPromise<any> {
    postMessage({
        type: MessageIds.TERN_JUMPTODEF_MSG,
        fileInfo: fileInfo,
        offset: offset
    });

    return addPendingRequest(fileInfo.name, offset, MessageIds.TERN_JUMPTODEF_MSG);
}

/**
 * check to see if the text we are sending to Tern is too long.
 * @param {string} the text to check
 * @return {string} the text, or the empty text if the original was too long
 */
export function filterText(text: string): string {
    let newText = text;
    if (text.length > preferences.getMaxFileSize()) {
        newText = "";
    }
    return newText;
}

/**
 * Get the text of a document, applying any size restrictions
 * if necessary
 * @param {Document} document - the document to get the text from
 * @return {string} the text, or the empty text if the original was too long
 */
function getTextFromDocument(document: Document): string {
    let text = document.getText()!;
    text = filterText(text);
    return text;
}

/**
 * Handle the response from the tern node domain when
 * it responds with the references
 *
 * @param response - the response from the node domain
 */
function handleRename(response): void {

    if (response.error) {
        EditorManager.getActiveEditor()!.displayErrorMessageAtCursor(response.error);
        return;
    }

    const file = response.file;
    const offset = response.offset;

    const $deferredFindRefs = getPendingRequest(file, offset, MessageIds.TERN_REFS);

    if ($deferredFindRefs) {
        $deferredFindRefs.resolveWith(null, [response]);
    }
}

/**
 * Request Jump-To-Definition from Tern.
 *
 * @param {session} session - the session
 * @param {Document} document - the document
 * @param {{line: number, ch: number}} offset - the offset into the document
 * @return {jQuery.Promise} - The promise will not complete until tern
 *      has completed.
 */
export function requestJumptoDef(session: Session, document: Document, offset: CodeMirror.Position): { promise: JQueryPromise<any> } {
    const path    = document.file.fullPath;
    const fileInfo: FileInfo = {
        type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
        name: path,
        offsetLines: 0,
        text: filterText(session.getJavascriptText())
    };

    const ternPromise = getJumptoDef(fileInfo, offset);

    return {promise: ternPromise};
}

/**
 * Handle the response from the tern node domain when
 * it responds with the definition
 *
 * @param response - the response from the node domain
 */
function handleJumptoDef(response): void {

    const file = response.file;
    const offset = response.offset;

    const $deferredJump = getPendingRequest(file, offset, MessageIds.TERN_JUMPTODEF_MSG);

    if ($deferredJump) {
        response.fullPath = getResolvedPath(response.resultFile);
        $deferredJump.resolveWith(null, [response]);
    }
}

/**
 * Handle the response from the tern node domain when
 * it responds with the scope data
 *
 * @param response - the response from the node domain
 */
function handleScopeData(response): void {
    const file = response.file;
    const offset = response.offset;

    const $deferredJump = getPendingRequest(file, offset, MessageIds.TERN_SCOPEDATA_MSG);

    if ($deferredJump) {
        $deferredJump.resolveWith(null, [response]);
    }
}

/**
 * Get a Promise for the completions from TernJS, for the file & offset passed in.
 *
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}} offset - the offset in the file the hints should be calculate at
 * @param {boolean} isProperty - true if getting a property hint,
 * otherwise getting an identifier hint.
 * @return {jQuery.Promise} - a promise that will resolve to an array of completions when
 *      it is done
 */
export function getTernHints(fileInfo: FileInfo, offset: CodeMirror.Position, isProperty: boolean): JQueryPromise<any> {

    /**
     *  If the document is large and we have modified a small portions of it that
     *  we are asking hints for, then send a partial document.
     */
    postMessage({
        type: MessageIds.TERN_COMPLETIONS_MSG,
        fileInfo: fileInfo,
        offset: offset,
        isProperty: isProperty
    });

    return addPendingRequest(fileInfo.name, offset, MessageIds.TERN_COMPLETIONS_MSG);
}

/**
 * Get a Promise for the function type from TernJS.
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line:number, ch:number}} offset - the line, column info for what we want the function type of.
 * @return {jQuery.Promise} - a promise that will resolve to the function type of the function being called.
 */
function getTernFunctionType(fileInfo: FileInfo, offset: CodeMirror.Position): JQueryPromise<any> {
    postMessage({
        type: MessageIds.TERN_CALLED_FUNC_TYPE_MSG,
        fileInfo: fileInfo,
        offset: offset
    });

    return addPendingRequest(fileInfo.name, offset, MessageIds.TERN_CALLED_FUNC_TYPE_MSG);
}


/**
 *  Given a starting and ending position, get a code fragment that is self contained
 *  enough to be compiled.
 *
 * @param {!Session} session - the current session
 * @param {{line: number, ch: number}} start - the starting position of the changes
 * @return {{type: string, name: string, offsetLines: number, text: string}}
 */
function getFragmentAround(session: Session, start: CodeMirror.Position): FileInfo {
    let minIndent: number | null = null;
    let minLine: number | null = null;
    let endLine;
    const cm        = session.editor._codeMirror;
    const tabSize   = cm.getOption("tabSize");
    const document  = session.editor.document;
    let p;
    let min: number;

    // expand range backwards
    // tslint:disable-next-line:ban-comma-operator
    for (p = start.line - 1, min = Math.max(0, p - 100); p >= min; --p) {
        const line = session.getLine(p);
        const fn = line.search(/\bfunction\b/);

        if (fn >= 0) {
            const indent = CodeMirror.countColumn(line, null, tabSize);
            if (minIndent === null || minIndent > indent) {
                if (session.getToken({line: p, ch: fn + 1}).type === "keyword") {
                    minIndent = indent;
                    minLine = p;
                }
            }
        }
    }

    if (minIndent === null) {
        minIndent = 0;
    }

    if (minLine === null) {
        minLine = min;
    }

    const max = Math.min(cm.lastLine(), start.line + 100);
    let endCh = 0;

    for (endLine = start.line + 1; endLine < max; ++endLine) {
        const line = cm.getLine(endLine);

        if (line.length > 0) {
            const indent = CodeMirror.countColumn(line, null, tabSize);
            if (indent <= minIndent) {
                endCh = line.length;
                break;
            }
        }
    }

    const from = {line: minLine, ch: 0};
    const to   = {line: endLine, ch: endCh};

    return {type: MessageIds.TERN_FILE_INFO_TYPE_PART,
        name: document.file.fullPath,
        offsetLines: from.line,
        text: document.getRange(from, to)};
}


/**
 * Get an object that describes what tern needs to know about the updated
 * file to produce a hint. As a side-effect of this calls the document
 * changes are reset.
 *
 * @param {!Session} session - the current session
 * @param {boolean=} preventPartialUpdates - if true, disallow partial updates.
 * Optional, defaults to false.
 * @return {{type: string, name: string, offsetLines: number, text: string}}
 */
function getFileInfo(session: Session, preventPartialUpdates = false): FileInfo {
    const start = session.getCursor();
    const end = start;
    const document = session.editor.document;
    const path = document.file.fullPath;
    const isHtmlFile = LanguageManager.getLanguageForPath(path).getId() === "html";
    let result;

    if (isHtmlFile) {
        result = {type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
            name: path,
            text: session.getJavascriptText()};
    } else if (!documentChanges) {
        result = {type: MessageIds.TERN_FILE_INFO_TYPE_EMPTY,
            name: path,
            text: ""};
    } else if (!preventPartialUpdates && session.editor.lineCount() > LARGE_LINE_COUNT &&
            (documentChanges.to - documentChanges.from < LARGE_LINE_CHANGE) &&
            documentChanges.from <= start.line &&
            documentChanges.to > end.line) {
        result = getFragmentAround(session, start);
    } else {
        result = {type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
            name: path,
            text: getTextFromDocument(document)};
    }

    documentChanges = null;
    return result;
}

/**
 *  Get the current offset. The offset is adjusted for "part" updates.
 *
 * @param {!Session} session - the current session
 * @param {{type: string, name: string, offsetLines: number, text: string}} fileInfo
 * - type of update, name of file, and the text of the update.
 * For "full" updates, the whole text of the file is present. For "part" updates,
 * the changed portion of the text. For "empty" updates, the file has not been modified
 * and the text is empty.
 * @param {{line: number, ch: number}=} offset - the default offset (optional). Will
 * use the cursor if not provided.
 * @return {{line: number, ch: number}}
 */
function getOffset(session: Session, fileInfo: FileInfo, offset?: CodeMirror.Position): CodeMirror.Position {
    let newOffset;

    if (offset) {
        newOffset = {line: offset.line, ch: offset.ch};
    } else {
        newOffset = session.getCursor();
    }

    if (fileInfo.type === MessageIds.TERN_FILE_INFO_TYPE_PART) {
        newOffset.line = Math.max(0, newOffset.line - fileInfo.offsetLines);
    }

    return newOffset;
}

/**
 * Get a Promise for all of the known properties from TernJS, for the directory and file.
 * The properties will be used as guesses in tern.
 * @param {Session} session - the active hinting session
 * @param {Document} document - the document for which scope info is
 *      desired
 * @return {jQuery.Promise} - The promise will not complete until the tern
 *      request has completed.
 */
export function requestGuesses(session: Session, document: Document): JQueryPromise<void> {
    const $deferred = $.Deferred<void>();
    const fileInfo = getFileInfo(session);
    const offset = getOffset(session, fileInfo);

    postMessage({
        type: MessageIds.TERN_GET_GUESSES_MSG,
        fileInfo: fileInfo,
        offset: offset
    });

    const promise = addPendingRequest(fileInfo.name, offset, MessageIds.TERN_GET_GUESSES_MSG);
    promise.done(function (guesses) {
        session.setGuesses(guesses);
        $deferred.resolve();
    }).fail(function () {
        $deferred.reject();
    });

    return $deferred.promise();
}

/**
 * Handle the response from the tern node domain when
 * it responds with the list of completions
 *
 * @param {{file: string, offset: {line: number, ch: number}, completions:Array.<string>,
 *          properties:Array.<string>}} response - the response from node domain
 */
function handleTernCompletions(response): void {

    const file = response.file;
    const offset = response.offset;
    const completions = response.completions;
    const properties = response.properties;
    const fnType  = response.fnType;
    const type = response.type;
    const error = response.error;
    const $deferredHints = getPendingRequest(file, offset, type);

    if ($deferredHints) {
        if (error) {
            $deferredHints.reject();
        } else if (completions) {
            $deferredHints.resolveWith(null, [{completions: completions}]);
        } else if (properties) {
            $deferredHints.resolveWith(null, [{properties: properties}]);
        } else if (fnType) {
            $deferredHints.resolveWith(null, [fnType]);
        }
    }
}

/**
 * Handle the response from the tern node domain when
 * it responds to the get guesses message.
 *
 * @param {{file: string, type: string, offset: {line: number, ch: number},
 *      properties: Array.<string>}} response -
 *      the response from node domain contains the guesses for a
 *      property lookup.
 */
function handleGetGuesses(response): void {
    const path = response.file;
    const type = response.type;
    const offset = response.offset;
    const $deferredHints = getPendingRequest(path, offset, type);

    if ($deferredHints) {
        $deferredHints.resolveWith(null, [response.properties]);
    }
}

/**
 * Handle the response from the tern node domain when
 * it responds to the update file message.
 *
 * @param {{path: string, type: string}} response - the response from node domain
 */
function handleUpdateFile(response): void {

    const path = response.path;
    const type = response.type;
    const $deferredHints = getPendingRequest(path, OFFSET_ZERO, type);

    if ($deferredHints) {
        $deferredHints.resolve();
    }
}

/**
 * Handle timed out inference
 *
 * @param {{path: string, type: string}} response - the response from node domain
 */
function handleTimedOut(response): void {

    const detectedExclusions  = PreferencesManager.get("jscodehints.detectedExclusions") || [];
    const filePath            = response.file;

    // Don't exclude the file currently being edited
    if (isFileBeingEdited(filePath)) {
        return;
    }

    // Handle file that is already excluded
    if (detectedExclusions.indexOf(filePath) !== -1) {
        console.log("JavaScriptCodeHints.handleTimedOut: file already in detectedExclusions array timed out: " + filePath);
        return;
    }

    // Save detected exclusion in project prefs so no further time is wasted on it
    detectedExclusions.push(filePath);
    PreferencesManager.set("jscodehints.detectedExclusions", detectedExclusions, { location: { scope: "project" } });

    // Show informational dialog
    Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_INFO,
        Strings.DETECTED_EXCLUSION_TITLE,
        StringUtils.format(
            Strings.DETECTED_EXCLUSION_INFO,
            StringUtils.breakableUrl(filePath)
        ),
        [
            {
                className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                id        : Dialogs.DIALOG_BTN_OK,
                text      : Strings.OK
            }
        ]
    );
}

(DocumentManager as unknown as DispatcherEvents).on("dirtyFlagChange", function (event, changedDoc) {
    if (changedDoc.file.fullPath) {
        postMessage({
            type: MessageIds.TERN_UPDATE_DIRTY_FILE,
            name: changedDoc.file.fullPath,
            action: changedDoc.isDirty
        });
    }
});

// Clear dirty document list in tern node domain
(ProjectManager as unknown as DispatcherEvents).on("beforeProjectClose", function () {
    postMessage({
        type: MessageIds.TERN_CLEAR_DIRTY_FILES_LIST
    });
});

/**
 * Encapsulate all the logic to talk to the tern module.  This will create
 * a new instance of a TernModule, which the rest of the hinting code can use to talk
 * to the tern node domain, without worrying about initialization, priming the pump, etc.
 *
 */
// tslint:disable member-access
class TernModule {
    public resetForced: boolean;

    #addFilesPromise: JQueryPromise<unknown> | null = null;
    #ternPromise;
    #rootTernDir;
    #projectRoot;
    #stopAddingFiles     = false;
    #resolvedFiles       = {};       // file -> resolved file
    #numInitialFiles     = 0;
    #numResolvedFiles    = 0;
    #numAddedFiles       = 0;
    #_ternNodeDomain: NodeDomain;

    constructor() {
        // Do nothing.
    }

    /**
     * @param {string} file a relative path
     * @return {string} returns the path we resolved when we tried to parse the file, or undefined
     */
    public getResolvedPath(file: string): string {
        return this.#resolvedFiles[file];
    }

    /**
     *  Determine whether the current set of files are using modules to pull in
     *  additional files.
     *
     * @return {boolean} - true if more files than the current directory have
     * been read in.
     */
    #usingModules(): boolean {
        return this.#numInitialFiles !== this.#numResolvedFiles;
    }

    /**
     * Send a message to the tern node domain - if the module is being initialized,
     * the message will not be posted until initialization is complete
     */
    public postMessage(msg): void {
        const self = this;

        this.#addFilesPromise!.done(function (ternModule) {
            // If an error came up during file handling, bail out now
            if (!self.#_ternNodeDomain) {
                return;
            }

            if (config.debug) {
                console.debug("Sending message", msg);
            }
            self.#_ternNodeDomain.exec("invokeTernCommand", msg);
        });
    }

    /**
     * Send a message to the tern node domain - this is only for messages that
     * need to be sent before and while the addFilesPromise is being resolved.
     */
    #_postMessageByPass(msg): void {
        const self = this;
        this.#ternPromise.done(function (ternModule) {
            if (config.debug) {
                console.debug("Sending message", msg);
            }
            self.#_ternNodeDomain.exec("invokeTernCommand", msg);
        });
    }

    /**
     *  Update tern with the new contents of a given file.
     *
     * @param {Document} document - the document to update
     * @return {jQuery.Promise} - the promise for the request
     */
    #updateTernFile(document: Document): JQueryPromise<any> {
        const path  = document.file.fullPath;

        this.#_postMessageByPass({
            type       : MessageIds.TERN_UPDATE_FILE_MSG,
            path       : path,
            text       : getTextFromDocument(document)
        });

        return addPendingRequest(path, OFFSET_ZERO, MessageIds.TERN_UPDATE_FILE_MSG);
    }

    /**
     * Handle a request from the tern node domain for text of a file
     *
     * @param {{file:string}} request - the request from the tern node domain.  Should be an Object containing the name
     *      of the file tern wants the contents of
     */
    #handleTernGetFile(request): void {
        const self = this;

        function replyWith(name: string, txt: string): void {
            self.#_postMessageByPass({
                type: MessageIds.TERN_GET_FILE_MSG,
                file: name,
                text: txt
            });
        }

        const name = request.file;

        /**
         * Helper function to get the text of a given document and send it to tern.
         * If DocumentManager successfully gets the file's text then we'll send it to the tern node domain.
         * The Promise for getDocumentText() is returned so that custom fail functions can be used.
         *
         * @param {string} filePath - the path of the file to get the text of
         * @return {jQuery.Promise} - the Promise returned from DocumentMangaer.getDocumentText()
         */
        function getDocText(filePath: string): JQueryPromise<string | null> {
            if (!FileSystem.isAbsolutePath(filePath) || // don't handle URLs
                    filePath.slice(0, 2) === "//") { // don't handle protocol-relative URLs like //example.com/main.js (see #10566)
                return ($.Deferred<string>()).reject().promise();
            }

            const file = FileSystem.getFileForPath(filePath);
            const promise = DocumentManager.getDocumentText(file);

            promise.done(function (docText) {
                self.#resolvedFiles[name] = filePath;
                self.#numResolvedFiles++;
                replyWith(name, filterText(docText!));
            });
            return promise;
        }

        /**
         * Helper function to find any files in the project that end with the
         * name we are looking for.  This is so we can find requirejs modules
         * when the baseUrl is unknown, or when the project root is not the same
         * as the script root (e.g. if you open the 'brackets' dir instead of 'brackets/src' dir).
         */
        function findNameInProject(): void {
            // check for any files in project that end with the right path.
            const fileName = name.substring(name.lastIndexOf("/") + 1);

            function _fileFilter(entry: File): boolean {
                return entry.name === fileName;
            }

            ProjectManager.getAllFiles(_fileFilter).done(function (files) {
                let file;
                files = files!.filter(function (file) {
                    const pos = file.fullPath.length - name.length;
                    return pos === file.fullPath.lastIndexOf(name);
                });

                if (files.length === 1) {
                    file = files[0];
                }
                if (file) {
                    getDocText(file.fullPath).fail(function () {
                        replyWith(name, "");
                    });
                } else {
                    replyWith(name, "");
                }
            });
        }

        if (!isFileExcludedInternal(name)) {
            getDocText(name).fail(function () {
                getDocText(self.#rootTernDir + name).fail(function () {
                    // check relative to project root
                    getDocText(self.#projectRoot + name)
                        // last look for any files that end with the right path
                        // in the project
                        .fail(findNameInProject);
                });
            });
        }
    }

    /**
     *  Prime the pump for a fast first lookup.
     *
     * @param {string} path - full path of file
     * @return {jQuery.Promise} - the promise for the request
     */
    #primePump(path: string, isUntitledDoc: boolean): JQueryPromise<any> {
        this.#_postMessageByPass({
            type            : MessageIds.TERN_PRIME_PUMP_MSG,
            path            : path,
            isUntitledDoc   : isUntitledDoc
        });

        return addPendingRequest(path, OFFSET_ZERO, MessageIds.TERN_PRIME_PUMP_MSG);
    }

    /**
     * Handle the response from the tern node domain when
     * it responds to the prime pump message.
     *
     * @param {{path: string, type: string}} response - the response from node domain
     */
    #handlePrimePumpCompletion(response): void {

        const path = response.path;
        const type = response.type;
        const $deferredHints = getPendingRequest(path, OFFSET_ZERO, type);

        if ($deferredHints) {
            $deferredHints.resolve();
        }
    }

    /**
     *  Add new files to tern, keeping any previous files.
     *  The tern server must be initialized before making
     *  this call.
     *
     * @param {Array.<string>} files - array of file to add to tern.
     * @return {boolean} - true if more files may be added, false if maximum has been reached.
     */
    #addFilesToTern(files: Array<string>): boolean {
        const self = this;

        // limit the number of files added to tern.
        const maxFileCount = preferences.getMaxFileCount();
        if (this.#numResolvedFiles + this.#numAddedFiles < maxFileCount) {
            const available = maxFileCount - this.#numResolvedFiles - this.#numAddedFiles;

            if (available < files.length) {
                files = files.slice(0, available);
            }

            this.#numAddedFiles += files.length;
            this.#ternPromise.done(function (ternModule) {
                const msg = {
                    type        : MessageIds.TERN_ADD_FILES_MSG,
                    files       : files
                };

                if (config.debug) {
                    console.debug("Sending message", msg);
                }
                self.#_ternNodeDomain.exec("invokeTernCommand", msg);
            });

        } else {
            this.#stopAddingFiles = true;
        }

        return this.#stopAddingFiles;
    }

    /**
     *  Add the files in the directory and subdirectories of a given directory
     *  to tern.
     *
     * @param {string} dir - the root directory to add.
     * @param {function ()} doneCallback - called when all files have been
     * added to tern.
     */
    #addAllFilesAndSubdirectories(dir: string, doneCallback: () => void): void {
        const self = this;

        FileSystem.resolve(dir, function (err, directory: Directory) {
            function visitor(entry: FileSystemEntry): boolean {
                if (entry.isFile) {
                    // TODO: this branch should return true or false based on the conditions below?
                    if (!isFileExcluded(entry as File)) { // ignore .dotfiles and non-.js files
                        self.#addFilesToTern([entry.fullPath]);
                    }
                    return false;
                }

                return !isDirectoryExcluded(entry.fullPath) &&
                    entry.name.indexOf(".") !== 0 &&
                    !self.#stopAddingFiles;
            }

            if (err) {
                return;
            }

            // TODO: "This comparison appears to be unintentional because the types 'string' and 'Directory' have no overlap.ts(2367)"
            // @ts-expect-error
            if (dir === FileSystem.getDirectoryForPath(self.#rootTernDir)) {
                doneCallback();
                return;
            }

            directory.visit(visitor, doneCallback);
        });
    }

    /**
     * Init the Tern module that does all the code hinting work.
     */
    #initTernModule(): void {
        const self = this;

        const moduleDeferred = $.Deferred();
        this.#ternPromise = moduleDeferred.promise();

        function prepareTern(): void {
            self.#_ternNodeDomain.exec("setInterface", {
                messageIds : MessageIds
            });

            self.#_ternNodeDomain.exec("invokeTernCommand", {
                type: MessageIds.SET_CONFIG,
                config: config
            });
            moduleDeferred.resolveWith(null, [self.#_ternNodeDomain]);
        }

        if (this.#_ternNodeDomain) {
            this.#_ternNodeDomain.exec("resetTernServer");
            moduleDeferred.resolveWith(null, [this.#_ternNodeDomain]);
        } else {
            this.#_ternNodeDomain     = new NodeDomain("TernNodeDomain", _domainPath);
            this.#_ternNodeDomain.on("data", function (evt, data) {
                if (config.debug) {
                    console.log("Message received", data.type);
                }

                const response = data;
                const type = response.type;

                if (type === MessageIds.TERN_COMPLETIONS_MSG ||
                        type === MessageIds.TERN_CALLED_FUNC_TYPE_MSG) {
                    // handle any completions the tern server calculated
                    handleTernCompletions(response);
                } else if (type === MessageIds.TERN_GET_FILE_MSG) {
                    // handle a request for the contents of a file
                    self.#handleTernGetFile(response);
                } else if (type === MessageIds.TERN_JUMPTODEF_MSG) {
                    handleJumptoDef(response);
                } else if (type === MessageIds.TERN_SCOPEDATA_MSG) {
                    handleScopeData(response);
                } else if (type === MessageIds.TERN_REFS) {
                    handleRename(response);
                } else if (type === MessageIds.TERN_PRIME_PUMP_MSG) {
                    self.#handlePrimePumpCompletion(response);
                } else if (type === MessageIds.TERN_GET_GUESSES_MSG) {
                    handleGetGuesses(response);
                } else if (type === MessageIds.TERN_UPDATE_FILE_MSG) {
                    handleUpdateFile(response);
                } else if (type === MessageIds.TERN_INFERENCE_TIMEDOUT) {
                    handleTimedOut(response);
                } else if (type === MessageIds.TERN_WORKER_READY) {
                    moduleDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                } else if (type === "RE_INIT_TERN") {
                    // Ensure the request is because of a node restart
                    if (currentModule) {
                        prepareTern();
                        // Mark the module with resetForced, then creation of TernModule will
                        // happen again as part of '_maybeReset' call
                        currentModule.resetForced = true;
                    }
                } else {
                    console.log("Tern Module: " + (response.log || response));
                }
            });

            self.#_ternNodeDomain.promise().done(prepareTern);
        }
    }

    /**
     * Create a new tern server.
     */
    #initTernServer(dir: string, files: Array<string>): void {
        const self = this;

        this.#initTernModule();
        this.#numResolvedFiles = 0;
        this.#numAddedFiles = 0;
        this.#stopAddingFiles = false;
        this.#numInitialFiles = files.length;

        this.#ternPromise.done(function (ternModule) {
            const msg = {
                type        : MessageIds.TERN_INIT_MSG,
                dir         : dir,
                files       : files,
                env         : ternEnvironment,
                timeout     : PreferencesManager.get("jscodehints.inferenceTimeout")
            };
            self.#_ternNodeDomain.exec("invokeTernCommand", msg);
        });
        this.#rootTernDir = dir + "/";
    }

    /**
     *  We can skip tern initialization if we are opening a file that has
     *  already been added to tern.
     *
     * @param {string} newFile - full path of new file being opened in the editor.
     * @return {boolean} - true if tern initialization should be skipped,
     * false otherwise.
     */
    #canSkipTernInitialization(newFile: string): boolean {
        return this.#resolvedFiles[newFile] !== undefined;
    }


    /**
     *  Do the work to initialize a code hinting session.
     *
     * @param {Session} session - the active hinting session (TODO: currently unused)
     * @param {!Document} document - the document the editor has changed to
     * @param {?Document} previousDocument - the document the editor has changed from
     */
    #doEditorChange(session: Session, document: Document, previousDocument: Document | null): void {
        const self = this;
        const file        = document.file;
        const path        = file.fullPath;
        const dir         = file.parentPath;

        const addFilesDeferred = $.Deferred();

        documentChanges = null;
        this.#addFilesPromise = addFilesDeferred.promise();
        const pr = ProjectManager.getProjectRoot() ? ProjectManager.getProjectRoot()!.fullPath : null;

        // avoid re-initializing tern if possible.
        if (this.#canSkipTernInitialization(path)) {

            // update the previous document in tern to prevent stale files.
            if (isDocumentDirty && previousDocument) {
                const updateFilePromise = this.#updateTernFile(previousDocument);
                updateFilePromise.done(function () {
                    self.#primePump(path, document.isUntitled());
                    addFilesDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                });
            } else {
                addFilesDeferred.resolveWith(null, [this.#_ternNodeDomain]);
            }

            isDocumentDirty = false;
            return;
        }

        if (previousDocument && previousDocument.isDirty) {
            this.#updateTernFile(previousDocument);
        }

        isDocumentDirty = false;
        this.#resolvedFiles = {};
        this.#projectRoot = pr;

        ensurePreferences();
        deferredPreferences!.done(function () {
            if (file instanceof InMemoryFile) {
                self.#initTernServer(pr!, []);
                const hintsPromise = self.#primePump(path, true);
                hintsPromise.done(function () {
                    addFilesDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                });
                return;
            }

            FileSystem.resolve(dir, function (err, directory) {
                if (err) {
                    console.error("Error resolving", dir);
                    addFilesDeferred.resolveWith(null);
                    return;
                }

                directory.getContents(function (err, contents) {
                    if (err) {
                        console.error("Error getting contents for", directory);
                        addFilesDeferred.resolveWith(null);
                        return;
                    }

                    const files = contents
                        .filter(function (entry) {
                            return entry.isFile && !isFileExcluded(entry);
                        })
                        .map(function (entry) {
                            return entry.fullPath;
                        });

                    self.#initTernServer(dir, files);

                    const hintsPromise = self.#primePump(path, false);
                    hintsPromise.done(function () {
                        if (!self.#usingModules()) {
                            // Read the subdirectories of the new file's directory.
                            // Read them first in case there are too many files to
                            // read in the project.
                            self.#addAllFilesAndSubdirectories(dir, function () {
                                // If the file is in the project root, then read
                                // all the files under the project root.
                                const currentDir = (dir + "/");
                                if (self.#projectRoot && currentDir !== self.#projectRoot &&
                                        currentDir.indexOf(self.#projectRoot) === 0) {
                                    self.#addAllFilesAndSubdirectories(self.#projectRoot, function () {
                                        // prime the pump again but this time don't wait
                                        // for completion.
                                        self.#primePump(path, false);
                                        addFilesDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                                    });
                                } else {
                                    addFilesDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                                }
                            });
                        } else {
                            addFilesDeferred.resolveWith(null, [self.#_ternNodeDomain]);
                        }
                    });
                });
            });
        });
    }

    /**
     * Called each time a new editor becomes active.
     *
     * @param {Session} session - the active hinting session (TODO: currently unused by doEditorChange())
     * @param {!Document} document - the document of the editor that has changed
     * @param {?Document} previousDocument - the document of the editor is changing from
     */
    public handleEditorChange(session: Session, document: Document, previousDocument: Document | null): void {
        const self = this;

        if (this.#addFilesPromise === null) {
            this.#doEditorChange(session, document, previousDocument);
        } else {
            this.#addFilesPromise.done(function () {
                self.#doEditorChange(session, document, previousDocument);
            });
        }
    }

    /**
     * Do some cleanup when a project is closed.
     *
     * We can clean up the node tern server we use to calculate hints now, since
     * we know we will need to re-init it in any new project that is opened.
     */
    public resetModule(): void {
        const self = this;

        function resetTernServer(): void {
            if (self.#_ternNodeDomain.ready()) {
                self.#_ternNodeDomain.exec("resetTernServer");
            }
        }

        if (this.#_ternNodeDomain) {
            if (this.#addFilesPromise) {
                // If we're in the middle of added files, don't reset
                // until we're done
                this.#addFilesPromise.done(resetTernServer).fail(resetTernServer);
            } else {
                resetTernServer();
            }
        }
    }

    public whenReady(func): void {
        this.#addFilesPromise!.done(func);
    }
}
// tslint:enable member-access

let resettingDeferred;

/**
 * reset the tern module, if necessary.
 *
 * During debugging, you can turn this automatic resetting behavior off
 * by running this in the console:
 * brackets._configureJSCodeHints({ noReset: true })
 *
 * This function is also used in unit testing with the "force" flag to
 * reset the module for each test to start with a clean environment.
 *
 * @param {Session} session
 * @param {Document} document
 * @param {boolean} force true to force a reset regardless of how long since the last one
 * @return {Promise} Promise resolved when the module is ready.
 *                   The new (or current, if there was no reset) module is passed to the callback.
 */
export function _maybeReset(session: Session, document: Document, force = false): JQueryPromise<TernModule> {
    let newTernModule: TernModule;
    // if we're in the middle of a reset, don't have to check
    // the new module will be online soon
    if (!resettingDeferred) {

        // We don't reset if the debugging flag is set
        // because it's easier to debug if the module isn't
        // getting reset all the time.
        if (currentModule.resetForced || force || (!config.noReset && ++_hintCount > MAX_HINTS)) {
            if (config.debug) {
                console.debug("Resetting tern module");
            }

            resettingDeferred = $.Deferred();
            newTernModule = new TernModule();
            newTernModule.handleEditorChange(session, document, null);
            newTernModule.whenReady(function () {
                // reset the old module
                currentModule.resetModule();
                currentModule = newTernModule;
                resettingDeferred.resolve(currentModule);
                // all done reseting
                resettingDeferred = null;
            });
            _hintCount = 0;
        } else {
            const d = $.Deferred<TernModule>();
            d.resolve(currentModule);
            return d.promise();
        }
    }

    return resettingDeferred.promise();
}

/**
 * Request a parameter hint from Tern.
 *
 * @param {Session} session - the active hinting session
 * @param {{line: number, ch: number}} functionOffset - the offset of the function call.
 * @return {jQuery.Promise} - The promise will not complete until the
 *      hint has completed.
 */
export function requestParameterHint(session: Session, functionOffset: CodeMirror.Position): JQueryPromise<any> {
    const $deferredHints = $.Deferred();
    const fileInfo = getFileInfo(session, true);
    const offset = getOffset(session, fileInfo, functionOffset);
    const fnTypePromise = getTernFunctionType(fileInfo, offset);

    $.when(fnTypePromise).done(
        function (fnType) {
            session.setFnType(fnType);
            session.setFunctionCallPos(functionOffset);
            $deferredHints.resolveWith(null, [fnType]);
        }
    ).fail(function () {
        $deferredHints.reject();
    });

    return $deferredHints.promise();
}

/**
 * Request hints from Tern.
 *
 * Note that successive calls to getScope may return the same objects, so
 * clients that wish to modify those objects (e.g., by annotating them based
 * on some temporary context) should copy them first. See, e.g.,
 * Session.getHints().
 *
 * @param {Session} session - the active hinting session
 * @param {Document} document - the document for which scope info is
 *      desired
 * @return {jQuery.Promise} - The promise will not complete until the tern
 *      hints have completed.
 */
export function requestHints(session: Session, document: Document): JQueryPromise<void> {
    const $deferredHints = $.Deferred<void>();
    const sessionType = session.getType();
    const fileInfo = getFileInfo(session);
    const offset = getOffset(session, fileInfo, null);

    _maybeReset(session, document);

    const hintPromise = getTernHints(fileInfo, offset, sessionType.property);

    $.when(hintPromise).done(
        function (completions, fnType) {
            if (completions.completions) {
                session.setTernHints(completions.completions);
                session.setGuesses(null);
            } else {
                session.setTernHints([]);
                session.setGuesses(completions.properties);
            }

            $deferredHints.resolveWith(null);
        }
    ).fail(function () {
        $deferredHints.reject();
    });

    return $deferredHints.promise();
}

/**
 *  Track the update area of the current document so we can tell if we can send
 *  partial updates to tern or not.
 *
 * @param {Array.<{from: {line:number, ch: number}, to: {line:number, ch: number},
 *     text: Array<string>}>} changeList - the document changes from the current change event
 */
function trackChange(changeList: Array<EditorChange>): void {
    let changed = documentChanges;

    if (changed === null) {
        documentChanges = changed = {from: changeList[0].from.line, to: changeList[0].from.line};
        if (config.debug) {
            console.debug("ScopeManager: document has changed");
        }
    }

    for (const thisChange of changeList) {
        const end = thisChange.from.line + (thisChange.text.length - 1);
        if (thisChange.from.line < changed.to) {
            changed.to = changed.to - (thisChange.to.line - end);
        }

        if (end >= changed.to) {
            changed.to = end + 1;
        }

        if (changed.from > thisChange.from.line) {
            changed.from = thisChange.from.line;
        }
    }
}

/*
    * Called each time the file associated with the active editor changes.
    * Marks the file as being dirty.
    *
    * @param {from: {line:number, ch: number}, to: {line:number, ch: number}}
    */
export function handleFileChange(changeList: Array<EditorChange>): void {
    isDocumentDirty = true;
    trackChange(changeList);
}

/**
 * Called each time a new editor becomes active.
 *
 * @param {Session} session - the active hinting session
 * @param {Document} document - the document of the editor that has changed
 * @param {?Document} previousDocument - the document of the editor is changing from
 */
export function handleEditorChange(session: Session, document: Document, previousDocument: Document): void {

    if (!currentModule) {
        currentModule = new TernModule();
    }

    return currentModule.handleEditorChange(session, document, previousDocument);
}

/**
 * Do some cleanup when a project is closed.
 * Clean up previous analysis data from the module
 */
export function handleProjectClose(): void {
    if (currentModule) {
        currentModule.resetModule();
    }
}

/**
 *  Read in project preferences when a new project is opened.
 *  Look in the project root directory for a preference file.
 *
 *  @param {string=} projectRootPath - new project root path(optional).
 *  Only needed for unit tests.
 */
export function handleProjectOpen(projectRootPath?: string): void {
    initPreferences(projectRootPath);
}

/** Used to avoid timing bugs in unit tests */
export function _readyPromise(): JQueryDeferred<void> | null {
    return deferredPreferences;
}

/**
 * @private
 *
 * Update the configuration in the tern node domain.
 */
export function _setConfig(configUpdate): void {
    config = brackets._configureJSCodeHints.config;
    postMessage({
        type: MessageIds.SET_CONFIG,
        config: configUpdate
    });
}
