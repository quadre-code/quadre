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

import * as _ from "lodash";

// Load dependent modules
import * as Commands from "command/Commands";
import * as EventDispatcher from "utils/EventDispatcher";
import * as KeyBindingManager from "command/KeyBindingManager";
import * as StringUtils from "utils/StringUtils";
import * as CommandManager from "command/CommandManager";
import * as PopUpManager from "widgets/PopUpManager";
import * as ViewUtils from "utils/ViewUtils";
import * as DeprecationWarning from "utils/DeprecationWarning";

// make sure the global brackets variable is loaded
import "utils/Global";

interface MenuItemMap {
    [menuItemID: string]: MenuItem;
}

export interface ContextMenuAdapter {
    open: (mouseOrLocation?: JQueryMouseEventObject | MenuLocation) => void;
    close: () => void;
    isOpen: () => boolean;
}

interface MenuLocation {
    pageX: number;
    pageY: number;
}

/**
 * Brackets Application Menu Constants
 * @enum {string}
 */
export const AppMenuBar = {
    APP_MENU        : "app-menu",
    FILE_MENU       : "file-menu",
    EDIT_MENU       : "edit-menu",
    FIND_MENU       : "find-menu",
    VIEW_MENU       : "view-menu",
    NAVIGATE_MENU   : "navigate-menu",
    HELP_MENU       : "help-menu"
};

/**
 * Brackets Context Menu Constants
 * @enum {string}
 */
export const ContextMenuIds = {
    EDITOR_MENU:                    "editor-context-menu",
    INLINE_EDITOR_MENU:             "inline-editor-context-menu",
    PROJECT_MENU:                   "project-context-menu",
    WORKING_SET_CONTEXT_MENU:       "workingset-context-menu",
    WORKING_SET_CONFIG_MENU:        "workingset-configuration-menu",
    SPLITVIEW_MENU:                 "splitview-menu"
};

interface RelativeID {
    sectionMarker: string;
}

/**
 * Brackets Application Menu Section Constants
 * It is preferred that plug-ins specify the location of new MenuItems
 * in terms of a menu section rather than a specific MenuItem. This provides
 * looser coupling to Bracket's internal MenuItems and makes menu organization
 * more semantic.
 * Use these constants as the "relativeID" parameter when calling addMenuItem() and
 * specify a position of FIRST_IN_SECTION or LAST_IN_SECTION.
 *
 * Menu sections are denoted by dividers or the beginning/end of a menu
 */
export const MenuSection: Record<string, RelativeID> = {
    // Menu Section                     Command ID to mark the section
    FILE_OPEN_CLOSE_COMMANDS:           {sectionMarker: Commands.FILE_NEW},
    FILE_SAVE_COMMANDS:                 {sectionMarker: Commands.FILE_SAVE},
    FILE_LIVE:                          {sectionMarker: Commands.FILE_LIVE_FILE_PREVIEW},
    FILE_EXTENSION_MANAGER:             {sectionMarker: Commands.FILE_EXTENSION_MANAGER},

    EDIT_UNDO_REDO_COMMANDS:            {sectionMarker: Commands.EDIT_UNDO},
    EDIT_TEXT_COMMANDS:                 {sectionMarker: Commands.EDIT_CUT},
    EDIT_SELECTION_COMMANDS:            {sectionMarker: Commands.EDIT_SELECT_ALL},
    EDIT_MODIFY_SELECTION:              {sectionMarker: Commands.EDIT_INDENT},
    EDIT_COMMENT_SELECTION:             {sectionMarker: Commands.EDIT_LINE_COMMENT},
    EDIT_CODE_HINTS_COMMANDS:           {sectionMarker: Commands.SHOW_CODE_HINTS},
    EDIT_TOGGLE_OPTIONS:                {sectionMarker: Commands.TOGGLE_CLOSE_BRACKETS},

    FIND_FIND_COMMANDS:                 {sectionMarker: Commands.CMD_FIND},
    FIND_FIND_IN_COMMANDS:              {sectionMarker: Commands.CMD_FIND_IN_FILES},
    FIND_REPLACE_COMMANDS:              {sectionMarker: Commands.CMD_REPLACE},

    VIEW_HIDESHOW_COMMANDS:             {sectionMarker: Commands.VIEW_HIDE_SIDEBAR},
    VIEW_FONTSIZE_COMMANDS:             {sectionMarker: Commands.VIEW_INCREASE_FONT_SIZE},
    VIEW_TOGGLE_OPTIONS:                {sectionMarker: Commands.TOGGLE_ACTIVE_LINE},

    NAVIGATE_GOTO_COMMANDS:             {sectionMarker: Commands.NAVIGATE_QUICK_OPEN},
    NAVIGATE_DOCUMENTS_COMMANDS:        {sectionMarker: Commands.NAVIGATE_NEXT_DOC},
    NAVIGATE_OS_COMMANDS:               {sectionMarker: Commands.NAVIGATE_SHOW_IN_FILE_TREE},
    NAVIGATE_QUICK_EDIT_COMMANDS:       {sectionMarker: Commands.TOGGLE_QUICK_EDIT},
    NAVIGATE_QUICK_DOCS_COMMANDS:       {sectionMarker: Commands.TOGGLE_QUICK_DOCS}
};


/**
 * Insertion position constants
 * Used by addMenu(), addMenuItem(), and addSubMenu() to
 * specify the relative position of a newly created menu object
 * @enum {string}
 */
export const BEFORE           = "before";
export const AFTER            = "after";
export const FIRST            = "first";
export const LAST             = "last";
export const FIRST_IN_SECTION = "firstInSection";
export const LAST_IN_SECTION  = "lastInSection";

type Position =
    | typeof BEFORE
    | typeof AFTER
    | typeof FIRST
    | typeof LAST
    | typeof FIRST_IN_SECTION
    | typeof LAST_IN_SECTION;

/**
 * Other constants
 */
export const DIVIDER = "---";
const SUBMENU = "SUBMENU";

/**
 * Error Codes from Brackets Shell
 * @enum {number}
 */
