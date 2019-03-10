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

import * as EditorManager from "editor/EditorManager";
import * as EventDispatcher from "utils/EventDispatcher";
import * as FileUtils from "file/FileUtils";
import InMemoryFile = require("document/InMemoryFile");
import * as PerfUtils from "utils/PerfUtils";
import * as LanguageManager from "language/LanguageManager";
import * as CodeMirror from "codemirror";
import * as _ from "lodash";

/**
 * Like _.each(), but if given a single item not in an array, acts as
 * if it were an array containing just that item.
 */
function oneOrEach(itemOrArr, cb) {
    if (Array.isArray(itemOrArr)) {
        _.each(itemOrArr, cb);
    } else {
        cb(itemOrArr, 0);
    }
}

/**
 * Model for the contents of a single file and its current modification state.
 * See DocumentManager documentation for important usage notes.
 *
 * Document dispatches these events:
 *
 * __change__ -- When the text of the editor changes (including due to undo/redo).
 *
 * Passes ({Document}, {ChangeList}), where ChangeList is an array
 * of change record objects. Each change record looks like:
 *
 *     { from: start of change, expressed as {line: <line number>, ch: <character offset>},
 *       to: end of change, expressed as {line: <line number>, ch: <chracter offset>},
 *       text: array of lines of text to replace existing text }
 *
 * The line and ch offsets are both 0-based.
 *
 * The ch offset in "from" is inclusive, but the ch offset in "to" is exclusive. For example,
 * an insertion of new content (without replacing existing content) is expressed by a range
 * where from and to are the same.
 *
 * If "from" and "to" are undefined, then this is a replacement of the entire text content.
 *
 * IMPORTANT: If you listen for the "change" event, you MUST also addRef() the document
 * (and releaseRef() it whenever you stop listening). You should also listen to the "deleted"
 * event.
 *
 * __deleted__ -- When the file for this document has been deleted. All views onto the document should
 * be closed. The document will no longer be editable or dispatch "change" events.
 *
 * __languageChanged__ -- When the value of getLanguage() has changed. 2nd argument is the old value,
 * 3rd argument is the new value.
 *
 * @constructor
 * @param {!File} file  Need not lie within the project.
 * @param {!Date} initialTimestamp  File's timestamp when we read it off disk.
 * @param {!string} rawText  Text content of the file.
 */
export class Document {
    private _associatedFullEditors;

    /**
     * Number of clients who want this Document to stay alive. The Document is listed in
     * DocumentManager._openDocuments whenever refCount > 0.
     */
    public _refCount = 0;

    /**
     * The File for this document. Need not lie within the project.
     * If Document is untitled, this is an InMemoryFile object.
     * @type {!File}
     */
    public file;

    /**
     * Whether this document has unsaved changes or not.
     * When this changes on any Document, DocumentManager dispatches a "dirtyFlagChange" event.
     * @type {boolean}
     */
    public isDirty = false;

    /**
     * Whether this document is currently being saved.
     * @type {boolean}
     */
    public isSaving = false;

    /**
     * The Language for this document. Will be resolved by file extension in the constructor
     * @type {!Language}
     */
    private language;

    /**
     * What we expect the file's timestamp to be on disk. If the timestamp differs from this, then
     * it means the file was modified by an app other than Brackets.
     * @type {!Date}
     */
    public diskTimestamp = null;

    /**
     * The timestamp of the document at the point where the user last said to keep changes that conflict
     * with the current disk version. Can also be -1, indicating that the file was deleted on disk at the
     * last point when the user said to keep changes, or null, indicating that the user has not said to
     * keep changes.
     * Note that this is a time as returned by Date.getTime(), not a Date object.
     * @type {?Number}
     */
    public keepChangesTime = null;

    /**
     * True while refreshText() is in progress and change notifications shouldn't trip the dirty flag.
     * @type {boolean}
     */
    private _refreshInProgress = false;

    /**
     * The text contents of the file, or null if our backing model is _masterEditor.
     * @type {?string}
     */
    private _text = null;

