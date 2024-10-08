import * as _ from "lodash";
import * as assert from "assert";
import { app, Menu, BrowserWindow, MenuItemConstructorOptions } from "electron";
import { menuTemplates } from "../shared";

export const ERR_NOT_FOUND = "NOTFOUND";

interface MenuItemOptions extends MenuItemConstructorOptions {}

function _getOrCreateMenuTemplate(winId: number): Array<MenuItemOptions> {
    if (!menuTemplates[winId]) {
        menuTemplates[winId] = [];
    }
    return menuTemplates[winId];
}

app.on("browser-window-focus", function (event, win) {
    _refreshMenu(win);
});
app.on("browser-window-blur", function (event, win) {
    _refreshMenu(win);
});

let currentShortcuts: { [accelerator: string]: string } = {};

function registerShortcuts(win: BrowserWindow, menuItem: MenuItemOptions): void {
    if (menuItem.accelerator && menuItem.id) {
        currentShortcuts[menuItem.accelerator as string] = menuItem.id;
    }
    if (Array.isArray(menuItem.submenu)) {
        menuItem.submenu.forEach((i) => registerShortcuts(win, i));
    }
}

const __refreshMenu = _.debounce(function (win: BrowserWindow) {
    const menuTemplate = menuTemplates[win.id];
    const menu = menuTemplate ? Menu.buildFromTemplate(_.cloneDeep(menuTemplate)) : null;
    if (process.platform !== "darwin") {
        win.setMenu(menu);
    } else if (menu) {
        Menu.setApplicationMenu(menu);
    }
    if (win.isFocused()) {
        currentShortcuts = {};
        menuTemplate.forEach((menuItem) => registerShortcuts(win, menuItem));
        win.webContents.send("updateShortcuts", JSON.stringify(currentShortcuts));
    }
}, 100);

function _refreshMenu(win: BrowserWindow, callback?: () => void): void {
    __refreshMenu(win);
    if (callback) {
        process.nextTick(callback);
    }
}

function _findMenuItemPosition(
    id: string,
    where: Array<MenuItemOptions>,
    whereId: string = ""
): [string, number] | null {
    const result = _.find(where, { id });
    if (result) {
        return [whereId, _.findIndex(where, { id })];
    }
    const results = _.compact(
        where.map(function (menuItem) {
            return menuItem.submenu
                ? _findMenuItemPosition(id, menuItem.submenu as Array<MenuItemOptions>, menuItem.id)
                : null;
        })
    );
    return results.length > 0 ? results[0] : null;
}

function _deleteMenuItemById(id: string, where: Array<MenuItemOptions>): boolean {
    const result = _.findIndex(where, { id });
    if (result !== -1) {
        where.splice(result, 1);
        return true;
    }
    const deleted = where
        .map(function (menuItem) {
            return menuItem.submenu
                ? _deleteMenuItemById(id, menuItem.submenu as Array<MenuItemOptions>)
                : null;
        })
        .filter((x) => x === true);
    return deleted.length > 0 ? true : false;
}

function _findMenuItemById(id: string, where: Array<MenuItemOptions>): MenuItemOptions | null {
    const result = _.find(where, { id });
    if (result) {
        return result;
    }
    const results = _.compact(
        where.map(function (menuItem) {
            return menuItem.submenu
                ? _findMenuItemById(id, menuItem.submenu as Array<MenuItemOptions>)
                : null;
        })
    );
    return results.length > 0 ? results[0] : null;
}

