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
 * Text-editing commands that apply to whichever Editor is currently focused
 */

// Load dependent modules
import * as Commands from "command/Commands";
import * as Strings from "strings";
import { Editor, Selection, LineSelection } from "editor/Editor";
import * as CommandManager from "command/CommandManager";
import * as EditorManager from "editor/EditorManager";
import * as CodeMirror from "thirdparty/CodeMirror/lib/codemirror";
import * as _ from "thirdparty/lodash";

interface EditGroup {
    text: string;
    start: CodeMirror.Pos;
    end?: CodeMirror.Pos;
}

interface SimpleEdit {
    edit: EditGroup;
}

interface EditText {
    edit: Array<EditGroup>;
    selection?: Array<Selection>;
}

interface EditLine {
    edit: EditGroup;
    selection: Selection;
}

/**
 * List of constants
 */
const DIRECTION_UP    = -1;
const DIRECTION_DOWN  = +1;

function _getMode(editor, mode) {
    const language = editor.document.getLanguage().getLanguageForMode(mode.name || mode);
    return {
        lineComment: language.getLineCommentPrefixes(),
        blockCommentStart: language.getBlockCommentPrefix(),
        blockCommentEnd: language.getBlockCommentSuffix()
    };
}

/**
 * Invokes a language-specific line-comment/uncomment handler
 * @param {?Editor} editor If unspecified, applies to the currently focused editor
 */
function lineComment(editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    editor._codeMirror.toggleLineComment({
        indent: Editor.getIndentLineComment(),
        padding: Editor.getPaddingComment(),
        commentBlankLines: Editor.getCommentBlankLines(),
        getMode: function (mode) {
            return _getMode(editor, mode);
        }
    });
}

/**
 * Invokes a language-specific block-comment/uncomment handler
 * @param {?Editor} editor If unspecified, applies to the currently focused editor
 */
function blockComment(editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    editor._codeMirror.toggleBlockComment({
        indent: Editor.getIndentLineComment(),
        padding: Editor.getPaddingComment(),
        getMode: function (mode) {
            return _getMode(editor, mode);
        }
    });
}

/**
 * Duplicates the selected text, or current line if no selection. The cursor/selection is left
 * on the second copy.
 */
function duplicateText(editor: Editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    const selections = editor.getSelections();
    let delimiter = "";
    const edits: Array<SimpleEdit> = [];
    const rangeSels: Array<Selection> = [];
    const cursorSels: Array<Selection> = [];
    const doc = editor.document;

    // When there are multiple selections, we want to handle all the cursors first (duplicating
    // their lines), then all the ranges (duplicating the ranges).
    _.each(selections, function (sel: Selection) {
        if (CodeMirror.cmpPos(sel.start, sel.end) === 0) {
            cursorSels.push(sel);
        } else {
            rangeSels.push(sel);
        }
    });

    const cursorLineSels = editor.convertToLineSelections(cursorSels);
    _.each(cursorLineSels, function (lineSel, index) {
        const sel = lineSel.selectionForEdit;
        if (sel.end.line === editor.lineCount()) {
            delimiter = "\n";
        }
        // Don't need to explicitly track selections since we are doing the edits in such a way that
        // the existing selections will get appropriately updated.
        edits.push({edit: {text: doc.getRange(sel.start, sel.end) + delimiter, start: sel.start }});
    });
    _.each(rangeSels, function (sel) {
        edits.push({edit: {text: doc.getRange(sel.start, sel.end), start: sel.start }});
    });

    doc.doMultipleEdits(edits);
}

/**
 * Deletes the current line if there is no selection or the lines for the selection
 * (removing the end of line too)
 */
