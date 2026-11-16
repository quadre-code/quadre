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

import type * as TCommandManager from "command/CommandManager";
import type * as TCommands from "command/Commands";
import type * as TKeyBindingManager from "command/KeyBindingManager";
import type * as TMenus from "command/Menus";
import type * as TFileSystem from "filesystem/FileSystem";
import type { Listener } from "utils/EventDispatcher";

let CommandManager: typeof TCommandManager;     // Load from brackets.test
let Commands: typeof TCommands;           // Load from brackets.test
let KeyBindingManager: typeof TKeyBindingManager;  // Load from brackets.test
let Menus: typeof TMenus;              // Load from brackets.test
let FileSystem: typeof TFileSystem;         // Load from brackets.test
import * as SpecRunnerUtils from "spec/SpecRunnerUtils";
import * as KeyEvent from "utils/KeyEvent";

interface Bounds {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

// Verify if we are running in a CI.
import { UrlParams } from "utils/UrlParams";
const params    = new UrlParams();

// parse URL parameters
params.parse();

const isCI = /true/i.test(params.get("isCI"));

(isCI ? xdescribe : describe)("Menus (Native Shell)", function (this: jasmine.Spec) {

    this.category = "integration";

    let testWindow: SpecRunnerUtils.TestWindow;

    beforeFirst(function (this: jasmine.Spec) {
        const testWindowOptions = {"hasNativeMenus" : true};

        // Create a new native menu window that will be shared by ALL tests in this spec.
        SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
            testWindow = w;

            // Load module instances from brackets.test
            CommandManager    = testWindow.brackets.test.CommandManager;
            Commands          = testWindow.brackets.test.Commands;
            KeyBindingManager = testWindow.brackets.test.KeyBindingManager;
            Menus             = testWindow.brackets.test.Menus;
            FileSystem        = testWindow.brackets.test.FileSystem;
        }, testWindowOptions);
    });

    afterLast(function () {
        (testWindow as any)        = null;
        (CommandManager as any)    = null;
        (Commands as any)          = null;
        (KeyBindingManager as any) = null;
        (Menus as any)             = null;
        SpecRunnerUtils.closeTestWindow();
    });

    describe("Remove Menu", function () {
        it("should add then remove new menu to menu bar with a menu id", function () {
            runs(function () {
                const menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);

                let menu = Menus.getMenu(menuId);
                expect(menu).toBeTruthy();

                Menus.removeMenu(menuId);
                menu = Menus.getMenu(menuId);
                expect(menu).toBeUndefined();
            });
        });

        it("should remove all menu items and dividers in the menu when removing the menu", function () {
            runs(function () {
                const menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);

                let menu = Menus.getMenu(menuId);
                expect(menu).toBeTruthy();

                const commandId = "Remove-Menu-test.Item-1";
                CommandManager.register("Remove Menu Test Command", commandId, function () { /* Do nothing */ });

                let menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();

                const menuItemId = menuItem!.id;
                expect(menuItemId).toBeTruthy();

                let menuDivider = menu.addMenuDivider();
                expect(menuDivider).toBeTruthy();

                const menuDividerId = menuDivider!.id;
                expect(menuDividerId).toBeTruthy();

                menuItem = Menus.getMenuItem(menuItemId);
                expect(menuItem).toBeTruthy();

                menuDivider = Menus.getMenuItem(menuDividerId);
                expect(menuDivider).toBeTruthy();

                Menus.removeMenu(menuId);

                menu = Menus.getMenu(menuId);
                expect(menu).toBeUndefined();

                menuItem = Menus.getMenuItem(menuItemId);
                expect(menuItem).toBeUndefined();

                menuDivider = Menus.getMenuItem(menuDividerId);
                expect(menuDivider).toBeUndefined();
            });
        });

