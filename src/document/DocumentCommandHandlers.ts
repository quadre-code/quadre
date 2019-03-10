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

/*jslint regexp: true */

// Load dependent modules
import * as AppInit from "utils/AppInit";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as DeprecationWarning from "utils/DeprecationWarning";
import * as ProjectManager from "project/ProjectManager";
import * as DocumentManager from "document/DocumentManager";
import * as MainViewManager from "view/MainViewManager";
import * as EditorManager from "editor/EditorManager";
import * as FileSystem from "filesystem/FileSystem";
import File = require("filesystem/File");
import FileSystemError = require("filesystem/FileSystemError");
import * as FileUtils from "file/FileUtils";
import * as FileViewController from "project/FileViewController";
import InMemoryFile = require("document/InMemoryFile");
import * as StringUtils from "utils/StringUtils";
import * as Async from "utils/Async";
import * as HealthLogger from "utils/HealthLogger";
import * as Dialogs from "widgets/Dialogs";
import * as DefaultDialogs from "widgets/DefaultDialogs";
import * as Strings from "strings";
import * as PopUpManager from "widgets/PopUpManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as PerfUtils from "utils/PerfUtils";
import * as KeyEvent from "utils/KeyEvent";
import * as Inspector from "LiveDevelopment/Inspector/Inspector";
import * as Menus from "command/Menus";
import { UrlParams } from "utils/UrlParams";
import * as StatusBar from "widgets/StatusBar";
import * as WorkspaceManager from "view/WorkspaceManager";
import * as LanguageManager from "language/LanguageManager";
import * as _ from "lodash";

import { DispatcherEvents } from "utils/EventDispatcher";

/**
 * Handlers for commands related to document handling (opening, saving, etc.)
 */

/**
 * Instance of the App and BrowserWindow object provided by Electron
 */
const browserWindow = electron.remote.getCurrentWindow();

/**
 * Container for label shown above editor; must be an inline element
 * @type {jQueryObject}
 */
let _$title;

/**
 * Container for dirty dot; must be an inline element
 * @type {jQueryObject}
 */
let _$dirtydot;

/**
 * Container for _$title; need not be an inline element
 * @type {jQueryObject}
 */
let _$titleWrapper;

/**
 * Label shown above editor for current document: filename and potentially some of its path
 * @type {string}
 */
let _currentTitlePath = null;

/**
 * Determine the dash character for each platform. Use emdash on Mac
 * and a standard dash on all other platforms.
 * @type {string}
 */
const _osDash = brackets.platform === "mac" ? "\u2014" : "-";

/**
 * String template for window title when no file is open.
 * @type {string}
 */
const WINDOW_TITLE_STRING_NO_DOC = "{0} " + _osDash + " {1}";

/**
 * String template for window title when a file is open.
 * @type {string}
 */
const WINDOW_TITLE_STRING_DOC = "{0} ({1}) " + _osDash + " {2}";

/**
 * Container for _$titleWrapper; if changing title changes this element's height, must kick editor to resize
 * @type {jQueryObject}
 */
let _$titleContainerToolbar;

/**
 * Last known height of _$titleContainerToolbar
 * @type {number}
 */
let _lastToolbarHeight = null;

/**
 * index to use for next, new Untitled document
 * @type {number}
 */
let _nextUntitledIndexToUse = 1;

/**
 * prevents reentrancy of browserReload()
 * @type {boolean}
 */
let _isReloading = false;

/** Unique token used to indicate user-driven cancellation of Save As (as opposed to file IO error) */
const USER_CANCELED = { userCanceled: true };

PreferencesManager.definePreference("defaultExtension", "string", "", {
    excludeFromHints: true
});

/**
 * Updates the title bar with new file title or dirty indicator
 * @private
 */
function _updateTitle() {
    const currentDoc          = DocumentManager.getCurrentDocument();
    let windowTitle         = brackets.config.app_title;
    const currentlyViewedPath = MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE);

    if (!brackets.nativeMenus) {
        if (currentlyViewedPath) {
            _$title.text(_currentTitlePath);
            _$title.attr("title", currentlyViewedPath);
            if (currentDoc) {
                // dirty dot is always in DOM so layout doesn't change, and visibility is toggled
                _$dirtydot.css("visibility", (currentDoc.isDirty) ? "visible" : "hidden");
            } else {
                // hide dirty dot if there is no document
                _$dirtydot.css("visibility", "hidden");
            }
        } else {
            _$title.text("");
            _$title.attr("title", "");
            _$dirtydot.css("visibility", "hidden");
        }

        // Set _$titleWrapper to a fixed width just large enough to accommodate _$title. This seems equivalent to what
        // the browser would do automatically, but the CSS trick we use for layout requires _$titleWrapper to have a
        // fixed width set on it (see the "#titlebar" CSS rule for details).
        _$titleWrapper.css("width", "");
        const newWidth = _$title.width();
        _$titleWrapper.css("width", newWidth);

        // Changing the width of the title may cause the toolbar layout to change height, which needs to resize the
        // editor beneath it (toolbar changing height due to window resize is already caught by EditorManager).
        const newToolbarHeight = _$titleContainerToolbar.height();
        if (_lastToolbarHeight !== newToolbarHeight) {
            _lastToolbarHeight = newToolbarHeight;
            WorkspaceManager.recomputeLayout();
        }
    }

    if (brackets.platform === "mac") {
        if (!currentDoc) {
            browserWindow.setRepresentedFilename("");
        } else if (!currentDoc.isDirty) {
            browserWindow.setDocumentEdited(false);
        }
    }

    const projectRoot = ProjectManager.getProjectRoot();
    if (projectRoot) {
        const projectName = projectRoot.name;
        // Construct shell/browser window title, e.g. "• index.html (myProject) — Brackets"
        if (currentlyViewedPath) {
            windowTitle = StringUtils.format(WINDOW_TITLE_STRING_DOC, _currentTitlePath, projectName, brackets.config.app_title);
            // Display dirty dot when there are unsaved changes
            if (currentDoc && currentDoc.isDirty) {
                if (brackets.platform === "mac") {
                    browserWindow.setDocumentEdited(true);
                } else {
                    windowTitle = "• " + windowTitle;
                }
            }

            // macOS have a proxy icon for document window in window title
            if (currentDoc && brackets.platform === "mac") {
                browserWindow.setRepresentedFilename(currentDoc.file.fullPath);
            }

        } else {
            // A document is not open
            windowTitle = StringUtils.format(WINDOW_TITLE_STRING_NO_DOC, projectName, brackets.config.app_title);
        }
    }
    window.document.title = windowTitle;
}

/**
 * Returns a short title for a given document.
 *
 * @param {Document} doc - the document to compute the short title for
 * @return {string} - a short title for doc.
 */
function _shortTitleForDocument(doc) {
    const fullPath = doc.file.fullPath;

    // If the document is untitled then return the filename, ("Untitled-n.ext");
    // otherwise show the project-relative path if the file is inside the
    // current project or the full absolute path if it's not in the project.
    if (doc.isUntitled()) {
        return fullPath.substring(fullPath.lastIndexOf("/") + 1);
    }

    return ProjectManager.makeProjectRelativeIfPossible(fullPath);
}

/**
 * Handles currentFileChange and filenameChanged events and updates the titlebar
 */
function handleCurrentFileChange() {
    const newFile = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);

    if (newFile) {
        const newDocument = DocumentManager.getOpenDocumentForPath(newFile.fullPath);

        if (newDocument) {
            _currentTitlePath = _shortTitleForDocument(newDocument);
        } else {
            _currentTitlePath = ProjectManager.makeProjectRelativeIfPossible(newFile.fullPath);
        }
    } else {
        _currentTitlePath = null;
    }

    // Update title text & "dirty dot" display
    _updateTitle();
}

/**
 * Handles dirtyFlagChange event and updates the title bar if necessary
 */
