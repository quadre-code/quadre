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

/*unittests: HTML Instrumentation*/

import { type Token, Tokenizer } from "language/HTMLTokenizer";
import * as MurmurHash3 from "thirdparty/murmurhash3_gc";
import * as PerfUtils from "utils/PerfUtils";

export type DOMNode<T extends object> = SimpleNode & T;
export type DOMNodePosition = DOMNode<{
    start: number;
    startPos: CodeMirror.Position;
    end?: number;
    endPos?: CodeMirror.Position;
}>;

export const _seed = Math.floor(Math.random() * 65535);

let tagID = 1;

/**
 * A list of tags whose start causes any of a given set of immediate parent
 * tags to close. This mostly comes from the HTML5 spec section on omitted close tags:
 * http://www.w3.org/html/wg/drafts/html/master/syntax.html#optional-tags
 * This doesn't handle general content model violations.
 */
const openImpliesClose = {
    li      : { li: true },
    dt      : { dd: true, dt: true },
    dd      : { dd: true, dt: true },
    address : { p: true },
    article : { p: true },
    aside   : { p: true },
    blockquote : { p: true },
    colgroup: { caption: true },
    details : { p: true },
    dir     : { p: true },
    div     : { p: true },
    dl      : { p: true },
    fieldset: { p: true },
    figcaption: { p: true },
    figure  : { p: true },
    footer  : { p: true },
    form    : { p: true },
    h1      : { p: true },
    h2      : { p: true },
    h3      : { p: true },
    h4      : { p: true },
    h5      : { p: true },
    h6      : { p: true },
    header  : { p: true },
    hgroup  : { p: true },
    hr      : { p: true },
    main    : { p: true },
    menu    : { p: true },
    nav     : { p: true },
    ol      : { p: true },
    p       : { p: true },
    pre     : { p: true },
    section : { p: true },
    table   : { p: true },
    ul      : { p: true },
    rb      : { rb: true, rt: true, rtc: true, rp: true },
    rp      : { rb: true, rt: true, rp: true },
    rt      : { rb: true, rt: true, rp: true },
    rtc     : { rb: true, rt: true, rtc: true, rp: true },
    optgroup: { optgroup: true, option: true },
    option  : { option: true },
    tbody   : { caption: true, colgroup: true, thead: true, tbody: true, tfoot: true },
    tfoot   : { caption: true, colgroup: true, thead: true, tbody: true },
    thead   : { caption: true, colgroup: true },
    tr      : { tr: true, th: true, td: true, caption: true },
    th      : { th: true, td: true },
    td      : { th: true, td: true },
    body    : { head: true }
};

/**
 * A list of elements which are automatically closed when their parent is closed:
 * http://www.w3.org/html/wg/drafts/html/master/syntax.html#optional-tags
 */
const optionalClose = {
    html: true,
    body: true,
    li: true,
    dd: true,
    dt: true, // This is not actually correct, but showing a syntax error is not helpful
    p: true,
    rb: true,
    rt: true,
    rtc: true,
    rp: true,
    optgroup: true,
    option: true,
    colgroup: true,
    caption: true,
    tbody: true,
    tfoot: true,
    tr: true,
    td: true,
    th: true
};

// TODO: handle optional start tags

/**
 * A list of tags that are self-closing (do not contain other elements).
 * Mostly taken from http://www.w3.org/html/wg/drafts/html/master/syntax.html#void-elements
 */
const voidElements = {
    area: true,
    base: true,
    basefont: true,
    br: true,
    col: true,
    command: true,
    embed: true,
    frame: true,
    hr: true,
    img: true,
    input: true,
    isindex: true,
    keygen: true,
    link: true,
    menuitem: true,
    meta: true,
    param: true,
    source: true,
    track: true,
    wbr: true
};

/**
 * A SimpleNode represents one node in a SimpleDOM tree. Each node can have
 * any set of properties on it, though there are a couple of assumptions made.
 * Elements will have `children` and `attributes` properties. Text nodes will have a `content`
 * property. All Elements will have a `tagID` and text nodes *can* have one.
 *
 * @constructor
 *
 * @param {Object} properties the properties provided will be set on the new object.
 */
export class SimpleNode {
    public children;
    public childSignature;
    public subtreeSignature;
    public textSignature;
    public attributeSignature;
    public content: string;
    public attributes: Record<string, string | number>;
    public tagID: number;
    public parent: SimpleNode;
    public tag: string;
    public nodeMap: Record<string, SimpleNode>;

    constructor(properties) {
        $.extend(this, properties);
    }

