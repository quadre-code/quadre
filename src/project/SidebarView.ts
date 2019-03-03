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

/**
 * The view that controls the showing and hiding of the sidebar.
 *
 * Although the sidebar view doesn't dispatch any events directly, it is a
 * resizable element (../utils/Resizer.js), which means it can dispatch Resizer
 * events.  For example, if you want to listen for the sidebar showing
 * or hiding itself, set up listeners for the corresponding Resizer events,
 * panelCollapsed and panelExpanded:
 *
 *      $("#sidebar").on("panelCollapsed", ...);
 *      $("#sidebar").on("panelExpanded", ...);
 */

import * as AppInit from "utils/AppInit";
import * as ProjectManager from "project/ProjectManager";
import * as WorkingSetView from "project/WorkingSetView";
import * as MainViewManager from "view/MainViewManager";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as Strings from "strings";
import * as Resizer from "utils/Resizer";
import * as _ from "thirdparty/lodash";
import { DispatcherEvents } from "utils/EventDispatcher";

// These vars are initialized by the htmlReady handler
// below since they refer to DOM elements
let $sidebar;
let $gearMenu;
let $splitViewMenu;
let $projectTitle;
let $projectFilesContainer;
let $workingSetViewsContainer;

/**
 * @private
 * Update project title when the project root changes
 */
function _updateProjectTitle() {
    let displayName = ProjectManager.getProjectRoot()!.name;
    const fullPath = ProjectManager.getProjectRoot()!.fullPath;

    if (displayName === "" && fullPath === "/") {
        displayName = "/";
    }

    $projectTitle.html(_.escape(displayName));
    $projectTitle.attr("title", fullPath);

    // Trigger a scroll on the project files container to
    // reposition the scroller shadows and avoid issue #2255
    $projectFilesContainer.trigger("scroll");
}

/**
 * Toggle sidebar visibility.
 */
export function toggle() {
    Resizer.toggle($sidebar);
}

/**
 * Show the sidebar.
 */
export function show() {
    Resizer.show($sidebar);
}

/**
 * Hide the sidebar.
 */
export function hide() {
    Resizer.hide($sidebar);
}

/**
 * Returns the visibility state of the sidebar.
 * @return {boolean} true if element is visible, false if it is not visible
 */
export function isVisible() {
    return Resizer.isVisible($sidebar);
}

/**
 * Update state of working set
 * @private
 */
function _updateWorkingSetState() {
    if (MainViewManager.getPaneCount() === 1 &&
            MainViewManager.getWorkingSetSize(MainViewManager.ACTIVE_PANE) === 0) {
        $workingSetViewsContainer.hide();
        $gearMenu.hide();
    } else {
        $workingSetViewsContainer.show();
        $gearMenu.show();
    }
}

/**
 * Update state of splitview and option elements
 * @private
 */
function _updateUIStates() {
    let spriteIndex;
    const ICON_CLASSES = ["splitview-icon-none", "splitview-icon-vertical", "splitview-icon-horizontal"];
    const layoutScheme = MainViewManager.getLayoutScheme();

    if (layoutScheme.columns > 1) {
        spriteIndex = 1;
    } else if (layoutScheme.rows > 1) {
        spriteIndex = 2;
    } else {
        spriteIndex = 0;
    }

    // SplitView Icon
    $splitViewMenu.removeClass(ICON_CLASSES.join(" "))
        .addClass(ICON_CLASSES[spriteIndex]);

    // SplitView Menu
    _cmdSplitNone.setChecked(spriteIndex === 0);
    _cmdSplitVertical.setChecked(spriteIndex === 1);
    _cmdSplitHorizontal.setChecked(spriteIndex === 2);

    // Options icon
    _updateWorkingSetState();
}

/**
 * Handle No Split Command
 * @private
 */
function _handleSplitViewNone() {
    MainViewManager.setLayoutScheme(1, 1);
}

/**
 * Handle Vertical Split Command
 * @private
 */
function _handleSplitViewVertical() {
    MainViewManager.setLayoutScheme(1, 2);
}

/**
 * Handle Horizontal Split Command
 * @private
 */
function _handleSplitViewHorizontal() {
    MainViewManager.setLayoutScheme(2, 1);
}

