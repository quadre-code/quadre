/*
 * Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
 * Copyright (c) 2022 - present The quadre code authors. All rights reserved.
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

/*
 * Utilities functions related to refactoring
 */

const Acorn         = brackets.getModule("thirdparty/acorn/acorn");
const ASTWalker     = brackets.getModule("thirdparty/acorn/walk");
const MessageIds    = brackets.getModule("JSUtils/MessageIds");
const _             = brackets.getModule("thirdparty/lodash");
const AcornLoose    = brackets.getModule("thirdparty/acorn/acorn_loose");
const ScopeManager  = brackets.getModule("JSUtils/ScopeManager");

import * as Templates from "text!Templates.json";
const templates = JSON.parse(Templates);

interface Scope {
    isClass?: boolean;
    name?: string;
    originNode?: any;
    prev?: any;
}

// Length of the function body used as function name for nameless functions
const FUNCTION_BODY_PREFIX_LENGTH = 30;

/**
 * Checks whether two ast nodes are equal
 * @param {!ASTNode} a
 * @param {!ASTNode} b
 * @return {boolean}
 */
export function isEqual(a, b) {
    return a.start === b.start && a.end === b.end;
}

/**
 * Gets a expression surrounding start and end (if any)
 * @param {!ASTNode} ast - the ast of the complete file
 * @param {!number} start - the start offset
 * @param {!number} end - the end offset
 * @param {!string} fileText - the entire file text
 * @return {ASTNode|boolean}
 */
export function getExpression(ast, start, end, fileText) {
    const expn = findSurroundExpression(ast, {start: start, end: end});
    if (!expn) {
        return false;
    }

    // Class Expression also includes the trailing semicolon
    // Add special case for it
    if (expn.type === "ClassExpression" && expn.start === start && expn.end - end <= 1) {
        expn.end = end;
        return expn;
    }

    if (expn.start === start && expn.end === end) {
        return expn;
    }

    // Subexpressions are possible only for BinaryExpression, LogicalExpression and SequenceExpression
    if (!(["BinaryExpression", "LogicalExpression", "SequenceExpression"].includes(expn.type))) {
        return false;
    }

    // Check subexpression
    const parentExpn = expn;
    const parentExpStr = fileText.substr(parentExpn.start, parentExpn.end - parentExpn.start);

    // Check whether the parentExpn forms a valid expression after replacing the sub expression
    const str = parentExpStr.substr(0, start - parentExpn.start) + "placeHolder" + parentExpStr.substr(end - parentExpn.start);
    const node = isStandAloneExpression(str);
    if (node && node.type === parentExpn.type) {
        return parentExpn;
    }

    return false;
}

export function getAST(text) {
    let ast;
    try {
        ast = Acorn.parse(text, {ecmaVersion: 9});
    } catch (e) {
        ast = Acorn.parse_dammit(text, {ecmaVersion: 9});
    }
    return ast;
}

/**
 * Checks whether the text between start and end offsets form a valid set of statements
 * @param {!ASTNode} ast - the ast of the complete file
 * @param {!number} start - the start offset
 * @param {!number} end - the end offset
 * @param {!string} fileText - the entire file text
 * @return {boolean}
 */
export function checkStatement(ast, start, end, fileText) {
    // Do not allow function or class nodes
    let notStatement = false;
    ASTWalker.simple(getAST(fileText.substr(start, end - start)), {
        FunctionDeclaration: function (node) {
            notStatement = true;
        },
        ClassDeclaration: function (node) {
            notStatement = true;
        }
    });

    if (notStatement) {
        return false;
    }

    const startStatement = findSurroundASTNode(ast, {start: start}, ["Statement"]);
    const endStatement   = findSurroundASTNode(ast, {start: end}, ["Statement"]);

    return startStatement && endStatement && startStatement.start === start &&
        startStatement.end <= end && endStatement.start >= start &&
        endStatement.end === end;
}

/**
 * Gets a unique identifier name in the scope that starts with prefix
 * @param {!Scope} scopes - an array of all scopes returned from tern (each element contains 'props' with identifiers
 *  in that scope)
 * @param {!string} prefix - prefix of the identifier
 * @param {number} num - number to start checking for
 * @return {!string} identifier name
 */
