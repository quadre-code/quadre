/*
* Copyright (c) 2013 Patrick Oladimeji. All rights reserved.
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
 * Code folding extension for brackets
 * @author Patrick Oladimeji
 * @date 10/24/13 9:35:26 AM
 */

/// <amd-dependency path="module" name="module"/>

import type { MenuItem } from "command/Menus";
import type { Editor as TEditor } from "editor/Editor";

const CodeMirror              = brackets.getModule("thirdparty/CodeMirror/lib/codemirror");
const Strings                 = brackets.getModule("strings");
const AppInit                 = brackets.getModule("utils/AppInit");
const CommandManager          = brackets.getModule("command/CommandManager");
const DocumentManager         = brackets.getModule("document/DocumentManager");
const Editor                  = brackets.getModule("editor/Editor").Editor;
const EditorManager           = brackets.getModule("editor/EditorManager");
const ProjectManager          = brackets.getModule("project/ProjectManager");
const ViewStateManager        = brackets.getModule("view/ViewStateManager");
const KeyBindingManager       = brackets.getModule("command/KeyBindingManager");
const ExtensionUtils          = brackets.getModule("utils/ExtensionUtils");
const Menus                   = brackets.getModule("command/Menus");
import * as prefs from "Prefs";
const COLLAPSE_ALL            = "codefolding.collapse.all";
const COLLAPSE                = "codefolding.collapse";
const EXPAND                  = "codefolding.expand";
const EXPAND_ALL              = "codefolding.expand.all";
const GUTTER_NAME             = "CodeMirror-foldgutter";
const CODE_FOLDING_GUTTER_PRIORITY   = Editor.CODE_FOLDING_GUTTER_PRIORITY;
let codeFoldingMenuDivider: MenuItem;
const collapseKey             = "Ctrl-Alt-[";
const expandKey               = "Ctrl-Alt-]";
const collapseAllKey          = "Alt-1";
const expandAllKey            = "Shift-Alt-1";
const collapseAllKeyMac       = "Cmd-1";
const expandAllKeyMac         = "Cmd-Shift-1";

ExtensionUtils.loadStyleSheet(module, "main.less");

// Load CodeMirror addons
brackets.getModule(["thirdparty/CodeMirror/addon/fold/brace-fold"]);
brackets.getModule(["thirdparty/CodeMirror/addon/fold/comment-fold"]);
brackets.getModule(["thirdparty/CodeMirror/addon/fold/markdown-fold"]);

interface SimpleRange {
    from: CodeMirror.Position;
    to: CodeMirror.Position;
}

// Some methods are defined in foldhelpers folder.
// TODO: we should try to use upstream code where possible.
declare module "codemirror" {
    interface Editor {
        _lineFolds: Record<number, SimpleRange>;

        foldCode: (line: number, options?: any) => void;
        unfoldCode: (line: number, options: any) => void;
        isFolded: (line: number) => boolean;

        getValidFolds: (fold: Record<number, any>) => Record<number, any>;
    }

    interface EditorConfiguration {
        foldGutter?: any;
    }

    interface LineHandle {
        lineNo: () => number;
    }

    interface Fold {
        auto: (cm: Editor, pos: Position) => SimpleRange;
    }
    const fold: Fold;

    // TODO: Not present in upstream types.
    const registerGlobalHelper: (
        type: string,
        name: string,
        predicate: (mode: any, cm: Editor) => void,
        value: (cm: Editor, start: Position) => void
    ) => void;

    interface CommandActions {
        unfoldAll: (cm: Editor, fromLine?: number, toline?: number) => void;
        foldToLevel: (cm: Editor, fromLine?: number, toline?: number) => void;
    }
}

// Still using slightly modified versions of the foldcode.js and foldgutter.js since we
// need to modify the gutter click handler to take care of some collapse and expand features
// e.g. collapsing all children when 'alt' key is pressed
import * as foldGutter from "foldhelpers/foldgutter";
import * as foldCode from "foldhelpers/foldcode";
import * as indentFold from "foldhelpers/indentFold";
import * as handlebarsFold from "foldhelpers/handlebarsFold";
import * as selectionFold from "foldhelpers/foldSelected";


/** Set to true when init() has run; set back to false after deinit() has run */
let _isInitialized = false;

/** Used to keep track of files for which line folds have been restored. */

/**
 * Restores the linefolds in the editor using values fetched from the preference store
 * Checks the document to ensure that changes have not been made (e.g., in a different editor)
 * to invalidate the saved line folds.
 * Selection Folds are found by comparing the line folds in the preference store with the
 * selection ranges in the viewState of the current document. Any selection range in the view state
 * that is folded in the prefs will be folded. Unlike other fold range finder, the only validation
 * on selection folds is to check that they satisfy the minimum fold range.
 * @param {Editor} editor  the editor whose saved line folds should be restored
 */