const NO_ERROR           = null;
const ERR_UNKNOWN        = 1;
const ERR_INVALID_PARAMS = 2;
const ERR_NOT_FOUND      = 3;

/**
 * Maps menuID's to Menu objects
 * @type {Object.<string, Menu>}
 */
const menuMap: Record<string, Menu> = {};

/**
 * Maps contextMenuID's to ContextMenu objects
 * @type {Object.<string, ContextMenu>}
 */
const contextMenuMap: Record<string, ContextMenu> = {};

/**
 * Maps menuItemID's to MenuItem objects
 * @type {Object.<string, MenuItem>}
 */
const menuItemMap: MenuItemMap = {};

/**
 * Retrieves the Menu object for the corresponding id.
 * @param {string} id
 * @return {Menu}
 */
export function getMenu(id: string): Menu {
    return menuMap[id];
}

/**
 * Retrieves the map of all Menu objects.
 * @return {Object.<string, Menu>}
 */
export function getAllMenus(): Record<string, Menu> {
    return menuMap;
}

/**
 * Retrieves the ContextMenu object for the corresponding id.
 * @param {string} id
 * @return {ContextMenu}
 */
export function getContextMenu(id: string): ContextMenu {
    return contextMenuMap[id];
}

/**
 * Removes the attached event listeners from the corresponding object.
 * @param {MenuItem} menuItem
 */
function removeMenuItemEventListeners(menuItem: MenuItem): void {
    menuItem._command
        .off("enabledStateChange", menuItem._enabledChanged)
        .off("checkedStateChange", menuItem._checkedChanged)
        .off("nameChange", menuItem._nameChanged)
        .off("keyBindingAdded", menuItem._keyBindingAdded)
        .off("keyBindingRemoved", menuItem._keyBindingRemoved);
}

/**
 * Check whether a ContextMenu exists for the given id.
 * @param {string} id
 * @return {boolean}
 */
function _isContextMenu(id: string): boolean {
    return !!getContextMenu(id);
}

function _isHTMLMenu(id: string): boolean {
    return (!brackets.nativeMenus || _isContextMenu(id));
}

/**
 * Retrieves the MenuItem object for the corresponding id.
 * @param {string} id
 * @return {MenuItem}
 */
export function getMenuItem(id: string): MenuItem {
    return menuItemMap[id];
}

function _getHTMLMenu(id: string): HTMLElement {
    return $("#" + StringUtils.jQueryIdEscape(id)).get(0);
}

function _getHTMLMenuItem(id: string): HTMLElement {
    return $("#" + StringUtils.jQueryIdEscape(id)).get(0);
}

function _addKeyBindingToMenuItem($menuItem: JQuery, key: string, displayKey: string): void {
    let $shortcut = $menuItem.find(".menu-shortcut");

    if ($shortcut.length === 0) {
        $shortcut = $("<span class='menu-shortcut' />");
        $menuItem.append($shortcut);
    }

    $shortcut.data("key", key);
    $shortcut.text(KeyBindingManager.formatKeyDescriptor(displayKey));
}

function _addExistingKeyBinding(menuItem: MenuItem): KeyBindingManager.ExplicitKeyBinding | null {
    const bindings = KeyBindingManager.getKeyBindings(menuItem.getCommand().getID());
    let binding: KeyBindingManager.ExplicitKeyBinding | null = null;

    if (bindings.length > 0) {
        // add the latest key binding
        binding = bindings[bindings.length - 1];
        _addKeyBindingToMenuItem($(_getHTMLMenuItem(menuItem.id)), binding.key, binding.displayKey!);
    }

    return binding;
}

let _menuDividerIDCount = 1;
function _getNextMenuItemDividerID(): string {
    return "brackets-menuDivider-" + _menuDividerIDCount++;
}

// Help function for inserting elements into a list
function _insertInList($list: JQuery, $element: JQuery, position?: Position, $relativeElement?: JQuery | null): void {
    // Determine where to insert. Default is LAST.
    let inserted = false;
    if (position) {

        // Adjust relative position for menu section positions since $relativeElement
        // has already been resolved by _getRelativeMenuItem() to a menuItem
        if (position === FIRST_IN_SECTION) {
            position = BEFORE;
        } else if (position === LAST_IN_SECTION) {
            position = AFTER;
        }

        if (position === FIRST) {
            $list.prepend($element);
            inserted = true;
        } else if ($relativeElement && $relativeElement.length > 0) {
            if (position === AFTER) {
                $relativeElement.after($element);
                inserted = true;
            } else if (position === BEFORE) {
                $relativeElement.before($element);
                inserted = true;
            }
        }
    }

    // Default to LAST
    if (!inserted) {
        $list.append($element);
    }
}

/**
 * Menu represents a top-level menu in the menu bar. A Menu may correspond to an HTML-based
 * menu or a native menu if Brackets is running in a native application shell.
 *
 * Since menus may have a native implementation clients should create Menus through
 * addMenu() and should NOT construct a Menu object directly.
 * Clients should also not access HTML content of a menu directly and instead use
 * the Menu API to query and modify menus.
 *
 * @constructor
 * @private
 *
 * @param {string} id
 */
export class Menu {
    protected id: string;
    public openSubMenu: any;

    constructor(id: string) {
        this.id = id;
    }

    private _getMenuItemId(commandId: string): string {
        return (this.id + "-" + commandId);
    }

    /**
     * Determine MenuItem in this Menu, that has the specified command
     *
     * @param {Command} command - the command to search for.
     * @return {?HTMLLIElement} menu item list element
     */
    private _getMenuItemForCommand(command: CommandManager.Command): JQuery | null {
        if (!command) {
            return null;
        }
        const foundMenuItem = menuItemMap[this._getMenuItemId(command.getID())];
        if (!foundMenuItem) {
            return null;
        }
        return $(_getHTMLMenuItem(foundMenuItem.id)).closest("li");
    }