export function getUniqueIdentifierName(scopes, prefix, num?) {
    if (!scopes) {
        return prefix;
    }

    const props = scopes.reduce(function (props, scope) {
        return _.union(props, _.keys(scope.props));
    }, []);

    if (!props) {
        return prefix;
    }

    num = num || "1";
    let name;
    while (num < 100) { // limit search length
        name = prefix + num;
        if (props.indexOf(name) === -1) {
            break;
        }
        ++num;
    }
    return name;
}

/**
 * Returns the no of lines in the text
 * @param {!string} text
 * @return {number}
 */
export function numLines(text) {
    return text.split("\n").length;
}

/**
 * Checks whether the text forms a stand alone expression without considering the context of text
 * @param {!string} text
 * @return {boolean}
 */
export function isStandAloneExpression(text) {
    const found = ASTWalker.findNodeAt(getAST(text), 0, text.length, function (nodeType, node) {
        if (nodeType === "Expression") {
            return true;
        }
        return false;
    });
    return found && found.node;
}

/**
 * Requests scope data from tern
 * @param {!Session} session
 * @param {!{line: number, ch: number}} offset
 * @return {!$.Promise} a jQuery promise that will be resolved with the scope data
 */
export function getScopeData(session, offset) {
    const path = session.path;
    const fileInfo = {
        type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
        name: path,
        offsetLines: 0,
        text: ScopeManager.filterText(session.getJavascriptText())
    };

    ScopeManager.postMessage({
        type: MessageIds.TERN_SCOPEDATA_MSG,
        fileInfo: fileInfo,
        offset: offset
    });

    const ternPromise = ScopeManager.addPendingRequest(fileInfo.name, offset, MessageIds.TERN_SCOPEDATA_MSG);

    const result = $.Deferred();

    ternPromise.done(function (response) {
        result.resolveWith(null, [response.scope]);
    }).fail(function () {
        result.reject();
    });

    return result;
}

/**
 * Normalize text by removing leading and trailing whitespace characters
 * and moves the start and end offset to reflect the new offset
 * @param {!string} text - selected text
 * @param {!number} start - the start offset of the text
 * @param {!number} end - the end offset of the text
 * @param {!boolean} removeTrailingSemiColons - removes trailing semicolons also if true
 * @return {!{text: string, start: number, end: number}}
 */
export function normalizeText(text, start, end, removeTrailingSemiColons?) {
    // Remove leading spaces
    let trimmedText = _.trimLeft(text);

    if (trimmedText.length < text.length) {
        start += (text.length - trimmedText.length);
    }

    text = trimmedText;

    // Remove trailing spaces
    trimmedText = _.trimRight(text);

    if (trimmedText.length < text.length) {
        end -= (text.length - trimmedText.length);
    }

    text = trimmedText;

    // Remove trailing semicolons
    if (removeTrailingSemiColons) {
        trimmedText = _.trimRight(text, ";");

        if (trimmedText.length < text.length) {
            end -= (text.length - trimmedText.length);
        }
    }

    return {
        text: trimmedText,
        start: start,
        end: end
    };
}

/**
 * Checks whether the scope is a function scope
 */
export function isFnScope(scope) {
    return !scope.isBlock && !scope.isCatch;
}

export function findSurroundExpression(ast, expn) {
    let start = expn.start;
    const end = expn.end;

    while (true) {
        const surroundExpn = findSurroundASTNode(ast, {start: start, end: end}, ["Expression"]);

        if (!surroundExpn) {
            return null;
        }

        // Do not allow sequence expressions
        if (surroundExpn.type === "SequenceExpression") {
            start = surroundExpn.start - 1;
        } else if (surroundExpn.type === "FunctionExpression") { // Do not allow method definition expressions
            const methodDefinitionNode = findSurroundASTNode(ast, surroundExpn, ["MethodDefinition"]);
            if (methodDefinitionNode && isEqual(methodDefinitionNode.value, surroundExpn)) {
                start = surroundExpn.start - 1;
            } else {
                return surroundExpn;
            }
        } else {
            return surroundExpn;
        }
    }
}