function restoreLineFolds(editor: TEditor): void {
    /**
     * Checks if the range from and to Pos is the same as the selection start and end Pos
     * @param   {Object}  range     {from, to} where from and to are CodeMirror.Pos objects
     * @param   {Object}  selection {start, end} where start and end are CodeMirror.Pos objects
     * @returns {Boolean} true if the range and selection span the same region and false otherwise
     */
    function rangeEqualsSelection(range: SimpleRange, selection: any): boolean {
        return range.from.line === selection.start.line && range.from.ch === selection.start.ch &&
            range.to.line === selection.end.line && range.to.ch === selection.end.ch;
    }

    /**
     * Checks if the range is equal to one of the selections in the viewState
     * @param   {Object}  range     {from, to} where from and to are CodeMirror.Pos objects.
     * @param   {Object}  viewState The current editor's ViewState object
     * @returns {Boolean} true if the range is found in the list of selections or false if not.
     */
    function isInViewStateSelection(range: SimpleRange, viewState: any): boolean {
        if (!viewState || !viewState.selections) {
            return false;
        }

        return viewState.selections.some(function (selection) {
            return rangeEqualsSelection(range, selection);
        });
    }

    const saveFolds = prefs.getSetting("saveFoldStates");

    if (!editor || !saveFolds) {
        if (editor) {
            editor._codeMirror._lineFolds = editor._codeMirror._lineFolds || {};
        }
        return;
    }

    const cm = editor._codeMirror;
    const viewState = ViewStateManager.getViewState(editor.document.file);
    const path = editor.document.file.fullPath;
    const folds = cm._lineFolds || prefs.getFolds(path) || {};

    // separate out selection folds from non-selection folds
    let nonSelectionFolds = {};
    const selectionFolds = {};
    let range;
    Object.keys(folds).forEach(function (line) {
        range = folds[line];
        if (isInViewStateSelection(range, viewState)) {
            selectionFolds[line] = range;
        } else {
            nonSelectionFolds[line] = range;
        }
    });
    nonSelectionFolds = cm.getValidFolds(nonSelectionFolds);
    // add the selection folds
    Object.keys(selectionFolds).forEach(function (line) {
        nonSelectionFolds[line] = selectionFolds[line];
    });
    cm._lineFolds = nonSelectionFolds;
    prefs.setFolds(path, cm._lineFolds);
    Object.keys(cm._lineFolds).forEach(function (line) {
        cm.foldCode(Number(line), {range: cm._lineFolds[line]});
    });
}

/**
 * Saves the line folds in the editor using the preference storage
 * @param {Editor} editor the editor whose line folds should be saved
 */
function saveLineFolds(editor: TEditor): void {
    const saveFolds = prefs.getSetting("saveFoldStates");
    if (!editor || !saveFolds) {
        return;
    }
    const folds = editor._codeMirror._lineFolds || {};
    const path = editor.document.file.fullPath;
    if (Object.keys(folds).length) {
        prefs.setFolds(path, folds);
    } else {
        prefs.setFolds(path, undefined);
    }
}

/**
 * Event handler for gutter click. Manages folding and unfolding code regions. If the Alt key
 * is pressed while clicking the fold gutter, child code fragments are also folded/unfolded
 * up to a level defined in the `maxFoldLevel' preference.
 * @param {!CodeMirror} cm the CodeMirror object
 * @param {number} line the line number for the clicked gutter
 * @param {string} gutter the name of the gutter element clicked
 * @param {!KeyboardEvent} event the underlying dom event triggered for the gutter click
 */
function onGutterClick(cm: CodeMirror.Editor, line: number, gutter: string, event: KeyboardEvent): void {
    const opts = cm.state.foldGutter.options;
    const pos = CodeMirror.Pos(line);
    if (gutter !== opts.gutter) { return; }

    const _lineFolds = cm._lineFolds;
    if (cm.isFolded(line)) {
        if (event.altKey) { // unfold code including children
            const range = _lineFolds[line];
            CodeMirror.commands.unfoldAll(cm, range.from.line, range.to.line);
        } else {
            cm.unfoldCode(line, {range: _lineFolds[line]});
        }
    } else {
        if (event.altKey) {
            const range = CodeMirror.fold.auto(cm, pos);
            if (range) {
                CodeMirror.commands.foldToLevel(cm, range.from.line, range.to.line);
            }
        } else {
            cm.foldCode(line);
        }
    }
}