    /**
     * Updates signatures used to optimize the number of comparisons done during
     * diffing. This is important to call if you change:
     *
     * * children
     * * child node attributes
     * * text content of a text node
     * * child node text
     */
    public update(): void {
        if (this.isElement()) {
            let subtreeHashes = "";
            let childHashes = "";
            for (const child of this.children) {
                if (child.isElement()) {
                    childHashes += String(child.tagID);
                    subtreeHashes += String(child.tagID) + child.attributeSignature + child.subtreeSignature;
                } else {
                    childHashes += child.textSignature;
                    subtreeHashes += child.textSignature;
                }
            }
            this.childSignature = MurmurHash3.hashString(childHashes, childHashes.length, _seed);
            this.subtreeSignature = MurmurHash3.hashString(subtreeHashes, subtreeHashes.length, _seed);
        } else {
            this.textSignature = MurmurHash3.hashString(this.content, this.content.length, _seed);
        }
    }

    /**
     * Updates the signature of this node's attributes. Call this after making attribute changes.
     */
    public updateAttributeSignature(): void {
        const attributeString = JSON.stringify(this.attributes);
        this.attributeSignature = MurmurHash3.hashString(attributeString, attributeString.length, _seed);
    }

    /**
     * Is this node an element node?
     *
     * @return {bool} true if it is an element
     */
    public isElement(): boolean {
        return !!this.children;
    }

    /**
     * Is this node a text node?
     *
     * @return {bool} true if it is text
     */
    public isText(): boolean {
        return !this.children;
    }
}

/**
 * @private
 *
 * Generates a synthetic ID for text nodes. These IDs are only used
 * for convenience when reading a SimpleDOM that is dumped to the console.
 *
 * @param {Object} textNode new node for which we are generating an ID
 * @return {string} ID for the node
 */
export function _getTextNodeID(textNode: SimpleNode): string {
    const childIndex = textNode.parent.children.indexOf(textNode);
    if (childIndex === 0) {
        return textNode.parent.tagID + ".0";
    }
    return textNode.parent.children[childIndex - 1].tagID + "t";
}

/**
 * @private
 *
 * Adds two {line, ch}-style positions, returning a new pos.
 */
function _addPos(pos1: CodeMirror.Position, pos2: CodeMirror.Position): CodeMirror.Position {
    return {line: pos1.line + pos2.line, ch: (pos2.line === 0 ? pos1.ch + pos2.ch : pos2.ch)};
}

/**
 * @private
 *
 * Offsets the character offset of the given {line, ch} pos by the given amount and returns a new
 * pos. Not for general purpose use as it does not account for line boundaries.
 */
export function _offsetPos(pos: CodeMirror.Position, offset: number): CodeMirror.Position {
    return {line: pos.line, ch: pos.ch + offset};
}

/**
 * A Builder creates a SimpleDOM tree of SimpleNode objects representing the
 * "important" contents of an HTML document. It does not include things like comments.
 * The nodes include information about their position in the text provided.
 *
 * @constructor
 *
 * @param {string} text The text to parse
 * @param {?int} startOffset starting offset in the text
 * @param {?{line: int, ch: int}} startOffsetPos line/ch position in the text
 */
export class Builder {
    private stack: Array<any>;
    private text: string;
    private t: Tokenizer;
    private currentTag;
    private startOffset: number;
    private startOffsetPos;
    public errors: Array<unknown>;

    constructor(text, startOffset?, startOffsetPos?) {
        this.stack = [];
        this.text = text;
        this.t = new Tokenizer(text);
        this.currentTag = null;
        this.startOffset = startOffset || 0;
        this.startOffsetPos = startOffsetPos || {line: 0, ch: 0};
    }

    private _logError(token: Token | null): void {
        const error: any = { token: token };
        const startPos    = token ? (token.startPos || token.endPos) : this.startOffsetPos;
        const endPos      = token ? token.endPos : this.startOffsetPos;

        error.startPos = _addPos(this.startOffsetPos, startPos);
        error.endPos = _addPos(this.startOffsetPos, endPos);

        if (!this.errors) {
            this.errors = [];
        }

        this.errors.push(error);
    }

