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
 * MainViewFactory is a singleton for managing view factories.
 *
 * Registering a view factory:
 *
 *      registerViewFactory({
 *           canOpenFile: function (fullPath) {
 *               return (fullPath.slice(-4) === ".ico");
 *           },
 *           openFile: function(file, pane) {
 *               return createIconView(file, pane);
 *           }
 *      });
 *
 *  The openFile method is used to open the file and construct
 *  a view of it.  Implementation should add the view to the pane
 *
 *      function createIconView(file, pane) {
 *          // IconView will construct its DOM and append
 *          //  it to pane.$el
 *          var view = new IconView(file, pane.$el);
 *          // Then tell the pane to add it to
 *          //  its view map and show it
 *          pane.addView(view, true);
 *          return new $.Deferred().resolve().promise();
 *      }
 *
 *  Factories should only create 1 view of a file per pane.  Brackets currently only supports 1 view of
 *  a file open at a given time but that may change to allow the same file open in more than 1 pane. Therefore
 *  Factories can do a simple check to see if a view already exists and show it before creating a new one:
 *
 *      var view = pane.getViewForPath(file.fullPath);
 *      if (view) {
 *          pane.showView(view);
 *      } else {
 *          return createIconView(file, pane);
 *      }
 *
 */

import * as _ from "lodash";
import { Pane } from "view/Pane";

interface Factory {
    canOpenFile(path: string): boolean;
    openFile(path: string, pane: Pane): JQueryPromise<any>;
}

/**
 * The view registration Database
 * @private
 * @type {Array.<Factory>}
 */
const _factories: Array<Factory> = [];

/**
 * Registers a view factory
 * @param {!Factory} factory - the view factory to register
 */
export function registerViewFactory(factory: Factory) {
    _factories.push(factory);
}

/**
 * Finds a factory that can open the specified file
 * @param {!string} fullPath - the file to open
 * @return {?Factory} A factory that can create a view for the path or undefined if there isn't one.
 */
export function findSuitableFactoryForPath(fullPath) {
    return _.find(_factories, function (factory) {
        // This could get more complex in the future by searching in this order
        //  1) a factory that can open the file by fullPath
        //  2) a factory that can open the file by name
        //  3) a factory that can open the file by filetype
        return factory.canOpenFile(fullPath);
    });
}
