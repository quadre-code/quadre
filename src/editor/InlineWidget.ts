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

// Load dependent modules
import * as EditorManager from "editor/EditorManager";
import * as EventDispatcher from "utils/EventDispatcher";
import * as KeyEvent from "utils/KeyEvent";
import { Editor } from "editor/Editor";

/**
 * @constructor
 *
 */
export class InlineWidget extends EventDispatcher.EventDispatcherBase {
    public htmlContent: HTMLElement;
    public $htmlContent: JQuery;
    public id = null;
    public hostEditor: Editor | null = null;
    private $closeBtn: JQuery;

    constructor() {
        super();

        const self = this;

        // create the outer wrapper div
        this.htmlContent = window.document.createElement("div");
        this.$htmlContent = $(this.htmlContent).addClass("inline-widget").attr("tabindex", "-1");
        this.$htmlContent.append("<div class='shadow top' />")
            .append("<div class='shadow bottom' />")
            .append("<a href='#' class='close no-focus'>&times;</a>");

        // create the close button
        this.$closeBtn = this.$htmlContent.find(".close");
        this.$closeBtn.click(function (e) {
            self.close();
            e.stopImmediatePropagation();
        });

        this.$htmlContent.on("keydown", function (e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                self.close();
                e.stopImmediatePropagation();
            }
        });
    }

    /**
     * Initial height of inline widget in pixels. Can be changed later via hostEditor.setInlineWidgetHeight()
     * @type {number}
     */
    public height = 0;

    /**
     * Closes this inline widget and all its contained Editors
     * @return {$.Promise} A promise that's resolved when the widget is fully closed.
     */
    public close() {
        return EditorManager.closeInlineWidget(this.hostEditor, this);
        // closeInlineWidget() causes our onClosed() handler to be called
    }

    /**
     * @return {boolean} True if any part of the inline widget is focused
     */
    public hasFocus() {
        const focusedItem = window.document.activeElement;
        const htmlContent = this.$htmlContent[0];
        return $.contains(htmlContent, focusedItem!) || htmlContent === focusedItem;
    }

    /**
     * Called any time inline is closed, whether manually or automatically.
     */
    public onClosed() {
        this.trigger("close");
    }

    /**
     * Called once content is parented in the host editor's DOM. Useful for performing tasks like setting
     * focus or measuring content, which require htmlContent to be in the DOM tree.
     *
     * IMPORTANT: onAdded() MUST be overridden to call hostEditor.setInlineWidgetHeight() at least once to
     * set the initial height (required to animate it open). The widget will never open otherwise.
     */
    public onAdded() {
        this.trigger("add");
    }

    /**
     * @param {Editor} hostEditor
     */
    public load(hostEditor) {
        this.hostEditor = hostEditor;
    }

    /**
     * Called when the editor containing the inline is made visible.
     */
    public onParentShown() {
        // do nothing - base implementation
    }

    /**
     * Called when the parent editor does a full refresh--for example, when the font size changes.
     */
    public refresh() {
        // do nothing - base implementation
    }
}