    /**
     * Builds the SimpleDOM.
     *
     * @param {?bool} strict if errors are detected, halt and return null
     * @param {?Object} markCache a cache that can be used in ID generation (is passed to `getID`)
     * @return {SimpleNode} root of tree or null if parsing failed
     */
    public build(strict?: boolean, markCache?): SimpleNode | null {
        const self = this;
        let token: Token | null;
        let lastClosedTag;
        let lastTextNode;
        const stack = this.stack;
        let attributeName: string | null = null;
        const nodeMap = {};

        markCache = markCache || {};

        // Start timers for building full and partial DOMs.
        // Appropriate timer is used, and the other is discarded.
        let timerBuildFull = "HTMLInstr. Build DOM Full";
        let timerBuildPart = "HTMLInstr. Build DOM Partial";
        // timer handles
        const timers = PerfUtils.markStart([timerBuildFull, timerBuildPart])!;
        timerBuildFull = timers[0];
        timerBuildPart = timers[1];

        function closeTag(endIndex: number, endPos: CodeMirror.Position): void {
            lastClosedTag = stack[stack.length - 1];
            stack.pop();
            lastClosedTag.update();

            lastClosedTag.end = self.startOffset + endIndex;
            lastClosedTag.endPos = _addPos(self.startOffsetPos, endPos);
        }

        while ((token = this.t.nextToken()) !== null) {
            // lastTextNode is used to glue text nodes together
            // If the last node we saw was text but this one is not, then we're done gluing.
            // If this node is a comment, we might still encounter more text.
            if (token.type !== "text" && token.type !== "comment" && lastTextNode) {
                lastTextNode = null;
            }

            if (token.type === "error") {
                PerfUtils.finalizeMeasurement(timerBuildFull);  // discard
                PerfUtils.addMeasurement(timerBuildPart);       // use
                this._logError(token);
                return null;
            }

            if (token.type === "opentagname") {
                const newTagName = token.contents.toLowerCase();

                if (openImpliesClose.hasOwnProperty(newTagName)) {
                    const closable = openImpliesClose[newTagName];
                    while (stack.length > 0 && closable.hasOwnProperty(stack[stack.length - 1].tag)) {
                        // Close the previous tag at the start of this tag.
                        // Adjust backwards for the < before the tag name.
                        closeTag(token.start - 1, _offsetPos(token.startPos!, -1));
                    }
                }

                const newTag = new SimpleNode({
                    tag: token.contents.toLowerCase(),
                    children: [],
                    attributes: {},
                    parent: (stack.length ? stack[stack.length - 1] : null),
                    start: this.startOffset + token.start - 1,
                    startPos: _addPos(this.startOffsetPos, _offsetPos(token.startPos!, -1)) // ok because we know the previous char was a "<"
                });
                newTag.tagID = this.getID(newTag, markCache);

                // During undo in particular, it's possible that tag IDs may be reused and
                // the marks in the document may be misleading. If a tag ID has been reused,
                // we apply a new tag ID to ensure that our edits come out correctly.
                if (nodeMap[newTag.tagID]) {
                    newTag.tagID = this.getNewID();
                }

                nodeMap[newTag.tagID] = newTag;
                if (newTag.parent) {
                    newTag.parent.children.push(newTag);
                }
                this.currentTag = newTag;

                if (voidElements.hasOwnProperty(newTag.tag)) {
                    // This is a self-closing element.
                    newTag.update();
                } else {
                    stack.push(newTag);
                }
            } else if (token.type === "opentagend" || token.type === "selfclosingtag") {
                // TODO: disallow <p/>?
                if (this.currentTag) {
                    if (token.type === "selfclosingtag" && stack.length && stack[stack.length - 1] === this.currentTag) {
                        // This must have been a self-closing tag that we didn't identify as a void element
                        // (e.g. an SVG tag). Pop it off the stack as if we had encountered its close tag.
                        closeTag(token.end, token.endPos);
                    } else {
                        // We're ending an open tag. Record the end of the open tag as the end of the
                        // range. (If we later find a close tag for this tag, the end will get overwritten
                        // with the end of the close tag. In the case of a self-closing tag, we should never
                        // encounter that.)
                        // Note that we don't need to update the signature here because the signature only
                        // relies on the tag name and ID, and isn't affected by the tag's attributes, so
                        // the signature we calculated when creating the tag is still the same. If we later
                        // find a close tag for this tag, we'll update the signature to account for its
                        // children at that point (in the next "else" case).
                        this.currentTag.end = this.startOffset + token.end;
                        this.currentTag.endPos = _addPos(this.startOffsetPos, token.endPos);
                        lastClosedTag = this.currentTag;
                        this.currentTag.updateAttributeSignature();
                        this.currentTag = null;
                    }
                }
            } else if (token.type === "closetag") {
                // If this is a self-closing element, ignore the close tag.
                const closeTagName = token.contents.toLowerCase();
                if (!voidElements.hasOwnProperty(closeTagName)) {
                    // Find the topmost item on the stack that matches. If we can't find one, assume
                    // this is just a dangling closing tag and ignore it.
                    let i;
                    for (i = stack.length - 1; i >= 0; i--) {
                        if (stack[i].tag === closeTagName) {
                            break;
                        }
                    }
                    if (i >= 0) {
                        do {
                            // For all tags we're implicitly closing (before we hit the matching tag), we want the
                            // implied end to be the beginning of the close tag (which is two characters, "</", before
                            // the start of the tagname). For the actual tag we're explicitly closing, we want the
                            // implied end to be the end of the close tag (which is one character, ">", after the end of
                            // the tagname).
                            if (stack.length === i + 1) {
                                closeTag(token.end + 1, _offsetPos(token.endPos, 1));
                            } else {
                                if (strict && !optionalClose.hasOwnProperty(stack[stack.length - 1].tag)) {
                                    // If we're in strict mode, treat unbalanced tags as invalid.
                                    PerfUtils.finalizeMeasurement(timerBuildFull);
                                    PerfUtils.addMeasurement(timerBuildPart);
                                    this._logError(token);
                                    return null;
                                }
                                closeTag(token.start - 2, _offsetPos(token.startPos!, -2));
                            }
                        } while (stack.length > i);
                    } else {
                        // If we're in strict mode, treat unmatched close tags as invalid. Otherwise
                        // we just silently ignore them.
                        if (strict) {
                            PerfUtils.finalizeMeasurement(timerBuildFull);
                            PerfUtils.addMeasurement(timerBuildPart);
                            this._logError(token);
                            return null;
                        }
                    }
                }
            } else if (token.type === "attribname") {
                attributeName = token.contents.toLowerCase();
                // Set the value to the empty string in case this is an empty attribute. If it's not,
                // it will get overwritten by the attribvalue later.
                this.currentTag.attributes[attributeName!] = "";
            } else if (token.type === "attribvalue" && attributeName !== null) {
                this.currentTag.attributes[attributeName] = token.contents;
                attributeName = null;
            } else if (token.type === "text") {
                if (stack.length) {
                    const parent = stack[stack.length - 1];
                    let newNode;

                    // Check to see if we're continuing a previous text.
                    if (lastTextNode) {
                        newNode = lastTextNode;
                        newNode.content += token.contents;
                    } else {
                        newNode = new SimpleNode({
                            parent: stack[stack.length - 1],
                            content: token.contents
                        });
                        parent.children.push(newNode);
                        newNode.tagID = _getTextNodeID(newNode);
                        nodeMap[newNode.tagID] = newNode;
                        lastTextNode = newNode;
                    }

                    newNode.update();
                }
            }
        }

        // If we have any tags hanging open, fail the parse if we're in strict mode,
        // otherwise close them at the end of the document.
        while (stack.length) {
            if (strict && !optionalClose.hasOwnProperty(stack[stack.length - 1].tag)) {
                PerfUtils.finalizeMeasurement(timerBuildFull);
                PerfUtils.addMeasurement(timerBuildPart);
                this._logError(token);
                return null;
            }
            closeTag(this.text.length, this.t._indexPos);
        }

        const dom = lastClosedTag;
        if (!dom) {
            // This can happen if the document has no nontrivial content, or if the user tries to
            // have something at the root other than the HTML tag. In all such cases, we treat the
            // document as invalid.
            this._logError(token);
            return null;
        }

        dom.nodeMap = nodeMap;
        PerfUtils.addMeasurement(timerBuildFull);       // use
        PerfUtils.finalizeMeasurement(timerBuildPart);  // discard

        return dom;
    }