function deleteCurrentLines(editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    // Walk the selections, calculating the deletion edits we need to do as we go;
    // document.doMultipleEdits() will take care of adjusting the edit locations when
    // it actually performs the edits.
    const doc = editor.document;
    let from;
    let to;
    const lineSelections = editor.convertToLineSelections(editor.getSelections());
    const edits: Array<SimpleEdit> = [];

    _.each(lineSelections, function (lineSel, index) {
        const sel = lineSel.selectionForEdit;

        from = sel.start;
        to = sel.end; // this is already at the beginning of the line after the last selected line
        if (to.line === editor.getLastVisibleLine() + 1) {
            // Instead of deleting the newline after the last line, delete the newline
            // before the beginning of the line--unless this is the entire visible content
            // of the editor, in which case just delete the line content.
            if (from.line > editor.getFirstVisibleLine()) {
                from.line -= 1;
                from.ch = doc.getLine(from.line).length;
            }
            to.line -= 1;
            to.ch = doc.getLine(to.line).length;
        }

        // We don't need to track the original selections, since they'll get collapsed as
        // part of the various deletions that occur.
        edits.push({edit: {text: "", start: from, end: to}});
    });
    doc.doMultipleEdits(edits);
}

/**
 * Moves the selected text, or current line if no selection. The cursor/selection
 * moves with the line/lines.
 * @param {Editor} editor - target editor
 * @param {Number} direction - direction of the move (-1,+1) => (Up,Down)
 */
function moveLine(editor: Editor, direction) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    const doc             = editor.document;
    const lineSelections  = editor.convertToLineSelections(editor.getSelections());
    const isInlineWidget  = !!EditorManager.getFocusedInlineWidget();
    const firstLine       = editor.getFirstVisibleLine();
    const lastLine        = editor.getLastVisibleLine();
    const totalLines      = editor.lineCount();
    let lineLength        = 0;
    const edits: Array<EditText> = [];
    let newSels           = [];
    let pos: CodeMirror.Pos = {};

    _.each(lineSelections, function (lineSel: LineSelection) {
        const sel = lineSel.selectionForEdit;
        const editGroup: Array<EditGroup> = [];

        // Make the move
        switch (direction) {
            case DIRECTION_UP:
                if (sel.start.line !== firstLine) {
                    let prevText = doc.getRange({ line: sel.start.line - 1, ch: 0 }, sel.start);

                    if (sel.end.line === lastLine + 1) {
                        if (isInlineWidget) {
                            prevText   = prevText.substring(0, prevText.length - 1);
                            lineLength = doc.getLine(sel.end.line - 1).length;
                            editGroup.push({text: "\n", start: { line: sel.end.line - 1, ch: lineLength }});
                        } else {
                            prevText = "\n" + prevText.substring(0, prevText.length - 1);
                        }
                    }

                    editGroup.push({text: "", start: { line: sel.start.line - 1, ch: 0 }, end: sel.start});
                    editGroup.push({text: prevText, start: { line: sel.end.line - 1, ch: 0 }});

                    // Make sure CodeMirror hasn't expanded the selection to include
                    // the line we inserted below.
                    _.each(lineSel.selectionsToTrack, function (originalSel) {
                        originalSel.start.line--;
                        originalSel.end.line--;
                    });

                    edits.push({edit: editGroup, selection: lineSel.selectionsToTrack});
                }
                break;
            case DIRECTION_DOWN:
                if (sel.end.line <= lastLine) {
                    let nextText      = doc.getRange(sel.end, { line: sel.end.line + 1, ch: 0 });
                    let deletionStart = sel.end;

                    if (sel.end.line === lastLine) {
                        if (isInlineWidget) {
                            if (sel.end.line === totalLines - 1) {
                                nextText += "\n";
                            }
                            lineLength = doc.getLine(sel.end.line - 1).length;
                            editGroup.push({text: "\n", start: { line: sel.end.line, ch: doc.getLine(sel.end.line).length }});
                        } else {
                            nextText     += "\n";
                            deletionStart = { line: sel.end.line - 1, ch: doc.getLine(sel.end.line - 1).length };
                        }
                    }

                    editGroup.push({text: "", start: deletionStart, end: { line: sel.end.line + 1, ch: 0 }});
                    if (lineLength) {
                        editGroup.push({text: "", start: { line: sel.end.line - 1, ch: lineLength }, end: { line: sel.end.line, ch: 0 }});
                    }
                    editGroup.push({text: nextText, start: { line: sel.start.line, ch: 0 }});

                    // In this case, we don't need to track selections, because the edits are done in such a way that
                    // the existing selections will automatically be updated properly by CodeMirror as it does the edits.
                    edits.push({edit: editGroup});
                }
                break;
        }
    });

    // Make sure selections are correct and primary selection is scrolled into view
    if (edits.length) {
        newSels = doc.doMultipleEdits(edits);

        pos.ch = 0;

        if (direction === DIRECTION_UP) {
            editor.setSelections(newSels);
            pos.line = editor.getSelection().start.line;
        } else if (direction === DIRECTION_DOWN) {
            pos.line = editor.getSelection().end.line;
        } else {
            console.error("EditorCommandHandler.moveLine() called with invalid argument 'direction' = %d", direction);
            pos = null;
        }

        editor._codeMirror.scrollIntoView(pos);
    }
}