function handleDirtyChange(event, changedDoc) {
    const currentDoc = DocumentManager.getCurrentDocument();

    if (currentDoc && changedDoc.file.fullPath === currentDoc.file.fullPath) {
        _updateTitle();
    }
}

/**
 * Shows an error dialog indicating that the given file could not be opened due to the given error
 * @param {!FileSystemError} name
 * @return {!Dialog}
 */
export function showFileOpenError(name, path) {
    return Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_ERROR,
        Strings.ERROR_OPENING_FILE_TITLE,
        StringUtils.format(
            Strings.ERROR_OPENING_FILE,
            StringUtils.breakableUrl(path),
            FileUtils.getFileErrorString(name)
        )
    );
}

/**
 * @private
 * Creates a document and displays an editor for the specified file path.
 * @param {!string} fullPath
 * @param {boolean=} silent If true, don't show error message
 * @param {string=} paneId, the id oi the pane in which to open the file. Can be undefined, a valid pane id or ACTIVE_PANE.
 * @param {{*}=} options, command options
 * @return {$.Promise} a jQuery promise that will either
 * - be resolved with a file for the specified file path or
 * - be rejected with FileSystemError if the file can not be read.
 * If paneId is undefined, the ACTIVE_PANE constant
 */
function _doOpen(fullPath, silent, paneId, options) {
    const result = $.Deferred<File>();

    // workaround for https://github.com/adobe/brackets/issues/6001
    // TODO should be removed once bug is closed.
    // if we are already displaying a file do nothing but resolve immediately.
    // this fixes timing issues in test cases.
    if (MainViewManager.getCurrentlyViewedPath(paneId || MainViewManager.ACTIVE_PANE) === fullPath) {
        const currentlyViewedFile = MainViewManager.getCurrentlyViewedFile(paneId || MainViewManager.ACTIVE_PANE)!;
        result.resolve(currentlyViewedFile);
        return result.promise();
    }

    function _cleanup(fileError, fullFilePath) {
        if (fullFilePath) {
            // For performance, we do lazy checking of file existence, so it may be in workingset
            MainViewManager._removeView(paneId, FileSystem.getFileForPath(fullFilePath));
            MainViewManager.focusActivePane();
        }
        result.reject(fileError);
    }
    function _showErrorAndCleanUp(fileError, fullFilePath) {
        if (silent) {
            _cleanup(fileError, fullFilePath);
        } else {
            showFileOpenError(fileError, fullFilePath).done(function () {
                _cleanup(fileError, fullFilePath);
            });
        }
    }

    if (!fullPath) {
        throw new Error("_doOpen() called without fullPath");
    } else {
        const perfTimerName = PerfUtils.markStart("Open File:\t" + fullPath);
        result.always(function () {
            PerfUtils.addMeasurement(perfTimerName);
        });

        const file = FileSystem.getFileForPath(fullPath);
        MainViewManager._open(paneId, file, options)
            .done(function () {
                result.resolve(file);
            })
            .fail(function (fileError) {
                _showErrorAndCleanUp(fileError, fullPath);
                result.reject();
            });
    }

    return result.promise();
}

/**
 * @private
 * Used to track the default directory for the file open dialog
 */
let _defaultOpenDialogFullPath: string | null = null;

/**
 * @private
 * Opens a file and displays its view (editor, image view, etc...) for the specified path.
 * If no path is specified, a file prompt is provided for input.
 * @param {?string} fullPath - The path of the file to open; if it's null we'll prompt for it
 * @param {boolean=} silent - If true, don't show error message
 * @param {string=}  paneId - the pane in which to open the file. Can be undefined, a valid pane id or ACTIVE_PANE
 * @param {{*}=} options - options to pass to MainViewManager._open
 * @return {$.Promise} a jQuery promise resolved with a Document object or
 *                      rejected with an err
 */
function _doOpenWithOptionalPath(fullPath, silent, paneId, options) {
    let result;
    paneId = paneId || MainViewManager.ACTIVE_PANE;
    if (!fullPath) {
        // Create placeholder deferred
        result = $.Deferred();

        // first time through, default to the current project path
        if (!_defaultOpenDialogFullPath) {
            _defaultOpenDialogFullPath = ProjectManager.getProjectRoot()!.fullPath;
        }
        // Prompt the user with a dialog
        FileSystem.showOpenDialog(true, false, Strings.OPEN_FILE, _defaultOpenDialogFullPath, null, function (err, paths) {
            if (!err) {
                if (paths.length > 0) {
                    // Add all files to the workingset without verifying that
                    // they still exist on disk (for faster opening)
                    const filesToOpen: Array<File> = [];

                    paths.forEach(function (path) {
                        filesToOpen.push(FileSystem.getFileForPath(path));
                    });
                    MainViewManager.addListToWorkingSet(paneId, filesToOpen);

                    _doOpen(paths[paths.length - 1], silent, paneId, options)
                        .done(function (file) {
                            _defaultOpenDialogFullPath =
                                FileUtils.getDirectoryPath(
                                    MainViewManager.getCurrentlyViewedPath(paneId)
                                );
                        })
                        // Send the resulting document that was opened
                        .then(result.resolve, result.reject);
                } else {
                    // Reject if the user canceled the dialog
                    result.reject();
                }
            }
        });
    } else {
        result = _doOpen(fullPath, silent, paneId, options);
    }

    return result.promise();
}

interface PathPart {
    path: string;
    line: number | null;
    column: number | null;
}

/**
 * @private
 * Splits a decorated file path into its parts.
 * @param {?string} path - a string of the form "fullpath[:lineNumber[:columnNumber]]"
 * @return {{path: string, line: ?number, column: ?number}}
 */
export function _parseDecoratedPath(path) {
    const result: PathPart = {path: path, line: null, column: null};
    if (path) {
        // If the path has a trailing :lineNumber and :columnNumber, strip
        // these off and assign to result.line and result.column.
        const matchResult = /(.+?):([0-9]+)(:([0-9]+))?$/.exec(path);
        if (matchResult) {
            result.path = matchResult[1];
            if (matchResult[2]) {
                result.line = parseInt(matchResult[2], 10);
            }
            if (matchResult[4]) {
                result.column = parseInt(matchResult[4], 10);
            }
        }
    }
    return result;
}

/**
 * @typedef {{fullPath:?string=, silent:boolean=, paneId:string=}} FileCommandData
 * fullPath: is in the form "path[:lineNumber[:columnNumber]]"
 * lineNumber and columnNumber are 1-origin: lines and columns are 1-based
 */

/**
 * @typedef {{fullPath:?string=, index:number=, silent:boolean=, forceRedraw:boolean=, paneId:string=}} PaneCommandData
 * fullPath: is in the form "path[:lineNumber[:columnNumber]]"
 * lineNumber and columnNumber are 1-origin: lines and columns are 1-based
 */

/**
 * Opens the given file and makes it the current file. Does NOT add it to the workingset.
 * @param {FileCommandData=} commandData - record with the following properties:
 *   fullPath: File to open;
 *   silent: optional flag to suppress error messages;
 *   paneId: optional PaneId (defaults to active pane)
 * @return {$.Promise} a jQuery promise that will be resolved with a file object
 */
