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

/*global less */

/**
 * The ViewCommandHandlers object dispatches the following event(s):
 *    - fontSizeChange -- Triggered when the font size is changed via the
 *      Increase Font Size, Decrease Font Size, or Restore Font Size commands.
 *      The 2nd arg to the listener is the amount of the change. The 3rd arg
 *      is a string containing the new font size after applying the change.
 */

import type { Editor } from "editor/Editor";

import * as Commands from "command/Commands";
import * as EventDispatcher from "utils/EventDispatcher";
import * as CommandManager from "command/CommandManager";
import * as Strings from "strings";
import * as StringUtils from "utils/StringUtils";
import * as EditorManager from "editor/EditorManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as DocumentManager from "document/DocumentManager";
import * as ThemeSettings from "view/ThemeSettings";
import * as MainViewManager from "view/MainViewManager";
import * as AppInit from "utils/AppInit";
import * as _ from "lodash";
import * as FontRuleTemplate from "text!view/fontrules/font-based-rules.less";

interface RuleTextConfiguration {
    ruleText: string;
}

interface RulePropConfiguration {
    propName: string;
    propValue: string;
    priorityFlag?: boolean;
    ruleName?: string;
}

interface LinesInView {
    first: number;
    last: number;
}

const prefs = PreferencesManager.getExtensionPrefs("fonts");

/**
 * Font sizes should be validated by this regexp
 */
export const validFontSizeRegExp = "^([0-9]+)?(\\.)?([0-9]+)(px|em)$";
// Need RegExp as a string to be exported for use with HTML5 pattern attribute

/**
 * @private
 * The currently present font size. Used to detect no-op changes.
 * @type {string}
 */
let currFontSize;

/**
 * @private
 * The currently present font family. Used to detect no-op changes.
 * @type {string}
 */
let currFontFamily;

/**
 * @const
 * @type {string}
 */
const DYNAMIC_FONT_STYLE_ID = "codemirror-dynamic-fonts";

/**
 * @const
 * @type {string}
 */
const DYNAMIC_FONT_FAMILY_ID = "codemirror-dynamic-font-family";

/**
 * @const
 * @private
 * The smallest font size in pixels
 * @type {number}
 */
const MIN_FONT_SIZE = 1;

/**
 * @const
 * @private
 * The largest font size in pixels
 * @type {number}
 */
const MAX_FONT_SIZE = 72;

/**
 * @const
 * @private
 * The default font size used only to convert the old fontSizeAdjustment view state to the new fontSize
 * @type {number}
 */
const DEFAULT_FONT_SIZE = 12;

/**
 * @const
 * @private
 * The default font family
 * @type {string}
 */
const DEFAULT_FONT_FAMILY = "'SourceCodePro-Medium', ＭＳ ゴシック, 'MS Gothic', monospace";

/**
 * @private
 * Removes style property from the DOM
 * @param {string} propertyID is the id of the property to be removed
 */
function _removeDynamicProperty(propertyID: string): void {
    $("#" + propertyID).remove();
}

/**
 * @private
 * Add the style property to the DOM
 * @param {string} propertyID Is the property ID to be added
 * @param {object} ruleCfg Is the CSS Rule configuration object
 * @param {string} ruleCfg.propName Is the name of the style property
 * @param {string} ruleCfg.propValue Is the value of the style property
 * @param {boolean} ruleCfg.priorityFlag Is a flag to make the style property !important
 * @param {string} ruleCfg.ruleName Optional Selctor name to be used for the rule
 * @param {string} ruleCfg.ruleText Optional selector definition text
 */
function _addDynamicProperty(propertyID: string, ruleCfg: RuleTextConfiguration | RulePropConfiguration): void {
    const $style   = $("<style type='text/css'></style>").attr("id", propertyID);
    if (isRuleTextConfiguration(ruleCfg)) {
        $style.html(ruleCfg.ruleText);
    } else {
        const cssRule = ruleCfg.ruleName || ".CodeMirror";
        const styleStr = StringUtils.format("{0}: {1} {2}", ruleCfg.propName, ruleCfg.propValue, ruleCfg.priorityFlag ? "!important" : "");
        $style.html(cssRule + "{ " + styleStr + " }");
    }

    // Let's make sure we remove the already existing item from the DOM.
    _removeDynamicProperty(propertyID);
    $("head").append($style);
}

