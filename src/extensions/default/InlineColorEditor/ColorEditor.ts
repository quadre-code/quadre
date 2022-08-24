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

const KeyEvent           = brackets.getModule("utils/KeyEvent");
const PreferencesManager = brackets.getModule("preferences/PreferencesManager");
const StringUtils        = brackets.getModule("utils/StringUtils");
const Strings            = brackets.getModule("strings");
const Mustache           = brackets.getModule("thirdparty/mustache/mustache");
import * as tinycolor from "thirdparty/tinycolor-min";

/** Mustache template that forms the bare DOM structure of the UI */
import * as ColorEditorTemplate from "text!ColorEditorTemplate.html";

/**
 * @const @type {number}
 */
const STEP_MULTIPLIER = 5;

/**
 * Convert 0x notation into hex6 format for tinycolor
 * compatibility: ("0xFFAACC" => "#FFFFFF")
 * @param {string} str - String to ensure hex format for
 * @returns {string} - str in hex format
 */
function ensureHexFormat(str) {
    return (/^0x/).test(str) ? str.replace("0x", "#") : str;
}

/**
 * Converts a color to a 0x-prefixed string
 * @param {tinycolor} color - color to convert
 * @returns {string} - color as 0x-prefixed string
 */
function as0xString(color) {
    return color.toHexString().replace("#", "0x");
}

/**
 * Converts 0x-prefixed color to hex
 * @param {string} color - Color to convert
 * @param {boolean} convertToString - true if color should
 *                                    be returned as string
 * @returns {tinycolor|string} - Hex color as a Tinycolor object
 *                               or a hex string
 */
function _0xColorToHex(color, convertToStr) {
    const hexColor = tinycolor(color.replace("0x", "#"));
    hexColor._format = "0x";

    if (convertToStr) {
        return hexColor.toString();
    }
    return hexColor;
}

/**
 * Ensures that a string is in Tinycolor supported format
 * @param {string} color - Color to check the format for
 * @param {boolean} convertToString - true if color should
 *                                    be returned as string
 * @returns {tinycolor|string} - Color as a Tinycolor object
 *                               or a hex string
 */
function checkSetFormat(color, convertToStr?) {
    if ((/^0x/).test(color)) {
        return _0xColorToHex(color, convertToStr);
    }
    if (convertToStr) {
        return tinycolor(color).toString();
    }
    return tinycolor(color);
}

/** Converts a mouse coordinate to be relative to zeroPos, and clips to [0, maxOffset] */
function _getNewOffset(pos, zeroPos, maxOffset) {
    let offset = pos - zeroPos;
    offset = Math.min(maxOffset, Math.max(0, offset));
    return offset;
}

/**
 * Color picker control; may be used standalone or within an InlineColorEditor inline widget.
 */
export class ColorEditor {

    /**
     * A string or tinycolor object representing the currently selected color
     * TODO (#2201): type is unpredictable
     * @type {tinycolor|string}
     */
    private _color: tinycolor = null;

    /**
     * An HSV representation of the currently selected color.
     * TODO (#2201): type of _hsv.s/.v is unpredictable
     * @type {!{h:number, s:number|string, v:number|string, a:number}}
     */
    private _hsv = tinycolor("rgba(0,0,0,1)").toHsv();
    public _format;

    /**
     * Color that was selected before undo(), if undo was the last change made. Else null.
     * @type {?string}
     */
    private _redoColor = null;

    /**
     * Initial value the color picker was opened with
     * @type {!string}
     */
    private _originalColor: string | null = null;

    private $element: JQuery;
    private _callback: (string: string) => void;
    private _isUpperCase: boolean;

    private $colorValue: JQuery;
    private $buttonList: JQuery;
    public $rgbaButton: JQuery;
    public $hexButton: JQuery;
    private $hslButton: JQuery;
    public $0xButton: JQuery;
    private $currentColor: JQuery;
    private $originalColor: JQuery;
    private $selection: JQuery;
    private $selectionBase: JQuery;
    private $hueBase: JQuery;
    private $opacityGradient: JQuery;
    private $hueSlider: JQuery;
    private $hueSelector: JQuery;
    private $opacitySlider: JQuery;
    private $opacitySelector: JQuery;
    private $swatches: JQuery;

