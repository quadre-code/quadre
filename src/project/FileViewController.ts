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
 * Responsible for coordinating file selection between views by permitting only one view
 * to show the current file selection at a time. Currently, only WorkingSetView and
 * ProjectManager can show file selection. In general the WorkingSetView takes higher
 * priority until the user selects a file in the ProjectManager.
 *
 * Events dispatched:
 * - documentSelectionFocusChange - indicates a document change has caused the focus to
 *   change between the working set and file tree.
 *
 * - fileViewFocusChange - indicates the selection focus has changed between the working
 *   set and the project tree, but the document selection has NOT changed
 *
 * Current file selection rules in views:
 * - select a file in WorkingSetView > select in WorkingSetView
 * - add a file to the WorkingSetView > select in WorkingSetView
 * - select a file in ProjectManager > select in ProjectManager
 * - open a file from places other than the WorkingSetView or ProjectManager >
 *       select file in WorkignSetView if its in the working set, otherwise select in ProjectManager
 */

// Load dependent modules
import * as DocumentManager from "document/DocumentManager";
import * as EventDispatcher from "utils/EventDispatcher";
import * as MainViewManager from "view/MainViewManager";
import * as CommandManager from "command/CommandManager";
import * as PerfUtils from "utils/PerfUtils";
import * as Commands from "command/Commands";
import * as DeprecationWarning from "utils/DeprecationWarning";
import File = require("filesystem/File");

/**
 * Tracks whether a "currentFileChange" notification occured due to a call to
 * openAndSelectDocument.
 * @see #openAndSelectDocument
 * @private
 */
let _curDocChangedDueToMe = false;
export const WORKING_SET_VIEW = "WorkingSetView";
export const PROJECT_MANAGER = "ProjectManager";

/**
 * @private
 * @see #getFileSelectionFocus
 */
let _fileSelectionFocus = PROJECT_MANAGER;

// Due to circular dependencies, not safe to call on() directly
/**
 * Change the doc selection to the working set when ever a new file is added to the working set
 */
EventDispatcher.on_duringInit(MainViewManager, "workingSetAdd", function (event, addedFile) {
    _fileSelectionFocus = WORKING_SET_VIEW;
    exports.trigger("documentSelectionFocusChange");
});

/**
 * Update the file selection focus whenever the contents of the editor area change
 */
EventDispatcher.on_duringInit(MainViewManager, "currentFileChange", function (event, file, paneId) {
    let perfTimerName;
    if (!_curDocChangedDueToMe) {
        // The the cause of the doc change was not openAndSelectDocument, so pick the best fileSelectionFocus
        perfTimerName = PerfUtils.markStart("FileViewController._oncurrentFileChange():\t" + (file ? (file.fullPath) : "(no open file)"));
        if (file && MainViewManager.findInWorkingSet(paneId,  file.fullPath) !== -1) {
            _fileSelectionFocus = WORKING_SET_VIEW;
        } else {
            _fileSelectionFocus = PROJECT_MANAGER;
        }
    }

    exports.trigger("documentSelectionFocusChange");

    if (!_curDocChangedDueToMe) {
        PerfUtils.addMeasurement(perfTimerName);
    }
});

/**
 * @private
 * @param {string=} paneId - the Pane to activate
 */
function _activatePane(paneId) {
    if (paneId) {
        MainViewManager.setActivePaneId(paneId);
    } else {
        MainViewManager.focusActivePane();
    }
    // If fullPath corresonds to the current doc being viewed then opening the file won't
    // trigger a currentFileChange event, so we need to trigger a documentSelectionFocusChange
    // in this case to signify the selection focus has changed even though the current document has not.
    exports.trigger("documentSelectionFocusChange");
}

/**
 * Modifies the selection focus in the project side bar. A file can either be selected
 * in the working set (the open files) or in the file tree, but not both.
 * @param {String} fileSelectionFocus - either PROJECT_MANAGER or WORKING_SET_VIEW
 */
export function setFileViewFocus(fileSelectionFocus) {
    if (fileSelectionFocus !== PROJECT_MANAGER && fileSelectionFocus !== WORKING_SET_VIEW) {
        console.error("Bad parameter passed to FileViewController.setFileViewFocus");
        return;
    }

    if (_fileSelectionFocus !== fileSelectionFocus) {
        _fileSelectionFocus = fileSelectionFocus;
        exports.trigger("fileViewFocusChange");
    }
}

/**
 * Opens a document if it's not open and selects the file in the UI corresponding to
 * fileSelectionFocus
 * @param {!fullPath} fullPath - full path of the document to open
 * @param {string} fileSelectionFocus - (WORKING_SET_VIEW || PROJECT_MANAGER)
 * @param {string} paneId - pane in which to open the document
 * @return {$.Promise}
 */