function handleFileOpen(commandData): JQueryPromise<File> {
    const fileInfo = _parseDecoratedPath(commandData ? commandData.fullPath : null);
    const silent = (commandData && commandData.silent) || false;
    const paneId = (commandData && commandData.paneId) || MainViewManager.ACTIVE_PANE;
    const result = $.Deferred<File>();

    _doOpenWithOptionalPath(fileInfo.path, silent, paneId, commandData && commandData.options)
        .done(function (file) {
            HealthLogger.fileOpened(file._path);
            if (!commandData || !commandData.options || !commandData.options.noPaneActivate) {
                MainViewManager.setActivePaneId(paneId);
            }

            // If a line and column number were given, position the editor accordingly.
            if (fileInfo.line !== null) {
                if (fileInfo.column === null || (fileInfo.column <= 0)) {
                    fileInfo.column = 1;
                }

                // setCursorPos expects line/column numbers as 0-origin, so we subtract 1
                EditorManager
                    .getCurrentFullEditor()
                    .setCursorPos(
                        fileInfo.line - 1,
                        fileInfo.column - 1,
                        true
                    );
            }

            result.resolve(file);
        })
        .fail(function (err) {
            result.reject(err);
        });

    return result;
    // Testing notes: here are some recommended manual tests for handleFileOpen, on Macintosh.
    // Do all tests with brackets already running, and also with brackets not already running.
    //
    // drag a file onto brackets icon in desktop (this uses undecorated paths)
    // drag a file onto brackets icon in taskbar (this uses undecorated paths)
    // open a file from brackets sidebar (this uses undecorated paths)
    // from command line: ...../Brackets.app/Contents path         - where 'path' is undecorated
    // from command line: ...../Brackets.app path                  - where 'path' has the form "path:line"
    // from command line: ...../Brackets.app path                  - where 'path' has the form "path:line:column"
    // from command line: open -a ...../Brackets.app path          - where 'path' is undecorated
    // do "View Source" from Adobe Scout version 1.2 or newer (this will use decorated paths of the form "path:line:column")
}

/**
 * Opens the given file, makes it the current file, does NOT add it to the workingset
 * @param {FileCommandData} commandData
 *   fullPath: File to open;
 *   silent: optional flag to suppress error messages;
 *   paneId: optional PaneId (defaults to active pane)
 * @return {$.Promise} a jQuery promise that will be resolved with @type {Document}
 */
function handleDocumentOpen(commandData) {
    const result = $.Deferred<DocumentManager.Document | null>();
    handleFileOpen(commandData)
        .done(function (file) {
            // if we succeeded with an open file
            //  then we need to resolve that to a document.
            //  getOpenDocumentForPath will return null if there isn't a
            //  supporting document for that file (e.g. an image)
            const doc = DocumentManager.getOpenDocumentForPath(file!.fullPath);
            result.resolve(doc);
        })
        .fail(function (err) {
            result.reject(err);
        });

    return result.promise();

}

/**
 * Opens the given file, makes it the current file, AND adds it to the workingset
 * @param {!PaneCommandData} commandData - record with the following properties:
 *   fullPath: File to open;
 *   index: optional index to position in workingset (defaults to last);
 *   silent: optional flag to suppress error messages;
 *   forceRedraw: flag to force the working set view redraw;
 *   paneId: optional PaneId (defaults to active pane)
 * @return {$.Promise} a jQuery promise that will be resolved with a @type {File}
 */
function handleFileAddToWorkingSetAndOpen(commandData) {
    return handleFileOpen(commandData).done(function (file) {
        const paneId = (commandData && commandData.paneId) || MainViewManager.ACTIVE_PANE;
        MainViewManager.addToWorkingSet(paneId, file, commandData.index, commandData.forceRedraw);
        HealthLogger.fileOpened(file!.fullPath, true);
    });
}

/**
 * @deprecated
 * Opens the given file, makes it the current document, AND adds it to the workingset
 * @param {!PaneCommandData} commandData - record with the following properties:
 *   fullPath: File to open;
 *   index: optional index to position in workingset (defaults to last);
 *   silent: optional flag to suppress error messages;
 *   forceRedraw: flag to force the working set view redraw;
 *   paneId: optional PaneId (defaults to active pane)
 * @return {$.Promise} a jQuery promise that will be resolved with @type {File}
 */
function handleFileAddToWorkingSet(commandData) {
    // This is a legacy deprecated command that
    //  will use the new command and resolve with a document
    //  as the legacy command would only support.
    DeprecationWarning.deprecationWarning("Commands.FILE_ADD_TO_WORKING_SET has been deprecated.  Use Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN instead.");
    const result = $.Deferred<DocumentManager.Document | null>();

    handleFileAddToWorkingSetAndOpen(commandData)
        .done(function (file) {
            // if we succeeded with an open file
            //  then we need to resolve that to a document.
            //  getOpenDocumentForPath will return null if there isn't a
            //  supporting document for that file (e.g. an image)
            const doc = DocumentManager.getOpenDocumentForPath(file!.fullPath);
            result.resolve(doc);
        })
        .fail(function (err) {
            result.reject(err);
        });

    return result.promise();
}

/**
 * @private
 * Ensures the suggested file name doesn't already exit.
 * @param {Directory} dir  The directory to use
 * @param {string} baseFileName  The base to start with, "-n" will get appended to make unique
 * @param {boolean} isFolder True if the suggestion is for a folder name
 * @return {$.Promise} a jQuery promise that will be resolved with a unique name starting with
 *   the given base name
 */
function _getUntitledFileSuggestion(dir, baseFileName, isFolder) {
    const suggestedName   = baseFileName + "-" + _nextUntitledIndexToUse++;
    const deferred        = $.Deferred();

    if (_nextUntitledIndexToUse > 9999) {
        // we've tried this enough
        deferred.reject();
    } else {
        const path = dir.fullPath + suggestedName;
        const entry = isFolder
            ? FileSystem.getDirectoryForPath(path)
            : FileSystem.getFileForPath(path);

        entry.exists(function (err, exists) {
            if (err || exists) {
                _getUntitledFileSuggestion(dir, baseFileName, isFolder)
                    .then(deferred.resolve, deferred.reject);
            } else {
                deferred.resolve(suggestedName);
            }
        });
    }

    return deferred.promise();
}

/**
 * Prevents re-entrancy into handleFileNewInProject()
 *
 * handleFileNewInProject() first prompts the user to name a file and then asynchronously writes the file when the
 * filename field loses focus. This boolean prevent additional calls to handleFileNewInProject() when an existing
 * file creation call is outstanding
 */
let fileNewInProgress = false;

/**
 * Bottleneck function for creating new files and folders in the project tree.
 * @private
 * @param {boolean} isFolder - true if creating a new folder, false if creating a new file
 */
function _handleNewItemInProject(isFolder) {
    if (fileNewInProgress) {
        ProjectManager.forceFinishRename();
        return;
    }
    fileNewInProgress = true;

    // Determine the directory to put the new file
    // If a file is currently selected in the tree, put it next to it.
    // If a directory is currently selected in the tree, put it in it.
    // If an Untitled document is selected or nothing is selected in the tree, put it at the root of the project.
    // (Note: 'selected' may be an item that's selected in the workingset and not the tree; but in that case
    // ProjectManager.createNewItem() ignores the baseDir we give it and falls back to the project root on its own)
    let baseDirEntry;
    let selected = ProjectManager.getSelectedItem();
    if ((!selected) || (selected instanceof InMemoryFile)) {
        selected = ProjectManager.getProjectRoot();
    }

    if (selected.isFile) {
        baseDirEntry = FileSystem.getDirectoryForPath(selected.parentPath);
    }

    baseDirEntry = baseDirEntry || selected;

    // Create the new node. The createNewItem function does all the heavy work
    // of validating file name, creating the new file and selecting.
    function createWithSuggestedName(suggestedName) {
        return ProjectManager.createNewItem(baseDirEntry, suggestedName, false, isFolder)
            .always(function () { fileNewInProgress = false; });
    }

    return _getUntitledFileSuggestion(baseDirEntry, Strings.UNTITLED, isFolder)
        .then(createWithSuggestedName, createWithSuggestedName.bind(undefined, Strings.UNTITLED));
}

/**
 * Create a new untitled document in the workingset, and make it the current document.
 * Promise is resolved (synchronously) with the newly-created Document.
 */
function handleFileNew() {
    // var defaultExtension = PreferencesManager.get("defaultExtension");
    // if (defaultExtension) {
    //     defaultExtension = "." + defaultExtension;
    // }
    const defaultExtension = "";  // disable preference setting for now

    const doc = DocumentManager.createUntitledDocument(_nextUntitledIndexToUse++, defaultExtension);
    MainViewManager._edit(MainViewManager.ACTIVE_PANE, doc);

    return $.Deferred().resolve(doc).promise();
}