    /**
     * @constructor
     * @param {!jQuery} $parent  DOM node into which to append the root of the color picker UI
     * @param {!string} color  Initially selected color
     * @param {!function(string)} callback  Called whenever selected color changes
     * @param {!Array.<{value:string, count:number}>} swatches  Quick-access color swatches to include in UI
     */
    constructor($parent, color, callback, swatches) {
        // Create the DOM structure, filling in localized strings via Mustache
        this.$element = $(Mustache.render(ColorEditorTemplate, Strings));
        $parent.append(this.$element);

        this._callback = callback;

        this._handleKeydown = this._handleKeydown.bind(this);
        this._handleOpacityKeydown = this._handleOpacityKeydown.bind(this);
        this._handleHslKeydown = this._handleHslKeydown.bind(this);
        this._handleHueKeydown = this._handleHueKeydown.bind(this);
        this._handleSelectionKeydown = this._handleSelectionKeydown.bind(this);
        this._handleOpacityDrag = this._handleOpacityDrag.bind(this);
        this._handleHueDrag = this._handleHueDrag.bind(this);
        this._handleSelectionFieldDrag = this._handleSelectionFieldDrag.bind(this);

        this._originalColor = color;
        this._color = checkSetFormat(color);

        this._redoColor = null;
        this._isUpperCase = PreferencesManager.get("uppercaseColors");
        PreferencesManager.on("change", "uppercaseColors", function (this: ColorEditor) {
            this._isUpperCase = PreferencesManager.get("uppercaseColors");
        }.bind(this));

        this.$colorValue = this.$element.find(".color-value");
        this.$buttonList = this.$element.find("ul.button-bar");
        this.$rgbaButton = this.$element.find(".rgba");
        this.$hexButton = this.$element.find(".hex");
        this.$hslButton = this.$element.find(".hsla");
        this.$0xButton = this.$element.find(".0x");
        this.$currentColor = this.$element.find(".current-color");
        this.$originalColor = this.$element.find(".original-color");
        this.$selection = this.$element.find(".color-selection-field");
        this.$selectionBase = this.$element.find(".color-selection-field .selector-base");
        this.$hueBase = this.$element.find(".hue-slider .selector-base");
        this.$opacityGradient = this.$element.find(".opacity-gradient");
        this.$hueSlider = this.$element.find(".hue-slider");
        this.$hueSelector = this.$element.find(".hue-slider .selector-base");
        this.$opacitySlider = this.$element.find(".opacity-slider");
        this.$opacitySelector = this.$element.find(".opacity-slider .selector-base");
        this.$swatches = this.$element.find(".swatches");

        // Create quick-access color swatches
        this._addSwatches(swatches);

        // Attach event listeners to main UI elements
        this._addListeners();

        // Initially selected color
        this.$originalColor.css("background-color", checkSetFormat(this._originalColor));

        this._commitColor(color);
    }

    /** Returns the root DOM node of the ColorPicker UI */
    public getRootElement() {
        return this.$element;
    }

    /** Attach event listeners for main UI elements */
    private _addListeners() {
        this._bindColorFormatToRadioButton("rgba");
        this._bindColorFormatToRadioButton("hex");
        this._bindColorFormatToRadioButton("hsla");
        this._bindColorFormatToRadioButton("0x");

        this._bindInputHandlers();

        this._bindOriginalColorButton();

        this._registerDragHandler(this.$selection, this._handleSelectionFieldDrag);
        this._registerDragHandler(this.$hueSlider, this._handleHueDrag);
        this._registerDragHandler(this.$opacitySlider, this._handleOpacityDrag);
        this._bindKeyHandler(this.$selectionBase, this._handleSelectionKeydown);
        this._bindKeyHandler(this.$hueBase, this._handleHueKeydown);
        this._bindKeyHandler(this.$opacitySelector, this._handleOpacityKeydown);
        this._bindKeyHandler(this.$hslButton, this._handleHslKeydown);

        // General key handler gets bubbling events from any focusable part of widget
        this._bindKeyHandler(this.$element, this._handleKeydown);
    }