/**
 * Collapses the code region nearest the current cursor position.
 * Nearest is found by searching from the current line and moving up the document until an
 * opening code-folding region is found.
 */
function collapseCurrent(): void {
    const editor = EditorManager.getFocusedEditor();
    if (!editor) {
        return;
    }
    const cm = editor._codeMirror;
    const cursor = editor.getCursorPos();
    // Move cursor up until a collapsible line is found
    for (let i = cursor.line; i >= 0; i--) {
        if (cm.foldCode(i)) {
            editor.setCursorPos(i);
            return;
        }
    }
}

/**
 * Expands the code region at the current cursor position.
 */
function expandCurrent(): void {
    const editor = EditorManager.getFocusedEditor();
    if (editor) {
        const cursor = editor.getCursorPos();
        const cm = editor._codeMirror;
        cm.unfoldCode(cursor.line);
    }
}

/**
 * Collapses all foldable regions in the current document. Folding is done up to a level 'n'
 * which is defined in the `maxFoldLevel` preference. Levels refer to fold heirarchies e.g., for the following
 * code fragment, the function is level 1, the if statement is level 2 and the forEach is level 3
 *
 *     function sample() {
 *         if (debug) {
 *             logMessages.forEach(function (m) {
 *                 console.debug(m);
 *             });
 *         }
 *     }
 */
function collapseAll(): void {
    const editor = EditorManager.getFocusedEditor();
    if (editor) {
        const cm = editor._codeMirror;
        CodeMirror.commands.foldToLevel(cm);
    }
}

/**
 * Expands all folded regions in the current document
 */
function expandAll(): void {
    const editor = EditorManager.getFocusedEditor();
    if (editor) {
        const cm = editor._codeMirror;
        CodeMirror.commands.unfoldAll(cm);
    }
}

function clearGutter(editor: TEditor): void {
    const cm = editor._codeMirror;
    const BLANK_GUTTER_CLASS = "CodeMirror-foldgutter-blank";
    editor.clearGutter(GUTTER_NAME);
    const blank = window.document.createElement("div");
    blank.className = BLANK_GUTTER_CLASS;
    const vp = cm.getViewport();
    cm.operation(function () {
        cm.eachLine(vp.from, vp.to, function (line) {
            editor.setGutterMarker(line.lineNo(), GUTTER_NAME, blank);
        });
    });
}

/**
 * Renders and sets up event listeners the code-folding gutter.
 * @param {Editor} editor the editor on which to initialise the fold gutter
 */
function setupGutterEventListeners(editor: TEditor): void {
    const cm = editor._codeMirror;
    $(editor.getRootElement()).addClass("folding-enabled");
    cm.setOption("foldGutter", {onGutterClick: onGutterClick});

    $(cm.getGutterElement()).on({
        mouseenter: function () {
            if (prefs.getSetting("hideUntilMouseover")) {
                foldGutter.updateInViewport(cm);
            } else {
                $(editor.getRootElement()).addClass("over-gutter");
            }
        },
        mouseleave: function () {
            if (prefs.getSetting("hideUntilMouseover")) {
                clearGutter(editor);
            } else {
                $(editor.getRootElement()).removeClass("over-gutter");
            }
        }
    });
}

/**
 * Remove gutter & revert collapsed sections in all currently open editors
 */
function removeGutters(): void {
    Editor.forEveryEditor(function (editor) {
        CodeMirror.commands.unfoldAll(editor._codeMirror);
    });

    Editor.unregisterGutter(GUTTER_NAME);

    Editor.forEveryEditor(function (editor) {
        $(editor.getRootElement()).removeClass("folding-enabled");
    });

    CodeMirror.defineOption("foldGutter", false, null as any);
}

/**
 * Add gutter and restore saved expand/collapse state.
 * @param {Editor} editor the editor instance where gutter should be added.
 */
function enableFoldingInEditor(editor: TEditor): void {
    restoreLineFolds(editor);
    setupGutterEventListeners(editor);
    editor._codeMirror.refresh();
}

/**
 * When a brand new editor is seen, initialise fold-gutter and restore line folds in it.
 * Save line folds in departing editor in case it's getting closed.
 * @param {object} event the event object
 * @param {Editor} current the current editor
 * @param {Editor} previous the previous editor
 */
function onActiveEditorChanged(event, current: TEditor, previous: TEditor): void {
    if (current && !current._codeMirror._lineFolds) {
        enableFoldingInEditor(current);
    }
    if (previous) {
        saveLineFolds(previous);
    }
}