/**
 * Create a new file in the project tree.
 */
function handleFileNewInProject() {
    _handleNewItemInProject(false);
}

/**
 * Create a new folder in the project tree.
 */
function handleNewFolderInProject() {
    _handleNewItemInProject(true);
}

/**
 * @private
 * Shows an Error modal dialog
 * @param {string} name
 * @param {string} path
 * @return {Dialog}
 */
function _showSaveFileError(name, path) {
    return Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_ERROR,
        Strings.ERROR_SAVING_FILE_TITLE,
        StringUtils.format(
            Strings.ERROR_SAVING_FILE,
            StringUtils.breakableUrl(path),
            FileUtils.getFileErrorString(name)
        )
    );
}

/**
 * Saves a document to its existing path. Does NOT support untitled documents.
 * @param {!Document} docToSave
 * @param {boolean=} force Ignore CONTENTS_MODIFIED errors from the FileSystem
 * @return {$.Promise} a promise that is resolved with the File of docToSave (to mirror
 *   the API of _doSaveAs()). Rejected in case of IO error (after error dialog dismissed).
 */
function doSave(docToSave, force = false): JQueryPromise<File> {
    const result = $.Deferred<File>();
    const file = docToSave.file;

    function handleError(error) {
        _showSaveFileError(error, file.fullPath)
            .done(function () {
                result.reject(error);
            });
    }

    function handleContentsModified() {
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.EXT_MODIFIED_TITLE,
            StringUtils.format(
                Strings.EXT_MODIFIED_WARNING,
                StringUtils.breakableUrl(docToSave.file.fullPath)
            ),
            [
                {
                    className : Dialogs.DIALOG_BTN_CLASS_LEFT,
                    id        : Dialogs.DIALOG_BTN_SAVE_AS,
                    text      : Strings.SAVE_AS
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id        : Dialogs.DIALOG_BTN_CANCEL,
                    text      : Strings.CANCEL
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id        : Dialogs.DIALOG_BTN_OK,
                    text      : Strings.SAVE_AND_OVERWRITE
                }
            ]
        )
            .done(function (id) {
                if (id === Dialogs.DIALOG_BTN_CANCEL) {
                    result.reject();
                } else if (id === Dialogs.DIALOG_BTN_OK) {
                    // Re-do the save, ignoring any CONTENTS_MODIFIED errors
                    doSave(docToSave, true).then(result.resolve, result.reject);
                } else if (id === Dialogs.DIALOG_BTN_SAVE_AS) {
                    // Let the user choose a different path at which to write the file
                    handleFileSaveAs({doc: docToSave}).then(result.resolve, result.reject);
                }
            });
    }

    function trySave() {
        // We don't want normalized line endings, so it's important to pass true to getText()
        FileUtils.writeText(file, docToSave.getText(true), force)
            .done(function () {
                docToSave.notifySaved();
                result.resolve(file);
            })
            .fail(function (err) {
                if (err === FileSystemError.CONTENTS_MODIFIED) {
                    handleContentsModified();
                } else {
                    handleError(err);
                }
            });
    }

    if (docToSave.isDirty) {
        if (docToSave.keepChangesTime) {
            // The user has decided to keep conflicting changes in the editor. Check to make sure
            // the file hasn't changed since they last decided to do that.
            docToSave.file.stat(function (err, stat) {
                // If the file has been deleted on disk, the stat will return an error, but that's fine since
                // that means there's no file to overwrite anyway, so the save will succeed without us having
                // to set force = true.
                if (!err && docToSave.keepChangesTime === stat.mtime.getTime()) {
                    // OK, it's safe to overwrite the file even though we never reloaded the latest version,
                    // since the user already said s/he wanted to ignore the disk version.
                    force = true;
                }
                trySave();
            });
        } else {
            trySave();
        }
    } else {
        result.resolve(file);
    }
    result.always(function () {
        MainViewManager.focusActivePane();
    });
    return result.promise();
}

/**
 * Reverts the Document to the current contents of its file on disk. Discards any unsaved changes
 * in the Document.
 * @private
 * @param {Document} doc
 * @param {boolean=} suppressError If true, then a failure to read the file will be ignored and the
 *      resulting promise will be resolved rather than rejected.
 * @return {$.Promise} a Promise that's resolved when done, or (if suppressError is false)
 *      rejected with a FileSystemError if the file cannot be read (after showing an error
 *      dialog to the user).
 */
function _doRevert(doc, suppressError = false) {
    const result = $.Deferred();

    FileUtils.readAsText(doc.file)
        .done(function (text, readTimestamp) {
            doc.refreshText(text, readTimestamp);
            result.resolve();
        })
        .fail(function (error) {
            if (suppressError) {
                result.resolve();
            } else {
                showFileOpenError(error, doc.file.fullPath)
                    .done(function () {
                        result.reject(error);
                    });
            }
        });

    return result.promise();
}

/**
 * Opens the native OS save as dialog and saves document.
 * The original document is reverted in case it was dirty.
 * Text selection and cursor position from the original document
 * are preserved in the new document.
 * When saving to the original document the document is saved as if save was called.
 * @param {Document} doc
 * @param {?{cursorPos:!Object, selection:!Object, scrollPos:!Object}} settings - properties of
 *      the original document's editor that need to be carried over to the new document
 *      i.e. scrollPos, cursorPos and text selection
 * @return {$.Promise} a promise that is resolved with the saved document's File. Rejected in
 *   case of IO error (after error dialog dismissed), or if the Save dialog was canceled.
 */