        it("should gracefully handle someone trying to remove a menu that doesn't exist", function () {
            runs(function () {
                const menuId = "Menu-test";

                Menus.removeMenu(menuId);
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should gracefully handle someone trying to remove a menu without supplying the id", function () {
            runs(function () {
                // @ts-expect-error
                Menus.removeMenu();
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });
    });


    (isCI ? xdescribe : describe)("Context Menus", function () {
        it("register a context menu", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu50");

            // Add menu item via command id
            CommandManager.register("Brackets Test Command Custom 50", "Menu-test.command50", function () { /* Do nothing */ });
            let menuItem = cmenu.addMenuItem("Menu-test.command50");
            expect(menuItem).toBeTruthy();
            expect(cmenu).toBeTruthy();

            // Add menu item via command object
            const command = CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () { /* Do nothing */ })!;
            menuItem = cmenu.addMenuItem(command);
            expect(menuItem).toBeTruthy();

            // add positioned divider
            menuItem = cmenu.addMenuDivider(Menus.BEFORE, "Menu-test.command51");
            let $listItems = testWindow.$("#test-cmenu50 > ul").children();
            expect($listItems.length).toBe(3);
            expect($($listItems[1]).find("hr.divider").length).toBe(1);

            // add divider to end
            menuItem = cmenu.addMenuDivider();
            $listItems = testWindow.$("#test-cmenu50 > ul").children();
            expect($listItems.length).toBe(4);
            expect($($listItems[3]).find("hr.divider").length).toBe(1);

            // duplicate command in Menu
            menuItem = cmenu.addMenuItem("Menu-test.command50");
            expect(menuItem).toBeFalsy();

            // duplicate ids
            const cmenu2 = Menus.registerContextMenu("test-cmenu50");
            expect(cmenu2).toBeFalsy();
        });

        it("open a context menu", function () {
            runs(function () {
                let openEvent = false;
                const cmenu = Menus.registerContextMenu("test-cmenu51");
                CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () { /* Do nothing */ });
                cmenu.addMenuItem("Menu-test.command51");

                cmenu.on("beforeContextMenuOpen", function () {
                    openEvent = true;
                });

                cmenu.open({ pageX: 300, pageY: 250 });
                const $menu = testWindow.$(".dropdown.open > ul");

                // all other drops downs should be closed
                expect($menu.length).toBe(1);

                // position is at correct location
                expect($menu.offset()!.left).toBe(300);
                expect($menu.offset()!.top).toBe(250);
                expect(openEvent).toBeTruthy();
            });
        });

        function getBounds(object: JQuery): Bounds {
            return {
                left   : object.offset()!.left,
                top    : object.offset()!.top,
                right  : object.offset()!.left + object.width(),
                bottom : object.offset()!.top + object.height()
            };
        }

        function boundsInsideWindow(object): boolean {
            const bounds = getBounds(object);
            return bounds.left   >= 0 &&
                    bounds.right  <= $(testWindow).width() &&
                    bounds.top    >= 0 &&
                    bounds.bottom <= $(testWindow).height();
        }

        it("context menu is not clipped", function () {
            runs(function () {
                const cmenu = Menus.registerContextMenu("test-cmenu52");
                CommandManager.register("Brackets Test Command Custom 52", "Menu-test.command52", function () { /* Do nothing */ });
                cmenu.addMenuItem("Menu-test.command52");
                const winWidth = $(testWindow).width();
                const winHeight = $(testWindow).height();

                cmenu.open({ pageX: 0, pageY: 0 });
                let $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: winHeight, pageY: winWidth });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: 0, pageY: winWidth });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({ pageX: winHeight, pageY: 0 });
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();
            });
        });

        it("close context menu", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu53");
            CommandManager.register("Brackets Test Command Custom 53", "Menu-test.command53", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command53");

            cmenu.open({ pageX: 0, pageY: 0 });

            // verify dropdown is open
            let $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(1);

            // verify close event
            cmenu.close();

            // verify all dropdowns are closed
            $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(0);
        });

        it("close context menu using Esc key", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu54");
            CommandManager.register("Brackets Test Command Custom 54", "Menu-test.command54", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command54");

            cmenu.open({ pageX: 0, pageY: 0 });

            // verify dropdown is open
            let $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(1);

            // close the context menu by simulating Esc key
            const key = KeyEvent.DOM_VK_ESCAPE;
            const element = $menus[0];
            SpecRunnerUtils.simulateKeyEvent(key, "keydown", element);

            // verify all dropdowns are closed
            $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(0);
        });
        it("check for context menu to have the right status", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu55");
            CommandManager.register("Brackets Test Command Custom 55", "Menu-test.command55", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command55");

            cmenu.open({pageX: 0, pageY: 0});

            // verify dropdown is open
            let isOpen = cmenu.isOpen();
            expect(isOpen).toBe(true);

            // verify close event
            cmenu.close();

            // verify all dropdowns are closed
            isOpen = cmenu.isOpen();
            expect(isOpen).toBe(false);
        });

        it("it should disable context menu items when file doesn't exist ", function () {
            runs(function () {
                // runs create a new file
                const promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);
                waitsForDone(promise, "FILE_NEW_UNTITLED");

                // opens context menu
                const cmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
                cmenu.open({pageX: 0, pageY: 0});

                // checks that all the relevant items are disabled
                const notVisible = [Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.NAVIGATE_SHOW_IN_OS];
                notVisible.forEach(function (item) { expect(CommandManager.get(item).getEnabled()).toBe(false); });

                //close menu and new file
                cmenu.close();
            });
        });

        it("it should enable context menu items when file does exist ", function () {
            const testPath = SpecRunnerUtils.getTempDirectory();
            const newFilePath = testPath + "/contextMenuTest.js";
            runs(function () {
                // runs create a new file and saves it
                SpecRunnerUtils.createTempDirectory();
                SpecRunnerUtils.loadProjectInTestWindow(testPath);
                let promise = CommandManager.execute(Commands.FILE_NEW_UNTITLED);

                waitsForDone(promise, "FILE_NEW_UNTITLED");

                spyOn(FileSystem, "showSaveDialog").andCallFake(function (dialogTitle, initialPath, proposedNewName, callback) {
                    callback(undefined, newFilePath);
                });

                promise = CommandManager.execute(Commands.FILE_SAVE);
                waitsForDone(promise, "Provide new filename", 5000);
            });
            runs(function () {
                // opens context menu
                const cmenu = Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU);
                cmenu.open({pageX: 0, pageY: 0});

                // checks that all the items are enabled
                const visible = [Commands.FILE_SAVE, Commands.FILE_SAVE_AS, Commands.FILE_RENAME, Commands.NAVIGATE_SHOW_IN_FILE_TREE, Commands.NAVIGATE_SHOW_IN_OS, Commands.CMD_FIND_IN_SUBTREE, Commands.CMD_REPLACE_IN_SUBTREE, Commands.FILE_CLOSE];
                visible.forEach(function (item) { expect(CommandManager.get(item).getEnabled()).toBe(true); });
            });
        });
    });
});