function isRuleTextConfiguration(ruleCfg: RuleTextConfiguration | RulePropConfiguration): ruleCfg is RuleTextConfiguration {
    return !!(ruleCfg as RuleTextConfiguration).ruleText;
}

/**
 * @private
 * Removes the styles used to update the font size
 */
function _removeDynamicFontSize(): void {
    _removeDynamicProperty(DYNAMIC_FONT_STYLE_ID);
}

/**
 * @private
 * Add the styles used to update the font size
 * @param {string} fontSize  A string with the font size and the size unit
 */
function _addDynamicFontSize(fontSize: string): void {
    const template = FontRuleTemplate.split("{font-size-param}").join(fontSize);
    const options: Less.Options = {
        math: "always"
    };

    less.render(template, options, function onParse(err, tree) {
        if (err) {
            console.error(err);
        } else {
            _addDynamicProperty(DYNAMIC_FONT_STYLE_ID, {
                ruleText: tree!.css
            });
        }
    });
}

/**
 * @private
 * Removes the styles used to update the font family
 */
function _removeDynamicFontFamily(): void {
    _removeDynamicProperty(DYNAMIC_FONT_FAMILY_ID);
}

/**
 * @private
 * Add the styles used to update the font family
 * @param {string} fontFamily  A string with the font family
 */
function _addDynamicFontFamily(fontFamily: string): void {
    _addDynamicProperty(DYNAMIC_FONT_FAMILY_ID, {
        propName: "font-family",
        propValue: fontFamily
    });
}

/**
 * @private
 * Sets the font size and restores the scroll position as best as possible.
 * @param {!Editor} editor  Editor to update.
 * @param {string=} fontSize  A string with the font size and the size unit
 */
function _updateScroll(editor: Editor, fontSize: string): void {
    const oldWidth    = editor._codeMirror.defaultCharWidth();
    const oldFontSize = prefs.get("fontSize");
    const newFontSize = fontSize;
    const scrollPos   = editor.getScrollPos();
    const line        = editor._codeMirror.lineAtHeight(scrollPos.y, "local");

    const delta = /em$/.test(oldFontSize) ? 10 : 1;

    const num = ((parseFloat(newFontSize) - parseFloat(oldFontSize)) * delta) as unknown as string;
    const adjustment = parseInt(num, 10);

    // Only adjust the scroll position if there was any adjustments to the font size.
    // Otherwise there will be unintended scrolling.
    //
    if (adjustment) {
        editor.refreshAll();
    }

    // Calculate the new scroll based on the old font sizes and scroll position
    const newWidth   = editor._codeMirror.defaultCharWidth();
    const deltaX     = scrollPos.x / oldWidth;
    const scrollPosX = scrollPos.x + Math.round(deltaX * (newWidth  - oldWidth));
    const scrollPosY = editor._codeMirror.heightAtLine(line, "local");

    editor.setScrollPos(scrollPosX, scrollPosY);
}

/**
 * Font size setter to set the font size for the document editor
 * @param {string} fontSize The font size with size unit as 'px' or 'em'
 */
export function setFontSize(fontSize: string): void {
    if (currFontSize === fontSize) {
        return;
    }

    _removeDynamicFontSize();
    if (fontSize) {
        _addDynamicFontSize(fontSize);
    }

    // Update scroll metrics in viewed editors
    _.forEach(MainViewManager.getPaneIdList(), function (paneId) {
        const currentPath = MainViewManager.getCurrentlyViewedPath(paneId);
        const doc = currentPath && DocumentManager.getOpenDocumentForPath(currentPath);
        if (doc && doc._masterEditor) {
            _updateScroll(doc._masterEditor, fontSize);
        }
    });

    exports.trigger("fontSizeChange", fontSize, currFontSize);
    currFontSize = fontSize;
    prefs.set("fontSize", fontSize);
}