    /**
     * Determine relative MenuItem
     *
     * @param {?string} relativeID - id of command (future: sub-menu).
     * @param {?string} position - only needed when relativeID is a MenuSection
     * @return {?HTMLLIElement} menu item list element
     */
    private _getRelativeMenuItem(relativeID?: RelativeID | string, position?: Position): JQuery | null {
        let $relativeElement: JQuery | null;

        if (relativeID) {
            if (position === FIRST_IN_SECTION || position === LAST_IN_SECTION) {
                if (!relativeID.hasOwnProperty("sectionMarker")) {
                    console.error("Bad Parameter in _getRelativeMenuItem(): relativeID must be a MenuSection when position refers to a menu section");
                    return null;
                }

                const sectionMarker = (relativeID as RelativeID).sectionMarker;

                // Determine the $relativeElement by traversing the sibling list and
                // stop at the first divider found
                // TODO: simplify using nextUntil()/prevUntil()
                const $sectionMarker = this._getMenuItemForCommand(CommandManager.get(sectionMarker));
                if (!$sectionMarker) {
                    console.error("_getRelativeMenuItem(): MenuSection " + sectionMarker +
                                  " not found in Menu " + this.id);
                    return null;
                }
                let $listElem = $sectionMarker;
                $relativeElement = $listElem;
                while (true) {
                    $listElem = (position === FIRST_IN_SECTION ? $listElem.prev() : $listElem.next());
                    if ($listElem.length === 0) {
                        break;
                    } else if ($listElem.find(".divider").length > 0) {
                        break;
                    } else {
                        $relativeElement = $listElem;
                    }
                }

            } else {
                if (relativeID.hasOwnProperty("sectionMarker")) {
                    console.error("Bad Parameter in _getRelativeMenuItem(): if relativeID is a MenuSection, position must be FIRST_IN_SECTION or LAST_IN_SECTION");
                    return null;
                }

                // handle FIRST, LAST, BEFORE, & AFTER
                const command = CommandManager.get(relativeID as string);
                if (command) {
                    // Lookup Command for this Command id
                    // Find MenuItem that has this command
                    $relativeElement = this._getMenuItemForCommand(command);
                }
                // @ts-expect-error
                if (!$relativeElement) {
                    console.error("_getRelativeMenuItem(): MenuItem with Command id " + relativeID +
                                  " not found in Menu " + this.id);
                    return null;
                }
            }

            return $relativeElement;

        }

        if (position && position !== FIRST && position !== LAST) {
            console.error("Bad Parameter in _getRelativeMenuItem(): relative position specified with no relativeID");
            return null;
        }

        // @ts-expect-error
        return $relativeElement;
    }

    /**
     * Removes the specified menu item from this Menu. Key bindings are unaffected; use KeyBindingManager
     * directly to remove key bindings if desired.
     *
     * @param {!string | Command} command - command the menu would execute if we weren't deleting it.
     */
    public removeMenuItem(command: CommandManager.Command | string): void {
        let commandID: string;

        if (!command) {
            console.error("removeMenuItem(): missing required parameters: command");
            return;
        }

        if (typeof (command) === "string") {
            const commandObj = CommandManager.get(command);
            if (!commandObj) {
                console.error("removeMenuItem(): command not found: " + command);
                return;
            }
            commandID = command;
        } else {
            commandID = command.getID();
        }
        const menuItemID = this._getMenuItemId(commandID);

        const menuItem = getMenuItem(menuItemID);
        removeMenuItemEventListeners(menuItem);

        if (_isHTMLMenu(this.id)) {
            // Targeting parent to get the menu item <a> and the <li> that contains it
            $(_getHTMLMenuItem(menuItemID)).parent().remove();
        } else {
            const winId = electronRemote.getCurrentWindow().id;
            brackets.app.removeMenuItem(winId, commandID, function (err) {
                if (err) {
                    console.error("removeMenuItem() -- command not found: " + commandID + " (error: " + err + ")");
                }
            });
        }

        delete menuItemMap[menuItemID];
    }

    /**
     * Removes the specified menu divider from this Menu.
     *
     * @param {!string} menuItemID - the menu item id of the divider to remove.
     */
    public removeMenuDivider(menuItemID: string): void {
        let $HTMLMenuItem;

        if (!menuItemID) {
            console.error("removeMenuDivider(): missing required parameters: menuItemID");
            return;
        }

        const menuItem = getMenuItem(menuItemID);

        if (!menuItem) {
            console.error("removeMenuDivider(): parameter menuItemID: %s is not a valid menu item id", menuItemID);
            return;
        }

        if (!menuItem.isDivider) {
            console.error("removeMenuDivider(): parameter menuItemID: %s is not a menu divider", menuItemID);
            return;
        }

        if (_isHTMLMenu(this.id)) {
            // Targeting parent to get the menu divider <hr> and the <li> that contains it
            $HTMLMenuItem = $(_getHTMLMenuItem(menuItemID)).parent();
            if ($HTMLMenuItem) {
                $HTMLMenuItem.remove();
            } else {
                console.error("removeMenuDivider(): HTML menu divider not found: %s", menuItemID);
                return;
            }
        } else {
            const winId = electronRemote.getCurrentWindow().id;
            brackets.app.removeMenuItem(winId, menuItem.dividerId, function (err) {
                if (err) {
                    console.error("removeMenuDivider() -- divider not found: %s (error: %s)", menuItemID, err);
                }
            });
        }

        if (!menuItemMap[menuItemID]) {
            console.error("removeMenuDivider(): menu divider not found in menuItemMap: %s", menuItemID);
            return;
        }

        delete menuItemMap[menuItemID];
    }