    /**
     * Editor object representing the full-size editor UI for this document. May be null if Document
     * has not yet been modified or been the currentDocument; in that case, our backing model is the
     * string _text.
     * @type {?Editor}
     */
    public _masterEditor?;

    /**
     * The content's line-endings style. If a Document is created on empty text, or text with
     * inconsistent line endings, defaults to the current platform's standard endings.
     * @type {FileUtils.LINE_ENDINGS_CRLF|FileUtils.LINE_ENDINGS_LF}
     */
    public _lineEndings: FileUtils.LineEndings | null = null;

    constructor(file, initialTimestamp, rawText) {
        this.file = file;
        this._updateLanguage();
        this.refreshText(rawText, initialTimestamp, true);
        // List of full editors which are initialized as master editors for this doc.
        this._associatedFullEditors = [];
    }

    /** Add a ref to keep this Document alive */
    public addRef() {
        // console.log("+++REF+++ "+this);

        if (this._refCount === 0) {
            // console.log("+++ adding to open list");
            if (exports.trigger("_afterDocumentCreate", this)) {
                return;
            }
        }
        this._refCount++;
    }

    /** Remove a ref that was keeping this Document alive */
    public releaseRef() {
        // console.log("---REF--- "+this);

        this._refCount--;
        if (this._refCount < 0) {
            console.error("Document ref count has fallen below zero!");
            return;
        }
        if (this._refCount === 0) {
            // console.log("--- removing from open list");
            if (exports.trigger("_beforeDocumentDelete", this)) {
                return;
            }
        }
    }

    /**
     * Attach a backing Editor to the Document, enabling setText() to be called. Assumes Editor has
     * already been initialized with the value of getText(). ONLY Editor should call this (and only
     * when EditorManager has told it to act as the master editor).
     * @param {!Editor} masterEditor
     */
    public _makeEditable(masterEditor) {

        this._text = null;
        this._masterEditor = masterEditor;

        masterEditor.on("change", this._handleEditorChange.bind(this));
    }

    /**
     * Detach the backing Editor from the Document, disallowing setText(). The text content is
     * stored back onto _text so other Document clients continue to have read-only access. ONLY
     * Editor.destroy() should call this.
     */
    public _makeNonEditable() {
        if (!this._masterEditor) {
            console.error("Document is already non-editable");
        } else {
            // _text represents the raw text, so fetch without normalized line endings
            this._text = this.getText(true);
            this._associatedFullEditors.splice(this._associatedFullEditors.indexOf(this._masterEditor), 1);

            // Identify the most recently created full editor before this and set that as new master editor
            if (this._associatedFullEditors.length > 0) {
                this._masterEditor = this._associatedFullEditors[this._associatedFullEditors.length - 1];
            } else {
                this._masterEditor = null;
            }
        }
    }

    /**
     * Toggles the master editor which has gained focus from a pool of full editors
     * To be used internally by Editor only
     */
    public _toggleMasterEditor(masterEditor) {
        // Do a check before processing the request to ensure inline editors are not being set as master editor
        if (this.file === masterEditor.document.file && this._associatedFullEditors.indexOf(masterEditor) >= 0) {
            this._masterEditor = masterEditor;
        }
    }

    /**
     * Checks and returns if a full editor exists for the provided pane attached to this document
     * @param {String} paneId
     * @return {Editor} Attached editor bound to the provided pane id
     */
    public _checkAssociatedEditorForPane(paneId) {
        let editorForPane;
        for (const associatedFullEditor of this._associatedFullEditors) {
            if (associatedFullEditor._paneId === paneId) {
                editorForPane = associatedFullEditor;
                break;
            }
        }

        return editorForPane;
    }

    /**
     * Disassociates an editor from this document if present in the associated editor list
     * To be used internally by Editor only when destroyed and not the current master editor for the document
     */
    public _disassociateEditor(editor) {
        // Do a check before processing the request to ensure inline editors are not being handled
        if (this._associatedFullEditors.indexOf(editor) >= 0) {
            this._associatedFullEditors.splice(this._associatedFullEditors.indexOf(editor), 1);
        }
    }

