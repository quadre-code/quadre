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

import * as _ from "lodash";
import * as Mustache from "thirdparty/mustache/mustache";
import * as Dialogs from "widgets/Dialogs";
import * as Strings from "strings";
import * as ViewCommandHandlers from "view/ViewCommandHandlers";
import * as settingsTemplate from "text!htmlContent/themes-settings.html";
import * as PreferencesManager from "preferences/PreferencesManager";

interface ThemeSetting {
    fontFamily?: string;
    fontSize?: string;
    validFontSizeRegExp?: string;
    theme?: any;
}

const prefs = PreferencesManager.getExtensionPrefs("themes");

/**
 * @type {Object}
 * Currently loaded themes that are available to choose from.
 */
let loadedThemes: Record<string, Theme> = {};

/**
 * Object with all default values that can be configure via the settings UI
 */
const defaults = {
    "themeScrollbars": true,
    "theme": "light-theme"
};


/**
 * Cached html settings jQuery object for easier processing when opening the settings dialog
 */
const $settings = $(settingsTemplate).addClass("themeSettings");

/**
 * @private
 * Gets all the configurable settings that need to be loaded in the settings dialog
 *
 * @return {Object} a collection with all the settings
 */
function getValues(): ThemeSetting {
    const result: ThemeSetting = {};

    Object.keys(defaults).forEach(function (key) {
        result[key] = prefs.get(key);
    });

    result.fontFamily = ViewCommandHandlers.getFontFamily();
    result.fontSize   = ViewCommandHandlers.getFontSize();
    result.validFontSizeRegExp = ViewCommandHandlers.validFontSizeRegExp;
    return result;
}

/**
 * Opens the settings dialog
 */
export function showDialog(): void {
    const currentSettings = getValues();
    const newSettings: ThemeSetting = {};
    const themes          = _.map(loadedThemes, function (theme) { return theme; });
    const template        = $("<div>").append($settings).html();
    const $template       = $(Mustache.render(template, {"settings": currentSettings, "themes": themes, "Strings": Strings}));

    // Select the correct theme.
    let $currentThemeOption = $template
        .find("[value='" + currentSettings.theme + "']");

    if ($currentThemeOption.length === 0) {
        $currentThemeOption = $template.find("[value='" + defaults.theme + "']");
    }
    $currentThemeOption.attr("selected", "selected");

    $template
        .find("[data-toggle=tab].default")
        .tab("show");

    $template
        .on("change", "[data-target]:checkbox", function (this: any) {
            const $target = $(this);
            const attr = $target.attr("data-target");
            newSettings[attr] = $target.is(":checked");
        })
        .on("input", "[data-target='fontSize']", function (this: any) {
            const self = this;
            const targetValue = $(this).val();
            const btn = $("#theme-settings-done-btn")[0] as HTMLButtonElement;

            // Make sure that the font size is expressed in terms
            // we can handle (px or em). If not, 'done' button is
            // disabled until input has been corrected.

            if (self.checkValidity() === true) {
                btn.disabled = false;
                newSettings.fontSize = targetValue;
            } else {
                btn.disabled = true;
            }
        })
        .on("input", "[data-target='fontFamily']", function (this: any) {
            const targetValue = $(this).val();
            newSettings.fontFamily = targetValue;
        })
        .on("change", "select", function (this: any) {
            const $target = $(":selected", this);
            const attr = $target.attr("data-target");

            if (attr) {
                prefs.set(attr, $target.val());
            }
        });

    Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
        let setterFn;

        if (id === "save") {
            // Go through each new setting and apply it
            Object.keys(newSettings).forEach(function (setting) {
                if (defaults.hasOwnProperty(setting)) {
                    prefs.set(setting, newSettings[setting]);
                } else {
                    // Figure out if the setting is in the ViewCommandHandlers, which means it is
                    // a font setting
                    setterFn = "set" + setting[0].toLocaleUpperCase() + setting.substr(1);
                    if (typeof ViewCommandHandlers[setterFn] === "function") {
                        ViewCommandHandlers[setterFn](newSettings[setting]);
                    }
                }
            });
        } else if (id === "cancel") {
            // Make sure we revert any changes to theme selection
            prefs.set("theme", currentSettings.theme);
        }
    });
}

/**
 * Interface to set the themes that are available to chose from in the setting dialog
 * @param {ThemeManager.Theme} themes is a collection of themes created by the ThemeManager
 */
export function _setThemes(themes: Record<string, Theme>): void {
    loadedThemes = themes;
}

/**
 * Restores themes to factory settings.
 */
export function restore(): void {
    prefs.set("theme", defaults.theme);
    prefs.set("themeScrollbars", defaults.themeScrollbars);
}

prefs.definePreference("theme", "string", defaults.theme, {
    description: Strings.DESCRIPTION_THEME
});
prefs.definePreference("themeScrollbars", "boolean", defaults.themeScrollbars, {
    description: Strings.DESCRIPTION_USE_THEME_SCROLLBARS
});
