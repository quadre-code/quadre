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
 * Editor is a 1-to-1 wrapper for a CodeMirror editor instance. It layers on Brackets-specific
 * functionality and provides APIs that cleanly pass through the bits of CodeMirror that the rest
 * of our codebase may want to interact with. An Editor is always backed by a Document, and stays
 * in sync with its content; because Editor keeps the Document alive, it's important to always
 * destroy() an Editor that's going away so it can release its Document ref.
 *
 * For now, there's a distinction between the "master" Editor for a Document - which secretly acts
 * as the Document's internal model of the text state - and the multitude of "slave" secondary Editors
 * which, via Document, sync their changes to and from that master.
 *
 * For now, direct access to the underlying CodeMirror object is still possible via `_codeMirror` --
 * but this is considered deprecated and may go away.
 *
 * The Editor object dispatches the following events:
 *    - keydown, keypress, keyup -- When any key event happens in the editor (whether it changes the
 *      text or not). Handlers are passed `(BracketsEvent, Editor, KeyboardEvent)`. The 3nd arg is the
 *      raw DOM event. Note: most listeners will only want to listen for "keypress".
 *    - cursorActivity -- When the user moves the cursor or changes the selection, or an edit occurs.
 *      Note: do not listen to this in order to be generally informed of edits--listen to the
 *      "change" event on Document instead.
 *    - scroll -- When the editor is scrolled, either by user action or programmatically.
 *    - lostContent -- When the backing Document changes in such a way that this Editor is no longer
 *      able to display accurate text. This occurs if the Document's file is deleted, or in certain
 *      Document->editor syncing edge cases that we do not yet support (the latter cause will
 *      eventually go away).
 *    - optionChange -- Triggered when an option for the editor is changed. The 2nd arg to the listener
 *      is a string containing the editor option that is changing. The 3rd arg, which can be any
 *      data type, is the new value for the editor option.
 *    - beforeDestroy - Triggered before the object is about to dispose of all its internal state data
 *      so that listeners can cache things like scroll pos, etc...
 *
 * The Editor also dispatches "change" events internally, but you should listen for those on
 * Documents, not Editors.
 *
 * To listen for events, do something like this: (see EventDispatcher for details on this pattern)
 *     `editorInstance.on("eventname", handler);`
 */

import * as AnimationUtils from "utils/AnimationUtils";
import * as Async from "utils/Async";
import * as CodeMirror from "codemirror";
import * as LanguageManager from "language/LanguageManager";
import * as EventDispatcher from "utils/EventDispatcher";
import * as Menus from "command/Menus";
import * as PerfUtils from "utils/PerfUtils";
import * as PopUpManager from "widgets/PopUpManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as Strings from "strings";
import { TextRange } from "document/TextRange";
import * as TokenUtils from "utils/TokenUtils";
import * as ValidationUtils from "utils/ValidationUtils";
import * as HTMLUtils from "language/HTMLUtils";
import * as ViewUtils from "utils/ViewUtils";
import * as MainViewManager from "view/MainViewManager";
import * as _ from "lodash";

interface Gutter {
    name: string;
    priority: number;
    languages?: Array<string>;
}

export interface Selection {
    start: CodeMirror.Position;
    end: CodeMirror.Position;
    reversed?: boolean;
    primary?: boolean;
}

export interface LineSelection {
    selectionForEdit: Selection;
    selectionsToTrack: Array<Selection>;
}

interface CmSelection {
    anchor: CodeMirror.Position;
    head: CodeMirror.Position;
}

/** Editor preferences */

enum EditorOptions {
    CLOSE_BRACKETS      = "closeBrackets",
    CLOSE_TAGS          = "closeTags",
    DRAG_DROP           = "dragDropText",
    HIGHLIGHT_MATCHES   = "highlightMatches",
    LINEWISE_COPY_CUT   = "lineWiseCopyCut",
    SCROLL_PAST_END     = "scrollPastEnd",
    SHOW_CURSOR_SELECT  = "showCursorWhenSelecting",
    SHOW_LINE_NUMBERS   = "showLineNumbers",
    SMART_INDENT        = "smartIndent",
    SOFT_TABS           = "softTabs",
    SPACE_UNITS         = "spaceUnits",
    STYLE_ACTIVE_LINE   = "styleActiveLine",
    TAB_SIZE            = "tabSize",
    UPPERCASE_COLORS    = "uppercaseColors",
    USE_TAB_CHAR        = "useTabChar",
    WORD_WRAP           = "wordWrap",
    AUTO_HIDE_SEARCH    = "autoHideSearch",
    INDENT_LINE_COMMENT = "indentLineComment",
    PADDING_COMMENT     = "paddingComment",
    COMMENT_BLANK_LINES = "commentBlankLines",
    INPUT_STYLE         = "inputStyle",
}

/**
 * A list of gutter name and priorities currently registered for editors.
 * The line number gutter is defined as { name: LINE_NUMBER_GUTTER, priority: 100 }
 * @type {Array.<{name: string, priority: number, languageIds: Array}}
 */
let registeredGutters: Array<Gutter> = [];

const cmOptions         = {};

/**
 * Constants
 * @type {number}
 */
const MIN_SPACE_UNITS         =  1;
const MIN_TAB_SIZE            =  1;
const DEFAULT_SPACE_UNITS     =  4;
const DEFAULT_TAB_SIZE        =  4;
const MAX_SPACE_UNITS         = 10;
const MAX_TAB_SIZE            = 10;

const LINE_NUMBER_GUTTER = "CodeMirror-linenumbers";
const LINE_NUMBER_GUTTER_PRIORITY     = 100;
const CODE_FOLDING_GUTTER_PRIORITY    = 1000;

/** @const */
const CENTERING_MARGIN = 0.15;

// Mappings from Brackets preferences to CodeMirror options
cmOptions[EditorOptions.CLOSE_BRACKETS]     = "autoCloseBrackets";
cmOptions[EditorOptions.CLOSE_TAGS]         = "autoCloseTags";
cmOptions[EditorOptions.DRAG_DROP]          = "dragDrop";
cmOptions[EditorOptions.HIGHLIGHT_MATCHES]  = "highlightSelectionMatches";
cmOptions[EditorOptions.LINEWISE_COPY_CUT]  = "lineWiseCopyCut";
cmOptions[EditorOptions.SCROLL_PAST_END]    = "scrollPastEnd";
cmOptions[EditorOptions.SHOW_CURSOR_SELECT] = "showCursorWhenSelecting";
cmOptions[EditorOptions.SHOW_LINE_NUMBERS]  = "lineNumbers";
cmOptions[EditorOptions.SMART_INDENT]       = "smartIndent";
cmOptions[EditorOptions.SPACE_UNITS]        = "indentUnit";
cmOptions[EditorOptions.STYLE_ACTIVE_LINE]  = "styleActiveLine";
cmOptions[EditorOptions.TAB_SIZE]           = "tabSize";
cmOptions[EditorOptions.USE_TAB_CHAR]       = "indentWithTabs";
cmOptions[EditorOptions.WORD_WRAP]          = "lineWrapping";
cmOptions[EditorOptions.INPUT_STYLE]        = "inputStyle";

PreferencesManager.definePreference(EditorOptions.CLOSE_BRACKETS,     "boolean", true, {
    description: Strings.DESCRIPTION_CLOSE_BRACKETS
});

// CodeMirror, html mode, set some tags do not close automatically.
// We do not initialize "dontCloseTags" because otherwise we would overwrite the default behavior of CodeMirror.
PreferencesManager.definePreference(EditorOptions.CLOSE_TAGS,         "object", { whenOpening: true, whenClosing: true, indentTags: [] }, {
    description: Strings.DESCRIPTION_CLOSE_TAGS,
    keys: {
        dontCloseTags: {
            type: "array",
            description: Strings.DESCRIPTION_CLOSE_TAGS_DONT_CLOSE_TAGS
        },
        whenOpening: {
            type: "boolean",
            description: Strings.DESCRIPTION_CLOSE_TAGS_WHEN_OPENING,
            initial: true
        },
        whenClosing: {
            type: "boolean",
            description: Strings.DESCRIPTION_CLOSE_TAGS_WHEN_CLOSING,
            initial: true
        },
        indentTags: {
            type: "array",
            description: Strings.DESCRIPTION_CLOSE_TAGS_INDENT_TAGS
        }
    }
});
PreferencesManager.definePreference(EditorOptions.DRAG_DROP,          "boolean", false, {
    description: Strings.DESCRIPTION_DRAG_DROP_TEXT
});
PreferencesManager.definePreference(EditorOptions.HIGHLIGHT_MATCHES,  "boolean", false, {
    description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES,
    keys: {
        showToken: {
            type: "boolean",
            description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES_SHOW_TOKEN,
            initial: false
        },
        wordsOnly: {
            type: "boolean",
            description: Strings.DESCRIPTION_HIGHLIGHT_MATCHES_WORDS_ONLY,
            initial: false
        }
    }
});
PreferencesManager.definePreference(EditorOptions.LINEWISE_COPY_CUT,  "boolean", true, {
    description: Strings.DESCRIPTION_LINEWISE_COPY_CUT
});
PreferencesManager.definePreference(EditorOptions.SCROLL_PAST_END,    "boolean", false, {
    description: Strings.DESCRIPTION_SCROLL_PAST_END
});
PreferencesManager.definePreference(EditorOptions.SHOW_CURSOR_SELECT, "boolean", false, {
    description: Strings.DESCRIPTION_SHOW_CURSOR_WHEN_SELECTING
});
PreferencesManager.definePreference(EditorOptions.SHOW_LINE_NUMBERS,  "boolean", true, {
    description: Strings.DESCRIPTION_SHOW_LINE_NUMBERS
});
PreferencesManager.definePreference(EditorOptions.SMART_INDENT,       "boolean", true, {
    description: Strings.DESCRIPTION_SMART_INDENT
});
PreferencesManager.definePreference(EditorOptions.SOFT_TABS,          "boolean", true, {
    description: Strings.DESCRIPTION_SOFT_TABS
});
PreferencesManager.definePreference(EditorOptions.SPACE_UNITS,        "number", DEFAULT_SPACE_UNITS, {
    validator: _.partialRight(ValidationUtils.isIntegerInRange, MIN_SPACE_UNITS, MAX_SPACE_UNITS),
    description: Strings.DESCRIPTION_SPACE_UNITS
});
PreferencesManager.definePreference(EditorOptions.STYLE_ACTIVE_LINE,  "boolean", false, {
    description: Strings.DESCRIPTION_STYLE_ACTIVE_LINE
});
PreferencesManager.definePreference(EditorOptions.TAB_SIZE,           "number", DEFAULT_TAB_SIZE, {
    validator: _.partialRight(ValidationUtils.isIntegerInRange, MIN_TAB_SIZE, MAX_TAB_SIZE),
    description: Strings.DESCRIPTION_TAB_SIZE
});
PreferencesManager.definePreference(EditorOptions.UPPERCASE_COLORS,   "boolean", false, {
    description: Strings.DESCRIPTION_UPPERCASE_COLORS
});
PreferencesManager.definePreference(EditorOptions.USE_TAB_CHAR,       "boolean", false, {
    description: Strings.DESCRIPTION_USE_TAB_CHAR
});
PreferencesManager.definePreference(EditorOptions.WORD_WRAP,          "boolean", true, {
    description: Strings.DESCRIPTION_WORD_WRAP
});

PreferencesManager.definePreference(EditorOptions.AUTO_HIDE_SEARCH,   "boolean", false, {
    description: Strings.DESCRIPTION_SEARCH_AUTOHIDE
});

PreferencesManager.definePreference(EditorOptions.INDENT_LINE_COMMENT,  "boolean", true, {
    description: Strings.DESCRIPTION_INDENT_LINE_COMMENT
});
PreferencesManager.definePreference(EditorOptions.PADDING_COMMENT, "string", " ", {
    description: Strings.DESCRIPTION_PADDING_COMMENT
});
PreferencesManager.definePreference(EditorOptions.COMMENT_BLANK_LINES, "boolean", false, {
    description: Strings.DESCRIPTION_COMMENT_BLANK_LINES
});

PreferencesManager.definePreference(EditorOptions.INPUT_STYLE,  "string", "textarea", {
    description: Strings.DESCRIPTION_INPUT_STYLE
});

