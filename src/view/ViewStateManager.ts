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
 * ViewStateManager is a singleton for views to park their global viwe state. The state is saved
 * with project data but the View or View Factory is responsible for restoring the view state
 * when the view is created.
 *
 * Views should implement `getViewState()` so that the view state can be saved and that data is cached
 * for later use.
 *
 * Views or View Factories are responsible for restoring the view state when the view of that file is created
 * by recalling the cached state.  Views determine what data is store in the view state and how to restore it.
 */

import type File = require("filesystem/File");
import type { View } from "view/Pane";

import * as _ from "lodash";

/**
 * The view state cache.
 * @type {Object.<string,*>}
 * @private
 */
let _viewStateCache: Record<string, any> = {};

/**
 * resets the view state cache
 */
export function reset(): void {
    _viewStateCache = {};
}

/**
 * Sets the view state for the specfied file
 * @param {!File} file - the file to record the view state for
 * @param {?*} viewState - any data that the view needs to restore the view state.
 */
function _setViewState(file: File, viewState: any): void {
    _viewStateCache[file.fullPath] = viewState;
}


/**
 * Updates the view state for the specified view
 * @param {!{!getFile:function():File, getViewState:function():*}} view - the to save state
 * @param {?*} viewState - any data that the view needs to restore the view state.
 */
export function updateViewState(view: View): void {
    if (view.getViewState) {
        _setViewState(view.getFile(), view.getViewState());
    }
}

/**
 * gets the view state for the specified file
 * @param {!File} file - the file to record the view state for
 * @return {?*} whatever data that was saved earlier with a call setViewState
 */
export function getViewState(file: File): any {
    return _viewStateCache[file.fullPath];
}

/**
 * adds an array of view states
 * @param {!object.<string, *>} viewStates - View State object to append to the current set of view states
 */
export function addViewStates(viewStates: Record<string, any>): void {
    _viewStateCache = _.extend(_viewStateCache, viewStates);
}