/**
 * Moves the selected text, or current line if no selection, one line up. The cursor/selection
 * moves with the line/lines.
 */
function moveLineUp(editor) {
    moveLine(editor, DIRECTION_UP);
}

/**
 * Moves the selected text, or current line if no selection, one line down. The cursor/selection
 * moves with the line/lines.
 */
function moveLineDown(editor) {
    moveLine(editor, DIRECTION_DOWN);
}

/**
 * Inserts a new and smart indented line above/below the selected text, or current line if no selection.
 * The cursor is moved in the new line.
 * @param {Editor} editor - target editor
 * @param {Number} direction - direction where to place the new line (-1,+1) => (Up,Down)
 */
function openLine(editor: Editor, direction) {
    editor = editor || EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    const selections     = editor.getSelections();
    const isInlineWidget = !!EditorManager.getFocusedInlineWidget();
    const lastLine       = editor.getLastVisibleLine();
    const doc            = editor.document;
    const edits: Array<EditLine> = [];
    let newSelections;
    let line;

    // First, insert all the newlines (skipping multiple selections on the same line),
    // then indent them all. (We can't easily do them all at once, because doMultipleEdits()
    // won't do the indentation for us, but we want its help tracking any selection changes
    // as the result of the edits.)

    // Note that we don't just use `editor.getLineSelections()` here because we don't actually want
    // to coalesce adjacent selections - we just want to ignore dupes.

    doc.batchOperation(function () {
        _.each(selections, function (sel: Selection, index) {
            if (index === 0 ||
                    (direction === DIRECTION_UP && sel.start.line > selections[index - 1].start.line) ||
                    (direction === DIRECTION_DOWN && sel.end.line > selections[index - 1].end.line)) {
                // Insert the new line
                switch (direction) {
                    case DIRECTION_UP:
                        line = sel.start.line;
                        break;
                    case DIRECTION_DOWN:
                        line = sel.end.line;
                        if (!(CodeMirror.cmpPos(sel.start, sel.end) !== 0 && sel.end.ch === 0)) {
                            // If not linewise selection
                            line++;
                        }
                        break;
                }

                let insertPos;
                if (line > lastLine && isInlineWidget) {
                    insertPos = {line: line - 1, ch: doc.getLine(line - 1).length};
                } else {
                    insertPos = {line: line, ch: 0};
                }
                // We want the selection after this edit to be right before the \n we just inserted.
                edits.push({edit: {text: "\n", start: insertPos}, selection: {start: insertPos, end: insertPos, primary: sel.primary}});
            } else {
                // We just want to discard this selection, since we've already operated on the
                // same line and it would just collapse to the same location. But if this was
                // primary, make sure the last selection we did operate on ends up as primary.
                if (sel.primary) {
                    edits[edits.length - 1].selection.primary = true;
                }
            }
        });
        newSelections = doc.doMultipleEdits(edits, "+input");

        // Now indent each added line (which doesn't mess up any line numbers, and
        // we're going to set the character offset to the last position on each line anyway).
        _.each(newSelections, function (sel) {
            // This is a bit of a hack. The document is the one that batches operations, but we want
            // to use CodeMirror's "smart indent" operation. So we need to use the document's own backing editor's
            // CodeMirror to do the indentation. A better way to fix this would be to expose this
            // operation on Document, but I'm not sure we want to sign up for that as a public API.
            doc._masterEditor._codeMirror.indentLine(sel.start.line, "smart", true);
            sel.start.ch = null; // last character on line
            sel.end = sel.start;
        });
    });
    editor.setSelections(newSelections);
}

