/*
 * Copyright (c) 2015 - 2017 Adobe Systems Incorporated. All rights reserved.
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

import type { Editor } from "editor/Editor";

import * as TokenUtils from "utils/TokenUtils";

interface ContextInfo {
    token: CodeMirror.Token | null;
    tokenType: number | null;
    offset: number;
    keyName: string | null;
    valueName: string | null;
    parentKeyName: string | null;
    isArray: boolean;
    exclusionList: Array<string>;
    shouldReplace: boolean;
}

// Enumerations for token types.
export const TOKEN_KEY   = 1;
export const TOKEN_VALUE = 2;

// Whitelist for allowed value types.
const valueTokenTypes = ["atom", "string", "number", "variable"];

// Reg-ex to match colon, comma, opening bracket of an array and white-space.
export const regexAllowedChars = /(?:^[:,[]$)|(?:^\s+$)/;

/**
 * @private
 *
 * Returns an object that represents all its parameters
 *
 * @param {!Object} token CodeMirror token
 * @param {!number} tokenType Type of current token
 * @param {!number} offset Offset in current token
 * @param {!String} keyName Name of corresponding key
 * @param {String} valueName Name of current value
 * @param {String} parentKeyName Name of parent key name
 * @param {Boolean} isArray Whether or not we are inside an array
 * @param {Array.<String>} exclusionList An array of keys that have already been used in the context of an object
 * @param {Boolean} shouldReplace Should we just replace the current token or also add colons/braces/brackets to it
 * @return {!{token: Object, tokenType: number, offset: number, keyName: String, valueName: String, parentKeyName: String, isArray: Boolean, exclusionList: Array.<String>, shouldReplace: Boolean}}
 */
function _createContextInfo(
    token: CodeMirror.Token,
    tokenType: number,
    offset: number,
    keyName: string,
    valueName: string,
    parentKeyName: string,
    isArray: boolean | null,
    exclusionList: Array<string> | null,
    shouldReplace: boolean
): ContextInfo {
    return {
        token: token || null,
        tokenType: tokenType || null,
        offset: offset || 0,
        keyName: keyName || null,
        valueName: valueName || null,
        parentKeyName: parentKeyName || null,
        isArray: isArray || false,
        exclusionList: exclusionList || [],
        shouldReplace: shouldReplace || false
    };
}

/**
 * Removes the quotes around a string
 *
 * @param {!String} string
 * @return {String}
 */
export function stripQuotes(string: null): null;
export function stripQuotes(string: string): string;
export function stripQuotes(string: string | null): string | null;
export function stripQuotes(string: string | null): string | null {
    if (string) {
        if (/^['"]$/.test(string.charAt(0))) {
            string = string.substr(1);
        }
        if (/^['"]$/.test(string.substr(-1, 1))) {
            string = string.substr(0, string.length - 1);
        }
    }
    return string;
}

/**
 * @private
 *
 * Returns the name of parent object
 *
 * @param {!{editor:!CodeMirror, pos:!{ch:number, line:number}, token:Object}} ctx
 * @return {String}
 */
function _getParentKeyName(ctx: TokenUtils.Context): string | null {
    let parentKeyName;
    let braceParity = 1;
    let hasColon;

    // Move the context back to find the parent key.
    while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx)) {
        if (ctx.token.type === null) {
            if (ctx.token.string === "}") {
                braceParity++;
            } else if (ctx.token.string === "{") {
                braceParity--;
            }
        }

        if (braceParity === 0) {
            while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx)) {
                if (ctx.token.type === null && ctx.token.string === ":") {
                    hasColon = true;
                } else if (ctx.token.type === "string property") {
                    parentKeyName = stripQuotes(ctx.token.string);
                    break;
                }
            }
            break;
        }
    }

    if (parentKeyName && hasColon) {
        return parentKeyName;
    }
    return null;
}

/**
 * @private
 *
 * Returns a list of properties that are already used by an object
 *
 * @param {!Editor} editor
 * @param {!{line: number, ch: number}} constPos
 * @return {Array.<String>}
 */
function _getExclusionList(editor: Editor, constPos: CodeMirror.Position): Array<string> {
    const exclusionList: Array<string> = [];

    // Move back to find exclusions.
    let pos = $.extend({}, constPos);
    let braceParity = 1;
    const ctxPrev = TokenUtils.getInitialContext(editor._codeMirror, pos);
    while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrev)) {
        if (ctxPrev.token.type === null) {
            if (ctxPrev.token.string === "}") {
                braceParity++;
            } else if (ctxPrev.token.string === "{") {
                braceParity--;
            }
        }

        if (braceParity === 1 && ctxPrev.token.type === "string property") {
            exclusionList.push(stripQuotes(ctxPrev.token.string));
        } else if (braceParity === 0) {
            break;
        }
    }

    // Move forward and find exclusions.
    pos = $.extend({}, constPos);
    braceParity = 1;
    const ctxNext = TokenUtils.getInitialContext(editor._codeMirror, pos);
    while (TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNext)) {
        if (ctxNext.token.type === null) {
            if (ctxNext.token.string === "{") {
                braceParity++;
            } else if (ctxNext.token.string === "}") {
                braceParity--;
            }
        }

        if (braceParity === 1 && ctxNext.token.type === "string property") {
            exclusionList.push(stripQuotes(ctxNext.token.string));
        } else if (braceParity === 0) {
            break;
        }
    }

    return exclusionList;
}

