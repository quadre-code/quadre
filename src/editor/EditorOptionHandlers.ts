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

import * as AppInit from "utils/AppInit";
import { Editor } from "editor/Editor";
import * as Commands from "command/Commands";
import * as CommandManager from "command/CommandManager";
import * as PreferencesManager from "preferences/PreferencesManager";
import * as Strings from "strings";
import * as _ from "lodash";

// Constants for the preferences referred to in this file
enum EditorOptionsHandler {
    SHOW_LINE_NUMBERS = "showLineNumbers",
    STYLE_ACTIVE_LINE = "styleActiveLine",
    WORD_WRAP         = "wordWrap",
    CLOSE_BRACKETS    = "closeBrackets",
    AUTO_HIDE_SEARCH  = "autoHideSearch",
}

type OptionMapping = {
    [key in EditorOptionsHandler]?: string;
};

/**
 * @private
 *
 * Maps from preference names to the command names needed to update the checked status.
 */
const _optionMapping: OptionMapping = {};
_optionMapping[EditorOptionsHandler.SHOW_LINE_NUMBERS] = Commands.TOGGLE_LINE_NUMBERS;
_optionMapping[EditorOptionsHandler.STYLE_ACTIVE_LINE] = Commands.TOGGLE_ACTIVE_LINE;
_optionMapping[EditorOptionsHandler.WORD_WRAP] = Commands.TOGGLE_WORD_WRAP;
_optionMapping[EditorOptionsHandler.CLOSE_BRACKETS] = Commands.TOGGLE_CLOSE_BRACKETS;
_optionMapping[EditorOptionsHandler.AUTO_HIDE_SEARCH] = Commands.TOGGLE_SEARCH_AUTOHIDE;


/**
 * @private
 *
 * Updates the command checked status based on the preference name given.
 *
 * @param {string} name Name of preference that has changed
 */
function _updateCheckedState(name) {
    const mapping = _optionMapping[name];
    if (!mapping) {
        return;
    }
    CommandManager.get(mapping).setChecked(PreferencesManager.get(name));
}

// Listen to preference changes for the preferences we care about
Object.keys(_optionMapping).forEach(function (preference) {
    PreferencesManager.on("change", preference, function () {
        _updateCheckedState(preference);
    });
});

/**
 * @private
 * Creates a function that will toggle the named preference.
 *
 * @param {string} prefName Name of preference that should be toggled by the function
 */
function _getToggler(prefName) {
    return function () {
        PreferencesManager.set(prefName, !PreferencesManager.get(prefName));
    };
}

function _init() {
    _.each(_optionMapping, function (commandName, prefName) {
        CommandManager.get(commandName).setChecked(PreferencesManager.get(prefName));
    });

    if (!Editor.getShowLineNumbers()) {
        Editor._toggleLinePadding(true);
    }
}

CommandManager.register(Strings.CMD_TOGGLE_LINE_NUMBERS, Commands.TOGGLE_LINE_NUMBERS, _getToggler(EditorOptionsHandler.SHOW_LINE_NUMBERS));
CommandManager.register(Strings.CMD_TOGGLE_ACTIVE_LINE, Commands.TOGGLE_ACTIVE_LINE, _getToggler(EditorOptionsHandler.STYLE_ACTIVE_LINE));
CommandManager.register(Strings.CMD_TOGGLE_WORD_WRAP, Commands.TOGGLE_WORD_WRAP, _getToggler(EditorOptionsHandler.WORD_WRAP));
CommandManager.register(Strings.CMD_TOGGLE_CLOSE_BRACKETS, Commands.TOGGLE_CLOSE_BRACKETS, _getToggler(EditorOptionsHandler.CLOSE_BRACKETS));
CommandManager.register(Strings.CMD_TOGGLE_SEARCH_AUTOHIDE, Commands.TOGGLE_SEARCH_AUTOHIDE, _getToggler(EditorOptionsHandler.AUTO_HIDE_SEARCH));

AppInit.htmlReady(_init);