/**
 * Inserts a new and smart indented line above the selected text, or current line if no selection.
 * The cursor is moved in the new line.
 * @param {Editor} editor - target editor
 */
function openLineAbove(editor) {
    openLine(editor, DIRECTION_UP);
}

/**
 * Inserts a new and smart indented line below the selected text, or current line if no selection.
 * The cursor is moved in the new line.
 * @param {Editor} editor - target editor
 */
function openLineBelow(editor) {
    openLine(editor, DIRECTION_DOWN);
}

/**
 * Indent a line of text if no selection. Otherwise, indent all lines in selection.
 */
function indentText() {
    const editor = EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    editor._codeMirror.execCommand("indentMore");
}

/**
 * Unindent a line of text if no selection. Otherwise, unindent all lines in selection.
 */
function unindentText() {
    const editor = EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }

    editor._codeMirror.execCommand("indentLess");
}

function selectLine(editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (editor) {
        // We can just use `convertToLineSelections`, but throw away the original tracked selections and just use the
        // coalesced selections.
        editor.setSelections(_.pluck(editor.convertToLineSelections(editor.getSelections(), { expandEndAtStartOfLine: true }), "selectionForEdit"));
    }
}

/**
 * @private
 * Takes the current selection and splits each range into separate selections, one per line.
 * @param {!Editor} editor The editor to operate on.
 */
function splitSelIntoLines(editor) {
    editor = editor || EditorManager.getFocusedEditor();
    if (editor) {
        editor._codeMirror.execCommand("splitSelectionByLine");
    }
}

/**
 * @private
 * Adds a cursor on the next/previous line after/before each selected range to the selection.
 * @param {!Editor} editor The editor to operate on.
 * @param {number} dir The direction to add - 1 is down, -1 is up.
 */
function addCursorToSelection(editor, dir) {
    editor = editor || EditorManager.getFocusedEditor();
    if (editor) {
        const origSels = editor.getSelections();
        const newSels: Array<Selection> = [];
        _.each(origSels, function (sel) {
            let pos;
            let colOffset;
            if ((dir === -1 && sel.start.line > editor.getFirstVisibleLine()) || (dir === 1 && sel.end.line < editor.getLastVisibleLine())) {
                // Add a new cursor on the next line up/down. It's okay if it overlaps another selection, because CM
                // will take care of throwing it away in that case. It will also take care of clipping the char position
                // to the end of the new line if the line is shorter.
                pos = _.clone(dir === -1 ? sel.start : sel.end);

                // get sel column of current selection
                colOffset = editor.getColOffset(pos);

                pos.line += dir;

                // translate column to ch in line of new selection
                pos.ch = editor.getCharIndexForColumn(pos.line, colOffset);


                // If this is the primary selection, we want the new cursor we're adding to become the
                // primary selection.
                newSels.push({start: pos, end: pos, primary: sel.primary});
                sel.primary = false;
            }
        });
        // CM will take care of sorting the selections.
        editor.setSelections(origSels.concat(newSels));
    }
}

/**
 * @private
 * Adds a cursor on the previous line before each selected range to the selection.
 * @param {!Editor} editor The editor to operate on.
 */
function addCursorToPrevLine(editor) {
    addCursorToSelection(editor, -1);
}

