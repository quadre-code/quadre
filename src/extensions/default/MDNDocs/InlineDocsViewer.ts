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

/**
 * Inline widget to display MDNDocs JSON data nicely formatted
 */

/// <amd-dependency path="module" name="module"/>

// Load Brackets modules
const Dialogs         = brackets.getModule("widgets/Dialogs");
const ExtensionUtils  = brackets.getModule("utils/ExtensionUtils");
const InlineWidget    = brackets.getModule("editor/InlineWidget").InlineWidget;
const KeyEvent        = brackets.getModule("utils/KeyEvent");
const Strings         = brackets.getModule("strings");
const Mustache        = brackets.getModule("thirdparty/mustache/mustache");
const HealthLogger    = brackets.getModule("utils/HealthLogger");

// Load template
import * as inlineEditorTemplate from "text!InlineDocsViewer.html";

// Lines height for scrolling
const SCROLL_LINE_HEIGHT = 40;

// Load CSS
ExtensionUtils.loadStyleSheet(module, "MDNDocs.less");


class InlineDocsViewer extends InlineWidget {
    public parentClass = InlineWidget.prototype;

    public $wrapperDiv: JQuery | null = null;
    public $scroller: JQuery | null = null;
    private $moreinfo: JQuery;

    /**
     * @param {!string} cssPropName
     * @param {!{SUMMARY:string, URL:string, VALUES:?Array.<{value:string, description:string}>}} cssPropDetails
     */
    constructor(PropName, PropDetails) {
        super();

        const templateVars = {
            propName            : PropName,
            summary             : PropDetails.SUMMARY,
            fullscreenSummary   : !(PropDetails.VALUES && PropDetails.VALUES.length),
            propValues          : PropDetails.VALUES || [],
            url                 : PropDetails.URL,
            Strings             : Strings
        };

        const html = Mustache.render(inlineEditorTemplate, templateVars);

        this.$wrapperDiv = $(html);
        this.$htmlContent.append(this.$wrapperDiv);

        Dialogs.addLinkTooltips(this.$wrapperDiv);

        this._sizeEditorToContent   = this._sizeEditorToContent.bind(this);
        this._handleWheelScroll     = this._handleWheelScroll.bind(this);

        this.$scroller = this.$wrapperDiv.find(".scroller");
        this.$scroller.on("mousewheel", this._handleWheelScroll);
        this.$moreinfo = this.$wrapperDiv.find(".more-info");
        this.$moreinfo.on("click", this._logAnalyticsData);
        this._onKeydown = this._onKeydown.bind(this);
    }

    /**
     * Handle scrolling.
     *
     * @param {Event} event Keyboard event or mouse scrollwheel event
     * @param {boolean} scrollingUp Is event to scroll up?
     * @param {DOMElement} scroller Element to scroll
     * @return {boolean} indication whether key was handled
     */
    private _handleScrolling(event, scrollingUp, scroller) {
        // We need to block the event from both the host CodeMirror code (by stopping bubbling) and the
        // browser's native behavior (by preventing default). We preventDefault() *only* when the docs
        // scroller is at its limit (when an ancestor would get scrolled instead); otherwise we'd block
        // normal scrolling of the docs themselves.
        event.stopPropagation();
        if (scrollingUp && scroller.scrollTop === 0) {
            event.preventDefault();
            return true;
        }

        if (!scrollingUp && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight) {
            event.preventDefault();
            return true;
        }

        return false;
    }

    /** Don't allow scrollwheel/trackpad to bubble up to host editor - makes scrolling docs painful */
    private _handleWheelScroll(event) {
        const scrollingUp = (event.originalEvent.wheelDeltaY > 0);
        const scroller = event.currentTarget;

        // If content has no scrollbar, let host editor scroll normally
        if (scroller.clientHeight >= scroller.scrollHeight) {
            return;
        }

        this._handleScrolling(event, scrollingUp, scroller);
    }

    /**
     * Convert keydown events into navigation actions.
     *
     * @param {KeyboardEvent} event
     * @return {boolean} indication whether key was handled
     */
    private _onKeydown(event) {
        const keyCode  = event.keyCode;
        const scroller = this.$scroller![0];

        // Ignore key events with modifier keys
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
            return false;
        }

        // Handle keys that we're interested in
        let scrollPos = scroller.scrollTop;

        switch (keyCode) {
            case KeyEvent.DOM_VK_UP:
                scrollPos = Math.max(0, scrollPos - SCROLL_LINE_HEIGHT);
                break;
            case KeyEvent.DOM_VK_PAGE_UP:
                scrollPos = Math.max(0, scrollPos - scroller.clientHeight);
                break;
            case KeyEvent.DOM_VK_DOWN:
                scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                    scrollPos + SCROLL_LINE_HEIGHT);
                break;
            case KeyEvent.DOM_VK_PAGE_DOWN:
                scrollPos = Math.min(scroller.scrollHeight - scroller.clientHeight,
                    scrollPos + scroller.clientHeight);
                break;
            default:
                // Ignore other keys
                return false;
        }

        scroller.scrollTop = scrollPos;

        // Disallow further processing
        event.stopPropagation();
        event.preventDefault();
        return true;
    }

    public onAdded() {
        super.onAdded();

        // Set height initially, and again whenever width might have changed (word wrap)
        this._sizeEditorToContent();
        $(window).on("resize", this._sizeEditorToContent);

        // Set focus
        this.$scroller![0].focus();
        this.$wrapperDiv![0].addEventListener("keydown", this._onKeydown, true);
    }

    public onClosed() {
        super.onClosed();

        $(window).off("resize", this._sizeEditorToContent);
        this.$wrapperDiv![0].removeEventListener("keydown", this._onKeydown, true);
    }

    private _sizeEditorToContent() {
        this.hostEditor!.setInlineWidgetHeight(this, this.$wrapperDiv!.height() + 20, true);
    }

    /**
     * Send analytics data for Quick Doc "readMore" action
     *
     * @return {boolean} false
     */
    private _logAnalyticsData() {
        HealthLogger.sendAnalyticsData(
            "QuickDocReadMore",
            "usage",
            "quickDoc",
            "readMore"
        );
        return false;
    }
}

export = InlineDocsViewer;