    /**
     * Adds a new menu item with the specified id and display text. The insertion position is
     * specified via the relativeID and position arguments which describe a position
     * relative to another MenuItem or MenuGroup. It is preferred that plug-ins
     * insert new  MenuItems relative to a menu section rather than a specific
     * MenuItem (see Menu Section Constants).
     *
     * TODO: Sub-menus are not yet supported, but when they are implemented this API will
     * allow adding new MenuItems to sub-menus as well.
     *
     * Note, keyBindings are bound to Command objects not MenuItems. The provided keyBindings
     *      will be bound to the supplied Command object rather than the MenuItem.
     *
     * @param {!string | Command} command - the command the menu will execute.
     *      Pass Menus.DIVIDER for a menu divider, or just call addMenuDivider() instead.
     * @param {?string | Array.<{key: string, platform: string}>}  keyBindings - register one
     *      one or more key bindings to associate with the supplied command.
     * @param {?string} position - constant defining the position of new MenuItem relative to
     *      other MenuItems. Values:
     *          - With no relativeID, use Menus.FIRST or LAST (default is LAST)
     *          - Relative to a command id, use BEFORE or AFTER (required)
     *          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required)
     * @param {?string} relativeID - command id OR one of the MenuSection.* constants. Required
     *      for all position constants except FIRST and LAST.
     *
     * @return {MenuItem} the newly created MenuItem
     */
    public addMenuItem(command: CommandManager.Command | string, keyBindings?, position?: Position, relativeID?: RelativeID | string): MenuItem | null {
        const menuID = this.id;
        let $menuItem;
        let name;
        let commandID: string;

        if (!command) {
            console.error("addMenuItem(): missing required parameters: command");
            return null;
        }

        if (typeof (command) === "string") {
            if (command === DIVIDER) {
                name = DIVIDER;
                commandID = _getNextMenuItemDividerID();
            } else {
                commandID = command;
                command = CommandManager.get(commandID);
                if (!command) {
                    console.error("addMenuItem(): commandID not found: " + commandID);
                    return null;
                }
                name = command.getName();
            }
        } else {
            commandID = command.getID();
            name = command.getName();
        }

        // Internal id is the a composite of the parent menu id and the command id.
        const id = this._getMenuItemId(commandID);

        if (menuItemMap[id]) {
            console.log("MenuItem added with same id of existing MenuItem: " + id);
            return null;
        }

        // create MenuItem
        const menuItem = new MenuItem(id, command);
        menuItemMap[id] = menuItem;

        // create MenuItem DOM
        if (_isHTMLMenu(this.id)) {
            if (name === DIVIDER) {
                $menuItem = $("<li><hr class='divider' id='" + id + "' /></li>");
            } else {
                // Create the HTML Menu
                $menuItem = $("<li><a href='#' id='" + id + "'> <span class='menu-name'></span></a></li>");

                $menuItem.on("click", function () {
                    menuItem._command.execute();
                });

                const self = this;
                $menuItem.on("mouseenter", function () {
                    self.closeSubMenu();
                });
            }

            // Insert menu item
            const $relativeElement = this._getRelativeMenuItem(relativeID!, position!);
            _insertInList(
                $("li#" + StringUtils.jQueryIdEscape(this.id) + " > ul.dropdown-menu"),
                $menuItem,
                position,
                $relativeElement
            );
        } else {
            const bindings = KeyBindingManager.getKeyBindings(commandID);
            let binding;
            let bindingStr = "";
            let displayStr = "";

            if (bindings && bindings.length > 0) {
                binding = bindings[bindings.length - 1];
                bindingStr = binding.displayKey || binding.key;
            }

            if (bindingStr.length > 0) {
                displayStr = KeyBindingManager.formatKeyDescriptor(bindingStr);
            }

            if (position === FIRST_IN_SECTION || position === LAST_IN_SECTION) {
                if (!relativeID!.hasOwnProperty("sectionMarker")) {
                    console.error("Bad Parameter in _getRelativeMenuItem(): relativeID must be a MenuSection when position refers to a menu section");
                    return null;
                }

                // For sections, pass in the marker for that section.
                relativeID = (relativeID as RelativeID).sectionMarker;
            }

            const winId = electronRemote.getCurrentWindow().id;
            brackets.app.addMenuItem(winId, this.id, name, commandID, bindingStr, displayStr, position, relativeID, function (err) {
                switch (err) {
                    case NO_ERROR:
                        break;
                    case ERR_INVALID_PARAMS:
                        console.error("addMenuItem(): Invalid Parameters when adding the command " + commandID);
                        break;
                    case ERR_NOT_FOUND:
                        console.error("_getRelativeMenuItem(): MenuItem with Command id " + relativeID + " not found in the Menu " + menuID);
                        break;
                    default:
                        console.error("addMenuItem(); Unknown Error (" + err + ") when adding the command " + commandID);
                }
            });
            menuItem.isNative = true;
        }

        // Initialize MenuItem state
        if (menuItem.isDivider) {
            menuItem.dividerId = commandID;
        } else {
            if (keyBindings) {
                // Add key bindings. The MenuItem listens to the Command object to update MenuItem DOM with shortcuts.
                if (!Array.isArray(keyBindings)) {
                    keyBindings = [keyBindings];
                }
            }

            // Note that keyBindings passed during MenuItem creation take precedent over any existing key bindings
            KeyBindingManager.addBinding(commandID, keyBindings);

            // Look for existing key bindings
            _addExistingKeyBinding(menuItem);

            menuItem._checkedChanged();
            menuItem._enabledChanged();
            menuItem._nameChanged();
        }

        return menuItem;
    }

    /**
     * Inserts divider item in menu.
     * @param {?string} position - constant defining the position of new the divider relative
     *      to other MenuItems. Default is LAST.  (see Insertion position constants).
     * @param {?string} relativeID - id of menuItem, sub-menu, or menu section that the new
     *      divider will be positioned relative to. Required for all position constants
     *      except FIRST and LAST
     *
     * @return {MenuItem} the newly created divider
     */
    public addMenuDivider(position?: Position, relativeID?: RelativeID | string): MenuItem | null {
        return this.addMenuItem(DIVIDER, "", position, relativeID);
    }

    /**
     * NOT IMPLEMENTED
     * Alternative JSON based API to addMenuItem()
     *
     * All properties are required unless noted as optional.
     *
     * @param { Array.<{
     *              id:         string,
     *              command:    string | Command,
     *              ?bindings:   string | Array.<{key: string, platform: string}>,
     *          }>} jsonStr
     *        }
     * @param {?string} position - constant defining the position of new the MenuItem relative
     *      to other MenuItems. Default is LAST.  (see Insertion position constants).
     * @param {?string} relativeID - id of menuItem, sub-menu, or menu section that the new
     *      menuItem will be positioned relative to. Required when position is
     *      AFTER or BEFORE, ignored when position is FIRST or LAST.
     *
     * @return {MenuItem} the newly created MenuItem
     */
    // Menu.prototype.createMenuItemsFromJSON = function (jsonStr, position, relativeID) {
    //     NOT IMPLEMENTED
    // };