    /**
     * Aassociates a full editor to this document
     * To be used internally by Editor only when pane marking happens
     */
    public _associateEditor(editor) {
        // Do a check before processing the request to ensure inline editors are not being handled
        if (this._associatedFullEditors.indexOf(editor) === -1) {
            this._associatedFullEditors.push(editor);
        }
    }

    /**
     * Guarantees that _masterEditor is non-null. If needed, asks EditorManager to create a new master
     * editor bound to this Document (which in turn causes Document._makeEditable() to be called).
     * Should ONLY be called by Editor and Document.
     */
    public _ensureMasterEditor() {
        if (!this._masterEditor) {
            EditorManager._createUnattachedMasterEditor(this);
        }
    }

    /**
     * Returns the document's current contents; may not be saved to disk yet. Whenever this
     * value changes, the Document dispatches a "change" event.
     *
     * @param {boolean=} useOriginalLineEndings If true, line endings in the result depend on the
     *      Document's line endings setting (based on OS & the original text loaded from disk).
     *      If false, line endings are always \n (like all the other Document text getter methods).
     * @return {string}
     */
    public getText(useOriginalLineEndings = false) {
        if (this._masterEditor) {
            // CodeMirror.getValue() always returns text with LF line endings; fix up to match line
            // endings preferred by the document, if necessary
            const codeMirrorText = this._masterEditor._codeMirror.getValue();
            if (useOriginalLineEndings) {
                if (this._lineEndings === FileUtils.LINE_ENDINGS_CRLF) {
                    return codeMirrorText.replace(/\n/g, "\r\n");
                }
            }
            return codeMirrorText;
        }

        // Optimized path that doesn't require creating master editor
        if (useOriginalLineEndings) {
            return this._text;
        }

        return Document.normalizeText(this._text);
    }

    /** Normalizes line endings the same way CodeMirror would */
    public static normalizeText(text) {
        return text.replace(/\r\n/g, "\n");
    }

    /**
     * Sets the contents of the document. Treated as an edit. Line endings will be rewritten to
     * match the document's current line-ending style.
     * @param {!string} text The text to replace the contents of the document with.
     */
    public setText(text) {
        this._ensureMasterEditor();
        this._masterEditor._codeMirror.setValue(text);
        // _handleEditorChange() triggers "change" event
    }

    /**
     * @private
     * Triggers the appropriate events when a change occurs: "change" on the Document instance
     * and "documentChange" on the Document module.
     * @param {Object} changeList Changelist in CodeMirror format
     */
    private _notifyDocumentChange(changeList) {
        (this as unknown as EventDispatcher.DispatcherEvents).trigger("change", this, changeList);
        (exports as unknown as EventDispatcher.DispatcherEvents).trigger("documentChange", this, changeList);
    }

    /**
     * Sets the contents of the document. Treated as reloading the document from disk: the document
     * will be marked clean with a new timestamp, the undo/redo history is cleared, and we re-check
     * the text's line-ending style. CAN be called even if there is no backing editor.
     * @param {!string} text The text to replace the contents of the document with.
     * @param {!Date} newTimestamp Timestamp of file at the time we read its new contents from disk.
     * @param {boolean} initial True if this is the initial load of the document. In that case,
     *      we don't send change events.
     */
    public refreshText(text, newTimestamp, initial) {
        const perfTimerName = PerfUtils.markStart("refreshText:\t" + (!this.file || this.file.fullPath));

        // If clean, don't transiently mark dirty during refresh
        // (we'll still send change events though, of course)
        this._refreshInProgress = true;

        if (this._masterEditor) {
            this._masterEditor._resetText(text);  // clears undo history too
            // _handleEditorChange() triggers "change" event for us
        } else {
            this._text = text;

            if (!initial) {
                // We fake a change record here that looks like CodeMirror's text change records, but
                // omits "from" and "to", by which we mean the entire text has changed.
                // TODO: Dumb to split it here just to join it again in the change handler, but this is
                // the CodeMirror change format. Should we document our change format to allow this to
                // either be an array of lines or a single string?
                this._notifyDocumentChange([{text: text.split(/\r?\n/)}]);
            }
        }
        this._updateTimestamp(newTimestamp);

        // If Doc was dirty before refresh, reset it to clean now (don't always call, to avoid no-op dirtyFlagChange events) Since
        // _resetText() above already ensures Editor state is clean, it's safe to skip _markClean() as long as our own state is already clean too.
        if (this.isDirty) {
            this._markClean();
        }
        this._refreshInProgress = false;

        // Sniff line-ending style
        this._lineEndings = FileUtils.sniffLineEndings(text);
        if (!this._lineEndings) {
            this._lineEndings = FileUtils.getPlatformLineEndings();
        }

        (exports as unknown as EventDispatcher.DispatcherEvents).trigger("_documentRefreshed", this);

        PerfUtils.addMeasurement(perfTimerName);
    }