function _doSaveAs(doc, settings): JQueryPromise<File> {
    let origPath;
    let saveAsDefaultPath;
    let defaultName;
    const result = $.Deferred<File>();

    function _doSaveAfterSaveDialog(path) {
        // Reconstruct old doc's editor's view state, & finally resolve overall promise
        function _configureEditorAndResolve() {
            const editor = EditorManager.getActiveEditor();
            if (editor) {
                if (settings) {
                    editor.setSelections(settings.selections);
                    editor.setScrollPos(settings.scrollPos.x, settings.scrollPos.y);
                }
            }
            result.resolve(newFile);
        }

        // Replace old document with new one in open editor & workingset
        function openNewFile() {
            let fileOpenPromise;

            if (FileViewController.getFileSelectionFocus() === FileViewController.PROJECT_MANAGER) {
                // If selection is in the tree, leave workingset unchanged - even if orig file is in the list
                fileOpenPromise = FileViewController
                    .openAndSelectDocument(path, FileViewController.PROJECT_MANAGER);
            } else {
                // If selection is in workingset, replace orig item in place with the new file
                const info = MainViewManager.findInAllWorkingSets(doc.file.fullPath).shift()!;

                // Remove old file from workingset; no redraw yet since there's a pause before the new file is opened
                MainViewManager._removeView(info.paneId, doc.file, true);

                // Add new file to workingset, and ensure we now redraw (even if index hasn't changed)
                fileOpenPromise = handleFileAddToWorkingSetAndOpen({fullPath: path, paneId: info.paneId, index: info.index, forceRedraw: true});
            }

            // always configure editor after file is opened
            fileOpenPromise.always(function () {
                _configureEditorAndResolve();
            });
        }

        // Same name as before - just do a regular Save
        if (path === origPath) {
            doSave(doc).then(result.resolve, result.reject);
            return;
        }

        doc.isSaving = true;    // mark that we're saving the document

        // First, write document's current text to new file
        const newFile = FileSystem.getFileForPath(path);

        // Save as warns you when you're about to overwrite a file, so we
        // explicitly allow "blind" writes to the filesystem in this case,
        // ignoring warnings about the contents being modified outside of
        // the editor.
        FileUtils.writeText(newFile, doc.getText(true), true)
            .done(function () {
                // If there were unsaved changes before Save As, they don't stay with the old
                // file anymore - so must revert the old doc to match disk content.
                // Only do this if the doc was dirty: _doRevert on a file that is not dirty and
                // not in the workingset has the side effect of adding it to the workingset.
                if (doc.isDirty && !(doc.isUntitled())) {
                    // if the file is dirty it must be in the workingset
                    // _doRevert is side effect free in this case
                    _doRevert(doc).always(openNewFile);
                } else {
                    openNewFile();
                }
            })
            .fail(function (error) {
                _showSaveFileError(error, path)
                    .done(function () {
                        result.reject(error);
                    });
            })
            .always(function () {
                // mark that we're done saving the document
                doc.isSaving = false;
            });
    }

    if (doc) {
        origPath = doc.file.fullPath;
        // If the document is an untitled document, we should default to project root.
        if (doc.isUntitled()) {
            // (Issue #4489) if we're saving an untitled document, go ahead and switch to this document
            //   in the editor, so that if we're, for example, saving several files (ie. Save All),
            //   then the user can visually tell which document we're currently prompting them to save.
            const info = MainViewManager.findInAllWorkingSets(origPath).shift();

            if (info) {
                MainViewManager._open(info.paneId, doc.file);
            }

            // If the document is untitled, default to project root.
            saveAsDefaultPath = ProjectManager.getProjectRoot()!.fullPath;
        } else {
            saveAsDefaultPath = FileUtils.getDirectoryPath(origPath);
        }
        defaultName = FileUtils.getBaseName(origPath);
        const file = FileSystem.getFileForPath(origPath);
        if (file instanceof InMemoryFile) {
            const language = LanguageManager.getLanguageForPath(origPath);
            if (language) {
                const fileExtensions = language.getFileExtensions();
                if (fileExtensions && fileExtensions.length > 0) {
                    defaultName += "." + fileExtensions[0];
                }
            }
        }
        FileSystem.showSaveDialog(Strings.SAVE_FILE_AS, saveAsDefaultPath, defaultName, function (err, selectedPath) {
            if (!err) {
                if (selectedPath) {
                    _doSaveAfterSaveDialog(selectedPath);
                } else {
                    result.reject(USER_CANCELED);
                }
            } else {
                result.reject(err);
            }
        });
    } else {
        result.reject();
    }
    return result.promise();
}

/**
 * Saves the given file. If no file specified, assumes the current document.
 * @param {?{doc: ?Document}} commandData  Document to close, or null
 * @return {$.Promise} resolved with the saved document's File (which MAY DIFFER from the doc
 *   passed in, if the doc was untitled). Rejected in case of IO error (after error dialog
 *   dismissed), or if doc was untitled and the Save dialog was canceled (will be rejected with
 *   USER_CANCELED object).
 */
function handleFileSave(commandData): JQueryPromise<File> {
    const activeEditor = EditorManager.getActiveEditor()!;
    const activeDoc = activeEditor && activeEditor.document;
    const doc = (commandData && commandData.doc) || activeDoc;
    let settings;

    if (doc && !doc.isSaving) {
        if (doc.isUntitled()) {
            if (doc === activeDoc) {
                settings = {
                    selections: activeEditor.getSelections(),
                    scrollPos: activeEditor.getScrollPos()
                };
            }

            return _doSaveAs(doc, settings);
        }

        return doSave(doc);
    }

    return $.Deferred<File>().reject().promise();
}

/**
 * Saves all unsaved documents corresponding to 'fileList'. Returns a Promise that will be resolved
 * once ALL the save operations have been completed. If ANY save operation fails, an error dialog is
 * immediately shown but after dismissing we continue saving the other files; after all files have
 * been processed, the Promise is rejected if any ONE save operation failed (the error given is the
 * first one encountered). If the user cancels any Save As dialog (for untitled files), the
 * Promise is immediately rejected.
 *
 * @param {!Array.<File>} fileList
 * @return {!$.Promise} Resolved with {!Array.<File>}, which may differ from 'fileList'
 *      if any of the files were Unsaved documents. Or rejected with {?FileSystemError}.
 */
function _saveFileList(fileList) {
    // Do in serial because doSave shows error UI for each file, and we don't want to stack
    // multiple dialogs on top of each other
    let userCanceled = false;
    const filesAfterSave: Array<File> = [];

    return Async.doSequentially(
        fileList,
        function (file) {
            // Abort remaining saves if user canceled any Save As dialog
            if (userCanceled) {
                return ($.Deferred()).reject().promise();
            }

            const doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
            if (doc) {
                const savePromise = handleFileSave({doc: doc});
                savePromise
                    .done(function (newFile) {
                        filesAfterSave.push(newFile!);
                    })
                    .fail(function (error) {
                        if (error === USER_CANCELED) {
                            userCanceled = true;
                        }
                    });
                return savePromise;
            }

            // workingset entry that was never actually opened - ignore
            filesAfterSave.push(file);
            return ($.Deferred()).resolve().promise();
        },
        false  // if any save fails, continue trying to save other files anyway; then reject at end
    ).then(function () {
        return filesAfterSave;
    });
}

/**
 * Saves all unsaved documents. See _saveFileList() for details on the semantics.
 * @return {$.Promise}
 */
function saveAll() {
    return _saveFileList(MainViewManager.getWorkingSet(MainViewManager.ALL_PANES));
}

/**
 * Prompts user with save as dialog and saves document.
 * @return {$.Promise} a promise that is resolved once the save has been completed
 */
const handleFileSaveAs = function (commandData) {
    // Default to current document if doc is null
    let doc = null;
    let settings;

    if (commandData) {
        doc = commandData.doc;
    } else {
        const activeEditor = EditorManager.getActiveEditor();
        if (activeEditor) {
            doc = activeEditor.document;
            settings = {};
            settings.selections = activeEditor.getSelections();
            settings.scrollPos = activeEditor.getScrollPos();
        }
    }

    // doc may still be null, e.g. if no editors are open, but _doSaveAs() does a null check on
    // doc.
    return _doSaveAs(doc, settings);
};

/**
 * Saves all unsaved documents.
 * @return {$.Promise} a promise that is resolved once ALL the saves have been completed; or rejected
 *      after all operations completed if any ONE of them failed.
 */
function handleFileSaveAll() {
    return saveAll();
}

/**
 * Closes the specified file: removes it from the workingset, and closes the main editor if one
 * is open. Prompts user about saving changes first, if document is dirty.
 *
 * @param {?{file: File, promptOnly:boolean}} commandData  Optional bag of arguments:
 *      file - File to close; assumes the current document if not specified.
 *      promptOnly - If true, only displays the relevant confirmation UI and does NOT actually
 *          close the document. This is useful when chaining file-close together with other user
 *          prompts that may be cancelable.
 *      _forceClose - If true, closes the document without prompting even if there are unsaved
 *          changes. Only for use in unit tests.
 * @return {$.Promise} a promise that is resolved when the file is closed, or if no file is open.
 *      FUTURE: should we reject the promise if no file is open?
 */