/**
 * @private
 * Adds a cursor on the next line after each selected range to the selection.
 * @param {!Editor} editor The editor to operate on.
 */
function addCursorToNextLine(editor) {
    addCursorToSelection(editor, 1);
}

function handleUndoRedo(operation) {
    const editor = EditorManager.getFocusedEditor();
    const result = $.Deferred();

    if (editor) {
        editor[operation]();
        result.resolve();
    } else {
        result.reject();
    }

    return result.promise();
}

function handleUndo() {
    return handleUndoRedo("undo");
}

function handleRedo() {
    return handleUndoRedo("redo");
}

function _handleSelectAll() {
    const result = $.Deferred();
    const editor = EditorManager.getFocusedEditor();

    if (editor) {
        editor.selectAllNoScroll();
        result.resolve();
    } else {
        result.reject();    // command not handled
    }

    return result.promise();
}

function _execCommand(cmd) {
    window.document.execCommand(cmd);
}
function _execCommandCut() {
    _execCommand("cut");
}
function _execCommandCopy() {
    _execCommand("copy");
}
function _execCommandPaste() {
    _execCommand("paste");
}

// Register commands
CommandManager.register(Strings.CMD_INDENT,                 Commands.EDIT_INDENT,                 indentText);
CommandManager.register(Strings.CMD_UNINDENT,               Commands.EDIT_UNINDENT,               unindentText);
CommandManager.register(Strings.CMD_COMMENT,                Commands.EDIT_LINE_COMMENT,           lineComment);
CommandManager.register(Strings.CMD_BLOCK_COMMENT,          Commands.EDIT_BLOCK_COMMENT,          blockComment);
CommandManager.register(Strings.CMD_DUPLICATE,              Commands.EDIT_DUPLICATE,              duplicateText);
CommandManager.register(Strings.CMD_DELETE_LINES,           Commands.EDIT_DELETE_LINES,           deleteCurrentLines);
CommandManager.register(Strings.CMD_LINE_UP,                Commands.EDIT_LINE_UP,                moveLineUp);
CommandManager.register(Strings.CMD_LINE_DOWN,              Commands.EDIT_LINE_DOWN,              moveLineDown);
CommandManager.register(Strings.CMD_OPEN_LINE_ABOVE,        Commands.EDIT_OPEN_LINE_ABOVE,        openLineAbove);
CommandManager.register(Strings.CMD_OPEN_LINE_BELOW,        Commands.EDIT_OPEN_LINE_BELOW,        openLineBelow);
CommandManager.register(Strings.CMD_SELECT_LINE,            Commands.EDIT_SELECT_LINE,            selectLine);
CommandManager.register(Strings.CMD_SPLIT_SEL_INTO_LINES,   Commands.EDIT_SPLIT_SEL_INTO_LINES,   splitSelIntoLines);
CommandManager.register(Strings.CMD_ADD_CUR_TO_NEXT_LINE,   Commands.EDIT_ADD_CUR_TO_NEXT_LINE,   addCursorToNextLine);
CommandManager.register(Strings.CMD_ADD_CUR_TO_PREV_LINE,   Commands.EDIT_ADD_CUR_TO_PREV_LINE,   addCursorToPrevLine);

CommandManager.register(Strings.CMD_UNDO,                   Commands.EDIT_UNDO,                   handleUndo);
CommandManager.register(Strings.CMD_REDO,                   Commands.EDIT_REDO,                   handleRedo);
CommandManager.register(Strings.CMD_CUT,                    Commands.EDIT_CUT,                    _execCommandCut);
CommandManager.register(Strings.CMD_COPY,                   Commands.EDIT_COPY,                   _execCommandCopy);
CommandManager.register(Strings.CMD_PASTE,                  Commands.EDIT_PASTE,                  _execCommandPaste);
CommandManager.register(Strings.CMD_SELECT_ALL,             Commands.EDIT_SELECT_ALL,             _handleSelectAll);
