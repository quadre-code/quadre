/*
 * Copyright (c) 2014 - 2017 Adobe Systems Incorporated. All rights reserved.
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
 * WorkingSetView generates the UI for the list of the files user is editing based on the model provided by EditorManager.
 * The UI allows the user to see what files are open/dirty and allows them to close files and specify the current editor.
 *
 */

// Load dependent modules
import * as AppInit from "utils/AppInit";
import * as DocumentManager from "document/DocumentManager";
import * as MainViewManager from "view/MainViewManager";
import * as CommandManager from "command/CommandManager";
import * as Commands from "command/Commands";
import * as Menus from "command/Menus";
import * as FileViewController from "project/FileViewController";
import * as ViewUtils from "utils/ViewUtils";
import * as KeyEvent from "utils/KeyEvent";
import * as paneListTemplate from "text!htmlContent/working-set.html";
import * as Strings from "strings";
import * as _ from "thirdparty/lodash";
import * as Mustache from "thirdparty/mustache/mustache";
import { DispatcherEvents } from "utils/EventDispatcher";

interface ViewMap {
    [key: string]: WorkingSetView;
}

interface HitTest {
    where: HitTestWhere;
    which?: JQuery;
}

interface ClassProviderData {
    name: string;
    fullPath: string;
    isFile: boolean;
}
type ClassProvider = (ClassProviderData) => string;

interface IconProviderData {
    name: string;
    fullPath: string;
    isFile: boolean;
}
type IconProvider = (IconProviderData) => string | JQuery | HTMLElement;

/**
 * Open view dictionary
 * Maps PaneId to WorkingSetView
 * @private
 * @type {Object.<string, WorkingSetView>}
 */
const _views: ViewMap = {};

/**
 * Icon Providers
 * @see {@link #addIconProvider}
 * @private
 */
const _iconProviders: Array<IconProvider> = [];

/**
 * Class Providers
 * @see {@link #addClassProvider}
 * @private
 */
const _classProviders: Array<ClassProvider> = [];


/**
 * #working-set-list-container
 * @type {jQuery}
 */
let $workingFilesContainer;

/**
 * Constants for event.which values
 * @enum {number}
 */
const LEFT_BUTTON = 1;
const MIDDLE_BUTTON = 2;

/**
 * Each list item in the working set stores a references to the related document in the list item's data.
 *  Use `listItem.data(_FILE_KEY)` to get the document reference
 * @type {string}
 * @private
 */
const _FILE_KEY = "file";

/**
 * Constants for hitTest.where
 * @enum {string}
 */
enum HitTestWhere {
    NOMANSLAND = "nomansland",
    NOMOVEITEM = "nomoveitem",
    ABOVEITEM  = "aboveitem",
    BELOWITEM  = "belowitem",
    TOPSCROLL  = "topscroll",
    BOTSCROLL  = "bottomscroll",
    BELOWVIEW  = "belowview",
    ABOVEVIEW  = "aboveview",
}

/**
 * Drag an item has to move 3px before dragging starts
 * @constant
 */
const _DRAG_MOVE_DETECTION_START = 3;

/**
 * Refreshes all Pane View List Views
 */
export function refresh(rebuild?) {
    _.forEach(_views, function (view) {
        const top = view.$openFilesContainer.scrollTop();
        if (rebuild) {
            view._rebuildViewList(true);
        } else {
            view._redraw();
        }
        view.$openFilesContainer.scrollTop(top);
    });
}

/**
 * Synchronizes the selection indicator for all views
 */
export function syncSelectionIndicator() {
    _.forEach(_views, function (view) {
        view.$openFilesContainer.triggerHandler("scroll");
    });
}

/**
 * Updates the appearance of the list element based on the parameters provided.
 * @private
 * @param {!HTMLLIElement} listElement
 * @param {?File} selectedFile
 */
function _updateListItemSelection(listItem, selectedFile) {
    const shouldBeSelected = (selectedFile && $(listItem).data(_FILE_KEY).fullPath === selectedFile.fullPath);
    ViewUtils.toggleClass($(listItem), "selected", shouldBeSelected);
}

/**
 * Determines if a file is dirty
 * @private
 * @param {!File} file - file to test
 * @return {boolean} true if the file is dirty, false otherwise
 */
function _isOpenAndDirty(file) {
    // working set item might never have been opened; if so, then it's definitely not dirty
    const docIfOpen = DocumentManager.getOpenDocumentForPath(file.fullPath);
    return (docIfOpen && docIfOpen.isDirty);
}


function _hasSelectionFocus() {
    return FileViewController.getFileSelectionFocus() === FileViewController.WORKING_SET_VIEW;
}

/**
 * Turns on/off the flag which suppresses rebuilding of the working set
 * when the "workingSetSort" event is dispatched from MainViewManager.
 * Only used while dragging things around in the working set to disable
 * rebuilding the list while dragging.
 * @private
 * @param {boolean} suppress - true suppress, false to allow sort redrawing
 */
function _suppressSortRedrawForAllViews(suppress) {
    _.forEach(_views, function (view) {
        view.suppressSortRedraw = suppress;
    });
}

/**
 * turns off the scroll shadow on view containers so they don't interfere with dragging
 * @private
 * @param {Boolean} disable - true to disable, false to enable
 */
function _suppressScrollShadowsOnAllViews(disable) {
    _.forEach(_views, function (view) {
        if (disable) {
            ViewUtils.removeScrollerShadow(view.$openFilesContainer[0], null);
        } else if (view.$openFilesContainer[0].scrollHeight > view.$openFilesContainer[0].clientHeight) {
            ViewUtils.addScrollerShadow(view.$openFilesContainer[0], null, true);
        }
    });
}