export function openAndSelectDocument(fullPath, fileSelectionFocus, paneId?) {
    let result;
    const curDocChangedDueToMe = _curDocChangedDueToMe;

    function _getDerivedPaneContext() {
        function _secondPaneContext() {
            const evt = window.event as MouseEvent;
            return (evt.ctrlKey || evt.metaKey) && evt.altKey ? MainViewManager.SECOND_PANE : null;
        }

        function _firstPaneContext() {
            const evt = window.event as MouseEvent;
            return (evt.ctrlKey || evt.metaKey) ? MainViewManager.FIRST_PANE : null;
        }

        return window.event && (_secondPaneContext() || _firstPaneContext());
    }

    if (fileSelectionFocus !== PROJECT_MANAGER && fileSelectionFocus !== WORKING_SET_VIEW) {
        console.error("Bad parameter passed to FileViewController.openAndSelectDocument");
        return;
    }

    // Opening files are asynchronous and we want to know when this function caused a file
    // to open so that _fileSelectionFocus is set appropriatly. _curDocChangedDueToMe is set here
    // and checked in the currentFileChange handler
    _curDocChangedDueToMe = true;

    _fileSelectionFocus = fileSelectionFocus;


    paneId = (paneId || _getDerivedPaneContext() || MainViewManager.ACTIVE_PANE);

    // If fullPath corresonds to the current doc being viewed then opening the file won't
    // trigger a currentFileChange event, so we need to trigger a documentSelectionFocusChange
    // in this case to signify the selection focus has changed even though the current document has not.
    const currentPath = MainViewManager.getCurrentlyViewedPath(paneId);
    if (currentPath === fullPath) {
        _activatePane(paneId);
        result = $.Deferred().resolve().promise();
    } else {
        result = CommandManager.execute(Commands.FILE_OPEN, {fullPath: fullPath,
            paneId: paneId});
    }

    // clear after notification is done
    result.always(function () {
        _curDocChangedDueToMe = curDocChangedDueToMe;
    });

    return result;
}

/**
 * Opens the specified document if it's not already open, adds it to the working set,
 * and selects it in the WorkingSetView
 * @param {!fullPath}
 * @param {string=} paneId - Pane in which to add the view.  If omitted, the command default is to use the ACTIVE_PANE
 * @return {!$.Promise}
 */
export function openFileAndAddToWorkingSet(fullPath, paneId?): JQueryPromise<File> {
    const result = $.Deferred<File>();
    const promise = CommandManager.execute<File>(Commands.CMD_ADD_TO_WORKINGSET_AND_OPEN, {
        fullPath: fullPath,
        paneId: paneId
    });

    // This properly handles sending the right nofications in cases where the document
    // is already the current one. In that case we will want to notify with
    // documentSelectionFocusChange so the views change their selection
    promise.done(function (file) {
        // CMD_ADD_TO_WORKINGSET_AND_OPEN command sets the current document. Update the
        // selection focus only if doc is not null. When double-clicking on an
        // image file, we get a null doc here but we still want to keep _fileSelectionFocus
        // as PROJECT_MANAGER. Regardless of doc is null or not, call _activatePane
        // to trigger documentSelectionFocusChange event.
        _fileSelectionFocus = WORKING_SET_VIEW;
        _activatePane(paneId);

        result.resolve(file);
    }).fail(function (err) {
        result.reject(err);
    });

    return result.promise();
}

/**
 * Opens the specified document with its associated external editor,
 */
export function openWithExternalApplication(fullPath): void {
    exports.trigger("openWithExternalApplication", fullPath);
}

/**
 * Opens the specified document if it's not already open, adds it to the working set,
 * and selects it in the WorkingSetView
 * @deprecated use FileViewController.openFileAndAddToWorkingSet() instead
 * @param {!fullPath}
 * @return {!$.Promise}
 */
export function addToWorkingSetAndSelect(fullPath) {
    DeprecationWarning.deprecationWarning("Use FileViewController.openFileAndAddToWorkingSet() instead of FileViewController.addToWorkingSetAndSelect().", true);
    const result = $.Deferred();
    openFileAndAddToWorkingSet(fullPath)
        .done(function (file) {
            let doc;

            if (file) {
                doc = DocumentManager.getOpenDocumentForPath(file.fullPath);
            }

            result.resolve(doc);
        })
        .fail(function (err) {
            result.reject(err);
        });
    return result.promise();
}


/**
 * returns either WORKING_SET_VIEW or PROJECT_MANAGER
 * @return {!String}
 */
export function getFileSelectionFocus() {
    return _fileSelectionFocus;
}

electron.ipcRenderer.on("open-file", function (evt, path) {
    openFileAndAddToWorkingSet(path);
});

EventDispatcher.makeEventDispatcher(exports);
