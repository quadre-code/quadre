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

/**
 * Manages parts of the status bar related to the current editor's state.
 */

// Load dependent modules
import * as _ from "thirdparty/lodash";
import * as AnimationUtils from "utils/AnimationUtils";
import * as AppInit from "utils/AppInit";
import { DropdownButton } from "widgets/DropdownButton";
import * as EditorManager from "editor/EditorManager";
import * as MainViewManager from "view/MainViewManager";
import { Editor } from "editor/Editor";
import * as KeyEvent from "utils/KeyEvent";
import * as LanguageManager from "language/LanguageManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as StatusBar from "widgets/StatusBar";
import * as Strings from "strings";
import * as StringUtils from "utils/StringUtils";
import { DispatcherEvents } from "utils/EventDispatcher";

/* StatusBar indicators */
let languageSelect; // this is a DropdownButton instance
let $cursorInfo;
let $fileInfo;
let $indentType;
let $indentWidthLabel;
let $indentWidthInput;
let $statusOverwrite;

/** Special list item for the 'set as default' gesture in language switcher dropdown */
const LANGUAGE_SET_AS_DEFAULT = {};


/**
 * Determine string based on count
 * @param {number} number Count
 * @param {string} singularStr Singular string
 * @param {string} pluralStr Plural string
 * @return {string} Proper string to use for count
 */
function _formatCountable(number, singularStr, pluralStr) {
    return StringUtils.format(number > 1 ? pluralStr : singularStr, number);
}

/**
 * Update file mode
 * @param {Editor} editor Current editor
 */
function _updateLanguageInfo(editor) {
    const doc = editor.document;
    const lang = doc.getLanguage();

    // Ensure width isn't left locked by a previous click of the dropdown (which may not have resulted in a "change" event at the time)
    languageSelect.$button.css("width", "auto");
    // Show the current language as button title
    languageSelect.$button.text(lang.getName());
}

/**
 * Update file information
 * @param {Editor} editor Current editor
 */
function _updateFileInfo(editor) {
    const lines = editor.lineCount();
    $fileInfo.text(_formatCountable(lines, Strings.STATUSBAR_LINE_COUNT_SINGULAR, Strings.STATUSBAR_LINE_COUNT_PLURAL));
}

/**
 * Update indent type and size
 * @param {string} fullPath Path to file in current editor
 */
function _updateIndentType(fullPath) {
    const indentWithTabs = Editor.getUseTabChar(fullPath);
    $indentType.text(indentWithTabs ? Strings.STATUSBAR_TAB_SIZE : Strings.STATUSBAR_SPACES);
    $indentType.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_TOOLTIP_SPACES : Strings.STATUSBAR_INDENT_TOOLTIP_TABS);
    $indentWidthLabel.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_TABS : Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_SPACES);
}

/**
 * Get indent size based on type
 * @param {string} fullPath Path to file in current editor
 * @return {number} Indent size
 */
function _getIndentSize(fullPath) {
    return Editor.getUseTabChar(fullPath) ? Editor.getTabSize(fullPath) : Editor.getSpaceUnits(fullPath);
}

/**
 * Update indent size
 * @param {string} fullPath Path to file in current editor
 */
function _updateIndentSize(fullPath) {
    const size = _getIndentSize(fullPath);
    $indentWidthLabel.text(size);
    $indentWidthInput.val(size);
}

/**
 * Toggle indent type
 */
function _toggleIndentType() {
    const current = EditorManager.getActiveEditor();
    const fullPath = current && current.document.file.fullPath;

    Editor.setUseTabChar(!Editor.getUseTabChar(fullPath), fullPath);
    _updateIndentType(fullPath);
    _updateIndentSize(fullPath);
}

/**
 * Update cursor(s)/selection(s) information
 * @param {Event} event (unused)
 * @param {Editor} editor Current editor
 */