    /**
     *
     * Creates a new submenu and a menuItem and adds the menuItem of the submenu
     * to the menu and returns the submenu.
     *
     * A submenu will have the same structure of a menu with a additional field
     * parentMenuItem which has the reference of the submenu's parent menuItem.
     *
     * A submenu will raise the following events:
     * - beforeSubMenuOpen
     * - beforeSubMenuClose
     *
     * Note, This function will create only a context submenu.
     *
     * TODO: Make this function work for Menus
     *
     *
     * @param {!string} name displayed in menu item of the submenu
     * @param {!string} id
     * @param {?string} position - constant defining the position of new MenuItem of the submenu relative to
     *      other MenuItems. Values:
     *          - With no relativeID, use Menus.FIRST or LAST (default is LAST)
     *          - Relative to a command id, use BEFORE or AFTER (required)
     *          - Relative to a MenuSection, use FIRST_IN_SECTION or LAST_IN_SECTION (required)
     * @param {?string} relativeID - command id OR one of the MenuSection.* constants. Required
     *      for all position constants except FIRST and LAST.
     *
     * @return {Menu} the newly created submenu
     */
    public addSubMenu(name: string, id: string, position?: Position, relativeID?: RelativeID | string): ContextMenu | null {

        if (!name || !id) {
            console.error("addSubMenu(): missing required parameters: name and id");
            return null;
        }

        // Guard against duplicate context menu ids
        if (contextMenuMap[id]) {
            console.log("Context menu added with id of existing Context Menu: " + id);
            return null;
        }

        const menu = new ContextMenu(id);
        contextMenuMap[id] = menu;

        const menuItemID = this.id + "-" + id;

        if (menuItemMap[menuItemID]) {
            console.log("MenuItem added with same id of existing MenuItem: " + id);
            return null;
        }

        // create MenuItem
        const menuItem = new MenuItem(menuItemID, SUBMENU);
        menuItemMap[menuItemID] = menuItem;

        menu.parentMenuItem = menuItem;

        // create MenuItem DOM
        if (_isHTMLMenu(this.id)) {
            // Create the HTML MenuItem
            const $menuItem = $("<li><a href='#' id='" + menuItemID + "'> "   +
                                "<span class='menu-name'>" + name + "</span>" +
                                "<span style='float: right'>&rtrif;</span>"   +
                                "</a></li>");

            const self = this;
            $menuItem.on("mouseenter", function (e) {
                if (self.openSubMenu && self.openSubMenu.id === menu.id) {
                    return;
                }
                self.closeSubMenu();
                self.openSubMenu = menu;
                menu.open();
            });

            // Insert menu item
            const $relativeElement = this._getRelativeMenuItem(relativeID, position)!;
            _insertInList($("li#" + StringUtils.jQueryIdEscape(this.id) + " > ul.dropdown-menu"),
                $menuItem, position, $relativeElement);
        } else {
            // TODO: add submenus for native menus
        }
        return menu;
    }

    /**
     * Removes the specified submenu from this Menu.
     *
     * Note, this function will only remove context submenus
     *
     * TODO: Make this function work for Menus
     *
     * @param {!string} subMenuID - the menu id of the submenu to remove.
     */
    public removeSubMenu(subMenuID: string): void {
        let commandID: CommandManager.Command | string = "";

        if (!subMenuID) {
            console.error("removeSubMenu(): missing required parameters: subMenuID");
            return;
        }

        const subMenu = getContextMenu(subMenuID);

        if (!subMenu || !subMenu.parentMenuItem) {
            console.error("removeSubMenu(): parameter subMenuID: %s is not a valid submenu id", subMenuID);
            return;
        }

        const parentMenuItem = subMenu.parentMenuItem;


        if (!menuItemMap[parentMenuItem.id]) {
            console.error("removeSubMenu(): parent menuItem not found in menuItemMap: %s", parentMenuItem.id);
            return;
        }

        // Remove all of the menu items in the submenu
        _.forEach(menuItemMap, function (value, key: string) {
            if (_.startsWith(key, subMenuID)) {
                if (value.isDivider) {
                    subMenu.removeMenuDivider(key);
                } else {
                    commandID = value.getCommand();
                    subMenu.removeMenuItem(commandID);
                }
            }
        });

        if (_isHTMLMenu(this.id)) {
            $(_getHTMLMenuItem(parentMenuItem.id)).parent().remove(); // remove the menu item
            $(_getHTMLMenu(subMenuID)).remove(); // remove the menu
        } else {
            // TODO: remove submenus for native menus
        }


        delete menuItemMap[parentMenuItem.id];
        delete contextMenuMap[subMenuID];
    }

    /**
     * Closes the submenu if the menu has a submenu open.
     */
    public closeSubMenu(): void {
        if (this.openSubMenu) {
            this.openSubMenu.close();
            this.openSubMenu = null;
        }
    }
}


/**
 * MenuItem represents a single menu item that executes a Command or a menu divider. MenuItems
 * may have a sub-menu. A MenuItem may correspond to an HTML-based
 * menu item or a native menu item if Brackets is running in a native application shell
 *
 * Since MenuItems may have a native implementation clients should create MenuItems through
 * addMenuItem() and should NOT construct a MenuItem object directly.
 * Clients should also not access HTML content of a menu directly and instead use
 * the MenuItem API to query and modify menus items.
 *
 * MenuItems are views on to Command objects so modify the underlying Command to modify the
 * name, enabled, and checked state of a MenuItem. The MenuItem will update automatically
 *
 * @constructor
 * @private
 *
 * @param {string} id
 * @param {string|Command} command - the Command this MenuItem will reflect.
 *                                   Use DIVIDER to specify a menu divider
 */