/**
 * Deactivates all views so the selection marker does not show
 * @private
 * @param {Boolean} deactivate - true to deactivate, false to reactivate
 */
function _deactivateAllViews(deactivate) {
    _.forEach(_views, function (view) {
        if (deactivate) {
            if (view.$el.hasClass("active")) {
                view.$el.removeClass("active").addClass("reactivate");
                view.$openFilesList.trigger("selectionHide");
            }
        } else {
            if (view.$el.hasClass("reactivate")) {
                view.$el.removeClass("reactivate").addClass("active");
            }
            // don't update the scroll pos
            view._fireSelectionChanged(false);
        }
    });
}

/**
 * Finds the WorkingSetView object for the specified element
 * @private
 * @param {jQuery} $el - the element to find the view for
 * @return {View} view object
 */
function _viewFromEl($el) {
    if (!$el.hasClass("working-set-view")) {
        $el = $el.parents(".working-set-view");
    }

    const id = $el.attr("id").match(/working-set-list-([\w]+[\w\d\-.:_]*)/).pop();
    return _views[id];
}

/**
 * Makes the specified element draggable
 * @private
 * @param {jQuery} $el - the element to make draggable
 */
function _makeDraggable($el) {
    let interval;
    const sourceFile = $el.data(_FILE_KEY);

    // turn off the "hover-scroll"
    function endScroll($el) {
        if (interval) {
            window.clearInterval(interval);
            interval = undefined;
        }
    }

    //  We scroll the list while hovering over the first or last visible list element
    //  in the working set, so that positioning a working set item before or after one
    //  that has been scrolled out of view can be performed.
    //
    //  This function will call the drag interface repeatedly on an interval to allow
    //  the item to be dragged while scrolling the list until the mouse is moved off
    //  the first or last item or endScroll is called
    function scroll($container, $el, dir, callback) {
        const container = $container[0];
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (maxScroll && dir && !interval) {
            // Scroll view if the mouse is over the first or last pixels of the container
            interval = window.setInterval(function () {
                const scrollTop = $container.scrollTop();
                if ((dir === -1 && scrollTop <= 0) || (dir === 1 && scrollTop >= maxScroll)) {
                    endScroll($el);
                } else {
                    $container.scrollTop(scrollTop + 7 * dir);
                    callback($el);
                }
            }, 50);
        }
    }

    // The mouse down handler pretty much handles everything
    $el.mousedown(function (e) {
        let scrollDir = 0;
        let dragged = false;
        const startPageY = e.pageY;
        let lastPageY = startPageY;
        let lastHit: HitTest = { where: HitTestWhere.NOMANSLAND };
        const tryClosing = $(e.target).hasClass("can-close");
        const currentFile = MainViewManager.getCurrentlyViewedFile();
        const activePaneId = MainViewManager.getActivePaneId()!;
        const activeView = _views[activePaneId];
        const sourceView = _viewFromEl($el);
        let currentView = sourceView;
        const startingIndex = $el.index();
        let itemHeight;
        let offset;
        let $copy;
        let $ghost;
        let draggingCurrentFile;

        function initDragging() {
            itemHeight = $el.height();
            offset = $el.offset();
            $copy = $el.clone();
            $ghost = $("<div class='open-files-container wsv-drag-ghost' style='overflow: hidden; display: inline-block;'>").append($("<ul>").append($copy).css("padding", "0"));
            draggingCurrentFile = ($el.hasClass("selected") && sourceView.paneId === activePaneId);

            // setup our ghost element as position absolute
            //  so we can put it wherever we want to while dragging
            if (draggingCurrentFile && _hasSelectionFocus()) {
                $ghost.addClass("dragging-current-file");
            }

            $ghost.css({
                top: offset.top,
                left: offset.left,
                width: $el.width() + 8
            });

            // this will give the element the appearence that it's ghosted if the user
            //  drags the element out of the view and goes off into no mans land
            $ghost.appendTo($("body"));
        }

        // Switches the view context to match the hit context
        function updateContext(hit) {
            // just set the container and update
            currentView = _viewFromEl(hit.which);
        }

        // Determines where the mouse hit was
        function hitTest(e) {
            let pageY = $ghost.offset().top;
            const direction =  e.pageY - lastPageY;
            let result: HitTest = {
                where: HitTestWhere.NOMANSLAND
            };
            let lookCount = 0;
            let hasScroller = false;
            let onTopScroller = false;
            let onBottomScroller = false;
            let $container;
            let $hit;
            let $item;
            let $view;
            let containerOffset;
            let scrollerTopArea;
            let scrollerBottomArea;

            // if the mouse is outside of the view then
            //  return nomansland -- this prevents some UI glitches
            //  that appear when dragging onto a second monitor
            if (e.pageX < 0 || e.pageX > $workingFilesContainer.width()) {
                return result;
            }

            do {
                // Turn off the ghost so elementFromPoint ignores it
                $ghost.hide();

                $hit = $(window.document.elementFromPoint(e.pageX, pageY)!);
                $view = $hit.closest(".working-set-view");
                $item = $hit.closest("#working-set-list-container li");

                // Show the ghost again
                $ghost.show();

                $container = $view.children(".open-files-container");

                if ($container.length) {
                    containerOffset = $container.offset();

                    // Compute "scrollMe" regions
                    scrollerTopArea = { top: containerOffset.top - 14,
                        bottom: containerOffset.top + 7};

                    scrollerBottomArea = { top: containerOffset.top + $container.height() - 7,
                        bottom: containerOffset.top + $container.height() + 14};
                }

                // If we hit ourself then look for another
                //  element to insert before/after
                if ($item[0] === $el[0]) {
                    if (direction > 0) {
                        $item = $item.next();
                        if ($item.length) {
                            pageY += itemHeight;
                        }
                    } else {
                        $item = $item.prev();
                        if ($item.length) {
                            pageY -= itemHeight;
                        }
                    }
                }

                // If we didn't hit anything then
                //  back up and try again in the other direction
                if (!$item.length) {
                    pageY += itemHeight;
                }

                // look one more time below the mouse
                //  if we didn't get a hit
            } while (!$item.length && ++lookCount < 2);

            // if we hit a span or an anchor tag and didn't
            //  find an item then force the selection hit to
            //  the item so we can bail out on the scrollMe
            //  region at the top and bottom of the list
            if ($item.length === 0 && ($hit.is("a") || $hit.is("span"))) {
                $item = $hit.parents("#working-set-list-container li");
            }

            // compute ghost location, we compute the insertion point based
            //  on where the ghost is, not where the  mouse is
            const gTop = $ghost.offset().top;
            const gHeight = $ghost.height();
            const gBottom = gTop + gHeight;
            // @ts-ignore
            const deltaY = pageY - e.pageY; // eslint-disable-line @typescript-eslint/no-unused-vars

            // data to help us determine if we have a scroller
            hasScroller = $item.length && $container.length && $container[0].scrollHeight > $container[0].clientHeight;

            // data to help determine if the ghost is in either of the scrollMe regions
            onTopScroller = hasScroller && scrollerTopArea && ((gTop >= scrollerTopArea.top && gTop <= scrollerTopArea.bottom)  ||
                                                (gBottom >= scrollerTopArea.top && gBottom <= scrollerTopArea.bottom));
            onBottomScroller = hasScroller && scrollerBottomArea && ((gTop >= scrollerBottomArea.top && gTop <= scrollerBottomArea.bottom) ||
                                                     (gBottom >= scrollerBottomArea.top && gBottom <= scrollerBottomArea.bottom));


            // helpers
            function mouseIsInTopHalf($elem) {
                const top = $elem.offset().top;
                const height = $elem.height();

                return (pageY < top + (height / 2));
            }

            function ghostIsAbove($elem) {
                const top = $elem.offset().top;
                let checkVal = gTop;

                if (direction > 0) {
                    checkVal += gHeight;
                }

                return (checkVal <=  (top + (itemHeight / 2)));
            }

            function ghostIsBelow($elem) {
                const top = $elem.offset().top;
                let checkVal = gTop;

                if (direction > 0) {
                    checkVal += gHeight;
                }

                return (checkVal >= (top + (itemHeight / 2)));
            }

            function elIsClearBelow($a, $b) {
                const aTop = $a.offset().top;
                const bTop = $b.offset().top;

                return (aTop >= bTop + $b.height());
            }

            function draggingBelowWorkingSet() {
                return ($hit.length === 0 || elIsClearBelow($hit, $workingFilesContainer));
            }

            function targetIsContainer() {
                return ($hit.is(".working-set-view") ||
                        $hit.is(".open-files-container") ||
                        ($hit.is("ul") && $hit.parent().is(".open-files-container")));
            }

            function targetIsNoDrop() {
                return $hit.is(".working-set-header") ||
                       $hit.is(".working-set-header-title") ||
                       $hit.is(".scroller-shadow") ||
                       $hit.is(".scroller-shadow");
            }

            function findViewFor($elem) {
                if ($elem.is(".working-set-view")) {
                    return $elem;
                }
                return $elem.parents(".working-set-view");
            }

            if ($item.length) {
                // We hit an item (li)
                if (onTopScroller && (direction <= 0 || lastHit.where === HitTestWhere.TOPSCROLL)) {
                    result = {
                        where: HitTestWhere.TOPSCROLL,
                        which: $item
                    };
                } else if (onBottomScroller && (direction >= 0 || lastHit.where === HitTestWhere.BOTSCROLL)) {
                    result = {
                        where: HitTestWhere.BOTSCROLL,
                        which: $item
                    };
                } else if (ghostIsAbove($item)) {
                    result = {
                        where: HitTestWhere.ABOVEITEM,
                        which: $item
                    };
                } else if (ghostIsBelow($item)) {
                    result = {
                        where: HitTestWhere.BELOWITEM,
                        which: $item
                    };
                }
            } else if ($el.parent()[0] !== $hit[0]) {
                // Didn't hit an li, figure out
                //  where to go from here
                $view = $el.parents(".working-set-view");

                if (targetIsNoDrop()) {
                    if (direction < 0) {
                        if (ghostIsBelow($hit)) {
                            return result;
                        }
                    } else {
                        return result;
                    }
                }

                if (draggingBelowWorkingSet()) {
                    return result;
                }

                if (targetIsContainer()) {
                    if (mouseIsInTopHalf($hit)) {
                        result = {
                            where: HitTestWhere.ABOVEVIEW,
                            which: findViewFor($hit)
                        };
                    } else {
                        result = {
                            where: HitTestWhere.BELOWVIEW,
                            which: findViewFor($hit)
                        };
                    }
                    return result;
                }

                // Data to determine to help determine if we should
                //  append to the previous or prepend to the next
                const $prev = $view.prev();
                const $next = $view.next();

                if (direction < 0) {
                    // moving up, if there is a view above
                    //  then we want to append to the view above
                    // otherwise we're in nomandsland
                    if ($prev.length) {
                        result = {
                            where: HitTestWhere.BELOWVIEW,
                            which: $prev
                        };
                    }
                } else if (direction > 0) {
                    // moving down, if there is a view below
                    // then we want to append to the view below
                    //  otherwise we're in nomandsland
                    if ($next.length) {
                        result = {
                            where: HitTestWhere.ABOVEVIEW,
                            which: $next
                        };
                    }
                } else if (mouseIsInTopHalf($view)) {
                    // we're inside the top half of
                    //  a view so prepend to the view we hit
                    result = {
                        where: HitTestWhere.ABOVEVIEW,
                        which: $view
                    };
                } else {
                    // we're inside the bottom half of
                    //  a view so append to the view we hit
                    result = {
                        where: HitTestWhere.BELOWVIEW,
                        which: $view
                    };
                }
            } else {
                // The item doesn't need updating
                result = {
                    where: HitTestWhere.NOMOVEITEM,
                    which: $hit
                };
            }

            return result;
        }

        // mouse move handler -- this pretty much does
        //  the heavy lifting for dragging the item around
        $(window).on("mousemove.wsvdragging", function (e) {
            // The drag function
            function drag(e) {
                if (!dragged) {
                    initDragging();
                    // sort redraw and scroll shadows
                    //  cause problems during drag so disable them
                    _suppressSortRedrawForAllViews(true);
                    _suppressScrollShadowsOnAllViews(true);

                    // remove the "active" class to remove the
                    //  selection indicator so we don't have to
                    //  keep it in sync while we're dragging
                    _deactivateAllViews(true);

                    // add a "dragging" class to the outer container
                    $workingFilesContainer.addClass("dragging");

                    // add a class to the element we're dragging if
                    //  it's the currently selected file so that we
                    //  can show it as selected while dragging
                    if (!draggingCurrentFile && FileViewController.getFileSelectionFocus() === FileViewController.WORKING_SET_VIEW) {
                        $(activeView._findListItemFromFile(currentFile)!).addClass("drag-show-as-selected");
                    }

                    // we've dragged the item so set
                    //  dragged to true so we don't try and open it
                    dragged = true;
                }

                // reset the scrolling direction to no-scroll
                scrollDir = 0;

                // Find out where to to drag it to
                lastHit = hitTest(e);

                // if the drag goes into nomansland then
                //  drop the opacity on the drag affordance
                //  and show the inserted item at reduced opacity
                switch (lastHit.where) {
                    case HitTestWhere.NOMANSLAND:
                    case HitTestWhere.BELOWVIEW:
                    case HitTestWhere.ABOVEVIEW:
                        $el.css({opacity: ".75"});
                        $ghost.css("opacity", ".25");
                        break;
                    default:
                        $el.css({opacity: ".0001"});
                        $ghost.css("opacity", "");
                        break;
                }

                // now do the insertion
                switch (lastHit.where) {
                    case HitTestWhere.TOPSCROLL:
                    case HitTestWhere.ABOVEITEM:
                        if (lastHit.where === HitTestWhere.TOPSCROLL) {
                            scrollDir = -1;
                        }
                        $el.insertBefore(lastHit.which);
                        updateContext(lastHit);
                        break;
                    case HitTestWhere.BOTSCROLL:
                    case HitTestWhere.BELOWITEM:
                        if (lastHit.where === HitTestWhere.BOTSCROLL) {
                            scrollDir = 1;
                        }
                        $el.insertAfter(lastHit.which);
                        updateContext(lastHit);
                        break;
                    case HitTestWhere.BELOWVIEW:
                        $el.appendTo(lastHit.which!.find("ul"));
                        updateContext(lastHit);
                        break;
                    case HitTestWhere.ABOVEVIEW:
                        $el.prependTo(lastHit.which!.find("ul"));
                        updateContext(lastHit);
                        break;
                }

                // we need to scroll
                if (scrollDir) {
                    // we're in range to scroll
                    scroll(currentView.$openFilesContainer, $el, scrollDir, function () {
                        // as we scroll, recompute the element and insert
                        //  it before/after the item to drag it in to place
                        drag(e);
                    });
                } else {
                    // we've moved away from the top/bottom "scrolling" region
                    endScroll($el);
                }
            }

            // Reposition the drag affordance if we've started dragging
            if ($ghost) {
                $ghost.css("top", $ghost.offset().top + (e.pageY - lastPageY));
            }

            // if we have't started dragging yet then we wait until
            //  the mouse has moved 3 pixels before we start dragging
            //  to avoid the item moving when clicked or double clicked
            if (dragged || Math.abs(e.pageY - startPageY) > _DRAG_MOVE_DETECTION_START) {
                drag(e);
            }

            lastPageY = e.pageY;
            e.stopPropagation();
        });


        function scrollCurrentViewToBottom() {
            const $container = currentView.$openFilesContainer;
            const container = $container[0];
            const maxScroll = container.scrollHeight - container.clientHeight;

            if (maxScroll) {
                $container.scrollTop(maxScroll);
            }
        }

        // Close down the drag operation
        function preDropCleanup() {
            window.onmousewheel = (window.document as any).onmousewheel = null;
            $(window).off(".wsvdragging");
            if (dragged) {
                $workingFilesContainer.removeClass("dragging");
                $workingFilesContainer.find(".drag-show-as-selected").removeClass("drag-show-as-selected");
                endScroll($el);
                // re-activate the views (adds the "active" class to the view that was previously active)
                _deactivateAllViews(false);
                // turn scroll wheel back on
                $ghost.remove();
                $el.css("opacity", "");

                if ($el.next().length === 0) {
                    scrollCurrentViewToBottom();
                }
            }
        }

        // Final Cleanup
        function postDropCleanup(noRefresh?) {
            if (dragged) {
                // re-enable stuff we turned off
                _suppressSortRedrawForAllViews(false);
                _suppressScrollShadowsOnAllViews(false);
            }

            // we don't need to refresh if the item
            //  was dragged but not enough to not change
            //  its order in the working set
            if (!noRefresh) {
                // rebuild the view
                refresh(true);
            }
            // focus the editor
            MainViewManager.focusActivePane();
        }

        // Drop
        function drop() {
            preDropCleanup();
            if (sourceView.paneId === currentView.paneId && startingIndex === $el.index()) {
                // if the item was dragged but not moved then don't open or close
                if (!dragged) {
                    // Click on close icon, or middle click anywhere - close the item without selecting it first
                    if (tryClosing || e.which === MIDDLE_BUTTON) {
                        CommandManager
                            .execute(Commands.FILE_CLOSE, {file: sourceFile,
                                paneId: sourceView.paneId})
                            .always(function () {
                                postDropCleanup();
                            });
                    } else {
                        // Normal right and left click - select the item
                        FileViewController.setFileViewFocus(FileViewController.WORKING_SET_VIEW);
                        CommandManager
                            .execute(Commands.FILE_OPEN, {fullPath: sourceFile.fullPath,
                                paneId: currentView.paneId})
                            .always(function () {
                                postDropCleanup();
                            });
                    }
                } else {
                    // no need to refresh
                    postDropCleanup(true);
                }
            } else if (sourceView.paneId === currentView.paneId) {
                // item was reordered
                MainViewManager._moveWorkingSetItem(sourceView.paneId, startingIndex, $el.index());
                postDropCleanup();
            } else {
                // If the same doc view is present in the destination pane prevent drop
                if (!MainViewManager._getPane(currentView.paneId)!.getViewForPath(sourceFile.fullPath)) {
                    // item was dragged to another working set
                    MainViewManager._moveView(sourceView.paneId, currentView.paneId, sourceFile, $el.index())
                        .always(function () {
                            // if the current document was dragged to another working set
                            //  then reopen it to make it the currently selected file
                            if (draggingCurrentFile) {
                                CommandManager
                                    .execute(Commands.FILE_OPEN, {fullPath: sourceFile.fullPath,
                                        paneId: currentView.paneId})
                                    .always(function () {
                                        postDropCleanup();
                                    });
                            } else {
                                postDropCleanup();
                            }
                        });
                } else {
                    postDropCleanup();
                }
            }
        }

        // prevent working set from grabbing focus no matter what type of click/drag occurs
        e.preventDefault();

        // initialization
        $(window).on("mouseup.wsvdragging", function () {
            drop();
        });

        // let escape cancel the drag
        $(window).on("keydown.wsvdragging", function (e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                preDropCleanup();
                postDropCleanup();
                e.stopPropagation();
            }
        });

        // turn off scroll wheel
        window.onmousewheel = (window.document as any).onmousewheel = function (e) {
            e.preventDefault();
        };

        // close all menus, and disable sorting
        Menus.closeAll();

        // Dragging only happens with the left mouse button
        //  or (on the Mac) when the ctrl key isn't pressed
        if (e.which !== LEFT_BUTTON || (e.ctrlKey && brackets.platform === "mac")) {
            drop();
            return;
        }


        e.stopPropagation();
    });
}