    /**
     * Update all UI elements to reflect the selected color (_color and _hsv). It is usually
     * incorrect to call this directly; use _commitColor() or setColorAsHsv() instead.
     */

    private _synchronize() {
        const colorValue  = this.getColor().getOriginalInput();
        const colorObject = checkSetFormat(colorValue);
        const hueColor    = "hsl(" + this._hsv.h + ", 100%, 50%)";
        this._updateColorTypeRadioButtons(colorObject.getFormat());
        this.$colorValue.val(colorValue);
        this.$currentColor.css("background-color", checkSetFormat(colorValue, true));
        this.$selection.css("background-color", hueColor);
        this.$hueBase.css("background-color", hueColor);

        // Update gradients in color square & opacity slider
        this.$selectionBase.css("background-color", colorObject.toHexString());
        this.$opacityGradient.css("background-image", "linear-gradient(" + hueColor + ", transparent)");

        // Update slider thumb positions
        this.$hueSelector.css("bottom", (this._hsv.h / 360 * 100) + "%");
        this.$opacitySelector.css("bottom", (this._hsv.a * 100) + "%");
        if (!isNaN(this._hsv.s)) {      // TODO (#2201): type of _hsv.s/.v is unpredictable
            this._hsv.s = (this._hsv.s * 100) + "%";
        }
        if (!isNaN(this._hsv.v)) {
            this._hsv.v = (this._hsv.v * 100) + "%";
        }
        this.$selectionBase.css({
            left: this._hsv.s,
            bottom: this._hsv.v
        });
    }

    /**
     * Focus the main color square's thumb.
     * @return {boolean} True if we focused the square, false otherwise.
     */
    public focus() {
        if (!this.$selectionBase.is(":focus")) {
            this.$selectionBase.focus();
            return true;
        }
        return false;
    }

    /**
     * Remove any preference listeners before destroying the editor.
     */
    public destroy() {
        PreferencesManager.off("change", "uppercaseColors");
    }

    /**
     * @return {tinycolor|string} The currently selected color (TODO (#2201): type is unpredictable).
     */
    public getColor() {
        return this._color;
    }

    /** Update the format button bar's selection */
    private _updateColorTypeRadioButtons(format) {
        this.$buttonList.find("li").removeClass("selected");
        switch (format) {
            case "rgb":
                this.$buttonList.find(".rgba").parent().addClass("selected");
                break;
            case "hex":
            case "name":
                this.$buttonList.find(".hex").parent().addClass("selected");
                break;
            case "hsl":
                this.$buttonList.find(".hsla").parent().addClass("selected");
                break;
            case "0x":
                this.$buttonList.find(".0x").parent().addClass("selected");
                break;
        }
    }

    /** Add event listeners to the format button bar */
    private _bindColorFormatToRadioButton(buttonClass) {
        const self = this;
        function handler(event) {
            const newFormat   = $(event.currentTarget).html().toLowerCase().replace("%", "p");
            let newColor    = self.getColor().toString();

            const colorObject = checkSetFormat(newColor);

            switch (newFormat) {
                case "hsla":
                    newColor = colorObject.toHslString();
                    break;
                case "rgba":
                    newColor = colorObject.toRgbString();
                    break;
                case "prgba":
                    newColor = colorObject.toPercentageRgbString();
                    break;
                case "hex":
                    newColor = colorObject.toHexString();
                    self._hsv.a = 1;
                    break;
                case "0x":
                    newColor = as0xString(colorObject);
                    self._hsv.a = 1;
                    self._format = "0x";
                    break;
            }

            // We need to run this again whenever RGB/HSL/Hex conversions
            // are performed to preserve the case
            newColor = self._isUpperCase ? newColor.toUpperCase() : newColor;
            self._commitColor(newColor, false);
        }
        this.$element.find("." + buttonClass).click(handler);
    }