export class MenuItem {
    public id: string;
    public dividerId: string;
    public isDivider: boolean;
    public isNative: boolean;
    public _command: CommandManager.Command;

    constructor(id: string, command: typeof DIVIDER | typeof SUBMENU | CommandManager.Command) {
        this.id = id;
        this.isDivider = (command === DIVIDER);
        this.isNative = false;

        if (!this.isDivider && command !== SUBMENU) {
            // Bind event handlers
            this._enabledChanged = this._enabledChanged.bind(this);
            this._checkedChanged = this._checkedChanged.bind(this);
            this._nameChanged = this._nameChanged.bind(this);
            this._keyBindingAdded = this._keyBindingAdded.bind(this);
            this._keyBindingRemoved = this._keyBindingRemoved.bind(this);

            this._command = (command  as CommandManager.Command);
            this._command
                .on("enabledStateChange", this._enabledChanged)
                .on("checkedStateChange", this._checkedChanged)
                .on("nameChange", this._nameChanged)
                .on("keyBindingAdded", this._keyBindingAdded)
                .on("keyBindingRemoved", this._keyBindingRemoved);
        }
    }

    /**
     * NOT IMPLEMENTED
     * @param {!string} text displayed in menu item
     * @param {!string} id
     * @param {?string} position - constant defining the position of new the MenuItem relative
     *      to other MenuItems. Default is LAST.  (see Insertion position constants)
     * @param {?string} relativeID - id of menuItem, sub-menu, or menu section that the new
     *      menuItem will be positioned relative to. Required when position is
     *      AFTER or BEFORE, ignored when position is FIRST or LAST.
     *
     * @return {MenuItem} newly created menuItem for sub-menu
     */
    // MenuItem.prototype.createSubMenu = function (text, id, position, relativeID) {
    //     NOT IMPLEMENTED
    // };

    /**
     * Gets the Command associated with a MenuItem
     * @return {Command}
     */
    public getCommand(): CommandManager.Command {
        return this._command;
    }

    /**
     * NOT IMPLEMENTED
     * Returns the parent MenuItem if the menu item is a sub-menu, returns null otherwise.
     * @return {MenuItem}
     */
    // MenuItem.prototype.getParentMenuItem = function () {
    //     NOT IMPLEMENTED;
    // };

    /**
     * Returns the parent Menu for this MenuItem
     * @return {Menu}
     */
    public getParentMenu(): Menu | null {
        const parent = $(_getHTMLMenuItem(this.id)).parents(".dropdown").get(0);
        if (!parent) {
            return null;
        }

        return getMenu(parent.id);
    }

    /**
     * Synchronizes MenuItem checked state with underlying Command checked state
     */
    public _checkedChanged(): void {
        const checked = !!this._command.getChecked();
        if (this.isNative) {
            const winId = electronRemote.getCurrentWindow().id;
            const enabled = !!this._command.getEnabled();
            brackets.app.setMenuItemState(winId, this._command.getID(), enabled, checked, function (err) {
                if (err) {
                    console.log("Error setting menu item state: " + err);
                }
            });
        } else {
            ViewUtils.toggleClass($(_getHTMLMenuItem(this.id)), "checked", checked);
        }
    }

    /**
     * Synchronizes MenuItem enabled state with underlying Command enabled state
     */
    public _enabledChanged(): void {
        if (this.isNative) {
            const winId = electronRemote.getCurrentWindow().id;
            const enabled = !!this._command.getEnabled();
            const checked = !!this._command.getChecked();
            brackets.app.setMenuItemState(winId, this._command.getID(), enabled, checked, function (err) {
                if (err) {
                    console.log("Error setting menu item state: " + err);
                }
            });
        } else {
            ViewUtils.toggleClass($(_getHTMLMenuItem(this.id)), "disabled", !this._command.getEnabled());
        }
    }

    /**
     * Synchronizes MenuItem name with underlying Command name
     */
    public _nameChanged(): void {
        if (this.isNative) {
            const winId = electronRemote.getCurrentWindow().id;
            brackets.app.setMenuTitle(winId, this._command.getID(), this._command.getName(), function (err) {
                if (err) {
                    console.log("Error setting menu title: " + err);
                }
            });
        } else {
            $(_getHTMLMenuItem(this.id)).find(".menu-name").text(this._command.getName()!);
        }
    }

    /**
     * @private
     * Updates MenuItem DOM with a keyboard shortcut label
     */
    public _keyBindingAdded(event: JQueryEventObject, keyBinding: KeyBindingManager.ExplicitKeyBinding): void {
        if (this.isNative) {
            const winId = electronRemote.getCurrentWindow().id;
            const shortcutKey = keyBinding.displayKey || keyBinding.key;
            brackets.app.setMenuItemShortcut(winId, this._command.getID(), shortcutKey, KeyBindingManager.formatKeyDescriptor(shortcutKey), function (err) {
                if (err) {
                    console.error("Error setting menu item shortcut: " + err);
                }
            });
        } else {
            _addKeyBindingToMenuItem($(_getHTMLMenuItem(this.id)), keyBinding.key, keyBinding.displayKey!);
        }
    }

    /**
     * @private
     * Updates MenuItem DOM to remove keyboard shortcut label
     */
    public _keyBindingRemoved(event: JQueryEventObject, keyBinding: KeyBindingManager.ExplicitKeyBinding): void {
        if (this.isNative) {
            const winId = electronRemote.getCurrentWindow().id;
            brackets.app.setMenuItemShortcut(winId, this._command.getID(), "", "", function (err) {
                if (err) {
                    console.error("Error setting menu item shortcut: " + err);
                }
            });
        } else {
            const $shortcut = $(_getHTMLMenuItem(this.id)).find(".menu-shortcut");

            if ($shortcut.length > 0 && $shortcut.data("key") === keyBinding.key) {
                // check for any other bindings
                if (_addExistingKeyBinding(this) === null) {
                    $shortcut.empty();
                }
            }
        }
    }
}


/**
 * Closes all menus that are open
 */