/**
 * Font size getter to get the current font size for the document editor
 * @return {string} Font size with size unit as 'px' or 'em'
 */
export function getFontSize(): string {
    return prefs.get("fontSize");
}


/**
 * Font family setter to set the font family for the document editor
 * @param {string} fontFamily The font family to be set.  It can be a string with multiple comma separated fonts
 */
export function setFontFamily(fontFamily: string): void {
    const editor = EditorManager.getCurrentFullEditor();

    if (currFontFamily === fontFamily) {
        return;
    }

    _removeDynamicFontFamily();
    if (fontFamily) {
        _addDynamicFontFamily(fontFamily);
    }

    exports.trigger("fontFamilyChange", fontFamily, currFontFamily);
    currFontFamily = fontFamily;
    prefs.set("fontFamily", fontFamily);

    if (editor) {
        editor.refreshAll();
    }
}


/**
 * Font smoothing setter to set the anti-aliasing type for the code area on Mac.
 * @param {string} aaType The antialiasing type to be set. It can take either "subpixel-antialiased" or "antialiased"
 */
function setMacFontSmoothingType(aaType: string): void {
    const $editorHolder  = $("#editor-holder");

    // Add/Remove the class based on the preference. Also
    // default to subpixel AA in case of invalid entries.
    if (aaType === "antialiased") {
        $editorHolder.removeClass("subpixel-aa");
    } else {
        $editorHolder.addClass("subpixel-aa");
    }
}

/**
 * Font family getter to get the currently configured font family for the document editor
 * @return {string} The font family for the document editor
 */
export function getFontFamily(): string {
    return prefs.get("fontFamily");
}


/**
 * @private
 * Increases or decreases the editor's font size.
 * @param {number} adjustment  Negative number to make the font smaller; positive number to make it bigger
 * @return {boolean} true if adjustment occurred, false if it did not occur
 */
function _adjustFontSize(adjustment: number): boolean {
    const fsStyle    = prefs.get("fontSize");
    const fontSizeRegExp = new RegExp(validFontSizeRegExp);

    // Make sure that the font size is expressed in terms we can
    // handle (px or em). If not, simply bail.

    if (fsStyle.search(fontSizeRegExp) === -1) {
        return false;
    }

    // Guaranteed to work by validation above.
    const fsUnits = fsStyle.substring(fsStyle.length - 2, fsStyle.length);
    const delta   = fsUnits === "px" ? 1 : 0.1;
    const fsOld   = parseFloat(fsStyle.substring(0, fsStyle.length - 2));
    const fsNew   = fsOld + (delta * adjustment);
    const fsStr   = fsNew + fsUnits;

    // Don't let the font size get too small or too large. The minimum font size is 1px or 0.1em
    // and the maximum font size is 72px or 7.2em depending on the unit used
    if (fsNew < MIN_FONT_SIZE * delta || fsNew > MAX_FONT_SIZE * delta) {
        return false;
    }

    setFontSize(fsStr);
    return true;
}

/** Increases the font size by 1 */
function _handleIncreaseFontSize(): void {
    _adjustFontSize(1);
}

/** Decreases the font size by 1 */
function _handleDecreaseFontSize(): void {
    _adjustFontSize(-1);
}

/** Restores the font size to the original size */
function _handleRestoreFontSize(): void {
    setFontSize(DEFAULT_FONT_SIZE + "px");
}

/**
 * @private
 * Updates the user interface appropriately based on whether or not a document is
 * currently open in the editor.
 */
