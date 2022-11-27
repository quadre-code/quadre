/*
* Copyright (c) 2017 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * Manages Editor navigation history to aid back/fwd movement between the edit positions
 * in the active project context. The navigation history is purely in-memory and not
 * persisted to file system when a project is being closed.
 */

const Strings                 = brackets.getModule("strings");
const MainViewManager         = brackets.getModule("view/MainViewManager");
const Document                = brackets.getModule("document/Document");
const DocumentManager         = brackets.getModule("document/DocumentManager");
const EditorManager           = brackets.getModule("editor/EditorManager");
const ProjectManager          = brackets.getModule("project/ProjectManager");
const CommandManager          = brackets.getModule("command/CommandManager");
const Commands                = brackets.getModule("command/Commands");
const Menus                   = brackets.getModule("command/Menus");
const KeyBindingManager       = brackets.getModule("command/KeyBindingManager");
const FileSystem              = brackets.getModule("filesystem/FileSystem");

import * as keyboard from "text!keyboard.json";
const KeyboardPrefs = JSON.parse(keyboard);

// Command constants for navigation history
const NAVIGATION_JUMP_BACK      = "navigation.jump.back";
const NAVIGATION_JUMP_FWD       = "navigation.jump.fwd";

// The latency time to capture an explicit cursor movement as a navigation frame
const NAV_FRAME_CAPTURE_LATENCY = 2000;
const MAX_NAV_FRAMES_COUNT = 30;

/**
 * Contains list of most recently known cursor positions.
 * @private
 * @type {Array.<Object>}
 */
let jumpBackwardStack: Array<NavigationFrame> = [];

/**
 * Contains list of most recently traversed cursor positions using NAVIGATION_JUMP_BACK command.
 * @private
 * @type {Array.<Object>}
 */
let jumpForwardStack: Array<NavigationFrame> = [];
let activePosNotSynced = false;
let captureTimer: number | null = null;
let currentEditPos: NavigationFrame | null = null;
let jumpInProgress = false;
let commandJumpBack;
let commandJumpFwd;

/**
 * Function to check if there are any navigatable frame backward.
 * @private
 */
function _hasNavBackFrames() {
    return (jumpForwardStack.length > 0 && jumpBackwardStack.length > 0) ||
        (!jumpForwardStack.length && jumpBackwardStack.length > 1);
}

/**
 * Function to enable/disable navigation command based on cursor positions availability.
 * @private
 */
function _validateNavigationCmds() {
    commandJumpBack.setEnabled(_hasNavBackFrames());
    commandJumpFwd.setEnabled(jumpForwardStack.length > 0);
}

/**
 * Function to check existence of a file entry, validity of markers
 * @private
 */
function _validateFrame(entry: NavigationFrame) {
    const deferred = $.Deferred();
    const fileEntry = FileSystem.getFileForPath(entry.filePath);

    if (entry.inMem) {
        const indexInWS = MainViewManager.findInWorkingSet(entry.paneId, entry.filePath);
        // Remove entry if InMemoryFile is not found in Working set
        if (indexInWS === -1) {
            deferred.reject();
        } else {
            deferred.resolve();
        }
    } else {
        fileEntry.exists(function (err, exists) {
            if (!err && exists) {
                // Additional check to handle external modification and mutation of the doc text affecting markers
                if (fileEntry._hash !== entry._hash) {
                    deferred.reject();
                } else if (!entry._validateMarkers()) {
                    deferred.reject();
                } else {
                    deferred.resolve();
                }
            } else {
                deferred.reject();
            }
        });
    }

    return deferred.promise();
}

/**
 * Prototype to capture a navigation frame and it's various data/functional attributues
 */
class NavigationFrame {
    public cm;
    public filePath: string;
    public inMem: boolean;
    public paneId;
    public _hash: string;
    private uId = (new Date()).getTime();
    private selections: Array<{start: any, end: any}> = [];
    private bookMarkIds: Array<string> | null = [];

    constructor(editor, selectionObj) {
        this.cm = editor._codeMirror;
        this.filePath = editor.document.file._path;
        this.inMem = editor.document.file.constructor.name === "InMemoryFile";
        this.paneId = editor._paneId;
        this._hash = editor.document.file._hash;
        this.uId = (new Date()).getTime();
        this.selections = [];
        this.bookMarkIds = [];
        this._createMarkers(selectionObj.ranges);
    }