function handleFileClose(commandData) {
    let file;
    let promptOnly;
    let _forceClose;
    let _spawnedRequest;
    let paneId = MainViewManager.ACTIVE_PANE;

    if (commandData) {
        file        = commandData.file;
        promptOnly  = commandData.promptOnly;
        _forceClose = commandData._forceClose;
        paneId      = commandData.paneId || paneId;
        _spawnedRequest = commandData.spawnedRequest || false;
    }

    // utility function for handleFileClose: closes document & removes from workingset
    function doClose(file) {
        if (!promptOnly) {
            MainViewManager._close(paneId, file);
        }
    }

    const result = $.Deferred();
    const promise = result.promise();

    // Default to current document if doc is null
    if (!file) {
        file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);
    }

    // No-op if called when nothing is open; TODO: (issue #273) should command be grayed out instead?
    if (!file) {
        result.resolve();
        return promise;
    }

    const doc = DocumentManager.getOpenDocumentForPath(file.fullPath);

    if (doc && doc.isDirty && !_forceClose && (MainViewManager.isExclusiveToPane(doc.file, paneId) || _spawnedRequest)) {
        // Document is dirty: prompt to save changes before closing if only the document is exclusively
        // listed in the requested pane or this is part of a list close request
        const filename = FileUtils.getBaseName(doc.file.fullPath);

        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
            Strings.SAVE_CLOSE_TITLE,
            StringUtils.format(
                Strings.SAVE_CLOSE_MESSAGE,
                StringUtils.breakableUrl(filename)
            ),
            [
                {
                    className : Dialogs.DIALOG_BTN_CLASS_LEFT,
                    id        : Dialogs.DIALOG_BTN_DONTSAVE,
                    text      : Strings.DONT_SAVE
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id        : Dialogs.DIALOG_BTN_CANCEL,
                    text      : Strings.CANCEL
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id        : Dialogs.DIALOG_BTN_OK,
                    text      : Strings.SAVE
                }
            ]
        )
            .done(function (id) {
                if (id === Dialogs.DIALOG_BTN_CANCEL) {
                    result.reject();
                } else if (id === Dialogs.DIALOG_BTN_OK) {
                    // "Save" case: wait until we confirm save has succeeded before closing
                    handleFileSave({doc: doc})
                        .done(function (newFile) {
                            doClose(newFile);
                            result.resolve();
                        })
                        .fail(function () {
                            result.reject();
                        });
                } else {
                    // "Don't Save" case: even though we're closing the main editor, other views of
                    // the Document may remain in the UI. So we need to revert the Document to a clean
                    // copy of whatever's on disk.
                    doClose(file);

                    // Only reload from disk if we've executed the Close for real.
                    if (promptOnly) {
                        result.resolve();
                    } else {
                        // Even if there are no listeners attached to the document at this point, we want
                        // to do the revert anyway, because clients who are listening to the global documentChange
                        // event from the Document module (rather than attaching to the document directly),
                        // such as the Find in Files panel, should get a change event. However, in that case,
                        // we want to ignore errors during the revert, since we don't want a failed revert
                        // to throw a dialog if the document isn't actually open in the UI.
                        const suppressError = !DocumentManager.getOpenDocumentForPath(file.fullPath);
                        _doRevert(doc, suppressError)
                            .then(result.resolve, result.reject);
                    }
                }
            });
        result.always(function () {
            MainViewManager.focusActivePane();
        });
    } else {
        // File is not open, or IS open but Document not dirty: close immediately
        doClose(file);
        MainViewManager.focusActivePane();
        result.resolve();
    }
    return promise;
}

/**
 * @param {!Array.<File>} list - the list of files to close
 * @param {boolean} promptOnly - true to just prompt for saving documents with actually closing them.
 * @param {boolean} _forceClose Whether to force all the documents to close even if they have unsaved changes. For unit testing only.
 * @return {jQuery.Promise} promise that is resolved or rejected when the function finishes.
 */
function _closeList(list, promptOnly = false, _forceClose = false) {
    const result      = $.Deferred();
    const unsavedDocs: Array<DocumentManager.Document> = [];

    list.forEach(function (file) {
        const doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
        if (doc && doc.isDirty) {
            unsavedDocs.push(doc);
        }
    });

    if (unsavedDocs.length === 0 || _forceClose) {
        // No unsaved changes or we want to ignore them, so we can proceed without a prompt
        result.resolve();

    } else if (unsavedDocs.length === 1) {
        // Only one unsaved file: show the usual single-file-close confirmation UI
        const fileCloseArgs = { file: unsavedDocs[0].file, promptOnly: promptOnly, spawnedRequest: true };

        handleFileClose(fileCloseArgs).done(function () {
            // still need to close any other, non-unsaved documents
            result.resolve();
        }).fail(function () {
            result.reject();
        });

    } else {
        // Multiple unsaved files: show a single bulk prompt listing all files
        const message = Strings.SAVE_CLOSE_MULTI_MESSAGE + FileUtils.makeDialogFileList(_.map(unsavedDocs, _shortTitleForDocument));

        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_SAVE_CLOSE,
            Strings.SAVE_CLOSE_TITLE,
            message,
            [
                {
                    className : Dialogs.DIALOG_BTN_CLASS_LEFT,
                    id        : Dialogs.DIALOG_BTN_DONTSAVE,
                    text      : Strings.DONT_SAVE
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id        : Dialogs.DIALOG_BTN_CANCEL,
                    text      : Strings.CANCEL
                },
                {
                    className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id        : Dialogs.DIALOG_BTN_OK,
                    text      : Strings.SAVE
                }
            ]
        )
            .done(function (id) {
                if (id === Dialogs.DIALOG_BTN_CANCEL) {
                    result.reject();
                } else if (id === Dialogs.DIALOG_BTN_OK) {
                    // Save all unsaved files, then if that succeeds, close all
                    _saveFileList(list).done(function (listAfterSave) {
                        // List of files after save may be different, if any were Untitled
                        result.resolve(listAfterSave);
                    }).fail(function () {
                        result.reject();
                    });
                } else {
                    // "Don't Save" case--we can just go ahead and close all files.
                    result.resolve();
                }
            });
    }

    // If all the unsaved-changes confirmations pan out above, then go ahead & close all editors
    // NOTE: this still happens before any done() handlers added by our caller, because jQ
    // guarantees that handlers run in the order they are added.
    result.done(function (listAfterSave) {
        listAfterSave = listAfterSave || list;
        if (!promptOnly) {
            MainViewManager._closeList(MainViewManager.ALL_PANES, listAfterSave);
        }
    });

    return result.promise();
}

/**
 * Closes all open files; equivalent to calling handleFileClose() for each document, except
 * that unsaved changes are confirmed once, in bulk.
 * @param {?{promptOnly: boolean, _forceClose: boolean}}
 *          If promptOnly is true, only displays the relevant confirmation UI and does NOT
 *          actually close any documents. This is useful when chaining close-all together with
 *          other user prompts that may be cancelable.
 *          If _forceClose is true, forces the files to close with no confirmation even if dirty.
 *          Should only be used for unit test cleanup.
 * @return {$.Promise} a promise that is resolved when all files are closed
 */
function handleFileCloseAll(commandData) {
    return _closeList(
        MainViewManager.getAllOpenFiles(),
        (commandData && commandData.promptOnly),
        (commandData && commandData._forceClose)
    );
}


/**
 * Closes a list of open files; equivalent to calling handleFileClose() for each document, except
 * that unsaved changes are confirmed once, in bulk.
 * @param {?{promptOnly: boolean, _forceClose: boolean}}
 *          If promptOnly is true, only displays the relevant confirmation UI and does NOT
 *          actually close any documents. This is useful when chaining close-all together with
 *          other user prompts that may be cancelable.
 *          If _forceClose is true, forces the files to close with no confirmation even if dirty.
 *          Should only be used for unit test cleanup.
 * @return {$.Promise} a promise that is resolved when all files are closed
 */
function handleFileCloseList(commandData) {
    return _closeList(commandData.fileList);
}

/**
 * @private
 * Common implementation for close/quit/reload which all mostly
 * the same except for the final step
 * @param {Object} commandData - (not referenced)
 * @param {!function()} postCloseHandler - called after close
 * @param {!function()} failHandler - called when the save fails to cancel closing the window
 */
