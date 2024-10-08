/**
 * Brackets Themes Copyright (c) 2014 Miguel Castillo.
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

import type { Theme } from "view/ThemeManager";

import * as CodeMirror from "codemirror";
import * as PreferencesManager from "preferences/PreferencesManager";

const prefs = PreferencesManager.getExtensionPrefs("themes");

const $scrollbars = $("<style id='scrollbars'>").appendTo("head");


/**
 * Load scrollbar styling based on whether or not theme scrollbars are enabled.
 *
 * @param {ThemeManager.Theme} theme Is the theme object with the corresponding scrollbar style
 *   to be updated
 */
export function updateScrollbars(theme: Theme | null): void {
    const themeToUpdate = theme || {} as Theme;
    if (prefs.get("themeScrollbars")) {
        const scrollbar = (themeToUpdate.scrollbar || []).join(" ");
        $scrollbars.text(scrollbar || "");
    } else {
        $scrollbars.text("");
    }
}


/**
 *  Handles updating codemirror with the current selection of themes.
 *
 * @param {CodeMirror} cm is the CodeMirror instance currently loaded
 */
export function updateThemes(cm: CodeMirror.Editor): void {
    const newTheme = prefs.get("theme");
    const cmTheme  = (cm.getOption("theme") || "").replace(/[\s]*/, ""); // Normalize themes string

    // Check if the editor already has the theme applied...
    if (cmTheme === newTheme) {
        return;
    }

    // Setup current and further documents to get the new theme...
    CodeMirror.defaults.theme = newTheme;
    cm.setOption("theme", newTheme);
}