function _addToPosition(
    obj: MenuItemOptions,
    target: Array<MenuItemOptions>,
    position: string,
    relativeId: string | null
): string | null {
    let retVal: string | null = null;
    if (position === "first") {
        target.unshift(obj);
    } else if (position === "last") {
        target.push(obj);
    } else if (
        position === "before" ||
        position === "after" ||
        position === "firstInSection" ||
        position === "lastInSection"
    ) {
        let idx = _.findIndex(target, { id: relativeId! });
        let idxSection: number;
        if (idx === -1) {
            // NOTE: original behaviour - if relativeId wasn't found
            // menu should be put to the end of the list
            console.warn(
                "menu item with id: " +
                    relativeId +
                    " was not found, adding entry to the end of the list"
            );
            retVal = ERR_NOT_FOUND;
            idx = target.length;
        }
        if (position === "firstInSection") {
            idxSection = _.findLastIndex(target, (o: MenuItemOptions, i: number) => {
                return i < idx && o.type === "separator";
            });
            idx = idxSection + 1;
        }
        if (position === "lastInSection") {
            idxSection = _.findIndex(target, (o: MenuItemOptions, i: number) => {
                return i >= idx && o.type === "separator";
            });
            idx = idxSection === -1 ? target.length : idxSection;
        }
        if (position === "after") {
            idx++;
        }
        target.splice(idx, 0, obj);
    } else {
        throw new Error("position not implemented in _addToPosition: " + position);
    }
    return retVal;
}

function _fixBracketsKeyboardShortcut(shortcut: string): string {
    if (shortcut.trim() === "") {
        return "";
    }

    shortcut = shortcut.replace(/-/g, "+");
    shortcut = shortcut.replace(/\+$/g, "Plus");
    shortcut = shortcut.replace(/\u2190/g, "Left");
    shortcut = shortcut.replace(/\u2191/g, "Up");
    shortcut = shortcut.replace(/\u2192/g, "Right");
    shortcut = shortcut.replace(/\u2193/g, "Down");
    shortcut = shortcut.replace(/\u2212/g, "-");

    // eslint-disable-next-line no-control-regex
    if (!shortcut.match(/^[\x00-\x7F]+$/)) {
        console.error("Non ASCII keyboard shortcut used: " + shortcut);
        return "";
    }

    return shortcut;
}

export function addMenu(
    winId: number,
    title: string,
    id: string,
    position: string,
    relativeId: string,
    callback: () => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!position || (position && typeof position === "string"), "position must be a string");
    assert(
        !relativeId || (relativeId && typeof relativeId === "string"),
        "relativeId must be a string"
    );
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        const newObj = { id, label: title };
        const menuTemplate = _getOrCreateMenuTemplate(winId);
        const err = _addToPosition(newObj, menuTemplate, position || "last", relativeId);
        const win = BrowserWindow.fromId(winId)!;
        _refreshMenu(win, callback.bind(null, err));
    });
}

export function addMenuItem(
    winId: number,
    parentId: string,
    title: string,
    id: string,
    key: string | null,
    displayStr: string | null,
    position: string | null,
    relativeId: string | null,
    callback: (err?: string | null) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(parentId && typeof parentId === "string", "parentId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    assert(id && typeof id === "string", "id must be a string");
    assert(!key || (key && typeof key === "string"), "key must be a string");
    assert(
        !displayStr || (displayStr && typeof displayStr === "string"),
        "displayStr must be a string"
    );
    assert(!position || (position && typeof position === "string"), "position must be a string");
    assert(
        !relativeId || (relativeId && typeof relativeId === "string"),
        "relativeId must be a string"
    );
    assert(typeof callback === "function", "callback must be a function");
    process.nextTick(function () {
        const win = BrowserWindow.fromId(winId)!;

        if (typeof key === "string") {
            key = _fixBracketsKeyboardShortcut(key);
        }

        const isSeparator = title === "---";
        const newObj: MenuItemOptions = {
            type: isSeparator ? "separator" : "normal",
            id,
            label: title,
            click: () => win.webContents.send("executeCommand", id),
        };

        if (key) {
            newObj.accelerator = key;
        }

        const menuTemplate = menuTemplates[winId];
        const parentObj = _findMenuItemById(parentId, menuTemplate);
        if (!parentObj) {
            return process.nextTick(function () {
                callback(ERR_NOT_FOUND);
            });
        }

        if (!parentObj.submenu) {
            parentObj.submenu = [];
        }

        const err = _addToPosition(
            newObj,
            parentObj.submenu as Array<MenuItemOptions>,
            position || "last",
            relativeId
        );
        _refreshMenu(win, callback.bind(null, err));
    });
}

export function getMenuItemState(
    winId: number,
    commandId: string,
    callback: (err?: string | null, enabled?: boolean, checked?: boolean) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const menuTemplate = menuTemplates[winId];
        const obj = _findMenuItemById(commandId, menuTemplate);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        callback(null, obj.enabled === true, obj.checked === true);
    });
}