// Initialize items dependent on HTML DOM
AppInit.htmlReady(function () {
    $sidebar                  = $("#sidebar");
    $gearMenu                 = $sidebar.find(".working-set-option-btn");
    $splitViewMenu            = $sidebar.find(".working-set-splitview-btn");
    $projectTitle             = $sidebar.find("#project-title");
    $projectFilesContainer    = $sidebar.find("#project-files-container");
    $workingSetViewsContainer = $sidebar.find("#working-set-list-container");

    // init
    $sidebar.on("panelResizeStart", function (evt, width) {
        $sidebar.find(".sidebar-selection-extension").css("display", "none");
        $sidebar.find(".scroller-shadow").css("display", "none");
    });

    $sidebar.on("panelResizeUpdate", function (evt, width) {
        ProjectManager._setFileTreeSelectionWidth(width);
    });

    $sidebar.on("panelResizeEnd", function (evt, width) {
        $sidebar.find(".sidebar-selection-extension").css("display", "block").css("left", width);
        $sidebar.find(".scroller-shadow").css("display", "block");
        $projectFilesContainer.triggerHandler("scroll");
        WorkingSetView.syncSelectionIndicator();
    });

    $sidebar.on("panelCollapsed", function (evt, width) {
        CommandManager.get(Commands.VIEW_HIDE_SIDEBAR).setName(Strings.CMD_SHOW_SIDEBAR);
    });

    $sidebar.on("panelExpanded", function (evt, width) {
        WorkingSetView.refresh();
        $sidebar.find(".scroller-shadow").css("display", "block");
        $sidebar.find(".sidebar-selection-extension").css("left", width);
        $projectFilesContainer.triggerHandler("scroll");
        WorkingSetView.syncSelectionIndicator();
        CommandManager.get(Commands.VIEW_HIDE_SIDEBAR).setName(Strings.CMD_HIDE_SIDEBAR);
    });

    // AppInit.htmlReady in utils/Resizer executes before, so it's possible that the sidebar
    // is collapsed before we add the event. Check here initially
    if (!$sidebar.is(":visible")) {
        $sidebar.trigger("panelCollapsed");
    }

    // wire up an event handler to monitor when panes are created
    (MainViewManager as unknown as DispatcherEvents).on("paneCreate", function (evt, paneId) {
        WorkingSetView.createWorkingSetViewForPane($workingSetViewsContainer, paneId);
    });

    (MainViewManager as unknown as DispatcherEvents).on("paneLayoutChange", function () {
        _updateUIStates();
    });

    (MainViewManager as unknown as DispatcherEvents).on("workingSetAdd workingSetAddList workingSetRemove workingSetRemoveList workingSetUpdate", function () {
        _updateWorkingSetState();
    });

    // create WorkingSetViews for each pane already created
    _.forEach(MainViewManager.getPaneIdList(), function (paneId) {
        WorkingSetView.createWorkingSetViewForPane($workingSetViewsContainer, paneId);
    });

    _updateUIStates();

    // Tooltips
    $gearMenu.attr("title", Strings.GEAR_MENU_TOOLTIP);
    $splitViewMenu.attr("title", Strings.SPLITVIEW_MENU_TOOLTIP);
});

(ProjectManager as unknown as DispatcherEvents).on("projectOpen", _updateProjectTitle);

/**
 * Register Command Handlers
 */
const _cmdSplitNone       = CommandManager.register(Strings.CMD_SPLITVIEW_NONE,       Commands.CMD_SPLITVIEW_NONE,       _handleSplitViewNone)!;
const _cmdSplitVertical   = CommandManager.register(Strings.CMD_SPLITVIEW_VERTICAL,   Commands.CMD_SPLITVIEW_VERTICAL,   _handleSplitViewVertical)!;
const _cmdSplitHorizontal = CommandManager.register(Strings.CMD_SPLITVIEW_HORIZONTAL, Commands.CMD_SPLITVIEW_HORIZONTAL, _handleSplitViewHorizontal)!;

CommandManager.register(Strings.CMD_TOGGLE_SIDEBAR, Commands.VIEW_HIDE_SIDEBAR, toggle);
CommandManager.register(Strings.CMD_SHOW_SIDEBAR, Commands.SHOW_SIDEBAR, show);
CommandManager.register(Strings.CMD_HIDE_SIDEBAR, Commands.HIDE_SIDEBAR, hide);