    /**
     * Adds, replaces, or removes text. If a range is given, the text at that range is replaced with the
     * given new text; if text == "", then the entire range is effectively deleted. If 'end' is omitted,
     * then the new text is inserted at that point and all existing text is preserved. Line endings will
     * be rewritten to match the document's current line-ending style.
     *
     * IMPORTANT NOTE: Because of #1688, do not use this in cases where you might be
     * operating on a linked document (like the main document for an inline editor)
     * during an outer CodeMirror operation (like a key event that's handled by the
     * editor itself). A common case of this is code hints in inline editors. In
     * such cases, use `editor._codeMirror.replaceRange()` instead. This should be
     * fixed when we migrate to use CodeMirror's native document-linking functionality.
     *
     * @param {!string} text  Text to insert or replace the range with
     * @param {!{line:number, ch:number}} start  Start of range, inclusive (if 'to' specified) or insertion point (if not)
     * @param {?{line:number, ch:number}} end  End of range, exclusive; optional
     * @param {?string} origin  Optional string used to batch consecutive edits for undo.
     *     If origin starts with "+", then consecutive edits with the same origin will be batched for undo if
     *     they are close enough together in time.
     *     If origin starts with "*", then all consecutive edit with the same origin will be batched for
     *     undo.
     *     Edits with origins starting with other characters will not be batched.
     *     (Note that this is a higher level of batching than batchOperation(), which already batches all
     *     edits within it for undo. Origin batching works across operations.)
     */
    public replaceRange(text, start, end, origin) {
        this._ensureMasterEditor();
        this._masterEditor._codeMirror.replaceRange(text, start, end, origin);
        // _handleEditorChange() triggers "change" event
    }

    /**
     * Returns the characters in the given range. Line endings are normalized to '\n'.
     * @param {!{line:number, ch:number}} start  Start of range, inclusive
     * @param {!{line:number, ch:number}} end  End of range, exclusive
     * @return {!string}
     */
    public getRange(start, end) {
        this._ensureMasterEditor();
        return this._masterEditor._codeMirror.getRange(start, end);
    }

    /**
     * Returns the text of the given line (excluding any line ending characters)
     * @param {number} Zero-based line number
     * @return {!string}
     */
    public getLine(lineNum) {
        this._ensureMasterEditor();
        return this._masterEditor._codeMirror.getLine(lineNum);
    }

    /**
     * Batches a series of related Document changes. Repeated calls to replaceRange() should be wrapped in a
     * batch for efficiency. Begins the batch, calls doOperation(), ends the batch, and then returns.
     * @param {function()} doOperation
     */
    public batchOperation(doOperation) {
        this._ensureMasterEditor();

        const self = this;
        self._masterEditor._codeMirror.operation(doOperation);
    }