export function getMenuPosition(
    winId: number,
    commandId: string,
    callback: (err?: string | null, parentId?: string, position?: number) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const menuTemplate = menuTemplates[winId];
        const res = _findMenuItemPosition(commandId, menuTemplate);
        return res ? callback(null, res[0], res[1]) : callback(null);
    });
}

export function getMenuTitle(
    winId: number,
    commandId: string,
    callback: (err?: string | null, title?: string) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const menuTemplate = menuTemplates[winId];
        const obj = _findMenuItemById(commandId, menuTemplate);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        callback(null, obj.label);
    });
}

export function removeMenu(
    winId: number,
    commandId: string,
    callback: (err?: string | null, deleted?: boolean) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const win = BrowserWindow.fromId(winId)!;
        const menuTemplate = menuTemplates[winId];
        const deleted = _deleteMenuItemById(commandId, menuTemplate);
        _refreshMenu(win, callback.bind(null, deleted ? null : ERR_NOT_FOUND));
    });
}

export function removeMenuItem(
    winId: number,
    commandId: string,
    callback: (err?: string | null, deleted?: boolean) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    process.nextTick(function () {
        const win = BrowserWindow.fromId(winId)!;
        const menuTemplate = menuTemplates[winId];
        const deleted = _deleteMenuItemById(commandId, menuTemplate);
        _refreshMenu(win, callback.bind(null, deleted ? null : ERR_NOT_FOUND));
    });
}

export function setMenuItemShortcut(
    winId: number,
    commandId: string,
    shortcut: string,
    displayStr: string,
    callback: (err?: string | null) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(
        shortcut === "" || (shortcut && typeof shortcut === "string"),
        "shortcut must be a string"
    );
    process.nextTick(function () {
        shortcut = _fixBracketsKeyboardShortcut(shortcut);
        const menuTemplate = menuTemplates[winId];
        const obj = _findMenuItemById(commandId, menuTemplate);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        if (shortcut) {
            obj.accelerator = shortcut;
        } else {
            delete obj.accelerator;
        }
        const win = BrowserWindow.fromId(winId)!;
        _refreshMenu(win, callback.bind(null, null));
    });
}

export function setMenuItemState(
    winId: number,
    commandId: string,
    enabled: boolean,
    checked: boolean,
    callback: (err?: string | null) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(typeof enabled === "boolean", "enabled must be a boolean");
    assert(typeof checked === "boolean", "checked must be a boolean");
    process.nextTick(function () {
        const menuTemplate = menuTemplates[winId];
        const obj = _findMenuItemById(commandId, menuTemplate);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }

        obj.enabled = enabled;
        obj.checked = checked;

        if (checked) {
            // TODO: Change addMenuItem to set the type (checkbox, radio, ... submenu)
            obj.type = "checkbox";
        }
        const win = BrowserWindow.fromId(winId)!;
        _refreshMenu(win, callback.bind(null, null));
    });
}

export function setMenuTitle(
    winId: number,
    commandId: string,
    title: string,
    callback: (err?: string | null) => void
): void {
    assert(typeof winId === "number", "winId must be a number");
    assert(commandId && typeof commandId === "string", "commandId must be a string");
    assert(title && typeof title === "string", "title must be a string");
    process.nextTick(function () {
        const menuTemplate = menuTemplates[winId];
        const obj = _findMenuItemById(commandId, menuTemplate);
        if (!obj) {
            return callback(ERR_NOT_FOUND);
        }
        obj.label = title;
        const win = BrowserWindow.fromId(winId)!;
        _refreshMenu(win, callback.bind(null, null));
    });
}