(isCI ? xdescribe : describe)("Menus (HTML)", function (this: jasmine.Spec) {

    this.category = "integration";

    let testWindow: SpecRunnerUtils.TestWindow;

    beforeFirst(function (this: jasmine.Spec) {
        const testWindowOptions = {"hasNativeMenus" : false};

        // Create a new HTML menu window that will be shared by ALL tests in this spec.
        SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
            testWindow = w;

            // Load module instances from brackets.test
            CommandManager    = testWindow.brackets.test.CommandManager;
            Commands          = testWindow.brackets.test.Commands;
            KeyBindingManager = testWindow.brackets.test.KeyBindingManager;
            Menus             = testWindow.brackets.test.Menus;
        }, testWindowOptions);
    });

    afterLast(function () {
        (testWindow as any)        = null;
        (CommandManager as any)    = null;
        (Commands as any)          = null;
        (KeyBindingManager as any) = null;
        (Menus as any)             = null;
        SpecRunnerUtils.closeTestWindow();
    });

    describe("Add Menus", function () {

        function getTopMenus(): JQuery {
            return testWindow.$("#titlebar > ul.nav").children();
        }

        it("should add new menu in last position of list", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                const menu = Menus.addMenu("Custom1", "menu-unittest1");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus(); // refresh
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest1");
            });
        });

        it("should add new menu in first position of list", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                const menu = Menus.addMenu("Custom2", "menu-unittest2", Menus.FIRST);
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[0]).attr("id")).toBe("menu-unittest2");
            });
        });

        it("should add new menu after reference menu", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                let menu = Menus.addMenu("CustomFirst", "menu-unittest3-first", Menus.FIRST);
                menu = Menus.addMenu("CustomAfter", "menu-unittest3-after", Menus.AFTER, "menu-unittest3-first");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 2);
                expect($($listItems[0]).attr("id")).toBe("menu-unittest3-first");
                expect($($listItems[1]).attr("id")).toBe("menu-unittest3-after");
            });
        });

        it("should add new menu before reference menu", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                let menu = Menus.addMenu("CustomLast", "menu-unittest3-last", Menus.LAST);
                menu = Menus.addMenu("CustomBefore", "menu-unittest3-before", Menus.BEFORE, "menu-unittest3-last");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 2);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest3-before");
                expect($($listItems[menuCountOriginal + 1]).attr("id")).toBe("menu-unittest3-last");
            });
        });

        it("should add new menu at end of list when reference menu doesn't exist", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                const menu = Menus.addMenu("Custom3", "menu-unittest4", Menus.AFTER, "NONEXISTANT");
                expect(menu).toBeTruthy();
                expect(menu).toBeDefined();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect($($listItems[menuCountOriginal]).attr("id")).toBe("menu-unittest4");
            });
        });

        it("should not add duplicate menu", function () {
            runs(function () {
                let $listItems = getTopMenus();
                expect($listItems.length).toBeGreaterThan(0);

                const menuCountOriginal = $listItems.length;
                const menu1 = Menus.addMenu("Custom5", "menu-unittest5");
                expect(menu1).toBeTruthy();

                const menu2 = Menus.addMenu("Custom5", "menu-unittest5");
                expect(menu2).toBeFalsy();

                $listItems = getTopMenus();
                expect($listItems.length).toBe(menuCountOriginal + 1);
                expect(menu2).toBeNull();
            });
        });
    });


    describe("Add Menu Items", function () {

        it("should add new menu items", function () {
            runs(function () {
                const menu = Menus.addMenu("MenuItem Menu 0", "menuitem-unittest0")!;
                const listSelector = "#menuitem-unittest0 > ul";
                let $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(0);


                // add new menu item to empty menu
                CommandManager.register("Brackets Test Command Custom 0", "Menu-test.command00", function () { /* Do nothing */ });
                let menuItem = menu.addMenuItem("Menu-test.command00");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect($($listItems[0]).length).toBe(1);

                // Periods (aka "dots") are allowed in HTML identifiers, but jQuery interprets
                // them as the start of a class selector, so they need to be escaped
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command00").length).toBe(1);


                // add new menu item in first position of menu
                CommandManager.register("Brackets Test Command Custom 1", "Menu-test.command01", function () { /* Do nothing */ });
                menuItem = menu.addMenuItem("Menu-test.command01", "Ctrl-Alt-1", Menus.FIRST);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(2);
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command01").length).toBe(1);


                // add new menu item in last position of menu
                CommandManager.register("Brackets Test Command Custom 2", "Menu-test.command02", function () { /* Do nothing */ });
                menuItem = menu.addMenuItem("Menu-test.command02", Menus.LAST);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(3);
                expect($($listItems[2]).find("a#menuitem-unittest0-Menu-test\\.command02").length).toBe(1);


                // add new menu item in position after reference command
                CommandManager.register("Brackets Test Command Custom 3", "Menu-test.command03", function () { /* Do nothing */ });
                menuItem = menu.addMenuItem("Menu-test.command03", "Ctrl-Alt-3", Menus.AFTER, "Menu-test.command01");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(4);
                expect($($listItems[1]).find("a#menuitem-unittest0-Menu-test\\.command03").length).toBe(1);


                // add new menu item in position before reference command
                CommandManager.register("Brackets Test Command Custom 4", "Menu-test.command04", function () { /* Do nothing */ });
                menuItem = menu.addMenuItem("Menu-test.command04", "Ctrl-Alt-4", Menus.BEFORE, "Menu-test.command01");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(5);
                expect($($listItems[0]).find("a#menuitem-unittest0-Menu-test\\.command04").length).toBe(1);


                // add positioned divider
                menu.addMenuDivider(Menus.AFTER, "Menu-test.command04");
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(6);
                expect($($listItems[1]).find("hr.divider").length).toBe(1);


                // add divider to end
                menu.addMenuDivider();
                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(7);
                expect($($listItems[6]).find("hr.divider").length).toBe(1);
            });
        });

        it("should add menu items to beginning and end of menu section", function () {
            // set up test menu and menu items
            CommandManager.register("Brackets Test Command Section 10", "Menu-test.command10", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 11", "Menu-test.command11", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 12", "Menu-test.command12", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 13", "Menu-test.command13", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 14", "Menu-test.command14", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 15", "Menu-test.command15", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 16", "Menu-test.command16", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 17", "Menu-test.command17", function () { /* Do nothing */ });
            CommandManager.register("Brackets Test Command Section 18", "Menu-test.command18", function () { /* Do nothing */ });

            const menu = Menus.addMenu("Section Test", "menuitem-unittest1")!;
            menu.addMenuItem("Menu-test.command10");
            menu.addMenuItem("Menu-test.command11");
            menu.addMenuDivider();
            menu.addMenuItem("Menu-test.command12");
            menu.addMenuItem("Menu-test.command13");

            // create mock menu sections
            const menuSectionCmd0 = { sectionMarker: "Menu-test.command10" };
            const menuSectionCmd2 = { sectionMarker: "Menu-test.command12" };

            const listSelector = "#menuitem-unittest1 > ul";

            // Add new menu to END of menuSectionCmd0
            // @ts-ignore
            let menuItem = menu.addMenuItem("Menu-test.command14", null, Menus.LAST_IN_SECTION, menuSectionCmd0);
            let $listItems = testWindow.$(listSelector).children();
            expect($listItems.length).toBe(6);
            expect($($listItems[2]).find("a#menuitem-unittest1-Menu-test\\.command14").length).toBe(1);

            // Add new menu to END of menuSectionCmd2
            menuItem = menu.addMenuItem("Menu-test.command15", null, Menus.LAST_IN_SECTION, menuSectionCmd2);
            $listItems = testWindow.$(listSelector).children();
            expect($listItems.length).toBe(7);
            expect($($listItems[6]).find("a#menuitem-unittest1-Menu-test\\.command15").length).toBe(1);

            // Add new menu to BEGINNING of menuSectionCmd0
            menuItem = menu.addMenuItem("Menu-test.command16", null, Menus.FIRST_IN_SECTION, menuSectionCmd0);
            $listItems = testWindow.$(listSelector).children();
            expect($listItems.length).toBe(8);
            expect($($listItems[0]).find("a#menuitem-unittest1-Menu-test\\.command16").length).toBe(1);

            // Add new menu to BEGINNING of menuSectionCmd2
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            menuItem = menu.addMenuItem("Menu-test.command17", null, Menus.FIRST_IN_SECTION, menuSectionCmd2);
            $listItems = testWindow.$(listSelector).children();
            expect($listItems.length).toBe(9);
            expect($($listItems[5]).find("a#menuitem-unittest1-Menu-test\\.command17").length).toBe(1);
        });

        it("should add new menu item in last position of menu if reference command isn't found in menu", function () {
            runs(function () {
                CommandManager.register("Brackets Test Command Custom 20", "Menu-test.command20", function () { /* Do nothing */ });
                const menu = Menus.addMenu("Custom 2", "menuitem-unittest2")!;
                menu.addMenuItem("Menu-test.command20", "Ctrl-Alt-0");
                const listSelector = "#menuitem-unittest2 > ul";

                // reference command doesn't exist
                CommandManager.register("Brackets Test Command Custom 21", "Menu-test.command21", function () { /* Do nothing */ });
                let menuItem = menu.addMenuItem("Menu-test.command21", "Ctrl-Alt-2", Menus.BEFORE, "NONEXISTANT");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                let $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(2);
                expect($($listItems[1]).find("a#menuitem-unittest2-Menu-test\\.command21").length).toBe(1);


                // reference command is in different menu
                CommandManager.register("Brackets Test Command Custom 22", "Menu-test.command22", function () { /* Do nothing */ });
                const menuOther = Menus.addMenu("Custom 2 Other", "menuitem-unittest2-other")!;
                menuOther.addMenuItem("Menu-test.command22", "Ctrl-Alt-2");

                CommandManager.register("Brackets Test Command Custom 23", "Menu-test.command23", function () { /* Do nothing */ });
                menuItem = menu.addMenuItem("Menu-test.command23", "Ctrl-Alt-3", Menus.BEFORE, "Menu-test.command22");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(3);
                expect($($listItems[2]).find("a#menuitem-unittest2-Menu-test\\.command23").length).toBe(1);


                // reference command exists, but isn't in any menu
                CommandManager.register("Brackets Test Command Custom 24", "Menu-test.command24", function () { /* Do nothing */ });
                CommandManager.register("Brackets Test Command Custom 25", "Menu-test.command25", function () { /* Do nothing */ });

                menuItem = menu.addMenuItem("Menu-test.command24", "Ctrl-Alt-1", Menus.BEFORE, "Menu-test.command25");
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(4);
                expect($($listItems[3]).find("a#menuitem-unittest2-Menu-test\\.command24").length).toBe(1);
            });
        });

        it("should not add menu item for these cases", function () {
            runs(function () {
                CommandManager.register("Brackets Test Command Custom 30", "Menu-test.command30", function () { /* Do nothing */ });
                const menu = Menus.addMenu("Custom 3", "menuitem-unittest3")!;
                const listSelector = "#menuitem-unittest3 > ul";
                let menuItem = menu.addMenuItem("Menu-test.command30");
                expect(menuItem).toBeTruthy();
                let $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);

                // duplicate command in a menu
                menuItem = menu.addMenuItem("Menu-test.command30");
                expect(menuItem).toBeFalsy();

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect(menuItem).toBeNull();


                // unregistered command
                menuItem = menu.addMenuItem("UNREGISTERED_COMMAND");
                expect(menuItem).toBe(null);

                $listItems = testWindow.$(listSelector).children();
                expect($listItems.length).toBe(1);
                expect(menuItem).toBeNull();
            });
        });
    });


    describe("Remove Menu Items", function () {

        function menuDOMChildren(menuItemId: string): JQuery {
            return testWindow.$("#" + menuItemId + " > ul").children();
        }

        it("should add then remove new menu item to empty menu with a command id", function () {
            runs(function () {
                const commandId = "Menu-test.removeMenuItem.command0";
                const menuItemId = "menu-test-removeMenuItem0";
                CommandManager.register("Brackets Test Command Custom", commandId, function () { /* Do nothing */ });
                const menu = Menus.addMenu("Custom", menuItemId)!;
                let $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);

                // Re-use commands that are already registered
                const menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                expect(typeof (commandId)).toBe("string");

                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(1);

                menu.removeMenuItem(commandId);
                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);
            });
        });

        it("should add then remove new menu item to empty menu with a command", function () {
            runs(function () {
                const commandId = "Menu-test.removeMenuItem.command1";
                const menuItemId = "menu-test-removeMenuItem1";
                CommandManager.register("Brackets Test Command Custom", commandId, function () { /* Do nothing */ });
                const menu = Menus.addMenu("Custom", menuItemId)!;
                let $listItems = testWindow.$("#menu-custom > ul").children();
                expect($listItems.length).toBe(0);

                // Re-use commands that are already registered
                const menuItem = menu.addMenuItem(commandId);
                expect(menuItem).toBeTruthy();
                expect(menuItem).toBeDefined();

                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(1);

                const command = CommandManager.get(commandId);
                expect(typeof (command)).toBe("object");

                menu.removeMenuItem(command);
                $listItems = menuDOMChildren(menuItemId);
                expect($listItems.length).toBe(0);
            });
        });

        it("should gracefully handle someone trying to delete a menu item that doesn't exist", function () {
            runs(function () {
                const commandId = "Menu-test.removeMenuItem.command2";
                const menuItemId = "menu-test-removeMenuItem2";
                const menu = Menus.addMenu("Custom", menuItemId)!;

                menu.removeMenuItem(commandId);
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should gracefully handle someone trying to delete nothing", function () {
            runs(function () {
                const menuItemId = "menu-test-removeMenuItem3";
                const menu = Menus.addMenu("Custom", menuItemId)!;

                // @ts-expect-error
                menu.removeMenuItem();
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should add then remove new menu item ensuring event listeners have also been detached", function () {
            runs(function () {
                const menuItemId = "menu-test-removeMenuItem4";
                const commandId = "Menu-test.removeMenuItem.command4";
                CommandManager.register("Brackets Test Command Custom", commandId, function () { /* Do nothing */ });
                const menu = Menus.addMenu("Custom", menuItemId)!;

                const command = CommandManager.get(commandId);
                command.on("nameChange", function () { /* Do nothing */ });
                expect(Object.keys((command as Listener)._eventHandlers!).length).toBe(1);
                expect((command as Listener)._eventHandlers!.nameChange.length).toBe(1);

                // @ts-expect-error
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const menuItem = menu.addMenuItem(commandId);
                expect(Object.keys((command as Listener)._eventHandlers!).length).toBe(5);
                expect((command as Listener)._eventHandlers!.nameChange.length).toBe(2);
                expect((command as Listener)._eventHandlers!.enabledStateChange.length).toBe(1);
                expect((command as Listener)._eventHandlers!.checkedStateChange.length).toBe(1);
                expect((command as Listener)._eventHandlers!.keyBindingAdded.length).toBe(1);
                expect((command as Listener)._eventHandlers!.keyBindingRemoved.length).toBe(1);

                // Check if attached events have been removed
                menu.removeMenuItem(command);
                expect(Object.keys((command as Listener)._eventHandlers!).length).toBe(1);
                expect((command as Listener)._eventHandlers!.nameChange.length).toBe(1);
                expect((command as Listener)._eventHandlers!.enabledStateChange).toBeUndefined();
                expect((command as Listener)._eventHandlers!.checkedStateChange).toBeUndefined();
                expect((command as Listener)._eventHandlers!.keyBindingAdded).toBeUndefined();
                expect((command as Listener)._eventHandlers!.keyBindingRemoved).toBeUndefined();

            });
        });
    });


    describe("Remove Menu Divider", function () {

        function menuDividerDOM(menuItemId: string): JQuery {
            return testWindow.$("#" + menuItemId);
        }

        it("should add then remove new menu divider to empty menu", function () {
            runs(function () {
                const menuId = "menu-custom-removeMenuDivider-1";
                const menu = Menus.addMenu("Custom", menuId)!;

                const menuDivider = menu.addMenuDivider();
                expect(menuDivider).toBeTruthy();

                let $listItems = menuDividerDOM(menuDivider!.id);
                expect($listItems.length).toBe(1);

                menu.removeMenuDivider(menuDivider!.id);
                $listItems = menuDividerDOM(menuDivider!.id);
                expect($listItems.length).toBe(0);
            });
        });

        it("should gracefully handle someone trying to remove a menu divider without supplying the id", function () {
            runs(function () {
                const menuId = "menu-custom-removeMenuDivider-2";
                const menu = Menus.addMenu("Custom", menuId)!;

                // @ts-expect-error
                menu.removeMenuDivider();
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should gracefully handle someone trying to remove a menu divider with an invalid id", function () {
            runs(function () {
                const menuId = "menu-custom-removeMenuDivider-3";
                const menu = Menus.addMenu("Custom", menuId)!;

                menu.removeMenuDivider("foo");
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should gracefully handle someone trying to remove a menu item that is not a divider", function () {
            runs(function () {
                const menuId = "menu-custom-removeMenuDivider-4";
                const menu = Menus.addMenu("Custom", menuId)!;
                const menuItemId = "menu-test-removeMenuDivider1";
                menu.addMenuItem(menuItemId);

                menu.removeMenuDivider(menuItemId);
                expect(menu).toBeTruthy();   // Verify that we got this far...
            });
        });
    });


    describe("Remove Menu", function () {

        function menuDOM(menuId: string): JQuery {
            return testWindow.$("#" + menuId);
        }

        it("should add then remove new menu to menu bar with a menu id", function () {
            runs(function () {
                const menuId = "Menu-test";
                Menus.addMenu("Custom", menuId);
                let $menu = menuDOM(menuId);
                expect($menu.length).toBe(1);

                Menus.removeMenu(menuId);
                $menu = menuDOM(menuId);
                expect($menu.length).toBe(0);
            });
        });

        it("should gracefully handle someone trying to remove a menu that doesn't exist", function () {
            runs(function () {
                const menuId = "Menu-test";

                Menus.removeMenu(menuId);
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });

        it("should gracefully handle someone trying to remove a menu without supplying the id", function () {
            runs(function () {
                // @ts-expect-error
                Menus.removeMenu();
                expect(Menus).toBeTruthy();   // Verify that we got this far...
            });
        });
    });


    describe("Context Submenus", function () {
        let menuId;
        let menu;
        let subMenuId;
        let subMenu;

        function parentMenuItemDOM(menuItemId: string): JQuery {
            return testWindow.$("#" + menuItemId);
        }

        function subMenuDOM(subMenuId: string): JQuery {
            return testWindow.$("#" + subMenuId);
        }

        function getBounds(object: JQuery): Bounds {
            return {
                left   : object.offset()!.left,
                top    : object.offset()!.top,
                right  : object.offset()!.left + object.width(),
                bottom : object.offset()!.top + object.height()
            };
        }

        function boundsInsideWindow(object: JQuery): boolean {
            const bounds = getBounds(object);
            return bounds.left   >= 0 &&
                    bounds.right  <= $(testWindow).width() &&
                    bounds.top    >= 0 &&
                    bounds.bottom <= $(testWindow).height();
        }

        it("open a context submenu", function () {
            runs(function () {
                let openEvent = false;

                menuId = "context-menu-custom-openSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-openSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 56", "Menu-test.command56", function () { /* Do nothing */ });
                subMenu.addMenuItem("Menu-test.command56");

                subMenu.on("beforeSubMenuOpen", function () {
                    openEvent = true;
                });

                subMenu.open();


                const $submenu = testWindow.$(".dropdown.open > ul");
                expect($submenu.length).toBe(1);

                expect(openEvent).toBeTruthy();

                subMenu.close();
            });
        });

        it("close a context submenu", function () {
            runs(function () {
                menuId = "context-menu-custom-closeSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-closeSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 58", "Menu-test.command58", function () { /* Do nothing */ });
                subMenu.addMenuItem("Menu-test.command58");

                subMenu.open();

                // verify dropdown is open
                let $submenu = testWindow.$(".dropdown.open");
                expect($submenu.length).toBe(1);

                // verify close event
                subMenu.close();

                // verify all dropdowns are closed
                $submenu = testWindow.$(".dropdown.open");
                expect($submenu.length).toBe(0);
            });
        });

        it("context submenu is not clipped", function () {
            runs(function () {
                let openEvent = false;

                menuId = "context-menu-custom-clipSubmenu-1";
                menu = Menus.registerContextMenu(menuId);

                subMenuId = "submenu-custom-clipSubmenu-1";
                subMenu = menu.addSubMenu("submenu", subMenuId);

                CommandManager.register("Brackets Test Command Custom 57", "Menu-test.command57", function () { /* Do nothing */ });
                subMenu.addMenuItem("Menu-test.command57");

                subMenu.on("beforeSubMenuOpen", function () {
                    openEvent = true;
                });

                subMenu.open();

                const $submenu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($submenu)).toBeTruthy();

                expect(openEvent).toBeTruthy();
            });
        });

        describe("Add a context submenu", function () {
            it("should add new context submenu", function () {
                runs(function () {
                    menuId = "context-menu-custom-addSubmenu-1";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-addSubmenu-1";
                    subMenu = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    // check if new submenu is empty
                    const children = testWindow.$("#submenu-custom-addSubmenu-1 > ul").children();
                    expect(children.length).toBe(0);
                });
            });
            it("should not add duplicate context submenu", function () {
                runs(function () {
                    menuId = "context-menu-custom-addSubmenu-2";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-addSubmenu-2";
                    subMenu = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    const subMenu2 = menu.addSubMenu("submenu", subMenuId);

                    expect(subMenu2).toBeFalsy();
                    expect(subMenu2).toBeNull();
                });
            });
        });

        describe("Remove a context submenu", function () {
            it("should add then remove new submenu to empty menu", function () {
                runs(function () {
                    menuId = "context-menu-custom-removeSubmenu-1";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "submenu-custom-removeSubmenu-1";
                    subMenu = menu.addSubMenu("submenu", subMenuId);
                    expect(subMenu).toBeTruthy();
                    expect(subMenu.parentMenuItem).toBeTruthy();

                    let $subMenu = subMenuDOM(subMenuId);
                    expect($subMenu.length).toBe(1);

                    let $parentMenuItem = parentMenuItemDOM(subMenu.parentMenuItem.id);
                    expect($parentMenuItem.length).toBe(1);

                    menu.removeSubMenu(subMenuId);
                    $subMenu = subMenuDOM(subMenuId);
                    expect($subMenu.length).toBe(0);

                    $parentMenuItem = parentMenuItemDOM(subMenu.parentMenuItem.id);
                    expect($parentMenuItem.length).toBe(0);
                });
            });

            it("should gracefully handle someone trying to remove a submenu that doesn't exist", function () {
                runs(function () {
                    menuId = "context-menu-custom-removeSubmenu-2";
                    menu = Menus.registerContextMenu(menuId);

                    subMenuId = "Menu-test";

                    menu.removeSubMenu(subMenuId);
                    expect(menu).toBeTruthy();
                });
            });

            it("should gracefully handle someone trying to remove a submenu without supplying the id", function () {
                runs(function () {
                    menuId = "context-menu-custom-removeSubmenu-3";
                    menu = Menus.registerContextMenu(menuId);

                    menu.removeSubMenu();
                    expect(menu).toBeTruthy();
                });
            });
        });
    });

    describe("Menu Item synchronizing", function () {

        it("should have same state as command", function () {
            runs(function () {

                // checked state
                const cmd = CommandManager.register("Brackets Test Command Custom 40", "Menu-test.command40", function () { /* Do nothing */ })!;
                expect(cmd).toBeTruthy();
                expect(cmd).toBeDefined();

                const menu = Menus.addMenu("Synchronizing Menu", "menuitem-unittest4")!;
                menu.addMenuItem("Menu-test.command40");
                let menuSelector = "#menuitem-unittest4-Menu-test\\.command40";

                // Verify menu is synced with command
                let $menuItem = testWindow.$(menuSelector);
                expect($($menuItem).hasClass("checked")).toBeFalsy();
                expect(cmd.getChecked()).toBeFalsy();

                // toggle command
                cmd.setChecked(true);
                expect(cmd.getChecked()).toBeTruthy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("checked")).toBeTruthy();

                // toggle command back
                cmd.setChecked(false);
                expect(cmd.getChecked()).toBeFalsy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("checked")).toBeFalsy();


                // enabled state
                $menuItem = testWindow.$(menuSelector);
                expect($($menuItem).hasClass("disabled")).toBeFalsy();

                // toggle command
                cmd.setEnabled(false);
                expect(cmd.getEnabled()).toBeFalsy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("disabled")).toBeTruthy();

                // toggle command back
                cmd.setEnabled(true);
                expect(cmd.getEnabled()).toBeTruthy();

                // Verify menu gets synced with command
                expect($($menuItem).hasClass("disabled")).toBeFalsy();


                // key bindings
                CommandManager.register("Brackets Test Command Custom 41", "Menu-test.command41", function () { /* Do nothing */ });
                menu.addMenuItem("Menu-test.command41", "Ctrl-9");
                menuSelector = "#menuitem-unittest4-Menu-test\\.command41";

                // Verify menu is synced with command
                $menuItem = testWindow.$(menuSelector);
                const $shortcut = $menuItem.find(".menu-shortcut");

                // verify key data instead of platform-specific labels
                if (testWindow.brackets.platform === "win") {
                    expect($shortcut.data("key")).toBe("Ctrl-9");
                } else if (testWindow.brackets.platform === "mac") {
                    expect($shortcut.data("key")).toBe("Cmd-9");
                }

                // change keyboard shortcut
                KeyBindingManager.addBinding("Menu-test.command41", "Alt-8");

                // verify updated keyboard shortcut
                expect($shortcut.data("key")).toBe("Alt-8");
            });
        });
    });


    describe("Context Menus", function () {
        it("register a context menu", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu50");

            // Add menu item via command id
            CommandManager.register("Brackets Test Command Custom 50", "Menu-test.command50", function () { /* Do nothing */ });
            let menuItem = cmenu.addMenuItem("Menu-test.command50");
            expect(menuItem).toBeTruthy();
            expect(cmenu).toBeTruthy();

            // Add menu item via command object
            const command = CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () { /* Do nothing */ })!;
            menuItem = cmenu.addMenuItem(command);
            expect(menuItem).toBeTruthy();

            // add positioned divider
            menuItem = cmenu.addMenuDivider(Menus.BEFORE, "Menu-test.command51");
            let $listItems = testWindow.$("#test-cmenu50 > ul").children();
            expect($listItems.length).toBe(3);
            expect($($listItems[1]).find("hr.divider").length).toBe(1);

            // add divider to end
            menuItem = cmenu.addMenuDivider();
            $listItems = testWindow.$("#test-cmenu50 > ul").children();
            expect($listItems.length).toBe(4);
            expect($($listItems[3]).find("hr.divider").length).toBe(1);

            // duplicate command in Menu
            menuItem = cmenu.addMenuItem("Menu-test.command50");
            expect(menuItem).toBeFalsy();

            // duplicate ids
            const cmenu2 = Menus.registerContextMenu("test-cmenu50");
            expect(cmenu2).toBeFalsy();
        });

        it("open a context menu", function () {
            runs(function () {
                let openEvent = false;
                const cmenu = Menus.registerContextMenu("test-cmenu51");
                CommandManager.register("Brackets Test Command Custom 51", "Menu-test.command51", function () { /* Do nothing */ });
                cmenu.addMenuItem("Menu-test.command51");

                cmenu.on("beforeContextMenuOpen", function () {
                    openEvent = true;
                });

                cmenu.open({pageX: 300, pageY: 250});
                const $menu = testWindow.$(".dropdown.open > ul");

                // all other drops downs should be closed
                expect($menu.length).toBe(1);

                // position is at correct location
                expect($menu.offset()!.left).toBe(300);
                expect($menu.offset()!.top).toBe(250);
                expect(openEvent).toBeTruthy();
            });
        });

        function getBounds(object: JQuery): Bounds {
            return {
                left   : object.offset()!.left,
                top    : object.offset()!.top,
                right  : object.offset()!.left + object.width(),
                bottom : object.offset()!.top + object.height()
            };
        }

        function boundsInsideWindow(object: JQuery): boolean {
            const bounds = getBounds(object);
            return bounds.left   >= 0 &&
                    bounds.right  <= $(testWindow).width() &&
                    bounds.top    >= 0 &&
                    bounds.bottom <= $(testWindow).height();
        }

        it("context menu is not clipped", function () {
            runs(function () {
                const cmenu = Menus.registerContextMenu("test-cmenu52");
                CommandManager.register("Brackets Test Command Custom 52", "Menu-test.command52", function () { /* Do nothing */ });
                cmenu.addMenuItem("Menu-test.command52");
                const winWidth = $(testWindow).width();
                const winHeight = $(testWindow).height();

                cmenu.open({pageX: 0, pageY: 0});
                let $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: winHeight, pageY: winWidth});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: 0, pageY: winWidth});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();

                cmenu.open({pageX: winHeight, pageY: 0});
                $menu = testWindow.$(".dropdown.open > ul");
                expect(boundsInsideWindow($menu)).toBeTruthy();
            });
        });

        it("close context menu", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu53");
            CommandManager.register("Brackets Test Command Custom 53", "Menu-test.command53", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command53");

            cmenu.open({pageX: 0, pageY: 0});

            // verify dropdown is open
            let $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(1);

            // verify close event
            cmenu.close();

            // verify context submenus are closed
            expect(cmenu.openSubMenu).toBeFalsy();

            // verify all dropdowns are closed
            $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(0);
        });

        it("close context menu using Esc key", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu54");
            CommandManager.register("Brackets Test Command Custom 54", "Menu-test.command54", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command54");

            cmenu.open({pageX: 0, pageY: 0});

            // verify dropdown is open
            let $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(1);

            // close the context menu by simulating Esc key
            const key = KeyEvent.DOM_VK_ESCAPE;
            const element = $menus[0];
            SpecRunnerUtils.simulateKeyEvent(key, "keydown", element);

            // verify all dropdowns are closed
            $menus = testWindow.$(".dropdown.open");
            expect($menus.length).toBe(0);
        });

        it("check for context menu to have the right status", function () {
            const cmenu = Menus.registerContextMenu("test-cmenu55");
            CommandManager.register("Brackets Test Command Custom 55", "Menu-test.command55", function () { /* Do nothing */ });
            cmenu.addMenuItem("Menu-test.command55");

            cmenu.open({pageX: 0, pageY: 0});

            // verify dropdown is open
            let isOpen = cmenu.isOpen();
            expect(isOpen).toBe(true);

            // verify close event
            cmenu.close();

            // verify all dropdowns are closed
            isOpen = cmenu.isOpen();
            expect(isOpen).toBe(false);
        });
    });
});