/**
 * Finds the surrounding ast node of the given expression of any of the given types
 * @param {!ASTNode} ast
 * @param {!{start: number, end: number}} expn - contains start and end offsets of expn
 * @param {!Array.<string>} types
 * @return {?ASTNode}
 */
export function findSurroundASTNode(ast, expn, types) {
    const foundNode = ASTWalker.findNodeAround(ast, expn.start, function (nodeType, node) {
        if (expn.end) {
            return types.includes(nodeType) && node.end >= expn.end;
        }

        return types.includes(nodeType);
    });
    return foundNode && _.clone(foundNode.node);
}

/**
 * Converts the scopes returned from tern to an array of scopes and adds id and name to the scope
 * Also checks for class scopes
 * @param {!ASTNode} ast - ast of the complete file
 * @param {!Scope} scope - scope returned from tern
 * @param {!string} fullText - the complete text of a file
 * @return {!Array.<Scope>}
 */
export function getAllScopes(ast, scope, fullText) {
    let curScope = scope;
    let cnt = 0;
    const scopes: Array<Scope> = [];

    while (curScope) {
        curScope.id = cnt++;
        scopes.push(curScope);

        if (curScope.fnType) {
            // Check for class scopes surrounding the function
            if (curScope.fnType === "FunctionExpression") {
                const methodDefinitionNode = findSurroundASTNode(ast, curScope.originNode, ["MethodDefinition"]);
                // class scope found
                if (methodDefinitionNode && isEqual(methodDefinitionNode.value, curScope.originNode)) {
                    // Change curScope name and originNode to that of methodDefinitionNode
                    curScope.name = methodDefinitionNode.key.name;
                    curScope.originNode = methodDefinitionNode;

                    const classNode = findSurroundASTNode(ast, methodDefinitionNode, ["ClassDeclaration", "ClassExpression"]);

                    if (classNode) {
                        // Class Declaration found add it to scopes
                        const temp = curScope.prev;
                        const newScope: Scope = {};
                        newScope.isClass = true;

                        // if the class is class expression, check if it has a name
                        if (classNode.type === "ClassExpression") {
                            const assignmentExpNode = findSurroundASTNode(ast, classNode, ["AssignmentExpression"]);
                            if (assignmentExpNode && assignmentExpNode.left && assignmentExpNode.left.name) {
                                newScope.name = "class " + assignmentExpNode.left.name;
                            } else {
                                const varDeclaratorNode = findSurroundASTNode(ast, classNode, ["VariableDeclarator"]);
                                if (varDeclaratorNode && varDeclaratorNode.id && varDeclaratorNode.id.name) {
                                    newScope.name = "class " + varDeclaratorNode.id.name;
                                } else {
                                    newScope.name = "class null";
                                }
                            }
                        } else {
                            newScope.name = "class " + (classNode.id && classNode.id.name);
                        }
                        newScope.originNode = classNode;
                        curScope.prev = newScope;
                        newScope.prev = temp;
                    }
                } else {
                    // For function expressions, assign name to prefix of the function body
                    curScope.name = "function starting with " +
                        fullText.substr(
                            curScope.originNode.body.start,
                            Math.min(
                                FUNCTION_BODY_PREFIX_LENGTH,
                                curScope.originNode.body.end - curScope.originNode.body.start
                            )
                        );
                }
            } else {
                // Acorn parse_dammit marks name with '✖' under erroneous declarations, check it
                if (curScope.fnType === "✖") {
                    curScope.name = "function starting with " +
                        fullText.substr(
                            curScope.originNode.body.start,
                            Math.min(
                                FUNCTION_BODY_PREFIX_LENGTH,
                                curScope.originNode.body.end - curScope.originNode.body.start
                            )
                        );
                } else {
                    curScope.name = curScope.fnType;
                }
            }
        } else if (!curScope.originNode) {
            curScope.name = "global";
        }

        curScope = curScope.prev;
    }
    return scopes;
}