    /**
     * Handles changes from the master backing Editor. Changes are triggered either by direct edits
     * to that Editor's UI, OR by our setText()/refreshText() methods.
     * @private
     */
    private _handleEditorChange(event, editor, changeList) {
        // Handle editor change event only when it is originated from the master editor for this doc
        if (this._masterEditor !== editor) {
            return;
        }

        // TODO: This needs to be kept in sync with SpecRunnerUtils.createMockActiveDocument(). In the
        // future, we should fix things so that we either don't need mock documents or that this
        // is factored so it will just run in both.
        if (!this._refreshInProgress) {
            // Sync isDirty from CodeMirror state
            const wasDirty = this.isDirty;
            this.isDirty = !editor._codeMirror.isClean();

            // Notify if isDirty just changed (this also auto-adds us to working set if needed)
            if (wasDirty !== this.isDirty) {
                (exports as unknown as EventDispatcher.DispatcherEvents).trigger("_dirtyFlagChange", this);
            }
        }

        // Notify that Document's text has changed
        this._notifyDocumentChange(changeList);
    }

    /**
     * @private
     */
    private _markClean() {
        this.isDirty = false;
        if (this._masterEditor) {
            this._masterEditor._codeMirror.markClean();
        }
        (exports as unknown as EventDispatcher.DispatcherEvents).trigger("_dirtyFlagChange", this);
    }

    /**
     * @private
     */
    private _updateTimestamp(timestamp) {
        this.diskTimestamp = timestamp;
        // Clear the "keep changes" timestamp since it's no longer relevant.
        this.keepChangesTime = null;
    }

    /**
     * Called when the document is saved (which currently happens in DocumentCommandHandlers). Marks the
     * document not dirty and notifies listeners of the save.
     */
    public notifySaved() {
        if (!this._masterEditor) {
            console.log("### Warning: saving a Document that is not modifiable!");
        }

        this._markClean();

        // TODO: (issue #295) fetching timestamp async creates race conditions (albeit unlikely ones)
        const self = this;
        this.file.stat(function (err, stat) {
            if (!err) {
                self._updateTimestamp(stat.mtime);
            } else {
                console.log("Error updating timestamp after saving file: " + self.file.fullPath);
            }
            (exports as unknown as EventDispatcher.DispatcherEvents).trigger("_documentSaved", self);
        });
    }

    /**
     * Adjusts a given position taking a given replaceRange-type edit into account.
     * If the position is within the original edit range (start and end inclusive),
     * it gets pushed to the end of the content that replaced the range. Otherwise,
     * if it's after the edit, it gets adjusted so it refers to the same character
     * it did before the edit.
     * @param {!{line:number, ch: number}} pos The position to adjust.
     * @param {!Array.<string>} textLines The text of the change, split into an array of lines.
     * @param {!{line: number, ch: number}} start The start of the edit.
     * @param {!{line: number, ch: number}} end The end of the edit.
     * @return {{line: number, ch: number}} The adjusted position.
     */
    public adjustPosForChange(pos, textLines, start, end) {
        // Same as CodeMirror.adjustForChange(), but that's a private function
        // and Marijn would rather not expose it publicly.
        const change = { text: textLines, from: start, to: end };

        if (CodeMirror.cmpPos(pos, start) < 0) {
            return pos;
        }
        if (CodeMirror.cmpPos(pos, end) <= 0) {
            return CodeMirror.changeEnd(change);
        }

        const line = pos.line + change.text.length - (change.to.line - change.from.line) - 1;
        let ch = pos.ch;
        if (pos.line === change.to.line) {
            ch += CodeMirror.changeEnd(change).ch - change.to.ch;
        }
        return {line: line, ch: ch};
    }

