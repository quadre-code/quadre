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

const Menus               = brackets.getModule("command/Menus");
const CommandManager      = brackets.getModule("command/CommandManager");
const Commands            = brackets.getModule("command/Commands");
const MainViewManager     = brackets.getModule("view/MainViewManager");
const Strings             = brackets.getModule("strings");
const PreferencesManager  = brackets.getModule("preferences/PreferencesManager");
const workingSetListCmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);

interface MenuEntriesShown {
    closeOthers?: boolean;
    closeAbove?: boolean;
    closeBelow?: boolean;
}

// Constants
const closeOthers             = "file.close_others";
const closeAbove              = "file.close_above";
const closeBelow              = "file.close_below";

// Global vars and preferences
const prefs                   = PreferencesManager.getExtensionPrefs("closeOthers");
let menuEntriesShown: MenuEntriesShown = {};

prefs.definePreference("below",  "boolean", true, {
    description: Strings.DESCRIPTION_CLOSE_OTHERS_BELOW
});
prefs.definePreference("others", "boolean", true, {
    description: Strings.DESCRIPTION_CLOSE_OTHERS
});
prefs.definePreference("above",  "boolean", true, {
    description: Strings.DESCRIPTION_CLOSE_OTHERS_ABOVE
});


/**
 * Handle the different Close Other commands
 * @param {string} mode
 */
function handleClose(mode): void {
    const targetIndex  = MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, MainViewManager.getCurrentlyViewedPath(MainViewManager.ACTIVE_PANE)!);
    const workingSetList = MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE);
    const start        = (mode === closeBelow) ? (targetIndex + 1) : 0;
    const end          = (mode === closeAbove) ? (targetIndex) : (workingSetList.length);
    const files: Array<any> = [];

    for (let i = start; i < end; i++) {
        if ((mode === closeOthers && i !== targetIndex) || (mode !== closeOthers)) {
            files.push(workingSetList[i]);
        }
    }

    CommandManager.execute(Commands.FILE_CLOSE_LIST, {fileList: files});
}

/**
 * Enable/Disable the menu items depending on which document is selected in the working set
 */
function contextMenuOpenHandler(): void {
    const file = MainViewManager.getCurrentlyViewedFile(MainViewManager.ACTIVE_PANE);

    if (file) {
        const targetIndex  = MainViewManager.findInWorkingSet(MainViewManager.ACTIVE_PANE, file.fullPath);
        const workingSetListSize = MainViewManager.getWorkingSetSize(MainViewManager.ACTIVE_PANE);

        if (targetIndex === workingSetListSize - 1) { // hide "Close Others Below" if the last file in Working Files is selected
            CommandManager.get(closeBelow).setEnabled(false);
        } else {
            CommandManager.get(closeBelow).setEnabled(true);
        }

        if (workingSetListSize === 1) { // hide "Close Others" if there is only one file in Working Files
            CommandManager.get(closeOthers).setEnabled(false);
        } else {
            CommandManager.get(closeOthers).setEnabled(true);
        }

        if (targetIndex === 0) { // hide "Close Others Above" if the first file in Working Files is selected
            CommandManager.get(closeAbove).setEnabled(false);
        } else {
            CommandManager.get(closeAbove).setEnabled(true);
        }
    }
}


/**
 * Returns the preferences used to add/remove the menu items
 * @return {{closeBelow: boolean, closeOthers: boolean, closeAbove: boolean}}
 */
function getPreferences() {
    // It's senseless to look prefs up for the current file, instead look them up for
    // the current project (or globally)
    return {
        closeBelow  : prefs.get("below",  PreferencesManager.CURRENT_PROJECT),
        closeOthers : prefs.get("others", PreferencesManager.CURRENT_PROJECT),
        closeAbove  : prefs.get("above",  PreferencesManager.CURRENT_PROJECT)
    };
}

/**
 * When the preferences changed, add/remove the required menu items
 */
function prefChangeHandler() {
    const prefs = getPreferences();

    if (prefs.closeBelow !== menuEntriesShown.closeBelow) {
        if (prefs.closeBelow) {
            workingSetListCmenu.addMenuItem(closeBelow, "", Menus.AFTER, Commands.FILE_CLOSE);
        } else {
            workingSetListCmenu.removeMenuItem(closeBelow);
        }
    }

    if (prefs.closeOthers !== menuEntriesShown.closeOthers) {
        if (prefs.closeOthers) {
            workingSetListCmenu.addMenuItem(closeOthers, "", Menus.AFTER, Commands.FILE_CLOSE);
        } else {
            workingSetListCmenu.removeMenuItem(closeOthers);
        }
    }

    if (prefs.closeAbove !== menuEntriesShown.closeAbove) {
        if (prefs.closeAbove) {
            workingSetListCmenu.addMenuItem(closeAbove, "", Menus.AFTER, Commands.FILE_CLOSE);
        } else {
            workingSetListCmenu.removeMenuItem(closeAbove);
        }
    }

    menuEntriesShown = prefs;
}

/**
 * Register the Commands and add the Menu Items, if required
 */
function initializeCommands() {
    const prefs = getPreferences();

    CommandManager.register(Strings.CMD_FILE_CLOSE_BELOW, closeBelow, function () {
        handleClose(closeBelow);
    });
    CommandManager.register(Strings.CMD_FILE_CLOSE_OTHERS, closeOthers, function () {
        handleClose(closeOthers);
    });
    CommandManager.register(Strings.CMD_FILE_CLOSE_ABOVE, closeAbove, function () {
        handleClose(closeAbove);
    });

    if (prefs.closeBelow) {
        workingSetListCmenu.addMenuItem(closeBelow, "", Menus.AFTER, Commands.FILE_CLOSE);
    }
    if (prefs.closeOthers) {
        workingSetListCmenu.addMenuItem(closeOthers, "", Menus.AFTER, Commands.FILE_CLOSE);
    }
    if (prefs.closeAbove) {
        workingSetListCmenu.addMenuItem(closeAbove, "", Menus.AFTER, Commands.FILE_CLOSE);
    }
    menuEntriesShown = prefs;
}


// Initialize using the prefs
initializeCommands();

// Add a context menu open handler
workingSetListCmenu.on("beforeContextMenuOpen", contextMenuOpenHandler);

(prefs as any).on("change", prefChangeHandler);

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