function _handleWindowGoingAway(commandData, postCloseHandler, failHandler?) {
    if (appshell.windowGoingAway) {
        // if we get called back while we're closing, then just return
        return ($.Deferred()).reject().promise();
    }

    return CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: true })
        .done(function () {
            appshell.windowGoingAway = true;

            // window is going away, hide it from the user
            browserWindow.hide();

            // give everyone a chance to save their state - but don't let any problems block us from quitting
            try {
                (ProjectManager as unknown as DispatcherEvents).trigger("beforeAppClose");
            } catch (ex) {
                console.error(ex);
            }

            // setTimeout to make sure saving state got time to finish
            setTimeout(postCloseHandler, 500);
        })
        .fail(function () {
            appshell.windowGoingAway = false;
            if (failHandler) {
                failHandler();
            }
        });
}

/**
 * @private
 * Implementation for abortQuit callback to reset quit sequence settings
 */
function handleAbortQuit() {
    appshell.windowGoingAway = false;
}

/**
 * @private
 * Implementation for native APP_BEFORE_MENUPOPUP callback to trigger beforeMenuPopup event
 */
function handleBeforeMenuPopup() {
    (PopUpManager as unknown as DispatcherEvents).trigger("beforeMenuPopup");
}

/**
 * Emitted when the window is going to be closed.
 * It's emitted before the beforeunload and unload event of DOM
 * For some Electron reason, we also need the onbeforeunload handler
 */
if (!(window as any).isSpecRunner) {
    // @ts-ignore
    window.onbeforeunload = function () {
        // note: in electron, any non-void return value will cause abort
        if (!appshell.windowGoingAway) {
            return false;
        }
    };
    browserWindow.on("close", function (event) {
        if (!appshell.windowGoingAway) {
            // stop the event for now
            event.preventDefault();
            // call _handleWindowGoingAway and then actually close the window
            _handleWindowGoingAway(event, function () {
                browserWindow.close();
            });
        }
        return appshell.windowGoingAway;
    });
}

/**
 * Confirms any unsaved changes, then closes the window
 * @param {Object} command data
 */
function handleFileCloseWindow(commandData) {
    return _handleWindowGoingAway(commandData, function () {
        browserWindow.close();
    });
}

/** Show a textfield to rename whatever is currently selected in the sidebar (or current doc if nothing else selected) */
function handleFileRename() {
    // Prefer selected sidebar item (which could be a folder)
    let entry = ProjectManager.getContext();
    if (!entry) {
        // Else use current file (not selected in ProjectManager if not visible in tree or workingset)
        entry = MainViewManager.getCurrentlyViewedFile();
    }
    if (entry) {
        ProjectManager.renameItemInline(entry);
    }
}

/** Closes the window, then quits the app */
function handleFileQuit(commandData) {
    return _handleWindowGoingAway(commandData, function () {
        browserWindow.close();
    });
}


/** Are we already listening for a keyup to call detectDocumentNavEnd()? */
let _addedNavKeyHandler = false;

/**
 * When the Ctrl key is released, if we were in the middle of a next/prev document navigation
 * sequence, now is the time to end it and update the MRU order. If we allowed the order to update
 * on every next/prev increment, the 1st & 2nd entries would just switch places forever and we'd
 * never get further down the list.
 * @param {jQueryEvent} event Key-up event
 */
function detectDocumentNavEnd(event) {
    if (event.keyCode === KeyEvent.DOM_VK_CONTROL) {  // Ctrl key
        MainViewManager.endTraversal();
        _addedNavKeyHandler = false;
        $(window.document.body).off("keyup", detectDocumentNavEnd);
    }
}

/**
 * Navigate to the next/previous (MRU or list order) document. Don't update MRU order yet
 * @param {!number} inc Delta indicating in which direction we're going
 * @param {?boolean} listOrder Whether to navigate using MRU or list order. Defaults to MRU order
 */
function goNextPrevDoc(inc, listOrder?) {
    let result;
    if (listOrder) {
        result = MainViewManager.traverseToNextViewInListOrder(inc);
    } else {
        result = MainViewManager.traverseToNextViewByMRU(inc);
    }

    if (result) {
        const file = result.file;
        const paneId = result.paneId;

        MainViewManager.beginTraversal();
        CommandManager.execute(Commands.FILE_OPEN, {
            fullPath: file.fullPath,
            paneId: paneId
        });

        // Listen for ending of Ctrl+Tab sequence
        if (!_addedNavKeyHandler) {
            _addedNavKeyHandler = true;
            $(window.document.body).keyup(detectDocumentNavEnd);
        }
    }
}

/**
 * Next Doc command handler (MRU order)
 */
function handleGoNextDoc() {
    goNextPrevDoc(+1);
}

/**
 * Previous Doc command handler (MRU order)
 */
function handleGoPrevDoc() {
    goNextPrevDoc(-1);
}

/**
 * Next Doc command handler (list order)
 */
function handleGoNextDocListOrder() {
    goNextPrevDoc(+1, true);
}

/**
 * Previous Doc command handler (list order)
 */
function handleGoPrevDocListOrder() {
    goNextPrevDoc(-1, true);
}

/**
 * Show in File Tree command handler
 */
function handleShowInTree() {
    ProjectManager.showInTree(MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE));
}

/**
 * Delete file command handler
 */
function handleFileDelete() {
    const entry = ProjectManager.getSelectedItem();
    Dialogs.showModalDialog(
        DefaultDialogs.DIALOG_ID_EXT_DELETED,
        Strings.CONFIRM_DELETE_TITLE,
        StringUtils.format(
            entry.isFile ? Strings.CONFIRM_FILE_DELETE : Strings.CONFIRM_FOLDER_DELETE,
            StringUtils.breakableUrl(entry.name)
        ),
        [
            {
                className : Dialogs.DIALOG_BTN_CLASS_NORMAL,
                id        : Dialogs.DIALOG_BTN_CANCEL,
                text      : Strings.CANCEL
            },
            {
                className : Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                id        : Dialogs.DIALOG_BTN_OK,
                text      : Strings.DELETE
            }
        ]
    )
        .done(function (id) {
            if (id === Dialogs.DIALOG_BTN_OK) {
                ProjectManager.deleteItem(entry);
            }
        });
}

/**
 * Show the selected sidebar (tree or workingset) item in Finder/Explorer
 */
function handleShowInOS() {
    const entry = ProjectManager.getSelectedItem();
    if (entry) {
        brackets.app.showOSFolder(entry.fullPath, function (err) {
            if (err) {
                console.error("Error showing '" + entry.fullPath + "' in OS folder:", err);
            }
        });
    }
}

/**
 * Disables Brackets' cache via the remote debugging protocol.
 * @return {$.Promise} A jQuery promise that will be resolved when the cache is disabled and be rejected in any other case
 */
function _disableCache() {
    const result = $.Deferred();

    if (brackets.inBrowser || brackets.inElectron) {
        result.resolve();
    } else {
        const port = brackets.app.getRemoteDebuggingPort ? brackets.app.getRemoteDebuggingPort() : 9234;
        Inspector.getDebuggableWindows("127.0.0.1", port)
            .fail(result.reject)
            .done(function (response) {
                const page = response[0];
                if (!page || !page.webSocketDebuggerUrl) {
                    result.reject();
                    return;
                }
                const _socket = new WebSocket(page.webSocketDebuggerUrl);
                // Disable the cache
                _socket.onopen = function _onConnect() {
                    _socket.send(JSON.stringify({ id: 1, method: "Network.setCacheDisabled", params: { "cacheDisabled": true } }));
                };
                // The first message will be the confirmation => disconnected to allow remote debugging of Brackets
                _socket.onmessage = function _onMessage(e) {
                    _socket.close();
                    result.resolve();
                };
                // In case of an error
                _socket.onerror = result.reject;
            });
    }

    return result.promise();
}

/**
 * Does a full reload of the browser window
 * @param {string} href The url to reload into the window
 */