function _updateUI(): void {
    if (DocumentManager.getCurrentDocument() !== null) {
        if (!CommandManager.get(Commands.VIEW_INCREASE_FONT_SIZE).getEnabled()) {
            // If one is disabled then they all are disabled, so enable them all
            CommandManager.get(Commands.VIEW_INCREASE_FONT_SIZE).setEnabled(true);
            CommandManager.get(Commands.VIEW_DECREASE_FONT_SIZE).setEnabled(true);
            CommandManager.get(Commands.VIEW_RESTORE_FONT_SIZE).setEnabled(true);
        }
    } else {
        // No current document so disable all of the Font Size commands
        CommandManager.get(Commands.VIEW_INCREASE_FONT_SIZE).setEnabled(false);
        CommandManager.get(Commands.VIEW_DECREASE_FONT_SIZE).setEnabled(false);
        CommandManager.get(Commands.VIEW_RESTORE_FONT_SIZE).setEnabled(false);
    }
}

/**
 * Initializes the different settings that need to loaded
 */
function init(): void {
    currFontFamily = prefs.get("fontFamily");
    _addDynamicFontFamily(currFontFamily);
    currFontSize = prefs.get("fontSize");
    _addDynamicFontSize(currFontSize);
    _updateUI();
}

/**
 * Restores the font size using the saved style and migrates the old fontSizeAdjustment
 * view state to the new fontSize, when required
 */
export function restoreFontSize(): void {
    let fsStyle = prefs.get("fontSize");
    const fsAdjustment = PreferencesManager.getViewState("fontSizeAdjustment");

    if (fsAdjustment) {
        // Always remove the old view state even if we also have the new view state.
        PreferencesManager.setViewState("fontSizeAdjustment", undefined);

        if (!fsStyle) {
            // Migrate the old view state to the new one.
            fsStyle = (DEFAULT_FONT_SIZE + fsAdjustment) + "px";
            prefs.set("fontSize", fsStyle);
        }
    }

    if (fsStyle) {
        _removeDynamicFontSize();
        _addDynamicFontSize(fsStyle);
    }
}

/**
 * Restores the font size and font family back to factory settings.
 */
export function restoreFonts(): void {
    setFontFamily(DEFAULT_FONT_FAMILY);
    setFontSize(DEFAULT_FONT_SIZE + "px");
}


/**
 * @private
 * Calculates the first and last visible lines of the focused editor
 * @param {number} textHeight
 * @param {number} scrollTop
 * @param {number} editorHeight
 * @return {{first: number, last: number}}
 */
function _getLinesInView(textHeight: number, scrollTop: number, editorHeight: number): LinesInView {
    const scrolledTop    = scrollTop / textHeight;
    const scrolledBottom = (scrollTop + editorHeight) / textHeight;

    // Adjust the last line to round inward to show a whole lines.
    const firstLine      = Math.ceil(scrolledTop);
    const lastLine       = Math.floor(scrolledBottom) - 1;

    return { first: firstLine, last: lastLine };
}

/**
 * @private
 * Scroll the viewport one line up or down.
 * @param {number} direction -1 to scroll one line up; 1 to scroll one line down.
 */