    /** Add event listener to the "original color value" swatch */
    private _bindOriginalColorButton() {
        const self = this;
        this.$originalColor.click(function (event) {
            self._commitColor(self._originalColor, true);
        });
    }

    /**
     * Convert percentage values in an RGB color into normal RGB values in the range of 0 - 255.
     * If the original color is already in non-percentage format, does nothing.
     * @param {string} color The color to be converted to non-percentage RGB color string.
     * @return {string} an RGB color string in the normal format using non-percentage values
     */
    public _convertToNormalRGB(color) {
        const matches = color.match(/^rgb.*?([0-9]+)%.*?([0-9]+)%.*?([0-9]+)%/i);
        if (matches) {
            for (let i = 0; i < 3; i++) {
                const percentStr = matches[i + 1];
                const value = Math.round(255 * Number(percentStr) / 100);
                if (!isNaN(value)) {
                    color = color.replace(percentStr + "%", value);
                }
            }
        }
        return color;
    }

    /**
     * Normalize the given color string into the format used by tinycolor, by adding a space
     * after commas.
     * @param {string} color The color to be corrected if it looks like an RGB or HSL color.
     * @return {string} a normalized color string.
     */
    private _normalizeColorString(color) {
        let normalizedColor = color;

        // Convert 6-digit hex to 3-digit hex as TinyColor (#ffaacc -> #fac)
        if (color.match(/^#[0-9a-fA-F]{6}/)) {
            return tinycolor(color).toString();
        }
        if (color.match(/^(rgb|hsl)/i)) {
            normalizedColor = normalizedColor.replace(/,\s*/g, ", ");
            normalizedColor = normalizedColor.replace(/\(\s+/, "(");
            normalizedColor = normalizedColor.replace(/\s+\)/, ")");
        }
        return normalizedColor;
    }

    /** Handle changes in text field */
    private _handleTextFieldInput(losingFocus) {
        let newColor    = $.trim(this.$colorValue.val());
        const newColorObj = checkSetFormat(newColor);
        let newColorOk  = newColorObj.isValid();


        // TinyColor will auto correct an incomplete rgb or hsl value into a valid color value.
        // eg. rgb(0,0,0 -> rgb(0, 0, 0)
        // We want to avoid having TinyColor do this, because we don't want to sync the color
        // to the UI if it's incomplete. To accomplish this, we first normalize the original
        // color string into the format TinyColor would generate, and then compare it to what
        // TinyColor actually generates to see if it's different. If so, then we assume the color
        // was incomplete to begin with.
        if (newColorOk) {
            newColorOk = (newColorObj.toString() === this._normalizeColorString(ensureHexFormat(newColor)));
        }

        // Restore to the previous valid color if the new color is invalid or incomplete.
        if (losingFocus && !newColorOk) {
            newColor = this.getColor().toString();
        }

        // Sync only if we have a valid color or we're restoring the previous valid color.
        if (losingFocus || newColorOk) {
            this._commitColor(newColor, true);
        }
    }

    private _bindInputHandlers() {
        const self = this;

        this.$colorValue.bind("input", function (event) {
            self._handleTextFieldInput(false);
        });

        this.$colorValue.bind("change", function (event) {
            self._handleTextFieldInput(true);
        });
    }

    /**
     * Populate the UI with the given color swatches and add listeners so they're selectable.
     * @param {!Array.<{value:string, count:number}>} swatches
     */
    private _addSwatches(swatches) {
        const self = this;

        // Create swatches
        swatches.forEach(function (swatch) {
            const swatchValue = checkSetFormat(swatch.value, true);
            const stringFormat = (swatch.count > 1) ? Strings.COLOR_EDITOR_USED_COLOR_TIP_PLURAL : Strings.COLOR_EDITOR_USED_COLOR_TIP_SINGULAR;
            const usedColorTip = StringUtils.format(stringFormat, swatch.value, swatch.count);

            self.$swatches.append("<li tabindex='0'><div class='swatch-bg'><div class='swatch' style='background-color: " +
                    swatchValue + ";' title='" + usedColorTip + "'></div></div> <span class='value'" + " title='" +
                    usedColorTip + "'>" + swatch.value + "</span></li>");
        });

        // Add key & click listeners to each
        this.$swatches.find("li").keydown(function (this: any, event) {
            if (event.keyCode === KeyEvent.DOM_VK_RETURN ||
                    event.keyCode === KeyEvent.DOM_VK_ENTER ||
                    event.keyCode === KeyEvent.DOM_VK_SPACE) {
                // Enter/Space is same as clicking on swatch

                self._commitColor($(event.currentTarget).find(".value").html());
            } else if (event.keyCode === KeyEvent.DOM_VK_TAB) {
                // Tab on last swatch loops back to color square
                if (!event.shiftKey && $(this).next("li").length === 0) {
                    self.$selectionBase.focus();
                    return false;
                }
            }

            return undefined;
        });

        this.$swatches.find("li").click(function (event) {
            self._commitColor($(event.currentTarget).find(".value").html());
        });
    }

    /**
     * Checks whether colorVal is a valid color
     * @param {!string} colorVal
     * @return {boolean} Whether colorVal is valid
     */
    public isValidColor(colorVal) {
        return tinycolor(colorVal).isValid();
    }

    /**
     * Sets _hsv and _color based on an HSV input, and updates the UI. Attempts to preserve
     * the previous color format.
     * @param {!{h:number=, s:number=, v:number=}} hsv  Any missing values use the previous color's values.
     */
    public setColorAsHsv(hsv) {
        let colorVal;
        const oldFormat = tinycolor(this.getColor()).getFormat();

        // Set our state to the new color
        $.extend(this._hsv, hsv);
        const newColor = tinycolor(this._hsv);

        switch (oldFormat) {
            case "hsl":
                colorVal = newColor.toHslString();
                break;
            case "rgb":
                colorVal = newColor.toRgbString();
                break;
            case "prgb":
                colorVal = newColor.toPercentageRgbString();
                break;
            case "hex":
            case "name":
                colorVal = this._hsv.a < 1 ? newColor.toRgbString() : newColor.toHexString();
                break;
            case "0x":
                colorVal = as0xString(newColor);
                break;
        }
        colorVal = this._isUpperCase ? colorVal.toUpperCase() : colorVal;
        this._commitColor(colorVal, false);
    }

    /**
     * Sets _color (and optionally _hsv) based on a string input, and updates the UI. The string's
     * format determines the new selected color's format.
     * @param {!string} colorVal
     * @param {boolean=} resetHsv  Pass false ONLY if hsv set already been modified to match colorVal. Default: true.
     */
    private _commitColor(colorVal, resetHsv?) {

        if (resetHsv === undefined) {
            resetHsv = true;
        }
        this._callback(colorVal);

        const colorObj = checkSetFormat(colorVal);
        colorObj._originalInput = colorVal;
        this._color = colorObj;

        if (resetHsv) {
            this._hsv = this._color!.toHsv();
        }

        this._redoColor = null;  // if we had undone, this new value blows away the redo history
        this._synchronize();
    }

    /**
     * Sets _color and _hsv based on a string input, and updates the UI. The string's
     * format determines the new selected color's format.
     * @param {!string} colorVal
     */
    public setColorFromString(colorVal) {
        this._commitColor(colorVal, true);  // TODO (#2204): make this less entangled with setColorAsHsv()
    }

    /** Dragging color square's thumb */
    private _handleSelectionFieldDrag(event) {
        const height  = this.$selection.height();
        const width   = this.$selection.width();
        const xOffset = _getNewOffset(event.clientX, this.$selection.offset().left, width);
        const yOffset = _getNewOffset(event.clientY, this.$selection.offset().top, height);
        const hsv: { s?: number, v?: number } = {};
        hsv.s = xOffset / width;
        hsv.v = 1 - yOffset / height;
        this.setColorAsHsv(hsv);
        if (!this.$selection.find(".selector-base").is(":focus")) {
            this.$selection.find(".selector-base").focus();
        }
    }

    /** Dragging hue slider thumb */
    private _handleHueDrag(event) {
        const height = this.$hueSlider.height();
        const offset = _getNewOffset(event.clientY, this.$hueSlider.offset().top, height);
        const hsv: { h?: number } = {};
        hsv.h = (1 - offset / height) * 360;
        this.setColorAsHsv(hsv);
        if (!this.$hueSlider.find(".selector-base").is(":focus")) {
            this.$hueSlider.find(".selector-base").focus();
        }
    }

    /** Dragging opacity slider thumb */
    private _handleOpacityDrag(event) {
        const height = this.$opacitySlider.height();
        const offset = _getNewOffset(event.clientY, this.$opacitySlider.offset().top, height);
        const hsv: { a?: number } = {};
        hsv.a = 1 - (offset / height);
        this.setColorAsHsv(hsv);
        if (!this.$opacitySlider.find(".selector-base").is(":focus")) {
            this.$opacitySlider.find(".selector-base").focus();
        }
    }

    /**
     * Helper for attaching drag-related mouse listeners to an element. It's up to
     * 'handler' to actually move the element as mouse is dragged.
     * @param {!function(jQuery.event)} handler  Called whenever drag position changes
     */
    private _registerDragHandler($element, handler) {
        const mouseupHandler = function (event) {
            $(window).unbind("mousemove", handler);
            $(window).unbind("mouseup", mouseupHandler);
        };
        $element.mousedown(function (event) {
            $(window).bind("mousemove", handler);
            $(window).bind("mouseup", mouseupHandler);
        });
        $element.mousedown(handler);  // run drag-update handler on initial mousedown too
    }

    /**
     * Handles undo gestures while color picker has focus. We don't want to let CodeMirror's
     * usual undo logic run since it will destroy our marker.
     */
    public undo() {
        if (this._originalColor!.toString() !== this._color.toString()) {
            const curColor = this._color.toString();
            this._commitColor(this._originalColor, true);
            this._redoColor = curColor;
        }
    }

    /** Similarly, handle redo gestures while color picker has focus. */
    public redo() {
        if (this._redoColor) {
            this._commitColor(this._redoColor, true);
            this._redoColor = null;
        }
    }

    /**
     * Global handler for keys in the color editor. Catches undo/redo keys and traps
     * arrow keys that would be handled by the scroller.
     */
    private _handleKeydown(event) {
        const hasCtrl = (brackets.platform === "win") ? (event.ctrlKey) : (event.metaKey);
        if (hasCtrl) {
            switch (event.keyCode) {
                case KeyEvent.DOM_VK_Z:
                    if (event.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                    return false;
                case KeyEvent.DOM_VK_Y:
                    this.redo();
                    return false;
            }
        } else {
            if (event.keyCode === KeyEvent.DOM_VK_LEFT ||
                    event.keyCode === KeyEvent.DOM_VK_RIGHT ||
                    event.keyCode === KeyEvent.DOM_VK_UP ||
                    event.keyCode === KeyEvent.DOM_VK_DOWN) {
                // Prevent arrow keys that weren't handled by a child control
                // from being handled by a parent, either through bubbling or
                // through default native behavior. There isn't a good general
                // way to tell if the target would handle this event by default,
                // so we look to see if the target is a text input control.
                let preventDefault = false;
                const $target = $(event.target);

                // If the input has no "type" attribute, it defaults to text. So we
                // have to check for both possibilities.
                if ($target.is("input:not([type])") || $target.is("input[type=text]")) {
                    // Text input control. In WebKit, if the cursor gets to the start
                    // or end of a text field and can't move any further, the default
                    // action doesn't take place in the text field, so the event is handled
                    // by the outer scroller. We have to prevent in that case too.
                    const el = $target[0] as HTMLInputElement;
                    if (el.selectionStart === el.selectionEnd &&
                            ((event.keyCode === KeyEvent.DOM_VK_LEFT && el.selectionStart === 0) ||
                                (event.keyCode === KeyEvent.DOM_VK_RIGHT && el.selectionEnd === $target.val().length))) {
                        preventDefault = true;
                    }
                } else {
                    // Not a text input control, so we want to prevent default.
                    preventDefault = true;
                }

                if (preventDefault) {
                    event.stopPropagation();
                    return false; // equivalent to event.preventDefault()
                }
            }
        }

        return undefined;
    }

    private _handleHslKeydown(event) {
        if (event.keyCode === KeyEvent.DOM_VK_TAB) {
            // If we're the last focusable element (no color swatches), Tab wraps around to color square
            if (!event.shiftKey) {
                if (this.$swatches.children().length === 0) {
                    this.$selectionBase.focus();
                    return false;
                }
            }
        }

        return undefined;
    }

    /** Key events on the color square's thumb */
    private _handleSelectionKeydown(event) {
        const hsv: { s?: number, v?: number } = {};
        let step = 1.5;
        let xOffset;
        let yOffset;
        let adjustedOffset;

        switch (event.keyCode) {
            case KeyEvent.DOM_VK_LEFT:
            case KeyEvent.DOM_VK_RIGHT:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                xOffset = Number($.trim(this.$selectionBase[0].style.left.replace("%", "")));
                adjustedOffset = (event.keyCode === KeyEvent.DOM_VK_LEFT) ? (xOffset - step) : (xOffset + step);
                xOffset = Math.min(100, Math.max(0, adjustedOffset));
                hsv.s = xOffset / 100;
                this.setColorAsHsv(hsv);
                return false;
            case KeyEvent.DOM_VK_DOWN:
            case KeyEvent.DOM_VK_UP:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                yOffset = Number($.trim(this.$selectionBase[0].style.bottom.replace("%", "")));
                adjustedOffset = (event.keyCode === KeyEvent.DOM_VK_DOWN) ? (yOffset - step) : (yOffset + step);
                yOffset = Math.min(100, Math.max(0, adjustedOffset));
                hsv.v = yOffset / 100;
                this.setColorAsHsv(hsv);
                return false;
            case KeyEvent.DOM_VK_TAB:
                // Shift+Tab loops back to last focusable element: last swatch if any; format button bar if not
                if (event.shiftKey) {
                    if (this.$swatches.children().length === 0) {
                        this.$hslButton.focus();
                    } else {
                        this.$swatches.find("li:last").focus();
                    }
                    return false;
                }
                break;
        }

        return undefined;
    }

    /** Key events on the hue slider thumb */
    private _handleHueKeydown(event) {
        const hsv: { h?: number } = {};
        const hue = Number(this._hsv.h);
        let step = 3.6;

        switch (event.keyCode) {
            case KeyEvent.DOM_VK_DOWN:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                hsv.h = (hue - step) <= 0 ? 360 - step : hue - step;
                this.setColorAsHsv(hsv);
                return false;
            case KeyEvent.DOM_VK_UP:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                hsv.h = (hue + step) >= 360 ? step : hue + step;
                this.setColorAsHsv(hsv);
                return false;
        }

        return undefined;
    }

    /** Key events on the opacity slider thumb */
    private _handleOpacityKeydown(event) {
        const alpha = this._hsv.a;
        const hsv: { a?: number } = {};
        let step = 0.01;

        switch (event.keyCode) {
            case KeyEvent.DOM_VK_DOWN:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                if (alpha > 0) {
                    hsv.a = (alpha - step) <= 0 ? 0 : alpha - step;
                    this.setColorAsHsv(hsv);
                }
                return false;
            case KeyEvent.DOM_VK_UP:
                step = event.shiftKey ? step * STEP_MULTIPLIER : step;
                if (alpha < 100) {
                    hsv.a = (alpha + step) >= 1 ? 1 : alpha + step;
                    this.setColorAsHsv(hsv);
                }
                return false;
        }

        return undefined;
    }

    private _bindKeyHandler($element, handler) {
        $element.bind("keydown", handler);
    }
}

// Prevent clicks on some UI elements (color selection field, slider and large swatch) from taking focus
$(window.document).on("mousedown", ".color-selection-field, .slider, .large-swatch", function (e) {
    e.preventDefault();
});