export function closeAll(): void {
    $(".dropdown").removeClass("open");
}

/**
 * Adds a top-level menu to the application menu bar which may be native or HTML-based.
 *
 * @param {!string} name - display text for menu
 * @param {!string} id - unique identifier for a menu.
 *      Core Menus in Brackets use a simple  title as an id, for example "file-menu".
 *      Extensions should use the following format: "author.myextension.mymenuname".
 * @param {?string} position - constant defining the position of new the Menu relative
 *  to other Menus. Default is LAST (see Insertion position constants).
 *
 * @param {?string} relativeID - id of Menu the new Menu will be positioned relative to. Required
 *      when position is AFTER or BEFORE, ignored when position is FIRST or LAST
 *
 * @return {?Menu} the newly created Menu
 */
export function addMenu(name: string, id: string, position?: Position, relativeID?: RelativeID | string): Menu | null {
    name = _.escape(name);
    const $menubar = $("#titlebar .nav");

    if (!name || !id) {
        console.error("call to addMenu() is missing required parameters");
        return null;
    }

    // Guard against duplicate menu ids
    if (menuMap[id]) {
        console.log("Menu added with same name and id of existing Menu: " + id);
        return null;
    }

    const menu = new Menu(id);
    menuMap[id] = menu;

    if (!_isHTMLMenu(id)) {
        const winId = electronRemote.getCurrentWindow().id;
        brackets.app.addMenu(winId, name, id, position, relativeID, function (err) {
            switch (err) {
                case NO_ERROR:
                    // Make sure name is up to date
                    brackets.app.setMenuTitle(winId, id, name, function (err) {
                        if (err) {
                            console.error("setMenuTitle() -- error: " + err);
                        }
                    });
                    break;
                case ERR_UNKNOWN:
                    console.error("addMenu(): Unknown Error when adding the menu " + id);
                    break;
                case ERR_INVALID_PARAMS:
                    console.error("addMenu(): Invalid Parameters when adding the menu " + id);
                    break;
                case ERR_NOT_FOUND:
                    console.error("addMenu(): Menu with command " + relativeID + " could not be found when adding the menu " + id);
                    break;
                default:
                    console.error("addMenu(): Unknown Error (" + err + ") when adding the menu " + id);
            }
        });
        return menu;
    }

    const $toggle = $("<a href='#' class='dropdown-toggle' data-toggle='dropdown'>" + name + "</a>");
    const $popUp = $("<ul class='dropdown-menu'></ul>");
    const $newMenu = $("<li class='dropdown' id='" + id + "'></li>").append($toggle).append($popUp);

    // Insert menu
    const $relativeElement = relativeID && $(_getHTMLMenu(relativeID as string));
    _insertInList($menubar, $newMenu, position, $relativeElement as JQuery);

    // Install ESC key handling
    PopUpManager.addPopUp($popUp, closeAll, false);

    // todo error handling

    return menu;
}

/**
 * Removes a top-level menu from the application menu bar which may be native or HTML-based.
 *
 * @param {!string} id - unique identifier for a menu.
 *      Core Menus in Brackets use a simple title as an id, for example "file-menu".
 *      Extensions should use the following format: "author.myextension.mymenuname".
 */
export function removeMenu(id: string): void {
    let commandID: CommandManager.Command | string = "";

    if (!id) {
        console.error("removeMenu(): missing required parameter: id");
        return;
    }

    if (!menuMap[id]) {
        console.error("removeMenu(): menu id not found: %s", id);
        return;
    }

    // Remove all of the menu items in the menu
    const menu = getMenu(id);

    _.forEach(menuItemMap, function (value, key: string) {
        if (_.startsWith(key, id)) {
            if (value.isDivider) {
                menu.removeMenuDivider(key);
            } else {
                commandID = value.getCommand();
                menu.removeMenuItem(commandID);
            }
        }
    });

    if (_isHTMLMenu(id)) {
        $(_getHTMLMenu(id)).remove();
    } else {
        const winId = electronRemote.getCurrentWindow().id;
        brackets.app.removeMenu(winId, id, function (err) {
            if (err) {
                console.error("removeMenu() -- id not found: " + id + " (error: " + err + ")");
            }
        });
    }

    delete menuMap[id];
}

/**
 * Represents a context menu that can open at a specific location in the UI.
 *
 * Clients should not create this object directly and should instead use registerContextMenu()
 * to create new ContextMenu objects.
 *
 * Context menus in brackets may be HTML-based or native so clients should not reach into
 * the HTML and should instead manipulate ContextMenus through the API.
 *
 * Events:
 * - beforeContextMenuOpen
 * - beforeContextMenuClose
 *
 * @constructor
 * @extends {Menu}
 */
export class ContextMenu extends EventDispatcher.withEventDispatcher(Menu) implements ContextMenuAdapter {
    public parentClass = Menu.prototype;
    public parentMenuItem: MenuItem;

    constructor(id: string) {
        super(id);

        const $newMenu = $("<li class='dropdown context-menu' id='" + StringUtils.jQueryIdEscape(id) + "'></li>");
        const $popUp = $("<ul class='dropdown-menu'></ul>");
        const $toggle = $("<a href='#' class='dropdown-toggle' data-toggle='dropdown'></a>").hide();

        // assemble the menu fragments
        $newMenu.append($toggle).append($popUp);

        // insert into DOM
        $("#context-menu-bar > ul").append($newMenu);

        const self = this;
        PopUpManager.addPopUp($popUp,
            function () {
                self.close();
            },
            false);

        // Listen to ContextMenu's beforeContextMenuOpen event to first close other popups
        PopUpManager.listenToContextMenu(this);
    }