    /**
     * Returns a new tag ID.
     *
     * @return {int} unique tag ID
     */
    public getNewID(): number {
        return tagID++;
    }

    /**
     * Returns the best tag ID for the new tag object given.
     * The default implementation just calls `getNewID`
     * and returns a unique ID.
     *
     * @param {Object} newTag tag object to potentially inspect to choose an ID
     * @return {int} unique tag ID
     */
    public getID(...args): number {
        return this.getNewID();
    }
}

/**
 * Builds a SimpleDOM from the text provided. If `strict` mode is true, parsing
 * will halt as soon as any error is seen and null will be returned.
 *
 * @param {string} text Text of document to parse
 * @param {bool} strict True for strict parsing
 * @return {SimpleNode} root of tree or null if strict failed
 */
export function build(text: string, strict?: boolean): SimpleNode | null {
    const builder = new Builder(text);
    return builder.build(strict);
}

/**
 * @private
 *
 * Generates a string version of a SimpleDOM for debugging purposes.
 *
 * @param {SimpleNode} root root of the tree
 * @return {string} Text version of the tree.
 */
export function _dumpDOM(root: SimpleNode): string {
    let result = "";
    let indent = "";

    function walk(node: SimpleNode): void {
        if (node.tag) {
            result += indent + "TAG " + node.tagID + " " + node.tag + " " + JSON.stringify(node.attributes) + "\n";
        } else {
            result += indent + "TEXT " + (node.tagID || "- ") + node.content + "\n";
        }
        if (node.isElement()) {
            indent += "  ";
            node.children.forEach(walk);
            indent = indent.slice(2);
        }
    }
    walk(root);

    return result;
}