function _updateCursorInfo(event?, editor?) {
    editor = editor || EditorManager.getActiveEditor();

    // compute columns, account for tab size
    const cursor = editor.getCursorPos(true);

    const cursorStr = StringUtils.format(Strings.STATUSBAR_CURSOR_POSITION, cursor.line + 1, cursor.ch + 1);

    const sels = editor.getSelections();
    let selStr = "";

    if (sels.length > 1) {
        selStr = StringUtils.format(Strings.STATUSBAR_SELECTION_MULTIPLE, sels.length);
    } else if (editor.hasSelection()) {
        const sel = sels[0];
        if (sel.start.line !== sel.end.line) {
            let lines = sel.end.line - sel.start.line + 1;
            if (sel.end.ch === 0) {
                lines--;  // end line is exclusive if ch is 0, inclusive otherwise
            }
            selStr = _formatCountable(lines, Strings.STATUSBAR_SELECTION_LINE_SINGULAR, Strings.STATUSBAR_SELECTION_LINE_PLURAL);
        } else {
            const cols = editor.getColOffset(sel.end) - editor.getColOffset(sel.start);  // end ch is exclusive always
            selStr = _formatCountable(cols, Strings.STATUSBAR_SELECTION_CH_SINGULAR, Strings.STATUSBAR_SELECTION_CH_PLURAL);
        }
    }
    $cursorInfo.text(cursorStr + selStr);
}

/**
 * Change indent size
 * @param {string} fullPath Path to file in current editor
 * @param {string} value Size entered into status bar
 */
function _changeIndentWidth(fullPath, value) {
    $indentWidthLabel.removeClass("hidden");
    $indentWidthInput.addClass("hidden");

    // remove all event handlers from the input field
    $indentWidthInput.off("blur keyup");

    // restore focus to the editor
    MainViewManager.focusActivePane();

    const valInt = parseInt(value, 10);
    if (Editor.getUseTabChar(fullPath)) {
        if (!Editor.setTabSize(valInt, fullPath)) {
            return;     // validation failed
        }
    } else {
        if (!Editor.setSpaceUnits(valInt, fullPath)) {
            return;     // validation failed
        }
    }

    // update indicator
    _updateIndentSize(fullPath);

    // column position may change when tab size changes
    _updateCursorInfo();
}

/**
 * Update insert/overwrite label
 * @param {Event} event (unused)
 * @param {Editor} editor Current editor
 * @param {string} newstate New overwrite state
 * @param {boolean=} doNotAnimate True if state should not be animated
 */
function _updateOverwriteLabel(event, editor, newstate, doNotAnimate) {
    if ($statusOverwrite.text() === (newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT)) {
        // label already up-to-date
        return;
    }

    $statusOverwrite.text(newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT);

    if (!doNotAnimate) {
        AnimationUtils.animateUsingClass($statusOverwrite[0], "flash", 1500);
    }
}

/**
 * Update insert/overwrite indicator
 * @param {Event} event (unused)
 */
function _updateEditorOverwriteMode(event) {
    const editor = EditorManager.getActiveEditor()!;
    const newstate = !editor._codeMirror.state.overwrite;

    // update label with no transition
    _updateOverwriteLabel(event, editor, newstate, true);
    editor.toggleOverwrite(newstate);
}

/**
 * Initialize insert/overwrite indicator
 * @param {Editor} currentEditor Current editor
 */
function _initOverwriteMode(currentEditor) {
    currentEditor.toggleOverwrite($statusOverwrite.text() === Strings.STATUSBAR_OVERWRITE);
    $statusOverwrite.attr("title", Strings.STATUSBAR_INSOVR_TOOLTIP);
}

/**
 * Handle active editor change event
 * @param {Event} event (unused)
 * @param {Editor} current Current editor
 * @param {Editor} previous Previous editor
 */
function _onActiveEditorChange(event, current, previous) {
    if (previous) {
        previous.off(".statusbar");
        previous.document.off(".statusbar");
        previous.document.releaseRef();
    }

    if (!current) {
        StatusBar.hideAllPanes();
    } else {
        const fullPath = current.document.file.fullPath;
        StatusBar.showAllPanes();

        current.on("cursorActivity.statusbar", _updateCursorInfo);
        current.on("optionChange.statusbar", function () {
            _updateIndentType(fullPath);
            _updateIndentSize(fullPath);
        });
        current.on("change.statusbar", function () {
            // async update to keep typing speed smooth
            window.setTimeout(function () { _updateFileInfo(current); }, 0);
        });
        current.on("overwriteToggle.statusbar", _updateOverwriteLabel);

        current.document.addRef();
        current.document.on("languageChanged.statusbar", function () {
            _updateLanguageInfo(current);
        });

        _updateCursorInfo(null, current);
        _updateLanguageInfo(current);
        _updateFileInfo(current);
        _initOverwriteMode(current);
        _updateIndentType(fullPath);
        _updateIndentSize(fullPath);
    }
}

/**
 * Populate the languageSelect DropdownButton's menu with all registered Languages
 */