/*
 * WorkingSetView constructor
 * @constructor
 * @param {!jQuery} $container - owning container
 * @param {!string} paneId - paneId of this view pertains to
 */
class WorkingSetView {
    public $header: JQuery | null;
    private $openFilesList: JQuery | null;
    public $container: JQuery;
    private $el: JQuery;
    private suppressSortRedraw: boolean;
    public paneId: string;

    public $openFilesContainer: JQuery;
    private $workingSetListViewHeader: JQuery;

    constructor($container: JQuery, paneId: string) {
        const id = "working-set-list-" + paneId;

        this.$header = null;
        this.$openFilesList = null;
        this.$container = $container;
        this.$el = $container.append(Mustache.render(paneListTemplate, _.extend({id: id}, Strings))).find("#" + id);
        this.suppressSortRedraw = false;
        this.paneId = paneId;

        this.init();
    }

    /*
    * Hides or shows the WorkingSetView
    */
    private _updateVisibility() {
        const fileList = MainViewManager.getWorkingSet(this.paneId);
        if (MainViewManager.getPaneCount() === 1 && (!fileList || fileList.length === 0)) {
            this.$openFilesContainer.hide();
            this.$workingSetListViewHeader.hide();
        } else {
            this.$openFilesContainer.show();
            this.$workingSetListViewHeader.show();
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /*
    * paneLayoutChange event listener
    * @private
    */
    private _handlePaneLayoutChange() {
        const $titleEl = this.$el.find(".working-set-header-title");
        let title = Strings.WORKING_FILES;

        this._updateVisibility();

        if (MainViewManager.getPaneCount() > 1) {
            title = MainViewManager.getPaneTitle(this.paneId);
        }

        $titleEl.text(title);
    }

    /**
     * Finds the listItem item assocated with the file. Returns null if not found.
     * @private
     * @param {!File} file
     * @return {HTMLLIItem} returns the DOM element of the item. null if one could not be found
     */
    public _findListItemFromFile(file): JQuery | null {
        let result: JQuery | null = null;

        if (file) {
            const items = this.$openFilesContainer.find("ul").children();
            items.each(function (this: any) {
                const $listItem = $(this);
                if ($listItem.data(_FILE_KEY).fullPath === file.fullPath) {
                    result = $listItem;
                    return false; // breaks each
                }

                return undefined;
            });
        }

        return result;
    }

    /*
    * creates a name that is namespaced to this pane
    * @param {!string} name - name of the event to create.
    * use an empty string to get just the event name to turn off all events in the namespace
    * @private
    */
    private _makeEventName(name) {
        return name + ".paneList" + this.paneId;
    }

    /**
     * Scrolls the selected file into view
     * @private
     */
    private _scrollSelectedFileIntoView() {
        if (!_hasSelectionFocus()) {
            return;
        }

        const file = MainViewManager.getCurrentlyViewedFile(this.paneId);

        const $selectedFile = this._findListItemFromFile(file);
        if (!$selectedFile) {
            return;
        }

        ViewUtils.scrollElementIntoView(this.$openFilesContainer, $selectedFile, false);
    }

    /**
     * Redraw selection when list size changes or DocumentManager currentDocument changes.
     * @param {boolean=} scrollIntoView = Scrolls the selected item into view (the default behavior)
     * @private
     */
    private _fireSelectionChanged(scrollIntoView?) {
        const reveal = (scrollIntoView === undefined || scrollIntoView === true);

        if (reveal) {
            this._scrollSelectedFileIntoView();
        }

        if (_hasSelectionFocus() && this.$el.hasClass("active")) {
            this.$openFilesList!.trigger("selectionChanged", reveal);
        } else {
            this.$openFilesList!.trigger("selectionHide");
        }
        // in-lieu of resize events, manually trigger contentChanged to update scroll shadows
        this.$openFilesContainer.trigger("contentChanged");
    }

    /**
     * adds the style 'vertical-scroll' if a vertical scroll bar is present
     * @private
     */
    private _adjustForScrollbars() {
        if (this.$openFilesContainer[0].scrollHeight > this.$openFilesContainer[0].clientHeight) {
            if (!this.$openFilesContainer.hasClass("vertical-scroll")) {
                this.$openFilesContainer.addClass("vertical-scroll");
            }
        } else {
            this.$openFilesContainer.removeClass("vertical-scroll");
        }
    }

    /**
     * Adds directory names to elements representing passed files in working tree
     * @private
     * @param {Array.<File>} filesList - list of Files with the same filename
     */
    private _addDirectoryNamesToWorkingTreeFiles(filesList) {
        // filesList must have at least two files in it for this to make sense
        if (filesList.length <= 1) {
            return;
        }

        const displayPaths = ViewUtils.getDirNamesForDuplicateFiles(filesList);

        // Go through open files and add directories to appropriate entries
        this.$openFilesContainer.find("ul > li").each(function (this: any) {
            const $li = $(this);
            const io = filesList.indexOf($li.data(_FILE_KEY));
            if (io !== -1) {
                const dirSplit = displayPaths[io].split("/");
                if (dirSplit.length > 3) {
                    displayPaths[io] = dirSplit[0] + "/\u2026/" + dirSplit[dirSplit.length - 1];
                }

                const $dir = $("<span class='directory'/>").html(" &mdash; " + displayPaths[io]);
                $li.children("a").append($dir);
            }
        });
    }

    /**
     * Looks for files with the same name in the working set
     * and adds a parent directory name to them
     * @private
     */
    private _checkForDuplicatesInWorkingTree() {
        const self = this;
        const map = {};
        const fileList = MainViewManager.getWorkingSet(MainViewManager.ALL_PANES);

        // We need to always clear current directories as files could be removed from working tree.
        this.$openFilesContainer.find("ul > li > a > span.directory").remove();

        // Go through files and fill map with arrays of files.
        fileList.forEach(function (file) {
            // Use the same function that is used to create html for file.
            const displayHtml = ViewUtils.getFileEntryDisplay(file);

            if (!map[displayHtml]) {
                map[displayHtml] = [];
            }
            map[displayHtml].push(file);
        });

        // Go through the map and solve the arrays with length over 1. Ignore the rest.
        _.forEach(map, function (value) {
            if (value.length > 1) {
                self._addDirectoryNamesToWorkingTreeFiles(value);
            }
        });
    }

    /**
     * Shows/Hides open files list based on working set content.
     * @private
     */
    private _redraw() {
        this._updateViewState();
        this._updateVisibility();
        this._updateItemClasses();
        this._adjustForScrollbars();
        this._fireSelectionChanged();
    }

    /**
     * activePaneChange event handler
     * @private
     */
    private _handleActivePaneChange() {
        this._redraw();
    }

    /**
     * Updates the appearance of the list element based on the parameters provided
     * @private
     * @param {!HTMLLIElement} listElement
     * @param {bool} isDirty
     * @param {bool} canClose
     */
    private _updateFileStatusIcon(listElement, isDirty, canClose) {
        let $fileStatusIcon = listElement.find(".file-status-icon");
        const showIcon = isDirty || canClose;

        // remove icon if its not needed
        if (!showIcon && $fileStatusIcon.length !== 0) {
            $fileStatusIcon.remove();
            $fileStatusIcon = null;

        // create icon if its needed and doesn't exist
        } else if (showIcon && $fileStatusIcon.length === 0) {

            $fileStatusIcon = $("<div class='file-status-icon'></div>")
                .prependTo(listElement);
        }

        // Set icon's class
        if ($fileStatusIcon) {
            ViewUtils.toggleClass($fileStatusIcon, "dirty", isDirty);
            ViewUtils.toggleClass($fileStatusIcon, "can-close", canClose);
        }
    }

    /**
     * Updates the working set item class list
     * @private
     */
    private _updateItemClasses() {
        if (_classProviders.length > 0) {
            this.$openFilesContainer.find("ul > li").each(function (this: any) {
                const $li = $(this);
                const file = $li.data(_FILE_KEY);
                const data = {
                    fullPath: file.fullPath,
                    name: file.name,
                    isFile: file.isFile
                };
                $li.removeAttr("class");
                _classProviders.forEach(function (provider) {
                    $li.addClass(provider(data));
                });
            });
        }
    }

    /**
     * Builds the UI for a new list item and inserts in into the end of the list
     * @private
     * @param {File} file
     * @return {HTMLLIElement} newListItem
     */
    private _createNewListItem(file) {
        const self = this;
        const selectedFile = MainViewManager.getCurrentlyViewedFile(this.paneId);
        const data = {
            fullPath: file.fullPath,
            name: file.name,
            isFile: file.isFile
        };

        // Create new list item with a link
        const $link = $("<a href='#'></a>").html(ViewUtils.getFileEntryDisplay(file));

        _iconProviders.forEach(function (provider) {
            const icon = provider(data);
            if (icon) {
                $link.prepend($(icon));
            }
        });

        const $newItem = $("<li></li>")
            .append($link)
            .data(_FILE_KEY, file);

        this.$openFilesContainer.find("ul").append($newItem);

        _classProviders.forEach(function (provider) {
            $newItem.addClass(provider(data));
        });

        // Update the listItem's apperance
        this._updateFileStatusIcon($newItem, _isOpenAndDirty(file), false);
        _updateListItemSelection($newItem, selectedFile);
        _makeDraggable($newItem);

        $newItem.hover(
            function (this: any) {
                self._updateFileStatusIcon($(this), _isOpenAndDirty(file), true);
            },
            function (this: any) {
                self._updateFileStatusIcon($(this), _isOpenAndDirty(file), false);
            }
        );
    }

    /**
     * Deletes all the list items in the view and rebuilds them from the working set model
     * @private
     */
    private _rebuildViewList(forceRedraw) {
        const self = this;
        const fileList = MainViewManager.getWorkingSet(this.paneId);

        this.$openFilesContainer.find("ul").empty();

        fileList.forEach(function (file) {
            self._createNewListItem(file);
        });

        if (forceRedraw) {
            self._redraw();
        }
    }

    /**
     * Updates the pane view's selection state
     * @private
     */
    private _updateViewState() {
        const paneId = MainViewManager.getActivePaneId();
        if (_hasSelectionFocus() && paneId === this.paneId) {
            this.$el.addClass("active");
            this.$openFilesContainer.addClass("active");
        } else {
            this.$el.removeClass("active");
            this.$openFilesContainer.removeClass("active");
        }
    }

    /**
     * Updates the pane view's selection marker and scrolls the item into view
     * @private
     */
    private _updateListSelection() {
        const file = MainViewManager.getCurrentlyViewedFile(this.paneId);

        this._updateViewState();

        // Iterate through working set list and update the selection on each
        this.$openFilesContainer.find("ul").children().each(function (this: any) {
            _updateListItemSelection(this, file);
        });

        // Make sure selection is in view
        this._scrollSelectedFileIntoView();
        this._fireSelectionChanged();
    }

    /**
     * workingSetAdd event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!File} fileAdded - the file that was added
     * @param {!number} index - index where the file was added
     * @param {!string} paneId - the id of the pane the item that was to
     */
    private _handleFileAdded(e, fileAdded, index, paneId) {
        if (paneId === this.paneId) {
            this._rebuildViewList(true);
        } else {
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /**
     * workingSetAddList event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!Array.<File>} files - the files that were added
     * @param {!string} paneId - the id of the pane the item that was to
     */
    private _handleFileListAdded(e, files, paneId) {
        if (paneId === this.paneId) {
            this._rebuildViewList(true);
        } else {
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /**
     * workingSetRemove event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!File} file - the file that was removed
     * @param {?boolean} suppressRedraw If true, suppress redraw
     * @param {!string} paneId - the id of the pane the item that was to
     */
    private _handleFileRemoved(e, file, suppressRedraw, paneId) {
        /*
        * The suppressRedraw flag is used in cases when we are replacing the working
        * set entry with another one. There are only 2 use cases for this:
        *
        *      1) When an untitled document is being saved.
        *      2) When a file is saved with a new name.
        */
        if (paneId === this.paneId) {
            if (!suppressRedraw) {
                const $listItem = this._findListItemFromFile(file);
                if ($listItem) {
                    // Make the next file in the list show the close icon,
                    // without having to move the mouse, if there is a next file.
                    const $nextListItem = $listItem.next();
                    if ($nextListItem && $nextListItem.length > 0) {
                        const canClose = ($listItem.find(".can-close").length === 1);
                        const isDirty = _isOpenAndDirty($nextListItem.data(_FILE_KEY));
                        this._updateFileStatusIcon($nextListItem, isDirty, canClose);
                    }
                    $listItem.remove();
                }
                this._redraw();
            }
        } else {
            /*
            * When this event is handled by a pane that is not being updated then
            * the suppressRedraw flag does not need to be respected.
            * _checkForDuplicatesInWorkingTree() does not remove any entries so it's
            * safe to call at any time.
            */
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /**
     * workingSetRemoveList event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!Array.<File>} files - the files that were removed
     * @param {!string} paneId - the id of the pane the item that was to
     */
    private _handleRemoveList(e, files, paneId) {
        const self = this;
        if (paneId === this.paneId) {
            files.forEach(function (file) {
                const $listItem = self._findListItemFromFile(file);
                if ($listItem) {
                    $listItem.remove();
                }
            });

            this._redraw();
        } else {
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /**
     * workingSetSort event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!string} paneId - the id of the pane to sort
     */
    private _handleWorkingSetSort(e, paneId) {
        if (!this.suppressSortRedraw && paneId === this.paneId) {
            this._rebuildViewList(true);
        }
    }

    /**
     * dirtyFlagChange event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {Document} doc - document whose dirty state has changed
     */
    private _handleDirtyFlagChanged(e, doc) {
        const listItem = this._findListItemFromFile(doc.file);
        if (listItem) {
            const canClose = $(listItem).find(".can-close").length === 1;
            this._updateFileStatusIcon(listItem, doc.isDirty, canClose);
        }
    }

    /**
     * workingSetUpdate event handler
     * @private
     * @param {jQuery.Event} e - event object
     * @param {!string} paneId - the id of the pane to update
     */
    private _handleWorkingSetUpdate(e, paneId) {
        if (this.paneId === paneId) {
            this._rebuildViewList(true);
        } else {
            this._checkForDuplicatesInWorkingTree();
        }
    }

    /**
     * Initializes the WorkingSetView object
     */
    public init() {
        this.$openFilesContainer = this.$el.find(".open-files-container");
        this.$workingSetListViewHeader = this.$el.find(".working-set-header");

        this.$openFilesList = this.$el.find("ul");

        // Register listeners
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetAdd"), _.bind(this._handleFileAdded, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetAddList"), _.bind(this._handleFileListAdded, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetRemove"), _.bind(this._handleFileRemoved, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetRemoveList"), _.bind(this._handleRemoveList, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetSort"), _.bind(this._handleWorkingSetSort, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("activePaneChange"), _.bind(this._handleActivePaneChange, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("paneLayoutChange"), _.bind(this._handlePaneLayoutChange, this));
        (MainViewManager as unknown as DispatcherEvents).on(this._makeEventName("workingSetUpdate"), _.bind(this._handleWorkingSetUpdate, this));

        (DocumentManager as unknown as DispatcherEvents).on(this._makeEventName("dirtyFlagChange"), _.bind(this._handleDirtyFlagChanged, this));

        (FileViewController as unknown as DispatcherEvents).on(this._makeEventName("documentSelectionFocusChange") + " " + this._makeEventName("fileViewFocusChange"), _.bind(this._updateListSelection, this));

        // Show scroller shadows when open-files-container scrolls
        ViewUtils.addScrollerShadow(this.$openFilesContainer[0], null, true);
        ViewUtils.sidebarList(this.$openFilesContainer);

        // Disable horizontal scrolling until WebKit bug #99379 is fixed
        this.$openFilesContainer.css("overflow-x", "hidden");

        this.$openFilesContainer.on("contextmenu.workingSetView", function (e) {
            Menus.getContextMenu(Menus.ContextMenuIds.WORKING_SET_CONTEXT_MENU).open(e);
        });

        this._redraw();
    }

    /**
     * Destroys the WorkingSetView DOM element and removes all event handlers
     */
    public destroy() {
        ViewUtils.removeScrollerShadow(this.$openFilesContainer[0], null);
        this.$openFilesContainer.off(".workingSetView");
        this.$el.remove();
        (MainViewManager as unknown as DispatcherEvents).off(this._makeEventName(""));
        (DocumentManager as unknown as DispatcherEvents).off(this._makeEventName(""));
        (FileViewController as unknown as DispatcherEvents).off(this._makeEventName(""));
    }
}


/**
 * paneDestroy event handler
 */
(MainViewManager as unknown as DispatcherEvents).on("paneDestroy", function (e, paneId) {
    const view = _views[paneId];
    delete _views[view.paneId];
    view.destroy();
});

/**
 * Creates a new WorkingSetView object for the specified pane
 * @param {!jQuery} $container - the WorkingSetView's DOM parent node
 * @param {!string} paneId - the id of the pane the view is being created for
 */
export function createWorkingSetViewForPane($container, paneId) {
    let view = _views[paneId];
    if (!view) {
        view = new WorkingSetView($container, paneId);
        _views[view.paneId] = view;
    }
}


/**
 * Adds an icon provider. The callback is invoked before each working set item is created, and can
 * return content to prepend to the item.
 *
 * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string|jQuery|DOMNode} callback
 * Return a string representing the HTML, a jQuery object or DOM node, or undefined. If undefined,
 * nothing is prepended to the list item.
 */
export function addIconProvider(callback) {
    if (!callback) {
        return;
    }
    _iconProviders.push(callback);
    // build all views so the provider has a chance to add icons
    //    to all items that have already been created
    refresh(true);
}

/**
 * Adds a CSS class provider, invoked before each working set item is created or updated. When called
 * to update an existing item, all previously applied classes have been cleared.
 *
 * @param {!function(!{name:string, fullPath:string, isFile:boolean}):?string} callback
 * Return a string containing space-separated CSS class(es) to add, or undefined to leave CSS unchanged.
 */
export function addClassProvider(callback) {
    if (!callback) {
        return;
    }
    _classProviders.push(callback);
    // build all views so the provider has a chance to style
    //    all items that have already been created
    refresh(true);
}

AppInit.htmlReady(function () {
    $workingFilesContainer =  $("#working-set-list-container");
});

/*
 * To be used by other modules/deafult-extensions which needs to borrow working set entry icons
 * @param {!object} data - contains file info {fullPath, name, isFile}
 * @param {!jQuery} $element - jquery fn wrap for the list item
 *
 * API to be used only by default extensions
 */
export function useIconProviders(data, $element) {
    _iconProviders.forEach(function (provider) {
        const icon = provider(data);
        if (icon) {
            $element.prepend($(icon));
        }
    });
}

/*
 * To be used by other modules/default-extensions which needs to borrow working set entry custom classes
 * @param {!object} data - contains file info {fullPath, name, isFile}
 * @param {!jQuery} $element - jquery fn wrap for the list item
 *
 * API to be used only by default extensions
 */
export function useClassProviders(data, $element) {
    _classProviders.forEach(function (provider) {
        $element.addClass(provider(data));
    });
}