    /**
     * Lifecycle event handler of the editor for which this frame is captured
     */
    public _handleEditorDestroy(editor?) {
        this._backupSelectionRanges();
        this._clearMarkers();
        this.cm = null;
        this.bookMarkIds = null;
    }

    /**
     * Function to re-create CM TextMarkers for previously backed up ranges
     * This logic is required to ensure that the captured navigation positions
     * stay valid and contextual even when the actual document text mutates.
     * The mutations which are handled here :
     * -> Addition/Deletion of lines before the captured position
     * -> Addition/Updation of characters in the captured selection
     */
    public _reinstateMarkers(editor) {
        this.cm = editor._codeMirror;
        this.paneId = editor._paneId;
        this._createMarkers(this.selections);
    }


    /**
     * Function to validate an existing frame against a file '_hash' to detect
     * external change so that the frame can be discarded
     */
    public _validateFileHash(file) {
        return this.filePath === file._path ? this._hash === file._hash : true;
    }

    /**
     * Function to create CM TextMarkers for the navigated positions/selections.
     * This logic is required to ensure that the captured navigation positions
     * stay valid and contextual even when the actual document text mutates.
     * The mutations which are handled here :
     * -> Addition/Deletion of lines before the captured position
     * -> Addition/Updation of characters in the captured selection
     */
    private _createMarkers(ranges) {
        this.bookMarkIds = [];
        for (const range of ranges) {
            const rangeStart = range.anchor || range.start;
            const rangeEnd = range.head || range.end;
            // 'markText' has to used for a non-zero length position, if current selection is
            // of zero length use bookmark instead.
            if (rangeStart.line === rangeEnd.line && rangeStart.ch === rangeEnd.ch) {
                const bookMark = this.cm.setBookmark(rangeStart, rangeEnd);
                this.bookMarkIds.push(bookMark.id);
            } else {
                this.cm.markText(rangeStart, rangeEnd, {className: (this.uId)});
            }
        }
    }

    /**
     * Function to actually convert the CM markers to CM positions which can be used to
     * set selections or cursor positions in Editor.
     */
    private _backupSelectionRanges() {
        if (!this.cm) {
            return;
        }

        // Reset selections first.
        this.selections = [];
        const self = this;

        // Collate only the markers we used to mark selections/cursors
        const markers = this.cm.getAllMarks().filter(function (entry) {
            if (entry.className === self.uId || self.bookMarkIds!.indexOf(entry.id) !== -1) {
                return entry;
            }
        });

        // Iterate over CM textmarkers and collate the updated(if?) positions
        for (const marker of markers) {
            const selection = marker.find();
            if (marker.type === "bookmark") {
                this.selections.push({start: selection, end: selection});
            } else {
                this.selections.push({start: selection.from, end: selection.to});
            }
        }
    }

    /**
     * Function to clean up the markers in cm
     */
    public _clearMarkers() {
        if (!this.cm) {
            return;
        }
        const self = this;

        // clear only the markers we used to mark selections/cursors
        this.cm.getAllMarks().filter(function (entry) {
            if (entry.className === self.uId || self.bookMarkIds!.indexOf(entry.id) !== -1) {
                entry.clear();
            }
        });
    }

    /**
     * Function to check if we have valid markers in cm for this frame
     */
    public _validateMarkers() {
        this._backupSelectionRanges();
        return this.selections.length;
    }

    /**
     * Function to actually navigate to the position(file,selections) captured in this frame
     */
    public goTo() {
        const self = this;
        this._backupSelectionRanges();
        jumpInProgress = true;

        // To ensure we don't reopen the same doc in the last known pane
        // rather bring it to the same pane where user has opened it
        const thisDoc = DocumentManager.getOpenDocumentForPath(this.filePath);
        if (thisDoc && thisDoc._masterEditor) {
            this.paneId = thisDoc._masterEditor._paneId;
        }

        CommandManager.execute(Commands.FILE_OPEN, {fullPath: this.filePath, paneId: this.paneId}).done(function () {
            EditorManager.getCurrentFullEditor().setSelections(self.selections, true);
            _validateNavigationCmds();
        }).always(function () {
            jumpInProgress = false;
        });
    }
}


/**
 * Function to capture a non-zero set of selections as a navigation frame.
 * The assumptions behind capturing a frame as a navigation frame are :
 *
 * -> If it's set by user explicitly (using mouse click or jump to definition)
 * -> By clicking on search results
 * -> Change of cursor by keyboard navigation keys or actual edits are not captured.
 *
 * @private
 */