    /**
     * Helper function for edit operations that operate on multiple selections. Takes an "edit list"
     * that specifies a list of replaceRanges that should occur, but where all the positions are with
     * respect to the document state before all the edits (i.e., you don't have to figure out how to fix
     * up the selections after each sub-edit). Edits must be non-overlapping (in original-document terms).
     * All the edits are done in a single batch.
     *
     * If your edits are structured in such a way that each individual edit would cause its associated
     * selection to be properly updated, then all you need to specify are the edits themselves, and the
     * selections will automatically be updated as the edits are performed. However, for some
     * kinds of edits, you need to fix up the selection afterwards. In that case, you can specify one
     * or more selections to be associated with each edit. Those selections are assumed to be in terms
     * of the document state after the edit, *as if* that edit were the only one being performed (i.e.,
     * you don't have to worry about adjusting for the effect of other edits). If you supply these selections,
     * then this function will adjust them as necessary for the effects of other edits, and then return a
     * flat list of all the selections, suitable for passing to `setSelections()`.
     *
     * @param {!Array.<{edit: {text: string, start:{line: number, ch: number}, end:?{line: number, ch: number}}
     *                        | Array.<{text: string, start:{line: number, ch: number}, end:?{line: number, ch: number}}>,
     *                  selection: ?{start:{line:number, ch:number}, end:{line:number, ch:number},
     *                              primary:boolean, reversed: boolean, isBeforeEdit: boolean}>}
     *                        | ?Array.<{start:{line:number, ch:number}, end:{line:number, ch:number},
     *                                  primary:boolean, reversed: boolean, isBeforeEdit: boolean}>}>} edits
     *     Specifies the list of edits to perform in a manner similar to CodeMirror's `replaceRange`. This array
     *     will be mutated.
     *
     *     `edit` is the edit to perform:
     *         `text` will replace the current contents of the range between `start` and `end`.
     *         If `end` is unspecified, the text is inserted at `start`.
     *         `start` and `end` should be positions relative to the document *ignoring* all other edit descriptions
     *         (i.e., as if you were only performing this one edit on the document).
     *     If any of the edits overlap, an error will be thrown.
     *
     *     If `selection` is specified, it should be a selection associated with this edit.
     *          If `isBeforeEdit` is set on the selection, the selection will be fixed up for this edit.
     *          If not, it won't be fixed up for this edit, meaning it should be expressed in terms of
     *          the document state after this individual edit is performed (ignoring any other edits).
     *          Note that if you were planning on just specifying `isBeforeEdit` for every selection, you can
     *          accomplish the same thing by simply not passing any selections and letting the editor update
     *          the existing selections automatically.
     *
     *     Note that `edit` and `selection` can each be either an individual edit/selection, or a group of
     *     edits/selections to apply in order. This can be useful if you need to perform multiple edits in a row
     *     and then specify a resulting selection that shouldn't be fixed up for any of those edits (but should be
     *     fixed up for edits related to other selections). It can also be useful if you have several selections
     *     that should ignore the effects of a given edit because you've fixed them up already (this commonly happens
     *     with line-oriented edits where multiple cursors on the same line should be ignored, but still tracked).
     *     Within an edit group, edit positions must be specified relative to previous edits within that group. Also,
     *     the total bounds of edit groups must not overlap (e.g. edits in one group can't surround an edit from another group).
     *
     * @param {?string} origin An optional edit origin that's passed through to each replaceRange().
     * @return {Array<{start:{line:number, ch:number}, end:{line:number, ch:number}, primary:boolean, reversed: boolean}>}
     *     The list of passed selections adjusted for the performed edits, if any.
     */
    public doMultipleEdits(edits, origin) {
        const self = this;

        // Sort the edits backwards, so we don't have to adjust the edit positions as we go along
        // (though we do have to adjust the selection positions).
        edits.sort(function (editDesc1, editDesc2) {
            const edit1 = (Array.isArray(editDesc1.edit) ? editDesc1.edit[0] : editDesc1.edit);
            const edit2 = (Array.isArray(editDesc2.edit) ? editDesc2.edit[0] : editDesc2.edit);
            // Treat all no-op edits as if they should happen before all other edits (the order
            // doesn't really matter, as long as they sort out of the way of the real edits).
            if (!edit1) {
                return -1;
            }

            if (!edit2) {
                return 1;
            }

            return CodeMirror.cmpPos(edit2.start, edit1.start);
        });

        // Pull out the selections, in the same order as the edits.
        let result = _.cloneDeep(_.pluck(edits, "selection"));

        // Preflight the edits to specify "end" if unspecified and make sure they don't overlap.
        // (We don't want to do it during the actual edits, since we don't want to apply some of
        // the edits before we find out.)
        _.each(edits, function (editDesc, index: number) {
            oneOrEach(editDesc.edit, function (edit) {
                if (edit) {
                    if (!edit.end) {
                        edit.end = edit.start;
                    }
                    if (index > 0) {
                        const prevEditGroup = edits[index - 1].edit;
                        // The edits are in reverse order, so we want to make sure this edit ends
                        // before any of the previous ones start.
                        oneOrEach(prevEditGroup, function (prevEdit) {
                            if (CodeMirror.cmpPos(edit.end, prevEdit.start) > 0) {
                                throw new Error("Document.doMultipleEdits(): Overlapping edits specified");
                            }
                        });
                    }
                }
            });
        });

        // Perform the edits.
        this.batchOperation(function () {
            _.each(edits, function (editDesc, index: number) {
                // Perform this group of edits. The edit positions are guaranteed to be okay
                // since all the previous edits we've done have been later in the document. However,
                // we have to fix up any selections that overlap or come after the edit.
                oneOrEach(editDesc.edit, function (edit) {
                    if (edit) {
                        self.replaceRange(edit.text, edit.start, edit.end, origin);

                        // Fix up all the selections *except* the one(s) related to this edit list that
                        // are not "before-edit" selections.
                        const textLines = edit.text.split("\n");
                        _.each(result, function (selections, selIndex) {
                            if (selections) {
                                oneOrEach(selections, function (sel) {
                                    if (sel.isBeforeEdit || selIndex !== index) {
                                        sel.start = self.adjustPosForChange(sel.start, textLines, edit.start, edit.end);
                                        sel.end = self.adjustPosForChange(sel.end, textLines, edit.start, edit.end);
                                    }
                                });
                            }
                        });
                    }
                });
            });
        });

        // FIXME: sort is not available with _.chain in the types.
        result = (_ as any).chain(result)
            .filter(function (item) {
                return item !== undefined;
            })
            .flatten()
            .sort(function (sel1, sel2) {
                return CodeMirror.cmpPos(sel1.start, sel2.start);
            })
            .value();
        _.each(result, function (item) {
            delete item.isBeforeEdit;
        });
        return result;
    }