function _scrollLine(direction: 1 | -1): void {
    const editor        = EditorManager.getCurrentFullEditor()!;
    const textHeight    = editor.getTextHeight();
    const cursorPos     = editor.getCursorPos();
    const hasSelecction = editor.hasSelection();
    const inlineEditors = editor.getInlineWidgets();
    const scrollInfo    = editor._codeMirror.getScrollInfo();
    const paddingTop    = editor._getLineSpaceElement().offsetTop;
    let editorHeight  = scrollInfo.clientHeight;
    let scrollTop     = scrollInfo.top - paddingTop;
    let removedScroll = paddingTop;

    // Go through all the editors and reduce the scroll top and editor height to properly calculate the lines in view
    inlineEditors.forEach(function (inlineEditor) {
        const line   = editor._getInlineWidgetLineNumber(inlineEditor);
        const coords = editor._codeMirror.charCoords({line: line, ch: 0}, "local");

        if (coords.top < scrollInfo.top) {
            scrollTop     -= inlineEditor.info!.height;
            removedScroll += inlineEditor.info!.height;

        } else if (coords.top + inlineEditor.info!.height < scrollInfo.top + editorHeight) {
            editorHeight -= inlineEditor.info!.height;
        }
    });

    // Calculate the lines in view
    const linesInView = _getLinesInView(textHeight, scrollTop, editorHeight);

    // If there is no selection move the cursor so that is always visible.
    if (!hasSelecction) {
        // Move the cursor to the first visible line.
        if (cursorPos.line < linesInView.first) {
            editor.setCursorPos({line: linesInView.first + direction, ch: cursorPos.ch});

        // Move the cursor to the last visible line.
        } else if (cursorPos.line > linesInView.last) {
            editor.setCursorPos({line: linesInView.last + direction, ch: cursorPos.ch});

        // Move the cursor up or down using moveV to keep the goal column intact, since setCursorPos deletes it.
        } else if ((direction > 0 && cursorPos.line === linesInView.first) ||
                (direction < 0 && cursorPos.line === linesInView.last)) {
            editor._codeMirror.moveV(direction, "line");
        }
    }

    // Scroll and make it snap to lines
    const lines = linesInView.first + direction;
    editor.setScrollPos(scrollInfo.left, (textHeight * lines) + removedScroll);
}

/** Scrolls one line up */
function _handleScrollLineUp(): void {
    _scrollLine(-1);
}

/** Scrolls one line down */
function _handleScrollLineDown(): void {
    _scrollLine(1);
}

/** Open theme settings dialog */
function _handleThemeSettings(): void {
    ThemeSettings.showDialog();
}

// Register command handlers
CommandManager.register(Strings.CMD_INCREASE_FONT_SIZE, Commands.VIEW_INCREASE_FONT_SIZE,  _handleIncreaseFontSize);
CommandManager.register(Strings.CMD_DECREASE_FONT_SIZE, Commands.VIEW_DECREASE_FONT_SIZE,  _handleDecreaseFontSize);
CommandManager.register(Strings.CMD_RESTORE_FONT_SIZE,  Commands.VIEW_RESTORE_FONT_SIZE,   _handleRestoreFontSize);
CommandManager.register(Strings.CMD_SCROLL_LINE_UP,     Commands.VIEW_SCROLL_LINE_UP,      _handleScrollLineUp);
CommandManager.register(Strings.CMD_SCROLL_LINE_DOWN,   Commands.VIEW_SCROLL_LINE_DOWN,    _handleScrollLineDown);
CommandManager.register(Strings.CMD_THEMES,             Commands.CMD_THEMES_OPEN_SETTINGS, _handleThemeSettings);

prefs.definePreference("fontSize",   "string", DEFAULT_FONT_SIZE + "px", {
    description: Strings.DESCRIPTION_FONT_SIZE
}).on("change", function () {
    setFontSize(prefs.get("fontSize"));
});
prefs.definePreference("fontFamily", "string", DEFAULT_FONT_FAMILY, {
    description: Strings.DESCRIPTION_FONT_FAMILY
}).on("change", function () {
    setFontFamily(prefs.get("fontFamily"));
});

// Define a preference for font smoothing mode on Mac.
// By default fontSmoothing is set to "subpixel-antialiased"
// for the text inside code editor. It can be overridden
// to "antialiased", that would set text rendering AA to use
// gray scale antialiasing.
if (brackets.platform === "mac") {
    prefs.definePreference("fontSmoothing", "string", "subpixel-antialiased", {
        description: Strings.DESCRIPTION_FONT_SMOOTHING,
        values: ["subpixel-antialiased", "antialiased"]
    }).on("change", function () {
        setMacFontSmoothingType(prefs.get("fontSmoothing"));
    });
}

// Update UI when opening or closing a document
(MainViewManager as unknown as EventDispatcher.DispatcherEvents).on("currentFileChange", _updateUI);

// Update UI when Brackets finishes loading
AppInit.appReady(init);

EventDispatcher.makeEventDispatcher(exports);