function _populateLanguageDropdown() {
    // Get all non-binary languages
    const languages = _.values(LanguageManager.getLanguages()).filter(function (language) {
        return !language.isBinary();
    });

    // sort dropdown alphabetically
    languages.sort(function (a, b) {
        return a.getName().toLowerCase().localeCompare(b.getName().toLowerCase());
    });

    languageSelect.items = languages;

    // Add option to top of menu for persisting the override
    languageSelect.items.unshift("---");
    languageSelect.items.unshift(LANGUAGE_SET_AS_DEFAULT);
}

/**
 * Initialize
 */
function _init() {

    $cursorInfo         = $("#status-cursor");
    $fileInfo           = $("#status-file");
    $indentType         = $("#indent-type");
    $indentWidthLabel   = $("#indent-width-label");
    $indentWidthInput   = $("#indent-width-input");
    $statusOverwrite    = $("#status-overwrite");

    languageSelect      = new DropdownButton("", [], function (item, index) {
        const document = EditorManager.getActiveEditor()!.document;
        const defaultLang = LanguageManager.getLanguageForPath(document.file.fullPath, true);

        if (item === LANGUAGE_SET_AS_DEFAULT) {
            const label = _.escape(StringUtils.format(Strings.STATUSBAR_SET_DEFAULT_LANG, LanguageManager.getCompoundFileExtension(document.file.fullPath)));
            return { html: label, enabled: document.getLanguage() !== defaultLang };
        }

        let html = _.escape(item.getName());

        // Show indicators for currently selected & default languages for the current file
        if (item === defaultLang) {
            html += " <span class='default-language'>" + Strings.STATUSBAR_DEFAULT_LANG + "</span>";
        }
        if (item === document.getLanguage()) {
            html = "<span class='checked-language'></span>" + html;
        }
        return html;
    });

    languageSelect.dropdownExtraClasses = "dropdown-status-bar";
    languageSelect.$button.addClass("btn-status-bar");
    $("#status-language").append(languageSelect.$button);
    languageSelect.$button.attr("title", Strings.STATUSBAR_LANG_TOOLTIP);

    // indentation event handlers
    $indentType.on("click", _toggleIndentType);
    $indentWidthLabel
        .on("click", function () {
            // update the input value before displaying
            const fullPath = EditorManager.getActiveEditor()!.document.file.fullPath;
            $indentWidthInput.val(_getIndentSize(fullPath));

            $indentWidthLabel.addClass("hidden");
            $indentWidthInput.removeClass("hidden");
            $indentWidthInput.focus();

            $indentWidthInput
                .on("blur", function () {
                    _changeIndentWidth(fullPath, $indentWidthInput.val());
                })
                .on("keyup", function (event) {
                    if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
                        $indentWidthInput.blur();
                    } else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                        _changeIndentWidth(fullPath, false);
                    }
                });
        });

    $indentWidthInput.focus(function () { $indentWidthInput.select(); });

    // Language select change handler
    languageSelect.on("select", function (e, lang) {
        const document = EditorManager.getActiveEditor()!.document;
        const fullPath = document.file.fullPath;

        if (lang === LANGUAGE_SET_AS_DEFAULT) {
            // Set file's current language in preferences as a file extension override (only enabled if not default already)
            const fileExtensionMap = PreferencesManager.get("language.fileExtensions");
            fileExtensionMap[LanguageManager.getCompoundFileExtension(fullPath)] = document.getLanguage().getId();
            PreferencesManager.set("language.fileExtensions", fileExtensionMap);

        } else {
            // Set selected language as a path override for just this one file (not persisted)
            const defaultLang = LanguageManager.getLanguageForPath(fullPath, true);
            // if default language selected, pass null to clear the override
            LanguageManager.setLanguageOverrideForPath(fullPath, lang === defaultLang ? null : lang);
        }
    });

    $statusOverwrite.on("click", _updateEditorOverwriteMode);
}

// Initialize: status bar focused listener
(EditorManager as unknown as DispatcherEvents).on("activeEditorChange", _onActiveEditorChange);

AppInit.htmlReady(_init);
AppInit.appReady(function () {
    // Populate language switcher with all languages after startup; update it later if this set changes
    _populateLanguageDropdown();
    (LanguageManager as unknown as DispatcherEvents).on("languageAdded languageModified", _populateLanguageDropdown);
    _onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
    StatusBar.show();
});