function _recordJumpDef(event, selectionObj) {
    // Don't capture frames if we are navigating or document text is being refreshed(fileSync in progress)
    if (jumpInProgress || (event.target && event.target.document._refreshInProgress)) {
        return;
    }
    // Reset forward navigation stack if we are capturing a new event
    jumpForwardStack = [];
    if (captureTimer) {
        window.clearTimeout(captureTimer);
        captureTimer = null;
    }

    // Ensure cursor activity has not happened because of arrow keys or edit
    if (selectionObj.origin !== "+move" && (!window.event || window.event.type !== "input")) {
        captureTimer = window.setTimeout(function () {
            // Check if we have reached MAX_NAV_FRAMES_COUNT
            // If yes, control overflow
            if (jumpBackwardStack.length === MAX_NAV_FRAMES_COUNT) {
                const navFrame = jumpBackwardStack.shift()!;
                navFrame._clearMarkers();
            }

            currentEditPos = new NavigationFrame(event.target, selectionObj);
            jumpBackwardStack.push(currentEditPos);
            _validateNavigationCmds();
            activePosNotSynced = false;
        }, NAV_FRAME_CAPTURE_LATENCY);
    } else {
        activePosNotSynced = true;
    }
}

/**
 * Command handler to navigate backward
 */
function _navigateBack() {
    if (!jumpForwardStack.length) {
        if (activePosNotSynced) {
            currentEditPos = new NavigationFrame(
                EditorManager.getCurrentFullEditor(),
                {ranges: EditorManager.getCurrentFullEditor()._codeMirror.listSelections()}
            );
            jumpForwardStack.push(currentEditPos);
        }
    }

    const navFrame = jumpBackwardStack.pop();

    // Check if the poped frame is the current active frame or doesn't have any valid marker information
    // if true, jump again
    if (navFrame && navFrame === currentEditPos) {
        jumpForwardStack.push(navFrame);
        _validateNavigationCmds();
        CommandManager.execute(NAVIGATION_JUMP_BACK);
        return;
    }

    if (navFrame) {
        // We will check for the file existence now, if it doesn't exist we will jump back again
        // but discard the popped frame as invalid.
        _validateFrame(navFrame).done(function () {
            jumpForwardStack.push(navFrame);
            navFrame.goTo();
            currentEditPos = navFrame;
        }).fail(function () {
            CommandManager.execute(NAVIGATION_JUMP_BACK);
        }).always(function () {
            _validateNavigationCmds();
        });
    }
}

/**
 * Command handler to navigate forward
 */
function _navigateForward() {
    const navFrame = jumpForwardStack.pop();

    if (!navFrame) {
        return;
    }

    // Check if the poped frame is the current active frame or doesn't have any valid marker information
    // if true, jump again
    if (navFrame === currentEditPos) {
        jumpBackwardStack.push(navFrame);
        _validateNavigationCmds();
        CommandManager.execute(NAVIGATION_JUMP_FWD);
        return;
    }

    // We will check for the file existence now, if it doesn't exist we will jump back again
    // but discard the popped frame as invalid.
    _validateFrame(navFrame).done(function () {
        jumpBackwardStack.push(navFrame);
        navFrame.goTo();
        currentEditPos = navFrame;
    }).fail(function () {
        _validateNavigationCmds();
        CommandManager.execute(NAVIGATION_JUMP_FWD);
    }).always(function () {
        _validateNavigationCmds();
    });

}

/**
 * Function to initialize navigation menu items.
 * @private
 */
function _initNavigationMenuItems() {
    const menu = Menus.getMenu(Menus.AppMenuBar.NAVIGATE_MENU);
    menu.addMenuItem(NAVIGATION_JUMP_BACK, "", Menus.AFTER, Commands.NAVIGATE_PREV_DOC);
    menu.addMenuItem(NAVIGATION_JUMP_FWD, "", Menus.AFTER, NAVIGATION_JUMP_BACK);
}

/**
 * Function to initialize navigation commands and it's keyboard shortcuts.
 * @private
 */