/**
 * Returns context info at a given position in editor
 *
 * @param {!Editor} editor
 * @param {!{line: number, ch: number}} constPos Position of cursor in the editor
 * @param {Boolean} requireParent If true will look for parent key name
 * @param {Boolean} requireNextToken if true we can replace the next token of a value.
 * @return {!{token: Object, tokenType: number, offset: number, keyName: String, valueName: String, parentKeyName: String, isArray: Boolean, exclusionList: Array.<String>, shouldReplace: Boolean}}
 */
export function getContextInfo(editor: Editor, constPos: CodeMirror.Position, requireParent: boolean, requireNextToken?: boolean): ContextInfo | null {
    let ctxPrev;
    let keyName;
    let valueName;
    let parentKeyName;
    let hasColon;
    let hasComma;
    let hasBracket;
    let shouldReplace;

    let pos = $.extend({}, constPos);
    const ctx = TokenUtils.getInitialContext(editor._codeMirror, pos);
    const offset = TokenUtils.offsetInToken(ctx);

    if (ctx.token && ctx.token.type === "string property") {
        // String literals used as keys.

        // Disallow hints if cursor is out of the string.
        if (/^['"]$/.test(ctx.token.string.substr(-1, 1)) &&
                ctx.token.string.length !== 1 && ctx.token.end === pos.ch) {
            return null;
        }
        keyName = stripQuotes(ctx.token.string);

        // Get parent key name.
        if (requireParent) {
            ctxPrev = $.extend(true, {}, ctx);
            const foo = _getParentKeyName(ctxPrev);
            parentKeyName = stripQuotes(foo);
        }

        // Check if the key is followed by a colon, so we should not append colon again.
        const ctxNext = $.extend(true, {}, ctx);
        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctxNext);
        if (ctxNext.token.type === null && ctxNext.token.string === ":") {
            shouldReplace = true;
        }

        // Get an exclusion list of properties.
        pos = $.extend({}, constPos);
        const exclusionList = _getExclusionList(editor, pos);

        return _createContextInfo(ctx.token, TOKEN_KEY, offset, keyName, valueName, parentKeyName, null, exclusionList, shouldReplace);
    }

    if (ctx.token && (valueTokenTypes.indexOf(ctx.token.type!) !== -1 ||
                            (ctx.token.type === null && regexAllowedChars.test(ctx.token.string)))) {
        // Boolean, String, Number and variable literal values.

        // Disallow hints if cursor is out of the string.
        if (ctx.token.type === "string" && /^['"]$/.test(ctx.token.string.substr(-1, 1)) &&
                ctx.token.string.length !== 1 && ctx.token.end === pos.ch) {
            return null;
        }
        valueName = ctx.token.string;

        // Check the current token
        if (ctx.token.type === null) {
            if (ctx.token.string === ":") {
                hasColon = true;
            } else if (ctx.token.string === ",") {
                hasComma = true;
            } else if (ctx.token.string === "[") {
                hasBracket = true;
            }
        }

        // move context back and find corresponding key name.
        ctxPrev = $.extend(true, {}, ctx);
        while (TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctxPrev)) {
            if (ctxPrev.token.type === "string property") {
                keyName = stripQuotes(ctxPrev.token.string);
                break;
            } else if (ctxPrev.token.type === null) {
                if (ctxPrev.token.string === ":") {
                    hasColon = true;
                } else if (ctxPrev.token.string === ",") {
                    hasComma = true;
                } else if (ctxPrev.token.string === "[") {
                    hasBracket = true;
                } else {
                    return null;
                }
            } else if (!hasComma) {
                return null;
            }
        }

        // If no key name or colon found OR
        // If we have a comma but no opening bracket, return null.
        if ((!keyName || !hasColon) || (hasComma && !hasBracket)) {
            return null;
        }

        const isArray = hasBracket;

        // Get parent key name.
        if (requireParent) {
            ctxPrev = $.extend(true, {}, ctx);
            parentKeyName = stripQuotes(_getParentKeyName(ctxPrev));
        }

        // Check if we can replace the next token of a value.
        const ctxNext = $.extend(true, {}, ctx);
        TokenUtils.moveNextToken(ctxNext);
        if (requireNextToken && valueTokenTypes.indexOf(ctxNext.token.type) !== -1) {
            shouldReplace = true;
        }

        return _createContextInfo((shouldReplace) ? ctxNext.token : ctx.token, TOKEN_VALUE, offset, keyName, valueName, parentKeyName, isArray, null, shouldReplace);
    }

    return null;
}