const editorOptions = Object.keys(cmOptions);

/** Editor preferences */

/**
 * Guard flag to prevent focus() reentrancy (via blur handlers), even across Editors
 * @type {boolean}
 */
let _duringFocus = false;

/**
 * Constant: ignore upper boundary when centering text
 * @type {number}
 */
export const BOUNDARY_CHECK_NORMAL   = 0;
export const BOUNDARY_IGNORE_TOP     = 1;

/**
 * @private
 * Create a copy of the given CodeMirror position
 * @param {!CodeMirror.Pos} pos
 * @return {CodeMirror.Pos}
 */
function _copyPos(pos) {
    return new CodeMirror.Pos(pos.line, pos.ch);
}

/**
 * Helper functions to check options.
 * @param {number} options BOUNDARY_CHECK_NORMAL or BOUNDARY_IGNORE_TOP
 */
function _checkTopBoundary(options) {
    return (options !== BOUNDARY_IGNORE_TOP);
}

function _checkBottomBoundary(options) {
    return true;
}

/**
 * Helper function to build preferences context based on the full path of
 * the file.
 *
 * @param {string} fullPath Full path of the file
 *
 * @return {*} A context for the specified file name
 */
function _buildPreferencesContext(fullPath) {
    return PreferencesManager._buildContext(fullPath,
        fullPath ? LanguageManager.getLanguageForPath(fullPath).getId() : undefined);
}

/**
 * List of all current (non-destroy()ed) Editor instances. Needed when changing global preferences
 * that affect all editors, e.g. tabbing or color scheme settings.
 * @type {Array.<Editor>}
 */
const _instances: Array<Editor> = [];

/**
 * Creates a new CodeMirror editor instance bound to the given Document. The Document need not have
 * a "master" Editor realized yet, even if makeMasterEditor is false; in that case, the first time
 * an edit occurs we will automatically ask EditorManager to create a "master" editor to render the
 * Document modifiable.
 *
 * ALWAYS call destroy() when you are done with an Editor - otherwise it will leak a Document ref.
 *
 * @constructor
 *
 * @param {!Document} document
 * @param {!boolean} makeMasterEditor  If true, this Editor will set itself as the (secret) "master"
 *          Editor for the Document. If false, this Editor will attach to the Document as a "slave"/
 *          secondary editor.
 * @param {!jQueryObject|DomNode} container  Container to add the editor to.
 * @param {{startLine: number, endLine: number}=} range If specified, range of lines within the document
 *          to display in this editor. Inclusive.
 * @param {!Object} options If specified, contains editor options that can be passed to CodeMirror
 */
export class Editor {
    /**
     * The Document we're bound to
     * @type {!Document}
     */
    public document;

    /**
     * The Editor's last known width.
     * Used in conjunction with updateLayout to recompute the layout
     * if the the parent container changes its size since our last layout update.
     * @type {?number}
     */
    private _lastEditorWidth: number | null = null;

    /**
     * If true, we're in the middle of syncing to/from the Document. Used to ignore spurious change
     * events caused by us (vs. change events caused by others, which we need to pay attention to).
     * @type {!boolean}
     */
    private _duringSync = false;

    /**
     * @private
     * NOTE: this is actually "semi-private": EditorManager also accesses this field... as well as
     * a few other modules. However, we should try to gradually move most code away from talking to
     * CodeMirror directly.
     * @type {!CodeMirror}
     */
    public _codeMirror: CodeMirror.Editor & CodeMirror.Doc;

    /**
     * @private
     * @type {!Array.<{id:number, data:Object}>}
     */
    private _inlineWidgets;

    /**
     * @private
     * @type {?TextRange}
     */
    private _visibleRange: TextRange | null = null;

    /**
     * @private
     * @type {Object}
     * Promise queues for inline widgets being added to a given line.
     */
    private _inlineWidgetQueues;

    /**
     * @private
     * @type {Array}
     * A list of objects corresponding to the markers that are hiding lines in the current editor.
     */
    private _hideMarks;

    private _$messagePopover: JQuery | null;
    private _paneId;
    public _hostEditor;
    private _currentOptions;
    private _focused;
    public $el: JQuery;

    constructor(document, makeMasterEditor, container, range?, options?) {
        const self = this;

        const isReadOnly = options && options.isReadOnly;

        _instances.push(this);

        // Attach to document: add ref & handlers
        this.document = document;
        document.addRef();

        if (container.jquery) {
            // CodeMirror wants a DOM element, not a jQuery wrapper
            container = container.get(0);
        }

        const $container = $(container);

        if (range) {    // attach this first: want range updated before we process a change
            this._visibleRange = new TextRange(document, range.startLine, range.endLine);
        }

        // store this-bound version of listeners so we can remove them later
        this._handleDocumentChange = this._handleDocumentChange.bind(this);
        this._handleDocumentDeleted = this._handleDocumentDeleted.bind(this);
        this._handleDocumentLanguageChanged = this._handleDocumentLanguageChanged.bind(this);
        this._doWorkingSetSync = this._doWorkingSetSync.bind(this);
        document.on("change", this._handleDocumentChange);
        document.on("deleted", this._handleDocumentDeleted);
        document.on("languageChanged", this._handleDocumentLanguageChanged);
        // To sync working sets if the view is for same doc across panes
        document.on("_dirtyFlagChange", this._doWorkingSetSync);

        const mode = this._getModeFromDocument();

        // (if makeMasterEditor, we attach the Doc back to ourselves below once we're fully initialized)

        this._inlineWidgets = [];
        this._inlineWidgetQueues = {};
        this._hideMarks = [];
        this._lastEditorWidth = null;

        this._$messagePopover = null;

        // To track which pane the editor is being attached to if it's a full editor
        this._paneId = null;

        // To track the parent editor ( host editor at that time of creation) of an inline editor
        this._hostEditor = null;

        // Editor supplies some standard keyboard behavior extensions of its own
        const codeMirrorKeyMap = {
            // calls to triggerKeyboardShortcut are here to stop codemirror stealing shortcuts
            // note: order of shift and ctrl must be reversed
            "Ctrl-D": function () { (window as any).triggerKeyboardShortcut("Ctrl-D"); },
            "Shift-Ctrl-Up": function () { (window as any).triggerKeyboardShortcut("Ctrl-Shift-Up"); },
            "Shift-Ctrl-Down": function () { (window as any).triggerKeyboardShortcut("Ctrl-Shift-Down"); },

            "Tab": function () { self._handleTabKey(); },
            "Shift-Tab": "indentLess",

            "Left": function (instance) {
                self._handleSoftTabNavigation(-1, "moveH");
            },
            "Right": function (instance) {
                self._handleSoftTabNavigation(1, "moveH");
            },
            "Backspace": function (instance) {
                self._handleSoftTabNavigation(-1, "deleteH");
            },
            "Delete": function (instance) {
                self._handleSoftTabNavigation(1, "deleteH");
            },
            "Esc": function (instance) {
                if (self.getSelections().length > 1) {
                    CodeMirror.commands.singleSelection(instance);
                } else {
                    self.removeAllInlineWidgets();
                }
            },
            "Home":      "goLineLeftSmart",
            "Cmd-Left":  "goLineLeftSmart",
            "End":       "goLineRight",
            "Cmd-Right": "goLineRight"
        };

        const currentOptions = this._currentOptions = _.zipObject(
            editorOptions,
            _.map(editorOptions, function (prefName) {
                return self._getOption(prefName);
            })
        );

        // When panes are created *after* the showLineNumbers option has been turned off
        //  we need to apply the show-line-padding class or the text will be juxtaposed
        //  to the edge of the editor which makes it not easy to read.  The code below to handle
        //  that the option change only applies the class to panes that have already been created
        // This line ensures that the class is applied to any editor created after the fact
        $container.toggleClass("show-line-padding", Boolean(!this._getOption("showLineNumbers")));

        // Create the CodeMirror instance
        // (note: CodeMirror doesn't actually require using 'new', but jslint complains without it)
        (this._codeMirror as any) = CodeMirror(container, {
            autoCloseBrackets           : currentOptions[EditorOptions.CLOSE_BRACKETS],
            autoCloseTags               : currentOptions[EditorOptions.CLOSE_TAGS],
            coverGutterNextToScrollbar  : true,
            cursorScrollMargin          : 3,
            dragDrop                    : currentOptions[EditorOptions.DRAG_DROP],
            electricChars               : true,
            extraKeys                   : codeMirrorKeyMap,
            highlightSelectionMatches   : currentOptions[EditorOptions.HIGHLIGHT_MATCHES],
            indentUnit                  : currentOptions[EditorOptions.USE_TAB_CHAR] ? currentOptions[EditorOptions.TAB_SIZE] : currentOptions[EditorOptions.SPACE_UNITS],
            indentWithTabs              : currentOptions[EditorOptions.USE_TAB_CHAR],
            inputStyle                  : currentOptions[EditorOptions.INPUT_STYLE],
            lineNumbers                 : currentOptions[EditorOptions.SHOW_LINE_NUMBERS],
            lineWiseCopyCut             : currentOptions[EditorOptions.LINEWISE_COPY_CUT],
            lineWrapping                : currentOptions[EditorOptions.WORD_WRAP],
            matchBrackets               : { maxScanLineLength: 50000, maxScanLines: 1000 },
            matchTags                   : { bothTags: true },
            scrollPastEnd               : !range && currentOptions[EditorOptions.SCROLL_PAST_END],
            showCursorWhenSelecting     : currentOptions[EditorOptions.SHOW_CURSOR_SELECT],
            smartIndent                 : currentOptions[EditorOptions.SMART_INDENT],
            styleActiveLine             : currentOptions[EditorOptions.STYLE_ACTIVE_LINE],
            tabSize                     : currentOptions[EditorOptions.TAB_SIZE],
            readOnly                    : isReadOnly
        });

        // Can't get CodeMirror's focused state without searching for
        // CodeMirror-focused. Instead, track focus via onFocus and onBlur
        // options and track state with this._focused
        this._focused = false;

        this._installEditorListeners();

        this._renderGutters();

        (this as unknown as EventDispatcher.DispatcherEvents).on("cursorActivity", function (event, editor) {
            self._handleCursorActivity(event);
        });
        (this as unknown as EventDispatcher.DispatcherEvents).on("keypress", function (event, editor, domEvent) {
            self._handleKeypressEvents(domEvent);
        });
        (this as unknown as EventDispatcher.DispatcherEvents).on("change", function (event, editor, changeList) {
            self._handleEditorChange(changeList);
        });
        (this as unknown as EventDispatcher.DispatcherEvents).on("focus", function (event, editor) {
            if (self._hostEditor) {
                // Mark the host editor as the master editor for the hosting document
                self._hostEditor.document._toggleMasterEditor(self._hostEditor);
            } else {
                // Set this full editor as master editor for the document
                self.document._toggleMasterEditor(self);
            }
        });

        // Set code-coloring mode BEFORE populating with text, to avoid a flash of uncolored text
        this._codeMirror.setOption("mode", mode);

        // Initially populate with text. This will send a spurious change event, so need to make
        // sure this is understood as a 'sync from document' case, not a genuine edit
        this._duringSync = true;
        this._resetText(document.getText());
        this._duringSync = false;

        if (range) {
            this._updateHiddenLines();
            this.setCursorPos(range.startLine, 0);
        }

        // Now that we're fully initialized, we can point the document back at us if needed
        if (makeMasterEditor) {
            document._makeEditable(this);
        }

        // Add scrollTop property to this object for the scroll shadow code to use
        Object.defineProperty(this, "scrollTop", {
            get: function () {
                return this._codeMirror.getScrollInfo().top;
            }
        });

        // Add an $el getter for Pane Views
        Object.defineProperty(this,  "$el", {
            get: function () {
                return $(this.getRootElement());
            }
        });
    }

    public markPaneId(paneId) {
        this._paneId = paneId;

        // Also add this to the pool of full editors
        this.document._associateEditor(this);

        // In case this Editor is initialized not as the first full editor for the document
        // and the document is already dirty and present in another working set, make sure
        // to add this documents to the new panes working set.
        this._doWorkingSetSync(null, this.document);
    }

    private _doWorkingSetSync(event, doc) {
        if (doc === this.document && this._paneId && this.document.isDirty) {
            MainViewManager.addToWorkingSet(this._paneId, this.document.file, -1, false);
        }
    }