/**
 * Note - To use these state defined in Refactoring Session,
 * Please reinitialize this RefactoringSession after performing any of the below operations
 * (i.e. replaceRange, setSelection or indentLine)
 *
 * RefactoringSession objects encapsulate state associated with a refactoring session
 * and This will help finding information around documents, selection,
 * position, ast, and queries around AST nodes
 *
 * @constructor
 * @param {Editor} editor - the editor context for the session
 */
export class RefactoringSession {
    public editor;
    public document;
    private selection;
    public text;
    public selectedText;
    public cm;
    public startIndex;
    public endIndex;
    public startPos;
    public endPos;
    public ast;

    constructor(editor) {
        this.editor = editor;
        this.document = editor.document;
        this.selection = editor.getSelection();
        this.text = this.document.getText();
        this.selectedText = editor.getSelectedText();
        this.cm = editor._codeMirror;
        this.startIndex = editor.indexFromPos(this.selection.start);
        this.endIndex = editor.indexFromPos(this.selection.end);
        this.startPos = this.selection.start;
        this.endPos = this.selection.end;
        this.ast = this.createAstOfCurrentDoc();
    }

    /**
     * Get the end position of given line
     *
     * @param {number} line - line number
     * @return {{line: number, ch: number}} - line end position
     */
    public lineEndPosition(line) {
        const lineText = this.document.getLine(line);

        return {
            line: line,
            ch: lineText.length
        };
    }

    /**
     * Get the ast of current opened document in focused editor
     *
     * @return {Object} - Ast of current opened doc
     */
    public createAstOfCurrentDoc() {
        let ast;
        const text = this.document.getText();
        try {
            ast = Acorn.parse(text);
        } catch (e) {
            ast = Acorn.parse_dammit(text);
        }
        return ast;
    }

    /**
     * This will add template at given position/selection
     *
     * @param {string} template - name of the template defined in templates.json
     * @param {Array} args- Check all arguments that exist in defined templated pass all that args as array
     * @param {{line: number, ch: number}} rangeToReplace - Range which we want to replace
     * @param {string} subTemplate - If template written under some category
     */
    public replaceTextFromTemplate(template, args, rangeToReplace?, subTemplate?) {
        let templateText = templates[template];

        if (subTemplate) {
            templateText = templateText[subTemplate];
        }

        const compiled = _.template(templateText);
        const formattedText = compiled(args);

        if (!rangeToReplace) {
            rangeToReplace = this.editor.getSelection();
        }

        this.document.replaceRange(formattedText, rangeToReplace.start, rangeToReplace.end);

        const startLine = rangeToReplace.start.line;
        const endLine = startLine + formattedText.split("\n").length;

        for (let i = startLine + 1; i < endLine; i++) {
            this.cm.indentLine(i);
        }
    }

    /**
     * Get Params of selected function
     *
     * @param {number} start- start offset
     * @param {number} end - end offset
     * @param {string} selectedText - Create ast for only selected node
     * @return {Array} param - Array of all parameters in function
     */
    public getParamsOfFunction(start, end, selectedText) {
        const param: Array<string> = [];
        ASTWalker.simple(AcornLoose.parse_dammit(selectedText), {
            Function: function (node) {
                if (node.type === "FunctionDeclaration") {
                    node.params.forEach(function (item) {
                        param.push(item.name);
                    });
                }
            }
        });

        return param;
    }

    /**
     * Get the Parent node
     *
     * @param {Object} ast - ast of full document
     * @param {number} start - start Offset
     * @return {Object} node - Returns the parent node of node which is at offset start
     */
    public getParentNode(ast, start) {
        const foundNode = ASTWalker.findNodeAround(ast, start, function (nodeType, node) {
            return (nodeType === "ObjectExpression");
        });
        return foundNode && foundNode.node;
    }

    /**
     * Checks weather the node at start is last in that scope or not
     *
     * @param {Object} ast - ast of full document
     * @param {number} start - start Offset
     * @return {boolean} - is last node in that scope
     */
    public isLastNodeInScope(ast, start) {
        const parentNode = this.getParentNode(ast, start);
        let currentNodeStart;

        ASTWalker.simple(parentNode, {
            Property: function (node) {
                currentNodeStart = node.start;
            }
        });

        return start >= currentNodeStart;
    }
}