/**
 * Saves the line folds in the current full editor before it is closed.
 */
function saveBeforeClose(): void {
    // We've already saved all other open editors when they go active->inactive
    saveLineFolds(EditorManager.getActiveEditor()!);
}

/**
 * Remove code-folding functionality
 */
function deinit(): void {
    _isInitialized = false;

    KeyBindingManager.removeBinding(collapseKey);
    KeyBindingManager.removeBinding(expandKey);
    KeyBindingManager.removeBinding(collapseAllKey);
    KeyBindingManager.removeBinding(expandAllKey);
    KeyBindingManager.removeBinding(collapseAllKeyMac);
    KeyBindingManager.removeBinding(expandAllKeyMac);

    // remove menus
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).removeMenuDivider(codeFoldingMenuDivider.id);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).removeMenuItem(COLLAPSE);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).removeMenuItem(EXPAND);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).removeMenuItem(COLLAPSE_ALL);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).removeMenuItem(EXPAND_ALL);

    EditorManager.off(".CodeFolding");
    DocumentManager.off(".CodeFolding");
    ProjectManager.off(".CodeFolding");

    removeGutters();
}

/**
 * Enable code-folding functionality
 */
function init(): void {
    _isInitialized = true;

    foldCode.init();
    foldGutter.init();

    // Many CodeMirror modes specify which fold helper should be used for that language. For a few that
    // don't, we register helpers explicitly here. We also register a global helper for generic indent-based
    // folding, which cuts across all languages if enabled via preference.
    CodeMirror.registerGlobalHelper("fold", "selectionFold", function (mode, cm) {
        return prefs.getSetting("makeSelectionsFoldable");
    }, selectionFold);
    CodeMirror.registerGlobalHelper("fold", "indent", function (mode, cm) {
        return prefs.getSetting("alwaysUseIndentFold");
    }, indentFold);

    CodeMirror.registerHelper("fold", "handlebars", handlebarsFold);
    CodeMirror.registerHelper("fold", "htmlhandlebars", handlebarsFold);
    CodeMirror.registerHelper("fold", "htmlmixed", handlebarsFold);

    EditorManager.on("activeEditorChange.CodeFolding", onActiveEditorChanged);
    DocumentManager.on("documentRefreshed.CodeFolding", function (event, doc) {
        restoreLineFolds(doc._masterEditor);
    });

    ProjectManager.on("beforeProjectClose.CodeFolding beforeAppClose.CodeFolding", saveBeforeClose);

    // create menus
    codeFoldingMenuDivider = Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuDivider()!;
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(COLLAPSE_ALL);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(EXPAND_ALL);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(COLLAPSE);
    Menus.getMenu(Menus.AppMenuBar.VIEW_MENU).addMenuItem(EXPAND);

    // register keybindings
    KeyBindingManager.addBinding(COLLAPSE_ALL, [ {key: collapseAllKey}, {key: collapseAllKeyMac, platform: "mac"} ]);
    KeyBindingManager.addBinding(EXPAND_ALL, [ {key: expandAllKey}, {key: expandAllKeyMac, platform: "mac"} ]);
    KeyBindingManager.addBinding(COLLAPSE, collapseKey);
    KeyBindingManager.addBinding(EXPAND, expandKey);


    // Add gutters & restore saved expand/collapse state in all currently open editors
    Editor.registerGutter(GUTTER_NAME, CODE_FOLDING_GUTTER_PRIORITY);
    Editor.forEveryEditor(function (editor) {
        enableFoldingInEditor(editor);
    });
}

/**
 * Register change listener for the preferences file.
 */
function watchPrefsForChanges(): void {
    prefs.prefsObject.on("change", function (e, data) {
        if (data.ids.indexOf("enabled") > -1) {
            // Check if enabled state mismatches whether code-folding is actually initialized (can't assume
            // since preference change events can occur when the value hasn't really changed)
            const isEnabled = prefs.getSetting("enabled");
            if (isEnabled && !_isInitialized) {
                init();
            } else if (!isEnabled && _isInitialized) {
                deinit();
            }
        }
    });
}

AppInit.htmlReady(function () {
    CommandManager.register(Strings.COLLAPSE_ALL, COLLAPSE_ALL, collapseAll);
    CommandManager.register(Strings.EXPAND_ALL, EXPAND_ALL, expandAll);
    CommandManager.register(Strings.COLLAPSE_CURRENT, COLLAPSE, collapseCurrent);
    CommandManager.register(Strings.EXPAND_CURRENT, EXPAND, expandCurrent);

    if (prefs.getSetting("enabled")) {
        init();
    }
    watchPrefsForChanges();
});