    /**
     * Removes this editor from the DOM and detaches from the Document. If this is the "master"
     * Editor that is secretly providing the Document's backing state, then the Document reverts to
     * a read-only string-backed mode.
     */
    public destroy() {
        (this as unknown as EventDispatcher.DispatcherEvents).trigger("beforeDestroy", this);

        // CodeMirror docs for getWrapperElement() say all you have to do is "Remove this from your
        // tree to delete an editor instance."
        $(this.getRootElement()).remove();

        _instances.splice(_instances.indexOf(this), 1);

        // Disconnect from Document
        this.document.releaseRef();
        this.document.off("change", this._handleDocumentChange);
        this.document.off("deleted", this._handleDocumentDeleted);
        this.document.off("languageChanged", this._handleDocumentLanguageChanged);
        this.document.off("_dirtyFlagChange", this._doWorkingSetSync);

        if (this._visibleRange) {   // TextRange also refs the Document
            this._visibleRange.dispose();
        }

        // If we're the Document's master editor, disconnecting from it has special meaning
        if (this.document._masterEditor === this) {
            this.document._makeNonEditable();
        } else {
            this.document._disassociateEditor(this);
        }

        // Destroying us destroys any inline widgets we're hosting. Make sure their closeCallbacks
        // run, at least, since they may also need to release Document refs
        const self = this;
        this._inlineWidgets.forEach(function (inlineWidget) {
            self._removeInlineWidgetInternal(inlineWidget);
        });
    }

    /**
     * @private
     * Handle any cursor movement in editor, including selecting and unselecting text.
     * @param {!Event} event
     */
    private _handleCursorActivity(event) {
        this._updateStyleActiveLine();
    }

    /**
     * @private
     * Removes any whitespace after one of ]{}) to prevent trailing whitespace when auto-indenting
     */
    private _handleWhitespaceForElectricChars() {
        const self        = this;
        const instance    = this._codeMirror;

        const selections = this.getSelections().map(function (sel) {
            const lineStr = instance.getLine(sel.end.line);

            if (lineStr && !/\S/.test(lineStr)) {
                // if the line is all whitespace, move the cursor to the end of the line
                // before indenting so that embedded whitespace such as indents are not
                // orphaned to the right of the electric char being inserted
                sel.end.ch = self.document.getLine(sel.end.line).length;
            }
            return sel;
        });
        this.setSelections(selections);
    }