function browserReload(href) {
    if (_isReloading) {
        return;
    }

    _isReloading = true;

    return CommandManager.execute(Commands.FILE_CLOSE_ALL, { promptOnly: true }).done(function () {
        appshell.windowGoingAway = true;

        // window is going away, hide it from the user
        browserWindow.hide();

        // Give everyone a chance to save their state - but don't let any problems block us from quitting
        try {
            (ProjectManager as unknown as DispatcherEvents).trigger("beforeAppClose");
        } catch (ex) {
            console.error(ex);
        }

        // Disable the cache to make reloads work
        _disableCache().always(function () {
            // Remove all menus to assure every part of Brackets is reloaded
            _.forEach(Menus.getAllMenus(), function (value, key) {
                Menus.removeMenu(key);
            });

            // If there's a fragment in both URLs, setting location.href won't actually reload
            const fragment = href.indexOf("#");
            if (fragment !== -1) {
                href = href.substr(0, fragment);
            }

            setTimeout(function () { electron.remote.require("./main").restart(href); }, 500);
        });
    }).fail(function () {
        _isReloading = false;
    });
}

/**
 * Restarts brackets Handler
 * @param {boolean=} loadWithoutExtensions - true to restart without extensions,
 *                                           otherwise extensions are loadeed as it is durning a typical boot
 */
function handleReload(loadWithoutExtensions) {
    let href    = window.location.href;
    const params  = new UrlParams();

    // Make sure the Reload Without User Extensions parameter is removed
    params.parse();

    if (loadWithoutExtensions) {
        if (!params.get("reloadWithoutUserExts")) {
            params.put("reloadWithoutUserExts", true);
        }
    } else {
        if (params.get("reloadWithoutUserExts")) {
            params.remove("reloadWithoutUserExts");
        }
    }

    if (href.indexOf("?") !== -1) {
        href = href.substring(0, href.indexOf("?"));
    }

    if (!params.isEmpty()) {
        href += "?" + params.toString();
    }

    // Give Mac native menus extra time to update shortcut highlighting.
    // Prevents the menu highlighting from getting messed up after reload.
    window.setTimeout(function () {
        browserReload(href);
    }, 100);
}

/**
 * Reload Without Extensions commnad handler
 */
const handleReloadWithoutExts = _.partial(handleReload, true);

/**
 * Do some initialization when the DOM is ready
 */
AppInit.htmlReady(function () {
    // If in Reload Without User Extensions mode, update UI and log console message
    const params      = new UrlParams();
    const $icon       = $("#toolbar-extension-manager");
    const $indicator  = $("<div>" + Strings.STATUSBAR_USER_EXTENSIONS_DISABLED + "</div>");

    params.parse();

    if (params.get("reloadWithoutUserExts") === "true" || PreferencesManager.get("extensionManager.show") === false) {
        CommandManager.get(Commands.FILE_EXTENSION_MANAGER).setEnabled(false);
        $icon.css({display: "none"});
        StatusBar.addIndicator("status-user-exts", $indicator, true);
        console.log("Brackets reloaded with extensions disabled");
    }

    // Init DOM elements
    _$titleContainerToolbar = $("#titlebar");
    _$titleWrapper = $(".title-wrapper", _$titleContainerToolbar);
    _$title = $(".title", _$titleWrapper);
    _$dirtydot = $(".dirty-dot", _$titleWrapper);
});

// Set some command strings
let quitString  = Strings.CMD_QUIT;
let showInOS    = Strings.CMD_SHOW_IN_OS;
if (brackets.platform === "win") {
    quitString  = Strings.CMD_EXIT;
    showInOS    = Strings.CMD_SHOW_IN_EXPLORER;
} else if (brackets.platform === "mac") {
    showInOS    = Strings.CMD_SHOW_IN_FINDER;
}

// Deprecated commands
CommandManager.register(Strings.CMD_ADD_TO_WORKING_SET,          Commands.FILE_ADD_TO_WORKING_SET,        handleFileAddToWorkingSet);
CommandManager.register(Strings.CMD_FILE_OPEN,                   Commands.FILE_OPEN,                      handleDocumentOpen);

// New commands
CommandManager.register(Strings.CMD_ADD_TO_WORKING_SET,          Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, handleFileAddToWorkingSetAndOpen);
CommandManager.register(Strings.CMD_FILE_OPEN,                   Commands.CMD_OPEN,                       handleFileOpen);

// File Commands
CommandManager.register(Strings.CMD_FILE_NEW_UNTITLED,           Commands.FILE_NEW_UNTITLED,              handleFileNew);
CommandManager.register(Strings.CMD_FILE_NEW,                    Commands.FILE_NEW,                       handleFileNewInProject);
CommandManager.register(Strings.CMD_FILE_NEW_FOLDER,             Commands.FILE_NEW_FOLDER,                handleNewFolderInProject);
CommandManager.register(Strings.CMD_FILE_SAVE,                   Commands.FILE_SAVE,                      handleFileSave);
CommandManager.register(Strings.CMD_FILE_SAVE_ALL,               Commands.FILE_SAVE_ALL,                  handleFileSaveAll);
CommandManager.register(Strings.CMD_FILE_SAVE_AS,                Commands.FILE_SAVE_AS,                   handleFileSaveAs);
CommandManager.register(Strings.CMD_FILE_RENAME,                 Commands.FILE_RENAME,                    handleFileRename);
CommandManager.register(Strings.CMD_FILE_DELETE,                 Commands.FILE_DELETE,                    handleFileDelete);

// Close Commands
CommandManager.register(Strings.CMD_FILE_CLOSE,                  Commands.FILE_CLOSE,                     handleFileClose);
CommandManager.register(Strings.CMD_FILE_CLOSE_ALL,              Commands.FILE_CLOSE_ALL,                 handleFileCloseAll);
CommandManager.register(Strings.CMD_FILE_CLOSE_LIST,             Commands.FILE_CLOSE_LIST,                handleFileCloseList);

// Traversal
CommandManager.register(Strings.CMD_NEXT_DOC,                    Commands.NAVIGATE_NEXT_DOC,              handleGoNextDoc);
CommandManager.register(Strings.CMD_PREV_DOC,                    Commands.NAVIGATE_PREV_DOC,              handleGoPrevDoc);

CommandManager.register(Strings.CMD_NEXT_DOC_LIST_ORDER,         Commands.NAVIGATE_NEXT_DOC_LIST_ORDER,   handleGoNextDocListOrder);
CommandManager.register(Strings.CMD_PREV_DOC_LIST_ORDER,         Commands.NAVIGATE_PREV_DOC_LIST_ORDER,   handleGoPrevDocListOrder);

// Special Commands
CommandManager.register(showInOS,                                Commands.NAVIGATE_SHOW_IN_OS,            handleShowInOS);
CommandManager.register(quitString,                              Commands.FILE_QUIT,                      handleFileQuit);
CommandManager.register(Strings.CMD_SHOW_IN_TREE,                Commands.NAVIGATE_SHOW_IN_FILE_TREE,     handleShowInTree);

// These commands have no UI representation and are only used internally
CommandManager.registerInternal(Commands.APP_ABORT_QUIT,            handleAbortQuit);
CommandManager.registerInternal(Commands.APP_BEFORE_MENUPOPUP,      handleBeforeMenuPopup);
CommandManager.registerInternal(Commands.FILE_CLOSE_WINDOW,         handleFileCloseWindow);
CommandManager.registerInternal(Commands.APP_RELOAD,                handleReload);
CommandManager.registerInternal(Commands.APP_RELOAD_WITHOUT_EXTS,   handleReloadWithoutExts);

// Listen for changes that require updating the editor titlebar
(ProjectManager as unknown as DispatcherEvents).on("projectOpen", _updateTitle);
(DocumentManager as unknown as DispatcherEvents).on("dirtyFlagChange", handleDirtyChange);
(DocumentManager as unknown as DispatcherEvents).on("fileNameChange", handleCurrentFileChange);
(MainViewManager as unknown as DispatcherEvents).on("currentFileChange", handleCurrentFileChange);

// Reset the untitled document counter before changing projects
(ProjectManager as unknown as DispatcherEvents).on("beforeProjectClose", function () { _nextUntitledIndexToUse = 1; });