    /* (pretty toString(), to aid debugging) */
    public toString() {
        const dirtyInfo = (this.isDirty ? " (dirty!)" : " (clean)");
        const editorInfo = (this._masterEditor ? " (Editable)" : " (Non-editable)");
        const refInfo = " refs:" + this._refCount;
        return "[Document " + this.file.fullPath + dirtyInfo + editorInfo + refInfo + "]";
    }

    /**
     * Returns the language this document is written in.
     * The language returned is based on the file extension.
     * @return {Language} An object describing the language used in this document
     */
    public getLanguage() {
        return this.language;
    }

    /**
     * Updates the language to match the current mapping given by LanguageManager
     */
    public _updateLanguage() {
        const oldLanguage = this.language;
        this.language = LanguageManager.getLanguageForPath(this.file.fullPath);
        if (oldLanguage && oldLanguage !== this.language) {
            (this as unknown as EventDispatcher.DispatcherEvents).trigger("languageChanged", oldLanguage, this.language);
        }
    }

    /** Called when Document.file has been modified (due to a rename) */
    public _notifyFilePathChanged() {
        // File extension may have changed
        this._updateLanguage();
    }

    /**
     * Is this an untitled document?
     *
     * @return {boolean} - whether or not the document is untitled
     */
    public isUntitled() {
        return this.file instanceof InMemoryFile;
    }
}
EventDispatcher.makeEventDispatcher(Document.prototype);

// We dispatch events from the module level, and the instance level. Instance events are wired up
// in the Document constructor.
EventDispatcher.makeEventDispatcher(exports);