function _initNavigationCommands() {
    CommandManager.register(Strings.CMD_NAVIGATE_BACKWARD, NAVIGATION_JUMP_BACK, _navigateBack);
    CommandManager.register(Strings.CMD_NAVIGATE_FORWARD, NAVIGATION_JUMP_FWD, _navigateForward);
    commandJumpBack = CommandManager.get(NAVIGATION_JUMP_BACK);
    commandJumpFwd = CommandManager.get(NAVIGATION_JUMP_FWD);
    commandJumpBack.setEnabled(false);
    commandJumpFwd.setEnabled(false);
    KeyBindingManager.addBinding(NAVIGATION_JUMP_BACK, KeyboardPrefs[NAVIGATION_JUMP_BACK]);
    KeyBindingManager.addBinding(NAVIGATION_JUMP_FWD, KeyboardPrefs[NAVIGATION_JUMP_FWD]);
    _initNavigationMenuItems();
}

/**
 * Function to request a navigation frame creation explicitly.
 * @private
 */
function _captureFrame(editor) {
    // Capture the active position now if it was not captured earlier
    if ((activePosNotSynced || !jumpBackwardStack.length) && !jumpInProgress) {
        jumpBackwardStack.push(new NavigationFrame(editor, {ranges: editor._codeMirror.listSelections()}));
    }
}

/**
 * Create snapshot of last known live markers.
 * @private
 */
function _backupLiveMarkers(frames: Array<NavigationFrame>, editor) {
    for (const frame of frames) {
        if (frame.cm === editor._codeMirror) {
            frame._handleEditorDestroy();
        }
    }
}

/**
 * Handle Editor destruction to create backup of live marker positions
 * @private
 */
function _handleEditorCleanup(event, editor) {
    _backupLiveMarkers(jumpBackwardStack, editor);
    _backupLiveMarkers(jumpForwardStack, editor);
}

/**
 * Removes all frames from backward navigation stack for the given file only if the file is changed on disk.
 * @private
 */
function _removeBackwardFramesForFile(file) {
    jumpBackwardStack = jumpBackwardStack.filter(function (frame) {
        return frame._validateFileHash(file);
    });
}

/**
 * Removes all frames from forward navigation stack for the given file only if the file is changed on disk.
 * @private
 */
function _removeForwardFramesForFile(file) {
    jumpForwardStack = jumpForwardStack.filter(function (frame) {
        return frame._validateFileHash(file);
    });
}

/**
 * Handles explicit content reset for a document caused by external changes
 * @private
 */
function _handleExternalChange(evt, doc) {
    if (doc) {
        _removeBackwardFramesForFile(doc.file);
        _removeForwardFramesForFile(doc.file);
        _validateNavigationCmds();
    }
}

function _handleProjectOpen() {
    jumpBackwardStack = [];
    jumpForwardStack = [];
}

/**
 * Required to make offline markers alive again to track document mutation
 * @private
 */
function _reinstateMarkers(editor, frames: Array<NavigationFrame>) {
    for (const frame of frames) {
        if (!frame.cm && frame.filePath === editor.document.file._path) {
            frame._reinstateMarkers(editor);
        }
    }
}

/**
 * Handle Active Editor change to update navigation information
 * @private
 */
function _handleActiveEditorChange(event, current, previous) {
    if (previous && previous._paneId) { // Handle only full editors
        previous.off("beforeSelectionChange", _recordJumpDef);
        _captureFrame(previous);
        _validateNavigationCmds();
    }

    if (current && current._paneId) { // Handle only full editors
        activePosNotSynced = true;
        current.off("beforeSelectionChange", _recordJumpDef);
        current.on("beforeSelectionChange", _recordJumpDef);
        current.off("beforeDestroy", _handleEditorCleanup);
        current.on("beforeDestroy", _handleEditorCleanup);
    }
}

function _initHandlers() {
    EditorManager.on("activeEditorChange", _handleActiveEditorChange);
    ProjectManager.on("projectOpen", _handleProjectOpen);
    EditorManager.on("_fullEditorCreatedForDocument", function (event, document, editor) {
        _handleExternalChange(event, {file: document.file});
        _reinstateMarkers(editor, jumpBackwardStack);
        _reinstateMarkers(editor, jumpForwardStack);
    });
    FileSystem.on("change", function (event, entry) {
        if (entry) {
            _handleExternalChange(event, {file: entry});
        }
    });
    (Document as any).on("_documentRefreshed", function (event, doc) {
        _handleExternalChange(event, {file: doc.file});
    });
}

export function init() {
    _initNavigationCommands();
    _initHandlers();
}