    /**
     * Displays the ContextMenu at the specified location and dispatches the
     * "beforeContextMenuOpen" event or "beforeSubMenuOpen" event (for submenus).
     * The menu location may be adjusted to prevent clipping by the browser window.
     * All other menus and ContextMenus will be closed before a new menu
     * will be closed before a new menu is shown (if the new menu is not
     * a submenu).
     *
     * In case of submenus, the parentMenu of the submenu will not be closed when the
     * sub menu is open.
     *
     * @param {MouseEvent | {pageX:number, pageY:number}} mouseOrLocation - pass a MouseEvent
     *      to display the menu near the mouse or pass in an object with page x/y coordinates
     *      for a specific location.This paramter is not used for submenus. Submenus are always
     *      displayed at a position relative to the parent menu.
     */
    public open(mouseOrLocation?: JQueryMouseEventObject | MenuLocation): void {

        if (!this.parentMenuItem &&
            (!mouseOrLocation || !mouseOrLocation.hasOwnProperty("pageX") || !mouseOrLocation.hasOwnProperty("pageY"))) {
            console.error("ContextMenu open(): missing required parameter");
            return;
        }

        const $window = $(window);
        const escapedId = StringUtils.jQueryIdEscape(this.id);
        const $menuAnchor = $("#" + escapedId);
        const $menuWindow = $("#" + escapedId + " > ul");
        let posTop;
        let posLeft;
        let elementRect;
        let clip;

        // only show context menu if it has menu items
        if ($menuWindow.children().length <= 0) {
            return;
        }


        // adjust positioning so menu is not clipped off bottom or right
        if (this.parentMenuItem) { // If context menu is a submenu

            this.trigger("beforeSubMenuOpen");

            const $parentMenuItem = $(_getHTMLMenuItem(this.parentMenuItem.id));

            posTop = $parentMenuItem.offset().top;
            posLeft = $parentMenuItem.offset().left + $parentMenuItem.outerWidth();

            elementRect = {
                top:    posTop,
                left:   posLeft,
                height: $menuWindow.height() + 25,
                width:  $menuWindow.width()
            };
            clip = ViewUtils.getElementClipSize($window, elementRect);

            if (clip.bottom > 0) {
                posTop = Math.max(0, posTop + $parentMenuItem.height() - $menuWindow.height());
            }

            posTop -= 30;   // shift top for hidden parent element
            posLeft += 3;

            if (clip.right > 0) {
                posLeft = Math.max(0, posLeft - $parentMenuItem.outerWidth() - $menuWindow.outerWidth());
            }
        } else {
            this.trigger("beforeContextMenuOpen");

            // close all other dropdowns
            closeAll();

            posTop  = mouseOrLocation!.pageY;
            posLeft = mouseOrLocation!.pageX;

            elementRect = {
                top:    posTop,
                left:   posLeft,
                height: $menuWindow.height() + 25,
                width:  $menuWindow.width()
            };
            clip = ViewUtils.getElementClipSize($window, elementRect);

            if (clip.bottom > 0) {
                posTop = Math.max(0, posTop - clip.bottom);
            }
            posTop -= 30;   // shift top for hidden parent element
            posLeft += 5;


            if (clip.right > 0) {
                posLeft = Math.max(0, posLeft - clip.right);
            }
        }

        // open the context menu at final location
        $menuAnchor
            .addClass("open")
            .css({"left": posLeft, "top": posTop});
    }

    /**
     * Closes the context menu.
     */
    public close(): void {
        if (this.parentMenuItem) {
            this.trigger("beforeSubMenuClose");
        } else {
            this.trigger("beforeContextMenuClose");
        }
        this.closeSubMenu();
        $("#" + StringUtils.jQueryIdEscape(this.id)).removeClass("open");
    }

    /**
     * Detect if current context menu is already open
     */
    public isOpen(): boolean {
        return $("#" + StringUtils.jQueryIdEscape(this.id)).hasClass("open");
    }

    /**
     * Associate a context menu to a DOM element.
     * This static function take care of registering event handlers for the click event
     * listener and passing the right "position" object to the Context#open method
     */
    public static assignContextMenuToSelector(selector: string, cmenu: ContextMenu | ContextMenuAdapter): void {
        $(selector).on("click", function (this: any, e) {
            let buttonOffset;
            let buttonHeight;

            e.stopPropagation();

            if (cmenu.isOpen()) {
                cmenu.close();
            } else {
                buttonOffset = $(this).offset();
                buttonHeight = $(this).outerHeight();
                cmenu.open({
                    pageX: buttonOffset.left,
                    pageY: buttonOffset.top + buttonHeight
                });
            }
        });
    }
}


/**
 * Registers new context menu with Brackets.
 *
 * Extensions should generally use the predefined context menus built into Brackets. Use this
 * API to add a new context menu to UI that is specific to an extension.
 *
 * After registering  a new context menu clients should:
 *      - use addMenuItem() to add items to the context menu
 *      - call open() to show the context menu.
 *      For example:
 *      $("#my_ID").contextmenu(function (e) {
 *          if (e.which === 3) {
 *              my_cmenu.open(e);
 *          }
 *      });
 *
 * To make menu items be contextual to things like selection, listen for the "beforeContextMenuOpen"
 * to make changes to Command objects before the context menu is shown. MenuItems are views of
 * Commands, which control a MenuItem's name, enabled state, and checked state.
 *
 * @param {string} id - unique identifier for context menu.
 *      Core context menus in Brackets use a simple title as an id.
 *      Extensions should use the following format: "author.myextension.mycontextmenu name"
 * @return {?ContextMenu} the newly created context menu
 */
export function registerContextMenu(id: string): ContextMenu {
    if (!id) {
        console.error("call to registerContextMenu() is missing required parameters");
        return (null as unknown as ContextMenu);
    }

    // Guard against duplicate menu ids
    if (contextMenuMap[id]) {
        console.log("Context Menu added with same name and id of existing Context Menu: " + id);
        return (null as unknown as ContextMenu);
    }

    const cmenu = new ContextMenu(id);
    contextMenuMap[id] = cmenu;
    return cmenu;
}

// Deprecated menu ids
DeprecationWarning.deprecateConstant(ContextMenuIds, "WORKING_SET_MENU", "WORKING_SET_CONTEXT_MENU");
DeprecationWarning.deprecateConstant(ContextMenuIds, "WORKING_SET_SETTINGS_MENU", "WORKING_SET_CONFIG_MENU");