    /**
     * @private
     * Handle CodeMirror key events.
     * @param {!Event} event
     */
    private _handleKeypressEvents(event) {
        const keyStr = String.fromCharCode(event.which || event.keyCode);

        if (/[\]{})]/.test(keyStr)) {
            this._handleWhitespaceForElectricChars();
        }
    }

    /**
     * @private
     * Helper function for `_handleTabKey()` (case 2) - see comment in that function.
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *     The selections to indent.
     */
    private _addIndentAtEachSelection(selections) {
        const instance = this._codeMirror;
        const usingTabs = instance.getOption("indentWithTabs");
        const indentUnit = instance.getOption("indentUnit");
        const edits: Array<any> = [];

        _.each(selections, function (sel) {
            let indentStr = "";
            if (usingTabs) {
                indentStr = "\t";
            } else {
                const numSpaces = indentUnit - (sel.start.ch % indentUnit);
                for (let i = 0; i < numSpaces; i++) {
                    indentStr += " ";
                }
            }
            edits.push({edit: {text: indentStr, start: sel.start}});
        });

        this.document.doMultipleEdits(edits);
    }

    /**
     * @private
     * Helper function for `_handleTabKey()` (case 3) - see comment in that function.
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *     The selections to indent.
     */
    private _autoIndentEachSelection(selections: Array<Selection>) {
        // Capture all the line lengths, so we can tell if anything changed.
        // Note that this function should only be called if all selections are within a single line.
        const instance = this._codeMirror;
        const lineLengths = {};
        _.each(selections, function (sel) {
            lineLengths[sel.start.line] = instance.getLine(sel.start.line).length;
        });

        // First, try to do a smart indent on all selections.
        CodeMirror.commands.indentAuto(instance);

        // If there were no code or selection changes, then indent each selection one more indent.
        let changed = false;
        const newSelections = this.getSelections();
        if (newSelections.length === selections.length) {
            _.each(selections, function (sel, index) {
                const newSel = newSelections[index];
                if (CodeMirror.cmpPos(sel.start, newSel.start) !== 0 ||
                        CodeMirror.cmpPos(sel.end, newSel.end) !== 0 ||
                        instance.getLine(sel.start.line).length !== lineLengths[sel.start.line]) {
                    changed = true;
                    // Bail - we don't need to look any further once we've found a change.
                    return false;
                }

                return undefined;
            });
        } else {
            changed = true;
        }

        if (!changed) {
            CodeMirror.commands.indentMore(instance);
        }
    }

    /**
     * @private
     * Handle Tab key press.
     */
    private _handleTabKey() {
        // Tab key handling is done as follows:
        // 1. If any of the selections are multiline, just add one indent level to the
        //    beginning of all lines that intersect any selection.
        // 2. Otherwise, if any of the selections is a cursor or single-line range that
        //    ends at or after the first non-whitespace character in a line:
        //    - if indentation is set to tabs, just insert a hard tab before each selection.
        //    - if indentation is set to spaces, insert the appropriate number of spaces before
        //      each selection to get to its next soft tab stop.
        // 3. Otherwise (all selections are cursors or single-line, and are in the whitespace
        //    before their respective lines), try to autoindent each line based on the mode.
        //    If none of the cursors moved and no space was added, then add one indent level
        //    to the beginning of all lines.

        // Note that in case 2, we do the "dumb" insertion even if the cursor is immediately
        // before the first non-whitespace character in a line. It might seem more convenient
        // to do autoindent in that case. However, the problem is if that line is already
        // indented past its "proper" location. In that case, we don't want Tab to
        // *outdent* the line. If we had more control over the autoindent algorithm or
        // implemented it ourselves, we could handle that case separately.

        const instance = this._codeMirror;
        let selectionType = "indentAuto";
        const selections = this.getSelections();

        _.each(selections, function (sel) {
            if (sel.start.line !== sel.end.line) {
                // Case 1 - we found a multiline selection. We can bail as soon as we find one of these.
                selectionType = "indentAtBeginning";
                return false;
            }

            if (sel.end.ch > 0 && sel.end.ch >= instance.getLine(sel.end.line).search(/\S/)) {
                // Case 2 - we found a selection that ends at or after the first non-whitespace
                // character on the line. We need to keep looking in case we find a later multiline
                // selection though.
                selectionType = "indentAtSelection";
            }

            return undefined;
        });

        switch (selectionType) {
            case "indentAtBeginning":
                // Case 1
                CodeMirror.commands.indentMore(instance);
                break;

            case "indentAtSelection":
                // Case 2
                this._addIndentAtEachSelection(selections);
                break;

            case "indentAuto":
                // Case 3
                this._autoIndentEachSelection(selections);
                break;
        }
    }

    /**
     * @private
     * Handle left arrow, right arrow, backspace and delete keys when soft tabs are used.
     * @param {number} direction Direction of movement: 1 for forward, -1 for backward
     * @param {string} functionName name of the CodeMirror function to call if we handle the key
     */
    private _handleSoftTabNavigation(direction, functionName) {
        const instance = this._codeMirror;
        let overallJump: number | null = null;

        if (!instance.getOption("indentWithTabs") && PreferencesManager.get(EditorOptions.SOFT_TABS)) {
            const indentUnit = instance.getOption("indentUnit");

            _.each(this.getSelections(), function (sel) {
                if (CodeMirror.cmpPos(sel.start, sel.end) !== 0) {
                    // This is a range - it will just collapse/be deleted regardless of the jump we set, so
                    // we can just ignore it and continue. (We don't want to return false in this case since
                    // we want to keep looking at other ranges.)
                    return;
                }

                const cursor = sel.start;
                let jump: number | null = (indentUnit === 0) ? 1 : cursor.ch % indentUnit;
                const line = instance.getLine(cursor.line);

                // Don't do any soft tab handling if there are non-whitespace characters before the cursor in
                // any of the selections.
                if (line.substr(0, cursor.ch).search(/\S/) !== -1) {
                    jump = null;
                } else if (direction === 1) { // right
                    if (indentUnit) {
                        jump = indentUnit - jump;
                    }

                    // Don't jump if it would take us past the end of the line, or if there are
                    // non-whitespace characters within the jump distance.
                    if (cursor.ch + jump > line.length || line.substr(cursor.ch, jump).search(/\S/) !== -1) {
                        jump = null;
                    }
                } else { // left
                    // If we are on the tab boundary, jump by the full amount,
                    // but not beyond the start of the line.
                    if (jump === 0) {
                        jump = indentUnit;
                    }
                    if (cursor.ch - jump! < 0) {
                        jump = null;
                    } else {
                        // We're moving left, so negate the jump.
                        jump = -jump!;
                    }
                }

                // Did we calculate a jump, and is this jump value either the first one or
                // consistent with all the other jumps? If so, we're good. Otherwise, bail
                // out of the foreach, since as soon as we hit an inconsistent jump we don't
                // have to look any further.
                if (jump !== null &&
                        (overallJump === null || overallJump === jump)) {
                    overallJump = jump;
                } else {
                    overallJump = null;
                    return false;
                }

                return undefined;
            });
        }

        if (overallJump === null) {
            // Just do the default move, which is one char in the given direction.
            overallJump = direction;
        }
        instance[functionName](overallJump, "char");
    }

    /**
     * Determine the mode to use from the document's language
     * Uses "text/plain" if the language does not define a mode
     * @return {string} The mode to use
     */
    private _getModeFromDocument() {
        // We'd like undefined/null/"" to mean plain text mode. CodeMirror defaults to plaintext for any
        // unrecognized mode, but it complains on the console in that fallback case: so, convert
        // here so we're always explicit, avoiding console noise.
        return this.document.getLanguage().getMode() || "text/plain";
    }


    /**
     * Selects all text and maintains the current scroll position.
     */
    public selectAllNoScroll() {
        const cm = this._codeMirror;
        const info = this._codeMirror.getScrollInfo();

        // Note that we do not have to check for the visible range here. This
        // concern is handled internally by code mirror.
        cm.operation(function () {
            cm.scrollTo(info.left, info.top);
            cm.execCommand("selectAll");
        });
    }

    /**
     * @return {boolean} True if editor is not showing the entire text of the document (i.e. an inline editor)
     */
    public isTextSubset() {
        return Boolean(this._visibleRange);
    }

    /**
     * Ensures that the lines that are actually hidden in the inline editor correspond to
     * the desired visible range.
     */
    private _updateHiddenLines() {
        if (this._visibleRange) {
            const cm = this._codeMirror;
            const self = this;
            cm.operation(function () {
                self._hideMarks.forEach(function (mark) {
                    if (mark) {
                        mark.clear();
                    }
                });
                self._hideMarks = [];
                self._hideMarks.push(self._hideLines(0, self._visibleRange!.startLine));
                self._hideMarks.push(self._hideLines(self._visibleRange!.endLine + 1, self.lineCount()));
            });
        }
    }

    private _applyChanges(changeList) {
        // _visibleRange has already updated via its own Document listener. See if this change caused
        // it to lose sync. If so, our whole view is stale - signal our owner to close us.
        if (this._visibleRange) {
            if (this._visibleRange.startLine === null || this._visibleRange.endLine === null) {
                (this as unknown as EventDispatcher.DispatcherEvents).trigger("lostContent");
                return;
            }
        }

        // Apply text changes to CodeMirror editor
        const cm = this._codeMirror;
        cm.operation(function () {
            for (const change of changeList) {
                const newText = change.text.join("\n");
                if (!change.from || !change.to) {
                    if (change.from || change.to) {
                        console.error("Change record received with only one end undefined--replacing entire text");
                    }
                    cm.setValue(newText);
                } else {
                    cm.replaceRange(newText, change.from, change.to, change.origin);
                }

            }
        });

        // The update above may have inserted new lines - must hide any that fall outside our range
        this._updateHiddenLines();
    }

    /**
     * Responds to changes in the CodeMirror editor's text, syncing the changes to the Document.
     * There are several cases where we want to ignore a CodeMirror change:
     *  - if we're the master editor, editor changes can be ignored because Document is already listening
     *    for our changes
     *  - if we're a secondary editor, editor changes should be ignored if they were caused by us reacting
     *    to a Document change
     */
    private _handleEditorChange(changeList) {
        // we're currently syncing from the Document, so don't echo back TO the Document
        if (this._duringSync) {
            return;
        }

        // Secondary editor: force creation of "master" editor backing the model, if doesn't exist yet
        this.document._ensureMasterEditor();

        if (this.document._masterEditor !== this) {
            // Secondary editor:
            // we're not the ground truth; if we got here, this was a real editor change (not a
            // sync from the real ground truth), so we need to sync from us into the document
            // (which will directly push the change into the master editor).
            // FUTURE: Technically we should add a replaceRange() method to Document and go through
            // that instead of talking to its master editor directly. It's not clear yet exactly
            // what the right Document API would be, though.
            this._duringSync = true;
            this.document._masterEditor._applyChanges(changeList);
            this._duringSync = false;

            // Update which lines are hidden inside our editor, since we're not going to go through
            // _applyChanges() in our own editor.
            this._updateHiddenLines();
        }
        // Else, Master editor:
        // we're the ground truth; nothing else to do, since Document listens directly to us
        // note: this change might have been a real edit made by the user, OR this might have
        // been a change synced from another editor

        // The "editorChange" event is mostly for the use of the CodeHintManager.
        // It differs from the normal "change" event, that it's actually publicly usable,
        // whereas the "change" event should be listened to on the document. Also the
        // Editor dispatches a change event before this event is dispatched, because
        // CodeHintManager needs to hook in here when other things are already done.
        (this as unknown as EventDispatcher.DispatcherEvents).trigger("editorChange", this, changeList);
    }

    /**
     * Responds to changes in the Document's text, syncing the changes into our CodeMirror instance.
     * There are several cases where we want to ignore a Document change:
     *  - if we're the master editor, Document changes should be ignored because we already have the right
     *    text (either the change originated with us, or it has already been set into us by Document)
     *  - if we're a secondary editor, Document changes should be ignored if they were caused by us sending
     *    the document an editor change that originated with us
     */
    private _handleDocumentChange(event, doc, changeList) {
        // we're currently syncing to the Document, so don't echo back FROM the Document
        if (this._duringSync) {
            return;
        }

        if (this.document._masterEditor !== this) {
            // Secondary editor:
            // we're not the ground truth; and if we got here, this was a Document change that
            // didn't come from us (e.g. a sync from another editor, a direct programmatic change
            // to the document, or a sync from external disk changes)... so sync from the Document
            this._duringSync = true;
            this._applyChanges(changeList);
            this._duringSync = false;
        }
        // Else, Master editor:
        // we're the ground truth; nothing to do since Document change is just echoing our
        // editor changes
    }

    /**
     * Responds to the Document's underlying file being deleted. The Document is now basically dead,
     * so we must close.
     */
    private _handleDocumentDeleted(event) {
        // Pass the delete event along as the cause (needed in MultiRangeInlineEditor)
        (this as unknown as EventDispatcher.DispatcherEvents).trigger("lostContent", event);
    }

    /**
     * Responds to language changes, for instance when the file extension is changed.
     */
    private _handleDocumentLanguageChanged(event) {
        this._codeMirror.setOption("mode", this._getModeFromDocument());
    }


    /**
     * Install event handlers on the CodeMirror instance, translating them into
     * jQuery events on the Editor instance.
     */
    private _installEditorListeners() {
        const self = this;

        // Redispatch these CodeMirror key events as Editor events
        function _onKeyEvent(instance, event) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("keyEvent", self, event);  // deprecated
            (self as unknown as EventDispatcher.DispatcherEvents).trigger(event.type, self, event);
            return event.defaultPrevented;   // false tells CodeMirror we didn't eat the event
        }
        this._codeMirror.on("keydown",  _onKeyEvent);
        this._codeMirror.on("keypress", _onKeyEvent);
        this._codeMirror.on("keyup",    _onKeyEvent);

        // FUTURE: if this list grows longer, consider making this a more generic mapping
        // NOTE: change is a "private" event--others shouldn't listen to it on Editor, only on
        // Document
        // Also, note that we use the new "changes" event in v4, which provides an array of
        // change objects. Our own event is still called just "change".
        this._codeMirror.on("changes", function (instance, changeList) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("change", self, changeList);
        });
        this._codeMirror.on("beforeChange", function (instance, changeObj) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("beforeChange", self, changeObj);
        });
        this._codeMirror.on("cursorActivity", function (instance) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("cursorActivity", self);
        });
        this._codeMirror.on("scroll", function (instance) {
            // If this editor is visible, close all dropdowns on scroll.
            // (We don't want to do this if we're just scrolling in a non-visible editor
            // in response to some document change event.)
            if (self.isFullyVisible()) {
                Menus.closeAll();
            }

            (self as unknown as EventDispatcher.DispatcherEvents).trigger("scroll", self);
        });

        // Convert CodeMirror onFocus events to EditorManager activeEditorChanged
        this._codeMirror.on("focus", function () {
            self._focused = true;
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("focus", self);
        });

        this._codeMirror.on("blur", function () {
            self._focused = false;
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("blur", self);
        });

        this._codeMirror.on("update", function (instance) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("update", self);
        });
        this._codeMirror.on("overwriteToggle", function (instance, newstate) {
            (self as unknown as EventDispatcher.DispatcherEvents).trigger("overwriteToggle", self, newstate);
        });

        // Disable CodeMirror's drop handling if a file/folder is dropped
        this._codeMirror.on("drop", function (cm, event) {
            const files = event.dataTransfer.files;
            if (files && files.length) {
                event.preventDefault();
            }
        });
        // For word wrap. Code adapted from https://codemirror.net/demo/indentwrap.html#
        this._codeMirror.on("renderLine", function (cm, line, elt) {
            const charWidth = self._codeMirror.defaultCharWidth();
            const off = CodeMirror.countColumn(line.text, null, cm.getOption("tabSize")) * charWidth;
            elt.style.textIndent = "-" + off + "px";
            elt.style.paddingLeft = off + "px";
        });
    }

    /**
     * Sets the contents of the editor, clears the undo/redo history and marks the document clean. Dispatches a change event.
     * Semi-private: only Document should call this.
     * @param {!string} text
     */
    private _resetText(text) {
        const currentText = this._codeMirror.getValue();

        // compare with ignoring line-endings, issue #11826
        const textLF = text ? text.replace(/(\r\n|\r|\n)/g, "\n") : null;
        const currentTextLF = currentText ? currentText.replace(/(\r\n|\r|\n)/g, "\n") : null;
        if (textLF === currentTextLF) {
            // there's nothing to reset
            return;
        }

        const perfTimerName = PerfUtils.markStart("Editor._resetText()\t" + (!this.document || this.document.file.fullPath));

        const cursorPos = this.getCursorPos();
        const scrollPos = this.getScrollPos();

        // This *will* fire a change event, but we clear the undo immediately afterward
        this._codeMirror.setValue(text);
        this._codeMirror.refresh();

        // Make sure we can't undo back to the empty state before setValue(), and mark
        // the document clean.
        this._codeMirror.clearHistory();
        this._codeMirror.markClean();

        // restore cursor and scroll positions
        this.setCursorPos(cursorPos);
        this.setScrollPos(scrollPos.x, scrollPos.y);

        PerfUtils.addMeasurement(perfTimerName);
    }

    /**
     * Gets the file associated with this editor
     * This is a required Pane-View interface method
     * @return {!File} the file associated with this editor
     */
    public getFile() {
        return this.document.file;
    }

    /**
     * Gets the current cursor position within the editor.
     * @param {boolean} expandTabs  If true, return the actual visual column number instead of the character offset in
     *      the "ch" property.
     * @param {?string} which Optional string indicating which end of the
     *  selection to return. It may be "start", "end", "head" (the side of the
     *  selection that moves when you press shift+arrow), or "anchor" (the
     *  fixed side of the selection). Omitting the argument is the same as
     *  passing "head". A {line, ch} object will be returned.)
     * @return {!{line:number, ch:number}}
     */
    public getCursorPos(expandTabs?, which?) {
        // Translate "start" and "end" to the official CM names (it actually
        // supports them as-is, but that isn't documented and we don't want to
        // rely on it).
        if (which === "start") {
            which = "from";
        } else if (which === "end") {
            which = "to";
        }
        const cursor = _copyPos(this._codeMirror.getCursor(which));

        if (expandTabs) {
            cursor.ch = this.getColOffset(cursor);
        }
        return cursor;
    }

    /**
     * Returns the display column (zero-based) for a given string-based pos. Differs from pos.ch only
     * when the line contains preceding \t chars. Result depends on the current tab size setting.
     * @param {!{line:number, ch:number}} pos
     * @return {number}
     */
    public getColOffset(pos) {
        const line = this._codeMirror.getRange({line: pos.line, ch: 0}, pos);
        let tabSize: number | null = null;
        let column = 0;

        for (const ch of line) {
            if (ch === "\t") {
                if (tabSize === null) {
                    tabSize = Editor.getTabSize();
                }
                if (tabSize > 0) {
                    column += (tabSize - (column % tabSize));
                }
            } else {
                column++;
            }
        }
        return column;
    }

    /**
     * Returns the string-based pos for a given display column (zero-based) in given line. Differs from column
     * only when the line contains preceding \t chars. Result depends on the current tab size setting.
     * @param {number} lineNum Line number
     * @param {number} column Display column number
     * @return {number}
     */
    public getCharIndexForColumn(lineNum, column) {
        const line = this._codeMirror.getLine(lineNum);
        let tabSize: number | null = null;
        let iCol = 0;
        let i;

        for (i = 0; iCol < column; i++) {
            if (line[i] === "\t") {
                if (tabSize === null) {
                    tabSize = Editor.getTabSize();
                }
                if (tabSize > 0) {
                    iCol += (tabSize - (iCol % tabSize));
                }
            } else {
                iCol++;
            }
        }
        return i;
    }

    /**
     * Sets the cursor position within the editor. Removes any selection.
     * @param {number} line  The 0 based line number.
     * @param {number} ch  The 0 based character position; treated as 0 if unspecified.
     * @param {boolean=} center  True if the view should be centered on the new cursor position.
     * @param {boolean=} expandTabs  If true, use the actual visual column number instead of the character offset as
     *      the "ch" parameter.
     */
    public setCursorPos(line, ch = 0, center?, expandTabs?) {
        if (expandTabs) {
            ch = this.getColOffset({line: line, ch: ch});
        }
        this._codeMirror.setCursor(line, ch);
        if (center) {
            this.centerOnCursor();
        }
    }

    /**
     * Set the editor size in pixels or percentage
     * @param {(number|string)} width
     * @param {(number|string)} height
     */
    public setSize(width, height) {
        this._codeMirror.setSize(width, height);
    }

    /**
     * Scrolls the editor viewport to vertically center the line with the cursor,
     * but only if the cursor is currently near the edges of the viewport or
     * entirely outside the viewport.
     *
     * This does not alter the horizontal scroll position.
     *
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     */
    public centerOnCursor(centerOptions = 0) {
        const $scrollerElement = $(this.getScrollerElement());
        const editorHeight = $scrollerElement.height();

        // we need to make adjustments for the statusbar's padding on the bottom and the menu bar on top.
        const statusBarHeight = $scrollerElement.outerHeight() - editorHeight;
        const menuBarHeight = $scrollerElement.offset().top;

        const documentCursorPosition = this._codeMirror.cursorCoords(null, "local").bottom;
        const screenCursorPosition = this._codeMirror.cursorCoords(null, "page").bottom - menuBarHeight;

        // If the cursor is already reasonably centered, we won't
        // make any change. "Reasonably centered" is defined as
        // not being within CENTERING_MARGIN of the top or bottom
        // of the editor (where CENTERING_MARGIN is a percentage
        // of the editor height).
        // For finding the first item (i.e. find while typing), do
        // not center if hit is in first half of screen because this
        // appears to be an unnecesary scroll.
        if ((_checkTopBoundary(centerOptions) && (screenCursorPosition < editorHeight * CENTERING_MARGIN)) ||
                (_checkBottomBoundary(centerOptions) && (screenCursorPosition > editorHeight * (1 - CENTERING_MARGIN)))) {

            let pos = documentCursorPosition - editorHeight / 2 + statusBarHeight;
            const info = this._codeMirror.getScrollInfo();
            pos = Math.min(Math.max(pos, 0), (info.height - info.clientHeight));
            this.setScrollPos(null, pos);
        }
    }

    /**
     * Given a position, returns its index within the text (assuming \n newlines)
     * @param {!{line:number, ch:number}}
     * @return {number}
     */
    public indexFromPos(coords) {
        return this._codeMirror.indexFromPos(coords);
    }

    /**
     * Returns true if pos is between start and end (INclusive at start; EXclusive at end by default,
     * but overridable via the endInclusive flag).
     * @param {{line:number, ch:number}} pos
     * @param {{line:number, ch:number}} start
     * @param {{line:number, ch:number}} end
     * @param {boolean} endInclusive
     *
     */
    public posWithinRange(pos, start, end, endInclusive) {
        if (start.line <= pos.line && end.line >= pos.line) {
            if (endInclusive) {
                return (start.line < pos.line || start.ch <= pos.ch) &&  // inclusive
                    (end.line > pos.line   || end.ch >= pos.ch);      // inclusive
            }

            return (start.line < pos.line || start.ch <= pos.ch) &&  // inclusive
                (end.line > pos.line   || end.ch > pos.ch);       // exclusive
        }
        return false;
    }

    /**
     * @return {boolean} True if there's a text selection; false if there's just an insertion point
     */
    public hasSelection() {
        return this._codeMirror.somethingSelected();
    }

    /**
     * @private
     * Takes an anchor/head pair and returns a start/end pair where the start is guaranteed to be <= end, and a "reversed" flag indicating
     * if the head is before the anchor.
     * @param {!{line: number, ch: number}} anchorPos
     * @param {!{line: number, ch: number}} headPos
     * @return {!{start:{line:number, ch:number}, end:{line:number, ch:number}}, reversed:boolean} the normalized range with start <= end
     */
    private _normalizeRange(anchorPos, headPos): Selection {
        if (headPos.line < anchorPos.line || (headPos.line === anchorPos.line && headPos.ch < anchorPos.ch)) {
            return {start: _copyPos(headPos), end: _copyPos(anchorPos), reversed: true};
        }

        return {start: _copyPos(anchorPos), end: _copyPos(headPos), reversed: false};
    }

    /**
     * Gets the current selection; if there is more than one selection, returns the primary selection
     * (generally the last one made). Start is inclusive, end is exclusive. If there is no selection,
     * returns the current cursor position as both the start and end of the range (i.e. a selection
     * of length zero). If `reversed` is set, then the head of the selection (the end of the selection
     * that would be changed if the user extended the selection) is before the anchor.
     * @return {!{start:{line:number, ch:number}, end:{line:number, ch:number}}, reversed:boolean}
     */
    public getSelection(): Selection {
        return this._normalizeRange(this.getCursorPos(false, "anchor"), this.getCursorPos(false, "head"));
    }

    /**
     * Returns an array of current selections, nonoverlapping and sorted in document order.
     * Each selection is a start/end pair, with the start guaranteed to come before the end.
     * Cursors are represented as a range whose start is equal to the end.
     * If `reversed` is set, then the head of the selection
     * (the end of the selection that would be changed if the user extended the selection)
     * is before the anchor.
     * If `primary` is set, then that selection is the primary selection.
     * @return {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>}
     */
    public getSelections(): Array<Selection> {
        const primarySel = this.getSelection();

        return _.map<CmSelection, Selection>(this._codeMirror.listSelections(), function (this: Editor, sel: CmSelection) {
            const result = this._normalizeRange(sel.anchor, sel.head);
            if (result.start.line === primarySel.start.line && result.start.ch === primarySel.start.ch &&
                    result.end.line === primarySel.end.line && result.end.ch === primarySel.end.ch) {
                result.primary = true;
            } else {
                result.primary = false;
            }
            return result;
        }.bind(this));
    }

    /**
     * Takes the given selections, and expands each selection so it encompasses whole lines. Merges
     * adjacent line selections together. Keeps track of each original selection associated with a given
     * line selection (there might be multiple if individual selections were merged into a single line selection).
     * Useful for doing multiple-selection-aware line edits.
     *
     * @param {Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>} selections
     *      The selections to expand.
     * @param {{expandEndAtStartOfLine: boolean, mergeAdjacent: boolean}} options
     *      expandEndAtStartOfLine: true if a range selection that ends at the beginning of a line should be expanded
     *          to encompass the line. Default false.
     *      mergeAdjacent: true if adjacent line ranges should be merged. Default true.
     * @return {Array.<{selectionForEdit: {start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean},
     *                  selectionsToTrack: Array.<{start:{line:number, ch:number}, end:{line:number, ch:number}, reversed:boolean, primary:boolean}>}>}
     *      The combined line selections. For each selection, `selectionForEdit` is the line selection, and `selectionsToTrack` is
     *      the set of original selections that combined to make up the given line selection. Note that the selectionsToTrack will
     *      include the original objects passed in `selections`, so if it is later mutated the original passed-in selections will be
     *      mutated as well.
     */
    public convertToLineSelections(selections: Array<Selection>, options?): Array<LineSelection> {
        const self = this;
        options = options || {};
        _.defaults(options, { expandEndAtStartOfLine: false, mergeAdjacent: true });

        // Combine adjacent lines with selections so they don't collide with each other, as they would
        // if we did them individually.
        const combinedSelections: Array<LineSelection> = [];
        let prevSel;
        _.each(selections, function (sel) {
            const newSel = _.cloneDeep(sel);

            // Adjust selection to encompass whole lines.
            newSel.start.ch = 0;
            // The end of the selection becomes the start of the next line, if it isn't already
            // or if expandEndAtStartOfLine is set.
            const hasSelection = (newSel.start.line !== newSel.end.line) || (newSel.start.ch !== newSel.end.ch);
            if (options.expandEndAtStartOfLine || !hasSelection || newSel.end.ch !== 0) {
                newSel.end = {line: newSel.end.line + 1, ch: 0};
            }

            // If the start of the new selection is within the range of the previous (expanded) selection, merge
            // the two selections together, but keep track of all the original selections that were related to this
            // selection, so they can be properly adjusted. (We only have to check for the start being inside the previous
            // range - it can't be before it because the selections started out sorted.)
            if (prevSel && self.posWithinRange(newSel.start, prevSel.selectionForEdit.start, prevSel.selectionForEdit.end, options.mergeAdjacent)) {
                prevSel.selectionForEdit.end.line = newSel.end.line;
                prevSel.selectionsToTrack.push(sel);
            } else {
                prevSel = {selectionForEdit: newSel, selectionsToTrack: [sel]};
                combinedSelections.push(prevSel);
            }
        });
        return combinedSelections;
    }

    /**
     * Returns the currently selected text, or "" if no selection. Includes \n if the
     * selection spans multiple lines (does NOT reflect the Document's line-endings style). By
     * default, returns only the contents of the primary selection, unless `allSelections` is true.
     * @param {boolean=} allSelections Whether to return the contents of all selections (separated
     *     by newlines) instead of just the primary selection. Default false.
     * @return {!string} The selected text.
     */
    public getSelectedText(allSelections?) {
        if (allSelections) {
            return this._codeMirror.getSelection();
        }

        const sel = this.getSelection();
        return this.document.getRange(sel.start, sel.end);
    }

    /**
     * Sets the current selection. Start is inclusive, end is exclusive. Places the cursor at the
     * end of the selection range. Optionally centers around the cursor after
     * making the selection
     *
     * @param {!{line:number, ch:number}} start
     * @param {{line:number, ch:number}=} end If not specified, defaults to start.
     * @param {boolean} center true to center the viewport
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} origin An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document#replaceRange} for more details.
     */
    public setSelection(start, end, center?, centerOptions?, origin?) {
        this.setSelections([{start: start, end: end || start}], center, centerOptions, origin);
    }

    /**
     * Sets a multiple selection, with the "primary" selection (the one returned by
     * getSelection() and getCursorPos()) defaulting to the last if not specified.
     * Overlapping ranges will be automatically merged, and the selection will be sorted.
     * Optionally centers around the primary selection after making the selection.
     * @param {!Array<{start:{line:number, ch:number}, end:{line:number, ch:number}, primary:boolean, reversed: boolean}>} selections
     *      The selection ranges to set. If the start and end of a range are the same, treated as a cursor.
     *      If reversed is true, set the anchor of the range to the end instead of the start.
     *      If primary is true, this is the primary selection. Behavior is undefined if more than
     *      one selection has primary set to true. If none has primary set to true, the last one is primary.
     * @param {boolean} center true to center the viewport around the primary selection.
     * @param {number} centerOptions Option value, or 0 for no options; one of the BOUNDARY_* constants above.
     * @param {?string} origin An optional string that describes what other selection or edit operations this
     *      should be merged with for the purposes of undo. See {@link Document#replaceRange} for more details.
     */
    public setSelections(selections: Array<Selection>, center?, centerOptions?, origin?) {
        let primIndex = selections.length - 1;
        let options;
        if (origin) {
            options = { origin: origin };
        }
        this._codeMirror.setSelections(_.map(selections, function (sel, index) {
            if (sel.primary) {
                primIndex = index;
            }
            return { anchor: sel.reversed ? sel.end : sel.start, head: sel.reversed ? sel.start : sel.end };
        }), primIndex, options);
        if (center) {
            this.centerOnCursor(centerOptions);
        }
    }

    /**
     * Sets the editors overwrite mode state. If null is passed, the state is toggled.
     *
     * @param {?boolean} start
     */
    public toggleOverwrite(state) {
        this._codeMirror.toggleOverwrite(state);
    }

    /**
     * Selects word that the given pos lies within or adjacent to. If pos isn't touching a word
     * (e.g. within a token like "//"), moves the cursor to pos without selecting a range.
     * @param {!{line:number, ch:number}}
     */
    public selectWordAt(pos) {
        const word = this._codeMirror.findWordAt(pos);
        this.setSelection(word.anchor, word.head);
    }

    /**
     * Gets the total number of lines in the the document (includes lines not visible in the viewport)
     * @return {!number}
     */
    public lineCount() {
        return this._codeMirror.lineCount();
    }

    /**
     * Deterines if line is fully visible.
     * @param {number} zero-based index of the line to test
     * @return {boolean} true if the line is fully visible, false otherwise
     */
    public isLineVisible(line) {
        const coords = this._codeMirror.charCoords({line: line, ch: 0}, "local");
        const scrollInfo = this._codeMirror.getScrollInfo();
        const top = scrollInfo.top;
        const bottom = scrollInfo.top + scrollInfo.clientHeight;

        // Check top and bottom and return false for partially visible lines.
        return (coords.top >= top && coords.bottom <= bottom);
    }

    /**
     * Gets the number of the first visible line in the editor.
     * @return {number} The 0-based index of the first visible line.
     */
    public getFirstVisibleLine() {
        return (this._visibleRange ? this._visibleRange.startLine : 0);
    }

    /**
     * Gets the number of the last visible line in the editor.
     * @return {number} The 0-based index of the last visible line.
     */
    public getLastVisibleLine() {
        return (this._visibleRange ? this._visibleRange.endLine : this.lineCount() - 1);
    }

    /* Hides the specified line number in the editor
        * @param {!from} line to start hiding from (inclusive)
        * @param {!to} line to end hiding at (exclusive)
        * @return {TextMarker} The CodeMirror mark object that's hiding the lines
        */
    private _hideLines(from, to) {
        if (to <= from) {
            return;
        }

        // We set clearWhenEmpty: false so that if there's a blank line at the beginning or end of
        // the document, and that's the only hidden line, we can still actually hide it. Doing so
        // requires us to create a 0-length marked span, which would ordinarily be cleaned up by CM
        // if clearWithEmpty is true. See https://groups.google.com/forum/#!topic/codemirror/RB8VNF8ow2w
        const value = this._codeMirror.markText(
            {line: from, ch: 0},
            {line: to - 1, ch: this._codeMirror.getLine(to - 1).length},
            {collapsed: true, inclusiveLeft: true, inclusiveRight: true, clearWhenEmpty: false}
        );

        return value;
    }

    /**
     * Gets the total height of the document in pixels (not the viewport)
     * @return {!number} height in pixels
     */
    public totalHeight() {
        return this.getScrollerElement().scrollHeight;
    }

    /**
     * Gets the scroller element from the editor.
     * @return {!HTMLDivElement} scroller
     */
    public getScrollerElement() {
        return this._codeMirror.getScrollerElement();
    }

    /**
     * Gets the root DOM node of the editor.
     * @return {!HTMLDivElement} The editor's root DOM node.
     */
    public getRootElement() {
        return this._codeMirror.getWrapperElement();
    }


    /**
     * Gets the lineSpace element within the editor (the container around the individual lines of code).
     * FUTURE: This is fairly CodeMirror-specific. Logic that depends on this may break if we switch
     * editors.
     * @return {!HTMLDivElement} The editor's lineSpace element.
     */
    private _getLineSpaceElement() {
        return $(".CodeMirror-lines", this.getScrollerElement()).children().get(0);
    }

    /**
     * Returns the current scroll position of the editor.
     * @return {{x:number, y:number}} The x,y scroll position in pixels
     */
    public getScrollPos() {
        const scrollInfo = this._codeMirror.getScrollInfo();
        return { x: scrollInfo.left, y: scrollInfo.top };
    }

    /**
     * Restores and adjusts the current scroll position of the editor.
     * @param {{x:number, y:number}} scrollPos - The x,y scroll position in pixels
     * @param {!number} heightDelta - The amount of delta H to apply to the scroll position
     */
    public adjustScrollPos(scrollPos, heightDelta) {
        this._codeMirror.scrollTo(scrollPos.x, scrollPos.y + heightDelta);
    }

    /**
     * Sets the current scroll position of the editor.
     * @param {number} x scrollLeft position in pixels
     * @param {number} y scrollTop position in pixels
     */
    public setScrollPos(x, y) {
        this._codeMirror.scrollTo(x, y);
    }

    /*
        * Returns the current text height of the editor.
        * @return {number} Height of the text in pixels
        */
    public getTextHeight() {
        return this._codeMirror.defaultTextHeight();
    }

    /**
     * Adds an inline widget below the given line. If any inline widget was already open for that
     * line, it is closed without warning.
     * @param {!{line:number, ch:number}} pos  Position in text to anchor the inline.
     * @param {!InlineWidget} inlineWidget The widget to add.
     * @param {boolean=} scrollLineIntoView Scrolls the associated line into view. Default true.
     * @return {$.Promise} A promise object that is resolved when the widget has been added (but might
     *     still be animating open). Never rejected.
     */
    public addInlineWidget(pos, inlineWidget, scrollLineIntoView) {
        const self = this;
        let queue = this._inlineWidgetQueues[pos.line];
        const deferred = $.Deferred();
        if (!queue) {
            queue = new Async.PromiseQueue();
            this._inlineWidgetQueues[pos.line] = queue;
        }
        queue.add(function () {
            self._addInlineWidgetInternal(pos, inlineWidget, scrollLineIntoView, deferred);
            return deferred.promise();
        });
        return deferred.promise();
    }

    /**
     * @private
     * Does the actual work of addInlineWidget().
     */
    private _addInlineWidgetInternal(pos, inlineWidget, scrollLineIntoView, deferred) {
        const self = this;

        this.removeAllInlineWidgetsForLine(pos.line).done(function () {
            if (scrollLineIntoView === undefined) {
                scrollLineIntoView = true;
            }

            if (scrollLineIntoView) {
                self._codeMirror.scrollIntoView(pos);
            }

            inlineWidget.info = self._codeMirror.addLineWidget(pos.line, inlineWidget.htmlContent,
                { coverGutter: true, noHScroll: true });
            CodeMirror.on(inlineWidget.info.line, "delete", function () {
                self._removeInlineWidgetInternal(inlineWidget);
            });
            self._inlineWidgets.push(inlineWidget);

            // Set up the widget to start closed, then animate open when its initial height is set.
            inlineWidget.$htmlContent.height(0);
            AnimationUtils.animateUsingClass(inlineWidget.htmlContent, "animating")
                .done(function () {
                    deferred.resolve();
                });

            // Callback to widget once parented to the editor. The widget should call back to
            // setInlineWidgetHeight() in order to set its initial height and animate open.
            inlineWidget.onAdded();
        });
    }

    /**
     * Removes all inline widgets
     */
    public removeAllInlineWidgets() {
        // copy the array because _removeInlineWidgetInternal will modify the original
        const widgets = [].concat(this.getInlineWidgets());

        return Async.doInParallel(
            widgets,
            this.removeInlineWidget.bind(this)
        );
    }

    /**
     * Removes the given inline widget.
     * @param {number} inlineWidget The widget to remove.
     * @return {$.Promise} A promise that is resolved when the inline widget is fully closed and removed from the DOM.
     */
    public removeInlineWidget(inlineWidget) {
        const deferred = $.Deferred();
        const self = this;

        function finishRemoving() {
            self._codeMirror.removeLineWidget(inlineWidget.info);
            self._removeInlineWidgetInternal(inlineWidget);
            deferred.resolve();
        }

        if (!inlineWidget.closePromise) {
            // Remove the inline widget from our internal list immediately, so
            // everyone external to us knows it's essentially already gone. We
            // don't want to wait until it's done animating closed (but we do want
            // the other stuff in _removeInlineWidgetInternal to wait until then).
            self._removeInlineWidgetFromList(inlineWidget);

            // If we're not visible (in which case the widget will have 0 client height),
            // don't try to do the animation, because nothing will happen and we won't get
            // called back right away. (The animation would happen later when we switch
            // back to the editor.)
            if (self.isFullyVisible()) {
                AnimationUtils.animateUsingClass(inlineWidget.htmlContent, "animating")
                    .done(finishRemoving);
                inlineWidget.$htmlContent.height(0);
            } else {
                finishRemoving();
            }
            inlineWidget.closePromise = deferred.promise();
        }
        return inlineWidget.closePromise;
    }

    /**
     * Removes all inline widgets for a given line
     * @param {number} lineNum The line number to modify
     */
    public removeAllInlineWidgetsForLine(lineNum) {
        const lineInfo = this._codeMirror.lineInfo(lineNum);
        const widgetInfos = (lineInfo && lineInfo.widgets) ? [].concat(lineInfo.widgets) : null;
        const self = this;

        if (widgetInfos && widgetInfos.length) {
            // Map from CodeMirror LineWidget to Brackets InlineWidget
            let inlineWidget;
            const allWidgetInfos = this._inlineWidgets.map(function (w) {
                return w.info;
            });

            return Async.doInParallel(
                widgetInfos,
                function (info) {
                    // Lookup the InlineWidget object using the same index
                    inlineWidget = self._inlineWidgets[allWidgetInfos.indexOf(info)];
                    if (inlineWidget) {
                        return self.removeInlineWidget(inlineWidget);
                    }

                    return $.Deferred().resolve().promise();
                }
            );
        }

        return $.Deferred().resolve().promise();
    }

    /**
     * Cleans up the given inline widget from our internal list of widgets. It's okay
     * to call this multiple times for the same widget--it will just do nothing if
     * the widget has already been removed.
     * @param {InlineWidget} inlineWidget  an inline widget.
     */
    private _removeInlineWidgetFromList(inlineWidget) {
        const l = this._inlineWidgets.length;
        for (let i = 0; i < l; i++) {
            if (this._inlineWidgets[i] === inlineWidget) {
                this._inlineWidgets.splice(i, 1);
                break;
            }
        }
    }

    /**
     * Removes the inline widget from the editor and notifies it to clean itself up.
     * @param {InlineWidget} inlineWidget  an inline widget.
     */
    private _removeInlineWidgetInternal(inlineWidget) {
        if (!inlineWidget.isClosed) {
            this._removeInlineWidgetFromList(inlineWidget);
            inlineWidget.onClosed();
            inlineWidget.isClosed = true;
        }
    }

    /**
     * Returns a list of all inline widgets currently open in this editor. Each entry contains the
     * inline's id, and the data parameter that was passed to addInlineWidget().
     * @return {!Array.<{id:number, data:Object}>}
     */
    public getInlineWidgets() {
        return this._inlineWidgets;
    }

    /**
     * Returns the currently focused inline widget, if any.
     * @return {?InlineWidget}
     */
    public getFocusedInlineWidget() {
        let result = null;

        this.getInlineWidgets().forEach(function (widget) {
            if (widget.hasFocus()) {
                result = widget;
            }
        });

        return result;
    }

    /**
     * Display temporary popover message at current cursor position. Display message above
     * cursor if space allows, otherwise below.
     *
     * @param {string} errorMsg Error message to display
     */
    public displayErrorMessageAtCursor(errorMsg) {
        const self = this;
        const POPOVER_MARGIN = 10;
        const POPOVER_ARROW_HALF_WIDTH = 10;
        const POPOVER_ARROW_HALF_BASE = POPOVER_ARROW_HALF_WIDTH + 3; // 3 is border radius

        function _removeListeners() {
            (self as unknown as EventDispatcher.DispatcherEvents).off(".msgbox");
        }

        // PopUpManager.removePopUp() callback
        function _clearMessagePopover() {
            if (self._$messagePopover && self._$messagePopover.length > 0) {
                // self._$messagePopover.remove() is done by PopUpManager
                self._$messagePopover = null;
            }
            _removeListeners();
        }

        // PopUpManager.removePopUp() is called either directly by this closure, or by
        // PopUpManager as a result of another popup being invoked.
        function _removeMessagePopover() {
            if (self._$messagePopover) {
                PopUpManager.removePopUp(self._$messagePopover);
            }
        }

        function _addListeners() {
            (self as unknown as EventDispatcher.DispatcherEvents)
                .on("blur.msgbox",           _removeMessagePopover)
                .on("change.msgbox",         _removeMessagePopover)
                .on("cursorActivity.msgbox", _removeMessagePopover)
                .on("update.msgbox",         _removeMessagePopover);
        }

        // Only 1 message at a time
        if (this._$messagePopover) {
            _removeMessagePopover();
        }

        // Make sure cursor is in view
        const cursorPos = this.getCursorPos();
        this._codeMirror.scrollIntoView(cursorPos);

        // Determine if arrow is above or below
        const cursorCoord = this._codeMirror.charCoords(cursorPos);

        // Assume popover height is max of 2 lines
        const arrowBelow = (cursorCoord.top > 100);

        // Text is dynamic, so build popover first so we can measure final width
        this._$messagePopover = $("<div/>").addClass("popover-message").appendTo($("body"));
        if (!arrowBelow) {
            $("<div/>").addClass("arrowAbove").appendTo(this._$messagePopover);
        }
        $("<div/>").addClass("text").appendTo(this._$messagePopover).html(errorMsg);
        if (arrowBelow) {
            $("<div/>").addClass("arrowBelow").appendTo(this._$messagePopover);
        }

        // Estimate where to position popover.
        const top = (arrowBelow)
            ? cursorCoord.top - this._$messagePopover.height() - POPOVER_MARGIN
            : cursorCoord.bottom + POPOVER_MARGIN;
        let left = cursorCoord.left - (this._$messagePopover.width() / 2);

        const popoverRect = {
            top:    top,
            left:   left,
            height: this._$messagePopover.height(),
            width:  this._$messagePopover.width()
        };

        // See if popover is clipped on any side
        const clip = ViewUtils.getElementClipSize($("#editor-holder"), popoverRect);

        // Prevent horizontal clipping
        if (clip.left > 0) {
            left += clip.left;
        } else if (clip.right > 0) {
            left -= clip.right;
        }

        // Popover text and arrow are positioned individually
        this._$messagePopover.css({"top": top, "left": left});

        // Position popover arrow centered over/under cursor...
        let arrowCenter = cursorCoord.left - left;

        // ... but don't let it slide off text box
        arrowCenter = Math.min(popoverRect.width - POPOVER_ARROW_HALF_BASE,
            Math.max(arrowCenter, POPOVER_ARROW_HALF_BASE));

        const arrowLeft = arrowCenter - POPOVER_ARROW_HALF_WIDTH;
        if (arrowBelow) {
            this._$messagePopover.find(".arrowBelow").css({"margin-left": arrowLeft});
        } else {
            this._$messagePopover.find(".arrowAbove").css({"margin-left": arrowLeft});
        }

        // Add listeners
        PopUpManager.addPopUp(this._$messagePopover, _clearMessagePopover, true);
        _addListeners();

        // Animate open
        AnimationUtils.animateUsingClass(this._$messagePopover[0], "animateOpen").done(function () {
            // Make sure we still have a popover
            if (self._$messagePopover && self._$messagePopover.length > 0) {
                self._$messagePopover.addClass("open");

                // Don't add scroll listeners until open so we don't get event
                // from scrolling cursor into view
                (self as unknown as EventDispatcher.DispatcherEvents).on("scroll.msgbox", _removeMessagePopover);

                // Animate closed -- which includes delay to show message
                AnimationUtils.animateUsingClass(self._$messagePopover[0], "animateClose", 6000)
                    .done(_removeMessagePopover);
            }
        });
    }

    /**
     * Returns the offset of the top of the virtual scroll area relative to the browser window (not the editor
     * itself). Mainly useful for calculations related to scrollIntoView(), where you're starting with the
     * offset() of a child widget (relative to the browser window) and need to figure out how far down it is from
     * the top of the virtual scroll area (excluding the top padding).
     * @return {number}
     */
    public getVirtualScrollAreaTop() {
        const topPadding = this._getLineSpaceElement().offsetTop; // padding within mover
        const scroller = this.getScrollerElement();
        return $(scroller).offset().top - scroller.scrollTop + topPadding;
    }

    /**
     * Sets the height of an inline widget in this editor.
     * @param {!InlineWidget} inlineWidget The widget whose height should be set.
     * @param {!number} height The height of the widget.
     * @param {boolean=} ensureVisible Whether to scroll the entire widget into view. Default false.
     */
    public setInlineWidgetHeight(inlineWidget, height, ensureVisible) {
        const self = this;
        const node = inlineWidget.htmlContent;
        const oldHeight = (node && $(node).height()) || 0;
        const changed = (oldHeight !== height);
        const isAttached = inlineWidget.info !== undefined;

        function updateHeight() {
            // Notify CodeMirror for the height change.
            if (isAttached) {
                inlineWidget.info.changed();
            }
        }

        function setOuterHeight() {
            function finishAnimating(e) {
                if (e.target === node) {
                    updateHeight();
                    $(node).off("webkitTransitionEnd", finishAnimating);
                }
            }
            $(node).height(height);
            if ($(node).hasClass("animating")) {
                $(node).on("webkitTransitionEnd", finishAnimating);
            } else {
                updateHeight();
            }
        }

        // Make sure we set an explicit height on the widget, so children can use things like
        // min-height if they want.
        if (changed || !node.style.height) {
            // If we're animating, set the wrapper's height on a timeout so the layout is finished before we animate.
            if ($(node).hasClass("animating")) {
                window.setTimeout(setOuterHeight, 0);
            } else {
                setOuterHeight();
            }
        }

        if (ensureVisible && isAttached) {
            const offset = $(node).offset(); // offset relative to document
            const position = $(node).position(); // position within parent linespace
            const scrollerTop = self.getVirtualScrollAreaTop();

            self._codeMirror.scrollIntoView({
                left: position.left,
                top: offset.top - scrollerTop,
                right: position.left, // don't try to make the right edge visible
                bottom: offset.top + height - scrollerTop
            });
        }
    }

    /**
     * @private
     * Get the starting line number for an inline widget.
     * @param {!InlineWidget} inlineWidget
     * @return {number} The line number of the widget or -1 if not found.
     */
    public _getInlineWidgetLineNumber(inlineWidget) {
        return this._codeMirror.getLineNumber(inlineWidget.info.line);
    }

    /** Gives focus to the editor control */
    public focus() {
        // Focusing an editor synchronously triggers focus/blur handlers. If a blur handler attemps to focus
        // another editor, we'll put CM in a bad state (because CM assumes programmatically focusing itself
        // will always succeed, and if you're in the middle of another focus change that appears to be untrue).
        // So instead, we simply ignore reentrant focus attempts.
        // See bug #2951 for an example of this happening and badly hosing things.
        if (_duringFocus) {
            return;
        }

        _duringFocus = true;
        try {
            this._codeMirror.focus();
        } finally {
            _duringFocus = false;
        }
    }

    /** Returns true if the editor has focus */
    public hasFocus() {
        return this._focused;
    }

    /*
        * @typedef {scrollPos:{x:number, y:number},Array.<{start:{line:number, ch:number},end:{line:number, ch:number}}>} EditorViewState
        */

    /*
        * returns the view state for the editor
        * @return {!EditorViewState}
        */
    public getViewState() {
        return {
            selections: this.getSelections(),
            scrollPos: this.getScrollPos()
        };

    }

    /*
        * Restores the view state
        * @param {!EditorViewState} viewState - the view state object to restore
        */
    public restoreViewState(viewState) {
        if (viewState.selection) {
            // We no longer write out single-selection, but there might be some view state
            // from an older version.
            this.setSelection(viewState.selection.start, viewState.selection.end);
        }
        if (viewState.selections) {
            this.setSelections(viewState.selections);
        }
        if (viewState.scrollPos) {
            this.setScrollPos(viewState.scrollPos.x, viewState.scrollPos.y);
        }
    }

    /**
     * Re-renders the editor UI
     * @param {boolean=} handleResize true if this is in response to resizing the editor. Default false.
     */
    public refresh(handleResize?) {
        // If focus is currently in a child of the CodeMirror editor (e.g. in an inline widget), but not in
        // the CodeMirror input field itself, remember the focused item so we can restore focus after the
        // refresh (which might cause the widget to be removed from the display list temporarily).
        const focusedItem = window.document.activeElement!;
        const restoreFocus = $.contains(this._codeMirror.getScrollerElement(), focusedItem);
        this._codeMirror.refresh();
        if (restoreFocus) {
            (focusedItem as HTMLElement).focus();
        }
    }

    /**
     * Re-renders the editor, and all children inline editors.
     * @param {boolean=} handleResize true if this is in response to resizing the editor. Default false.
     */
    public refreshAll(handleResize?) {
        this.refresh(handleResize);
        this.getInlineWidgets().forEach(function (inlineWidget) {
            inlineWidget.refresh();
        });
    }

    /** Undo the last edit. */
    public undo() {
        this._codeMirror.undo();
    }

    /** Redo the last un-done edit. */
    public redo() {
        this._codeMirror.redo();
    }

    /**
     * View API Visibility Change Notification handler.  This is also
     * called by the native "setVisible" API which refresh can be optimized
     * @param {boolean} show true to show the editor, false to hide it
     * @param {boolean} refresh true (default) to refresh the editor, false to skip refreshing it
     */
    public notifyVisibilityChange(show, refresh = true) {
        if (show && (refresh || refresh === undefined)) {
            this.refresh();
        }
        if (show) {
            this._inlineWidgets.forEach(function (inlineWidget) {
                inlineWidget.onParentShown();
            });
        }
    }

    /**
     * Shows or hides the editor within its parent. Does not force its ancestors to
     * become visible.
     * @param {boolean} show true to show the editor, false to hide it
     * @param {boolean} refresh true (default) to refresh the editor, false to skip refreshing it
     */
    public setVisible(show, refresh = true) {
        this.$el.css("display", (show ? "" : "none"));
        this.notifyVisibilityChange(show, refresh);
    }

    /**
     * Returns true if the editor is fully visible--i.e., is in the DOM, all ancestors are
     * visible, and has a non-zero width/height.
     */
    public isFullyVisible() {
        return $(this.getRootElement()).is(":visible");
    }

    /**
     * Gets the syntax-highlighting mode for the given range.
     * Returns null if the mode at the start of the selection differs from the mode at the end -
     * an *approximation* of whether the mode is consistent across the whole range (a pattern like
     * A-B-A would return A as the mode, not null).
     *
     * @param {!{line: number, ch: number}} start The start of the range to check.
     * @param {!{line: number, ch: number}} end The end of the range to check.
     * @param {boolean=} knownMixed Whether we already know we're in a mixed mode and need to check both
     *     the start and end.
     * @return {?(Object|string)} Name of syntax-highlighting mode, or object containing a "name" property
     *     naming the mode along with configuration options required by the mode.
     * @see {@link LanguageManager::#getLanguageForPath} and {@link LanguageManager::Language#getMode}.
     */
    public getModeForRange(start, end, knownMixed) {
        const outerMode = this._codeMirror.getMode();
        const startMode = TokenUtils.getModeAt(this._codeMirror, start);
        const endMode = TokenUtils.getModeAt(this._codeMirror, end);
        if (!knownMixed && outerMode.name === startMode.name) {
            // Mode does not vary: just use the editor-wide mode name
            return this._codeMirror.getOption("mode");
        }

        if (!startMode || !endMode || startMode.name !== endMode.name) {
            return null;
        }

        return startMode;
    }

    /**
     * Gets the syntax-highlighting mode for the current selection or cursor position. (The mode may
     * vary within one file due to embedded languages, e.g. JS embedded in an HTML script block). See
     * `getModeForRange()` for how this is determined for a single selection.
     *
     * If there are multiple selections, this will return a mode only if all the selections are individually
     * consistent and resolve to the same mode.
     *
     * @return {?(Object|string)} Name of syntax-highlighting mode, or object containing a "name" property
     *     naming the mode along with configuration options required by the mode.
     * @see {@link LanguageManager::#getLanguageForPath} and {@link LanguageManager::Language#getMode}.
     */
    public getModeForSelection() {
        // Check for mixed mode info
        const self        = this;
        const sels        = this.getSelections();
        const primarySel  = this.getSelection();
        const outerMode   = this._codeMirror.getMode();
        const startMode   = TokenUtils.getModeAt(this._codeMirror, primarySel.start);
        const isMixed     = (outerMode.name !== startMode.name);

        if (isMixed) {
            // This is the magic code to let the code view know that we are in 'css' context
            // if the CodeMirror outermode is 'htmlmixed' and we are in 'style' attributes
            // value context. This has to be done as CodeMirror doesn't yet think this as 'css'
            // This magic is executed only when user is having a cursor and not selection
            // We will enable selection handling one we figure a way out to handle mixed scope selection
            if (outerMode.name === "htmlmixed" && primarySel.start.line === primarySel.end.line && primarySel.start.ch === primarySel.end.ch) {
                const tagInfo = HTMLUtils.getTagInfo(this, primarySel.start, true);
                const tokenType = tagInfo.position.tokenType;

                if (tokenType === HTMLUtils.ATTR_VALUE && tagInfo.attr.name.toLowerCase() === "style") {
                    return "css";
                }
            }
            // Shortcut the first check to avoid getModeAt(), which can be expensive
            if (primarySel.start.line !== primarySel.end.line || primarySel.start.ch !== primarySel.end.ch) {
                const endMode = TokenUtils.getModeAt(this._codeMirror, primarySel.end);

                if (startMode.name !== endMode.name) {
                    return null;
                }
            }

            // If mixed mode, check that mode is the same at start & end of each selection
            const hasMixedSel = _.some(sels, function (sel) {
                if (sel === primarySel) {
                    // We already checked this before, so we know it's not mixed.
                    return false;
                }

                const rangeMode = self.getModeForRange(sel.start, sel.end, true);
                return (!rangeMode || rangeMode.name !== startMode.name);
            });
            if (hasMixedSel) {
                return null;
            }

            return startMode.name;
        }

        // Mode does not vary: just use the editor-wide mode
        return this._codeMirror.getOption("mode");
    }

    /*
        * gets the language for the selection. (Javascript selected from an HTML document or CSS selected from an HTML document, etc...)
        * @return {!Language}
        */
    public getLanguageForSelection() {
        return this.document.getLanguage().getLanguageForMode(this.getModeForSelection());
    }

    /**
     * Gets the syntax-highlighting mode for the document.
     *
     * @return {Object|String} Object or Name of syntax-highlighting mode
     * @see {@link LanguageManager::#getLanguageForPath|LanguageManager.getLanguageForPath} and {@link LanguageManager::Language#getMode|Language.getMode}.
     */
    public getModeForDocument() {
        return this._codeMirror.getOption("mode");
    }

    /**
     * @private
     *
     * Retrieve the value of the named preference for this document.
     *
     * @param {string} prefName Name of preference to retrieve.
     * @return {*} current value of that pref
     */
    private _getOption(prefName) {
        return PreferencesManager.get(prefName, PreferencesManager._buildContext(this.document.file.fullPath, this.document.getLanguage().getId()));
    }

    /**
     * @private
     *
     * Updates the editor to the current value of prefName for the file being edited.
     *
     * @param {string} prefName Name of the preference to visibly update
     */
    public _updateOption(prefName) {
        const oldValue = this._currentOptions[prefName];
        const newValue = this._getOption(prefName);

        if (oldValue !== newValue) {
            this._currentOptions[prefName] = newValue;

            if (prefName === EditorOptions.USE_TAB_CHAR) {
                this._codeMirror.setOption(cmOptions[prefName], newValue);
                this._codeMirror.setOption(
                    "indentUnit",
                    newValue === true
                        ? this._currentOptions[EditorOptions.TAB_SIZE]
                        : this._currentOptions[EditorOptions.SPACE_UNITS]
                );
            } else if (prefName === EditorOptions.STYLE_ACTIVE_LINE) {
                this._updateStyleActiveLine();
            } else if (prefName === EditorOptions.SCROLL_PAST_END && this._visibleRange) {
                // Do not apply this option to inline editors
                return;
            } else if (prefName === EditorOptions.SHOW_LINE_NUMBERS) {
                Editor._toggleLinePadding(!newValue);
                this._codeMirror.setOption(cmOptions[EditorOptions.SHOW_LINE_NUMBERS], newValue);
                if (newValue) {
                    Editor.registerGutter(LINE_NUMBER_GUTTER, LINE_NUMBER_GUTTER_PRIORITY);
                } else {
                    Editor.unregisterGutter(LINE_NUMBER_GUTTER);
                }
                this.refreshAll();
            } else {
                this._codeMirror.setOption(cmOptions[prefName], newValue);
            }

            (this as unknown as EventDispatcher.DispatcherEvents).trigger("optionChange", prefName, newValue);
        }
    }

    /**
     * @private
     *
     * Used to ensure that "style active line" is turned off when there is a selection.
     */
    private _updateStyleActiveLine() {
        if (this.hasSelection()) {
            if (this._codeMirror.getOption("styleActiveLine")) {
                this._codeMirror.setOption("styleActiveLine", false);
            }
        } else {
            this._codeMirror.setOption("styleActiveLine", this._currentOptions[EditorOptions.STYLE_ACTIVE_LINE]);
        }
    }

    /**
     * resizes the editor to fill its parent container
     * should not be used on inline editors
     * @param {boolean=} forceRefresh - forces the editor to update its layout
     *                                   even if it already matches the container's height / width
     */
    public updateLayout(forceRefresh) {
        const curRoot = this.getRootElement();
        const curWidth = $(curRoot).width();
        const $editorHolder = this.$el.parent();
        const editorAreaHt = $editorHolder.height();

        if (!curRoot.style.height || $(curRoot).height() !== editorAreaHt) {
            // Call setSize() instead of $.height() to allow CodeMirror to
            // check for options like line wrapping
            this.setSize(null, editorAreaHt);
            if (forceRefresh === undefined) {
                forceRefresh = true;
            }
        } else if (curWidth !== this._lastEditorWidth) {
            if (forceRefresh === undefined) {
                forceRefresh = true;
            }
        }
        this._lastEditorWidth = curWidth;

        if (forceRefresh) {
            this.refreshAll(forceRefresh);
        }
    }

    /**
     * Clears all marks from the gutter with the specified name.
     * @param {string} name The name of the gutter to clear.
     */
    public clearGutter(name) {
        this._codeMirror.clearGutter(name);
    }

    /**
     * Renders all registered gutters
     * @private
     */
    private _renderGutters() {
        const languageId = this.document.getLanguage().getId();

        function _filterByLanguages(gutter) {
            return !gutter.languages || gutter.languages.indexOf(languageId) > -1;
        }

        function _sortByPriority(a, b) {
            return a.priority - b.priority;
        }

        function _getName(gutter) {
            return gutter.name;
        }

        let gutters = registeredGutters.map(_getName);
        const rootElement = this.getRootElement();

        // If the line numbers gutter has not been explicitly registered and the CodeMirror lineNumbes option is
        // set to true, we explicitly add the line numbers gutter. This case occurs the first time the editor loads
        // and showLineNumbers is set to true in preferences
        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0 && this._codeMirror.getOption(cmOptions[EditorOptions.SHOW_LINE_NUMBERS])) {
            registeredGutters.push({name: LINE_NUMBER_GUTTER, priority: LINE_NUMBER_GUTTER_PRIORITY});
        }

        gutters = registeredGutters.sort(_sortByPriority)
            .filter(_filterByLanguages)
            .map(_getName);

        this._codeMirror.setOption("gutters", gutters);
        this._codeMirror.refresh();

        if (gutters.indexOf(LINE_NUMBER_GUTTER) < 0) {
            $(rootElement).addClass("linenumber-disabled");
        } else {
            $(rootElement).removeClass("linenumber-disabled");
        }
    }

    /**
     * Sets the marker for the specified gutter on the specified line number
     * @param   {string}   lineNumber The line number for the inserted gutter marker
     * @param   {string}   gutterName The name of the gutter
     * @param   {object}   marker     The dom element representing the marker to the inserted in the gutter
     */
    public setGutterMarker(lineNumber, gutterName, marker) {
        const gutterNameRegistered = registeredGutters.some(function (gutter) {
            return gutter.name === gutterName;
        });

        if (!gutterNameRegistered) {
            console.warn("Gutter name must be registered before calling editor.setGutterMarker");
            return;
        }

        this._codeMirror.setGutterMarker(lineNumber, gutterName, marker);
    }

    /**
     * Returns the list of gutters current registered on all editors.
     * @return {!Array.<{name: string, priority: number}>}
     */
    public static getRegisteredGutters() {
        return registeredGutters;
    }

    /**
     * Registers the gutter with the specified name at the given priority.
     * @param {string} name    The name of the gutter.
     * @param {number} priority  A number denoting the priority of the gutter. Priorities higher than LINE_NUMBER_GUTTER_PRIORITY appear after the line numbers. Priority less than LINE_NUMBER_GUTTER_PRIORITY appear before.
     * @param {?Array<string>} languageIds A list of language ids that this gutter is valid for. If no language ids are passed, then the gutter is valid in all languages.
     */
    public static registerGutter(name, priority, languageIds?) {
        if (isNaN(priority)) {
            console.warn("A non-numeric priority value was passed to registerGutter. The value will default to 0.");
            priority = 0;
        }

        if (!name || typeof name !== "string") {
            console.error("The name of the registered gutter must be a string.");
            return;
        }

        const gutter: Gutter = {name: name, priority: priority, languages: languageIds};
        const gutterExists = registeredGutters.some(function (gutter) {
            return gutter.name === name;
        });

        if (!gutterExists) {
            registeredGutters.push(gutter);
        }

        Editor.forEveryEditor(function (editor) {
            editor._renderGutters();
        });
    }

    /**
     * Unregisters the gutter with the specified name and removes it from the UI.
     * @param {string} name The name of the gutter to be unregistered.
     */
    public static unregisterGutter(name) {
        registeredGutters = registeredGutters.filter(function (gutter) {
            return gutter.name !== name;
        });

        Editor.forEveryEditor(function (editor) {
            editor._renderGutters();
        });
    }

    // Global settings that affect Editor instances that share the same preference locations

    /**
     * Sets whether to use tab characters (vs. spaces) when inserting new text.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setUseTabChar(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.USE_TAB_CHAR, value, options);
    }

    /**
     * Gets whether the specified or current file uses tab characters (vs. spaces) when inserting new text
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getUseTabChar(fullPath?) {
        return PreferencesManager.get(EditorOptions.USE_TAB_CHAR, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets tab character width.
     * Affects any editors that share the same preference location.
     * @param {number} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setTabSize(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.TAB_SIZE, value, options);
    }

    /**
     * Get indent unit
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    public static getTabSize(fullPath?): number {
        return PreferencesManager.get(EditorOptions.TAB_SIZE, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets indentation width.
     * Affects any editors that share the same preference location.
     * @param {number} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setSpaceUnits(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.SPACE_UNITS, value, options);
    }

    /**
     * Get indentation width
     * @param {string=} fullPath Path to file to get preference for
     * @return {number}
     */
    public static getSpaceUnits(fullPath?) {
        return PreferencesManager.get(EditorOptions.SPACE_UNITS, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets the auto close brackets.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setCloseBrackets(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.CLOSE_BRACKETS, value, options);
    }

    /**
     * Gets whether the specified or current file uses auto close brackets
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getCloseBrackets(fullPath?) {
        return PreferencesManager.get(EditorOptions.CLOSE_BRACKETS, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets show line numbers option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setShowLineNumbers(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.SHOW_LINE_NUMBERS, value, options);
    }

    /**
     * Returns true if show line numbers is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getShowLineNumbers(fullPath?) {
        return PreferencesManager.get(EditorOptions.SHOW_LINE_NUMBERS, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets show active line option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setShowActiveLine(value, fullPath?) {
        return PreferencesManager.set(EditorOptions.STYLE_ACTIVE_LINE, value);
    }

    /**
     * Returns true if show active line is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getShowActiveLine(fullPath?) {
        return PreferencesManager.get(EditorOptions.STYLE_ACTIVE_LINE, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets word wrap option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setWordWrap(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.WORD_WRAP, value, options);
    }

    /**
     * Returns true if word wrap is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getWordWrap(fullPath?) {
        return PreferencesManager.get(EditorOptions.WORD_WRAP, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets indentLineComment option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setIndentLineComment(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.INDENT_LINE_COMMENT, value, options);
    }

    /**
     * Returns true if indentLineComment is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getIndentLineComment(fullPath?) {
        return PreferencesManager.get(EditorOptions.INDENT_LINE_COMMENT, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets paddingComment option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setPaddingComment(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.PADDING_COMMENT, value, options);
    }

    /**
     * Returns the string of paddingComment for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getPaddingComment(fullPath?) {
        return PreferencesManager.get(EditorOptions.PADDING_COMMENT, _buildPreferencesContext(fullPath));
    }

    /**
     * Sets commentBlankLines option.
     * Affects any editors that share the same preference location.
     * @param {boolean} value
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean} true if value was valid
     */
    public static setCommentBlankLines(value, fullPath?) {
        const options = fullPath && {context: fullPath};
        return PreferencesManager.set(EditorOptions.COMMENT_BLANK_LINES, value, options);
    }

    /**
     * Returns true if commentBlankLines is enabled for the specified or current file
     * @param {string=} fullPath Path to file to get preference for
     * @return {boolean}
     */
    public static getCommentBlankLines(fullPath?) {
        return PreferencesManager.get(EditorOptions.COMMENT_BLANK_LINES, _buildPreferencesContext(fullPath));
    }

    /**
     * Runs callback for every Editor instance that currently exists
     * @param {!function(!Editor)} callback
     */
    public static forEveryEditor(callback) {
        _instances.forEach(callback);
    }

    /**
     * @private
     * Toggles the left padding of all code editors.  Used to provide more
     * space between the code text and the left edge of the editor when
     * line numbers are hidden.
     * @param {boolean} showLinePadding
     */
    public static _toggleLinePadding(showLinePadding) {
        // apply class to all pane DOM nodes
        const $holders: Array<JQuery> = [];
        _instances.forEach(function (editor) {
            const $editorHolder = editor.$el.parent();
            if ($holders.indexOf($editorHolder) === -1) {
                $holders.push($editorHolder);
            }
        });

        _.each($holders, function ($holder) {
            $holder.toggleClass("show-line-padding", Boolean(showLinePadding));
        });
    }

    public static LINE_NUMBER_GUTTER_PRIORITY = LINE_NUMBER_GUTTER_PRIORITY;
    public static CODE_FOLDING_GUTTER_PRIORITY = CODE_FOLDING_GUTTER_PRIORITY;
}

EventDispatcher.makeEventDispatcher(Editor.prototype);
EventDispatcher.markDeprecated(Editor.prototype, "keyEvent", "'keydown/press/up'");

// Set up listeners for preference changes
editorOptions.forEach(function (prefName) {
    PreferencesManager.on("change", prefName, function () {
        _instances.forEach(function (editor) {
            editor._updateOption(prefName);
        });
    });
});
