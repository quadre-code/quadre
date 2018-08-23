(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(require('lodash'), require('codemirror')) :
    typeof define === 'function' && define.amd ? define(['lodash', 'codemirror'], factory) :
    (factory(global._,global.CodeMirror));
 }(this, (function (_,CodeMirror) { 'use strict';
 
    var TokenUtils;
    (function (TokenUtils) {
        var cache;
        function _clearCache(cm) {
            cache = null;
            if (cm) {
                cm.off("changes", _clearCache);
            }
        }
        function _manageCache(cm, line) {
            if (!cache || !cache.tokens || cache.line !== line || cache.cm !== cm) {
                var tokens = cm.getLineTokens(line, false);
                tokens.unshift(cm.getTokenAt({ line: line, ch: 0 }, false));
                cache = {
                    cm: cm,
                    line: line,
                    timeStamp: Date.now(),
                    tokens: tokens
                };
                cm.off("changes", _clearCache);
                cm.on("changes", _clearCache);
            }
            return cache.tokens;
        }
        function getTokenAt(cm, pos, precise) {
            if (precise) {
                _clearCache();
                return cm.getTokenAt(pos, precise);
            }
            var cachedTokens = _manageCache(cm, pos.line), tokenIndex = _.sortedIndex(cachedTokens, { end: pos.ch }), token = cachedTokens[tokenIndex];
            return token || cm.getTokenAt(pos, precise);
        }
        TokenUtils.getTokenAt = getTokenAt;
        function getInitialContext(cm, pos) {
            return {
                "editor": cm,
                "pos": pos,
                "token": cm.getTokenAt(pos, true)
            };
        }
        TokenUtils.getInitialContext = getInitialContext;
        function movePrevToken(ctx, precise) {
            if (precise === undefined) {
                precise = true;
            }
            if (ctx.pos.ch <= 0 || ctx.token.start <= 0) {
                if (ctx.pos.line <= 0) {
                    return false;
                }
                ctx.pos.line--;
                ctx.pos.ch = ctx.editor.getLine(ctx.pos.line).length;
            }
            else {
                ctx.pos.ch = ctx.token.start;
            }
            ctx.token = getTokenAt(ctx.editor, ctx.pos, precise);
            return true;
        }
        TokenUtils.movePrevToken = movePrevToken;
        function isAtStart(ctx) {
            return (ctx.pos.ch <= 0 || ctx.token.start <= 0) && (ctx.pos.line <= 0);
        }
        TokenUtils.isAtStart = isAtStart;
        function moveNextToken(ctx, precise) {
            var eol = ctx.editor.getLine(ctx.pos.line).length;
            if (precise === undefined) {
                precise = true;
            }
            if (ctx.pos.ch >= eol || ctx.token.end >= eol) {
                if (ctx.pos.line >= ctx.editor.lineCount() - 1) {
                    return false;
                }
                ctx.pos.line++;
                ctx.pos.ch = 0;
            }
            else {
                ctx.pos.ch = ctx.token.end + 1;
            }
            ctx.token = getTokenAt(ctx.editor, ctx.pos, precise);
            return true;
        }
        TokenUtils.moveNextToken = moveNextToken;
        function isAtEnd(ctx) {
            var eol = ctx.editor.getLine(ctx.pos.line).length;
            return (ctx.pos.ch >= eol || ctx.token.end >= eol) && (ctx.pos.line >= ctx.editor.lineCount() - 1);
        }
        TokenUtils.isAtEnd = isAtEnd;
        function moveSkippingWhitespace(moveFxn, ctx) {
            if (!moveFxn(ctx)) {
                return false;
            }
            while (!ctx.token.type && !/\S/.test(ctx.token.string)) {
                if (!moveFxn(ctx)) {
                    return false;
                }
            }
            return true;
        }
        TokenUtils.moveSkippingWhitespace = moveSkippingWhitespace;
        function offsetInToken(ctx) {
            var offset = ctx.pos.ch - ctx.token.start;
            if (offset < 0) {
                console.log("CodeHintUtils: _offsetInToken - Invalid context: pos not in the current token!");
            }
            return offset;
        }
        TokenUtils.offsetInToken = offsetInToken;
        function getModeAt(cm, pos, precise) {
            precise = precise || true;
            var modeData = cm.getMode(), name;
            if (modeData.innerMode) {
                modeData = CodeMirror.innerMode(modeData, getTokenAt(cm, pos, precise).state).mode;
            }
            name = modeData.name === "xml" ? modeData.configuration : modeData.name;
            return { mode: modeData, name: name };
        }
        TokenUtils.getModeAt = getModeAt;
    })(TokenUtils || (TokenUtils = {}));
 
    var Editor = (function () {
        function Editor(codeMirror) {
            this._codeMirror = codeMirror;
        }
        Editor.prototype.focus = function () {
            this._codeMirror.focus();
        };
        Editor.prototype.getModeForRange = function (start, end, knownMixed) {
            var outerMode = this._codeMirror.getMode(), startMode = TokenUtils.getModeAt(this._codeMirror, start), endMode = TokenUtils.getModeAt(this._codeMirror, end);
            if (!knownMixed && outerMode.name === startMode.name) {
                return this._codeMirror.getOption("mode");
            }
            else if (!startMode || !endMode || startMode.name !== endMode.name) {
                return null;
            }
            else {
                return startMode;
            }
        };
        Editor.prototype.setCursorPos = function (line, ch) {
            this._codeMirror.setCursor(CodeMirror.Pos(line, ch));
        };
        Editor.prototype.indexFromPos = function (coords) {
            return this._codeMirror.indexFromPos(coords);
        };
        Editor.prototype.setSelection = function (start, end) {
            this.setSelections([{ start: start, end: end || start }]);
        };
        Editor.prototype.setSelections = function (selections) {
            var primIndex = selections.length - 1, options;
            this._codeMirror.setSelections(selections.map(function (sel, index) {
                if (sel.primary) {
                    primIndex = index;
                }
                return { anchor: sel.reversed ? sel.end : sel.start, head: sel.reversed ? sel.start : sel.end };
            }), primIndex, options);
        };
        Editor.prototype.convertToLineSelections = function (selections, options) {
            var self = this;
            options = options || {};
            _.defaults(options, { expandEndAtStartOfLine: false, mergeAdjacent: true });
            var combinedSelections = [], prevSel;
            _.each(selections, function (sel) {
                var newSel = _.cloneDeep(sel);
                newSel.start.ch = 0;
                var hasSelection = (newSel.start.line !== newSel.end.line) || (newSel.start.ch !== newSel.end.ch);
                if (options.expandEndAtStartOfLine || !hasSelection || newSel.end.ch !== 0) {
                    newSel.end = { line: newSel.end.line + 1, ch: 0 };
                }
                if (prevSel && self.posWithinRange(newSel.start, prevSel.selectionForEdit.start, prevSel.selectionForEdit.end, options.mergeAdjacent)) {
                    prevSel.selectionForEdit.end.line = newSel.end.line;
                    prevSel.selectionsToTrack.push(sel);
                }
                else {
                    prevSel = { selectionForEdit: newSel, selectionsToTrack: [sel] };
                    combinedSelections.push(prevSel);
                }
            });
            return combinedSelections;
        };
        Editor.prototype.getSelectedText = function (allSelections) {
            if (allSelections) {
                return this._codeMirror.getSelection();
            }
            else {
                var sel = this.getSelection();
                return this._codeMirror.getRange(sel.start, sel.end);
            }
        };
        Editor.prototype._copyPos = function (pos) {
            return new CodeMirror.Pos(pos.line, pos.ch);
        };
        Editor.prototype.posWithinRange = function (pos, start, end, endInclusive) {
            if (start.line <= pos.line && end.line >= pos.line) {
                if (endInclusive) {
                    return (start.line < pos.line || start.ch <= pos.ch) &&
                        (end.line > pos.line || end.ch >= pos.ch);
                }
                else {
                    return (start.line < pos.line || start.ch <= pos.ch) &&
                        (end.line > pos.line || end.ch > pos.ch);
                }
            }
            return false;
        };
        Editor.prototype.hasSelection = function () {
            return this._codeMirror.somethingSelected();
        };
        Editor.prototype._normalizeRange = function (anchorPos, headPos) {
            if (headPos.line < anchorPos.line || (headPos.line === anchorPos.line && headPos.ch < anchorPos.ch)) {
                return { start: this._copyPos(headPos), end: this._copyPos(anchorPos), reversed: true };
            }
            else {
                return { start: this._copyPos(anchorPos), end: this._copyPos(headPos), reversed: false };
            }
        };
        Editor.prototype.getSelection = function () {
            return this._normalizeRange(this.getCursorPos(false, "anchor"), this.getCursorPos(false, "head"));
        };
        Editor.prototype.getSelections = function () {
            var primarySel = this.getSelection();
            var self = this;
            return _.map(this._codeMirror.listSelections(), function (sel) {
                var result = self._normalizeRange(sel.anchor, sel.head);
                if (result.start.line === primarySel.start.line && result.start.ch === primarySel.start.ch &&
                    result.end.line === primarySel.end.line && result.end.ch === primarySel.end.ch) {
                    result.primary = true;
                }
                else {
                    result.primary = false;
                }
                return result;
            });
        };
        Editor.prototype.getCursorPos = function (expandTabs, which) {
            if (which === "start") {
                which = "from";
            }
            else if (which === "end") {
                which = "to";
            }
            var cursor = this._copyPos(this._codeMirror.getCursor(which));
            if (expandTabs) {
                cursor.ch = this.getColOffset(cursor);
            }
            return cursor;
        };
        Editor.prototype.getColOffset = function (pos) {
            var line = this._codeMirror.getRange({ line: pos.line, ch: 0 }, pos), tabSize = null, column = 0, i;
            for (i = 0; i < line.length; i++) {
                if (line[i] === "\t") {
                    if (tabSize === null) {
                        tabSize = Editor.getTabSize();
                    }
                    if (tabSize > 0) {
                        column += (tabSize - (column % tabSize));
                    }
                }
                else {
                    column++;
                }
            }
            return column;
        };
        Editor.getTabSize = function () {
            return 4;
        };
        Editor.prototype.getText = function () {
            return this._codeMirror.getValue();
        };
        Editor.prototype.setText = function (text) {
            this._codeMirror.setValue(text);
        };
        return Editor;
    }());
 
    var Document;
    (function (Document) {
        function adjustPosForChange(pos, textLines, start, end) {
            var change = { text: textLines, from: start, to: end };
            if (CodeMirror.cmpPos(pos, start) < 0) {
                return pos;
            }
            if (CodeMirror.cmpPos(pos, end) <= 0) {
                return CodeMirror.changeEnd(change);
            }
            var line = pos.line + change.text.length - (change.to.line - change.from.line) - 1, ch = pos.ch;
            if (pos.line === change.to.line) {
                ch += CodeMirror.changeEnd(change).ch - change.to.ch;
            }
            return { line: line, ch: ch };
        }
        function oneOrEach(itemOrArr, cb) {
            if (Array.isArray(itemOrArr)) {
                _.each(itemOrArr, cb);
            }
            else {
                cb(itemOrArr, 0);
            }
        }
        function doMultipleEdits(editor, edits, origin) {
            edits.sort(function (editDesc1, editDesc2) {
                var edit1 = (Array.isArray(editDesc1.edit) ? editDesc1.edit[0] : editDesc1.edit), edit2 = (Array.isArray(editDesc2.edit) ? editDesc2.edit[0] : editDesc2.edit);
                if (!edit1) {
                    return -1;
                }
                else if (!edit2) {
                    return 1;
                }
                else {
                    return CodeMirror.cmpPos(edit2.start, edit1.start);
                }
            });
            var result = _.cloneDeep(_.map(edits, "selection"));
            _.each(edits, function (editDesc, index) {
                oneOrEach(editDesc.edit, function (edit) {
                    if (edit) {
                        if (!edit.end) {
                            edit.end = edit.start;
                        }
                        if (index > 0) {
                            var prevEditGroup = edits[index - 1].edit;
                            oneOrEach(prevEditGroup, function (prevEdit) {
                                if (CodeMirror.cmpPos(edit.end, prevEdit.start) > 0) {
                                    throw new Error("doMultipleEdits(): Overlapping edits specified");
                                }
                            });
                        }
                    }
                });
            });
            editor._codeMirror.operation(function () {
                _.each(edits, function (editDesc, index) {
                    oneOrEach(editDesc.edit, function (edit) {
                        if (edit) {
                            editor._codeMirror.replaceRange(edit.text, edit.start, edit.end, origin);
                            var textLines = edit.text.split("\n");
                            _.each(result, function (selections, selIndex) {
                                if (selections) {
                                    oneOrEach(selections, function (sel) {
                                        if (sel.isBeforeEdit || selIndex !== index) {
                                            sel.start = adjustPosForChange(sel.start, textLines, edit.start, edit.end);
                                            sel.end = adjustPosForChange(sel.end, textLines, edit.start, edit.end);
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
            });
            result = result.filter(function (item) {
                return item !== undefined;
            });
            result = _.flatten(result);
            result = result.sort(function (sel1, sel2) {
                return CodeMirror.cmpPos(sel1.start, sel2.start);
            });
            _.each(result, function (item) {
                delete item.isBeforeEdit;
            });
            return result;
        }
        Document.doMultipleEdits = doMultipleEdits;
    })(Document || (Document = {}));
 
    function getMode(cm, pos) {
        var mode = cm.getMode();
        return mode.useInnerComments === false || !mode.innerMode ? mode : cm.getModeAt(pos);
    }
    function _createSpecialLineExp(lineSyntax, blockSyntax) {
        var i, character, escapedCharacter, subExps = [], prevChars = "";
        for (i = lineSyntax.length; i < blockSyntax.length; i++) {
            character = blockSyntax.charAt(i);
            escapedCharacter = _.escapeRegExp(character);
            subExps.push(prevChars + "[^" + escapedCharacter + "]");
            if (prevChars) {
                subExps.push(prevChars + "$");
            }
            prevChars += escapedCharacter;
        }
        return new RegExp("^\\s*" + _.escapeRegExp(lineSyntax) + "($|" + subExps.join("|") + ")");
    }
    function _createLineExpressions(prefixes, blockPrefix, blockSuffix) {
        var lineExp = [], escapedPrefix, nothingPushed;
        prefixes.forEach(function (prefix) {
            escapedPrefix = _.escapeRegExp(prefix);
            nothingPushed = true;
            if (blockPrefix && blockPrefix.indexOf(prefix) === 0) {
                lineExp.push(_createSpecialLineExp(prefix, blockPrefix));
                nothingPushed = false;
            }
            if (blockSuffix && blockPrefix !== blockSuffix && blockSuffix.indexOf(prefix) === 0) {
                lineExp.push(_createSpecialLineExp(prefix, blockSuffix));
                nothingPushed = false;
            }
            if (nothingPushed) {
                lineExp.push(new RegExp("^\\s*" + escapedPrefix));
            }
        });
        return lineExp;
    }
    function _matchExpressions(string, expressions) {
        return expressions.some(function (exp) {
            return string.match(exp);
        });
    }
    function _getLinePrefix(string, expressions, prefixes) {
        var result = null;
        expressions.forEach(function (exp, index) {
            if (string.match(exp) && ((result && result.length < prefixes[index].length) || !result)) {
                result = prefixes[index];
            }
        });
        return result;
    }
    function _containsNotLineComment(editor, startLine, endLine, lineExp) {
        var i, line, containsNotLineComment = false;
        for (i = startLine; i <= endLine; i++) {
            line = editor._codeMirror.getLine(i);
            if (line.match(/\S/) && !_matchExpressions(line, lineExp)) {
                containsNotLineComment = true;
                break;
            }
        }
        return containsNotLineComment;
    }
    function _getLineCommentPrefixEdit(editor, prefixes, blockPrefix, blockSuffix, lineSel, options) {
        var sel = lineSel.selectionForEdit, trackedSels = lineSel.selectionsToTrack, lineExp = _createLineExpressions(prefixes, blockPrefix, blockSuffix), startLine = sel.start.line, endLine = sel.end.line, editGroup = [];
        if (sel.end.ch === 0) {
            endLine--;
        }
        var i, line, prefix, commentI, containsNotLineComment = _containsNotLineComment(editor, startLine, endLine, lineExp);
        if (containsNotLineComment) {
            line = editor._codeMirror.getLine(startLine);
            var originalCursorPosition = line.search(/\S|$/);
            var firstCharPosition, cursorPosition = originalCursorPosition;
            for (i = startLine; i <= endLine; i++) {
                if (options.indent) {
                    if (i !== startLine) {
                        line = editor._codeMirror.getLine(i);
                        firstCharPosition = line.search(/\S|$/);
                    }
                    if (firstCharPosition < originalCursorPosition) {
                        cursorPosition = firstCharPosition;
                    }
                    else {
                        cursorPosition = originalCursorPosition;
                    }
                    editGroup.push({ text: prefixes[0], start: { line: i, ch: cursorPosition } });
                }
                else {
                    editGroup.push({ text: prefixes[0], start: { line: i, ch: 0 } });
                }
            }
            _.each(trackedSels, function (trackedSel) {
                if (trackedSel.start.ch === 0 && CodeMirror.cmpPos(trackedSel.start, trackedSel.end) !== 0) {
                    trackedSel.start = { line: trackedSel.start.line, ch: 0 };
                    trackedSel.end = { line: trackedSel.end.line, ch: (trackedSel.end.line === endLine ? trackedSel.end.ch + prefixes[0].length : 0) };
                }
                else {
                    trackedSel.isBeforeEdit = true;
                }
            });
        }
        else {
            for (i = startLine; i <= endLine; i++) {
                line = editor._codeMirror.getLine(i);
                prefix = _getLinePrefix(line, lineExp, prefixes);
                if (prefix) {
                    commentI = line.indexOf(prefix);
                    editGroup.push({ text: "", start: { line: i, ch: commentI }, end: { line: i, ch: commentI + prefix.length } });
                }
            }
            _.each(trackedSels, function (trackedSel) {
                trackedSel.isBeforeEdit = true;
            });
        }
        return { edit: editGroup, selection: trackedSels };
    }
    function _isPrevTokenABlockComment(ctx, prefix, suffix, prefixExp, suffixExp, lineExp) {
        var result = TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx);
        while (result && _matchExpressions(ctx.token.string, lineExp)) {
            result = TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx);
        }
        if (result && ctx.token.type === "comment") {
            if (!ctx.token.string.match(prefixExp) && !ctx.token.string.match(suffixExp)) {
                return true;
            }
            else if (prefix === suffix && ctx.token.string.length === prefix.length) {
                return !_isPrevTokenABlockComment(ctx, prefix, suffix, prefixExp, suffixExp, lineExp);
            }
            else {
                return ctx.token.string.match(prefixExp);
            }
        }
        return false;
    }
    function _firstNotWs(cm, lineNum) {
        var text = cm.getLine(lineNum);
        if (text === null || text === undefined) {
            return 0;
        }
        return text.search(/\S|$/);
    }
    function _getBlockCommentPrefixSuffixEdit(editor, prefix, suffix, linePrefixes, sel, selectionsToTrack, command, options) {
        var ctx = TokenUtils.getInitialContext(editor._codeMirror, { line: sel.start.line, ch: sel.start.ch }), selEndIndex = editor.indexFromPos(sel.end), lineExp = _createLineExpressions(linePrefixes, prefix, suffix), prefixExp = new RegExp("^" + _.escapeRegExp(prefix), "g"), suffixExp = new RegExp(_.escapeRegExp(suffix) + "$", "g"), prefixPos = null, suffixPos = null, commentAtStart = true, isBlockComment = false, canComment = false, invalidComment = false, lineUncomment = false, result = true, editGroup = [], edit;
        var searchCtx, atSuffix, suffixEnd, initialPos, endLine;
        var indentLineComment = options.indent;
        function isIndentLineCommand() {
            return indentLineComment && command === "line";
        }
        if (!selectionsToTrack) {
            selectionsToTrack = [_.cloneDeep(sel)];
        }
        if (!ctx.token.type && !/\S/.test(ctx.token.string)) {
            result = TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx);
        }
        while (result && ctx.token.type !== "comment") {
            result = TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx) && editor.indexFromPos(ctx.pos) <= selEndIndex;
            commentAtStart = false;
        }
        if (result && ctx.token.type === "comment") {
            if (_matchExpressions(ctx.token.string, lineExp)) {
                if (ctx.token.start === 0 && !ctx.token.string.match(/^\\s*/) && commentAtStart) {
                    searchCtx = TokenUtils.getInitialContext(editor._codeMirror, { line: ctx.pos.line, ch: ctx.token.start });
                    isBlockComment = _isPrevTokenABlockComment(searchCtx, prefix, suffix, prefixExp, suffixExp, lineExp);
                }
                else {
                    isBlockComment = false;
                }
            }
            else {
                isBlockComment = true;
                if (ctx.token.string === prefix && prefix === suffix) {
                    searchCtx = TokenUtils.getInitialContext(editor._codeMirror, { line: ctx.pos.line, ch: ctx.token.start });
                    atSuffix = _isPrevTokenABlockComment(searchCtx, prefix, suffix, prefixExp, suffixExp, lineExp);
                    if (atSuffix) {
                        TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx);
                    }
                    else {
                        TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx);
                    }
                }
            }
            if (isBlockComment) {
                initialPos = _.cloneDeep(ctx.pos);
                result = true;
                while (result && !ctx.token.string.match(prefixExp)) {
                    result = TokenUtils.moveSkippingWhitespace(TokenUtils.movePrevToken, ctx);
                }
                prefixPos = result && { line: ctx.pos.line, ch: ctx.token.start };
                if (ctx.token.string === prefix && prefix === suffix) {
                    ctx = TokenUtils.getInitialContext(editor._codeMirror, _.cloneDeep(initialPos));
                }
                while (result && !ctx.token.string.match(suffixExp)) {
                    result = TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx);
                }
                suffixPos = result && { line: ctx.pos.line, ch: ctx.token.end - suffix.length };
                do {
                    result = TokenUtils.moveSkippingWhitespace(TokenUtils.moveNextToken, ctx) &&
                        editor.indexFromPos(ctx.pos) <= selEndIndex;
                } while (result && !ctx.token.string.match(prefixExp));
                invalidComment = result && !!ctx.token.string.match(prefixExp);
                suffixEnd = suffixPos && { line: suffixPos.line, ch: suffixPos.ch + suffix.length };
                if ((suffixEnd && CodeMirror.cmpPos(sel.start, suffixEnd) > 0) || (prefixPos && CodeMirror.cmpPos(sel.end, prefixPos) < 0)) {
                    canComment = true;
                }
            }
            else {
                endLine = sel.end.line;
                if (sel.end.ch === 0 && editor.hasSelection()) {
                    endLine--;
                }
                if (!_containsNotLineComment(editor, sel.start.line, endLine, lineExp)) {
                    lineUncomment = true;
                }
                else {
                    canComment = true;
                }
            }
        }
        else {
            canComment = true;
        }
        if (invalidComment) {
            edit = { edit: [], selection: selectionsToTrack };
        }
        else if (lineUncomment) {
            edit = null;
        }
        else {
            if (canComment) {
                var completeLineSel = sel.start.ch === 0 && sel.end.ch === 0 && sel.start.line < sel.end.line;
                var startCh = _firstNotWs(editor._codeMirror, sel.start.line);
                if (completeLineSel) {
                    if (isIndentLineCommand()) {
                        var endCh = _firstNotWs(editor._codeMirror, sel.end.line - 1);
                        var useTabChar = editor._codeMirror.getOption("indentWithTabs");
                        var indentChar = useTabChar ? "\t" : " ";
                        editGroup.push({
                            text: _.repeat(indentChar, endCh) + suffix + "\n",
                            start: { line: sel.end.line, ch: 0 }
                        });
                        editGroup.push({
                            text: prefix + "\n" + _.repeat(indentChar, startCh),
                            start: { line: sel.start.line, ch: startCh }
                        });
                    }
                    else {
                        editGroup.push({ text: suffix + "\n", start: sel.end });
                        editGroup.push({ text: prefix + "\n", start: sel.start });
                    }
                }
                else {
                    editGroup.push({ text: suffix, start: sel.end });
                    if (isIndentLineCommand()) {
                        editGroup.push({ text: prefix, start: { line: sel.start.line, ch: startCh } });
                    }
                    else {
                        editGroup.push({ text: prefix, start: sel.start });
                    }
                }
                _.each(selectionsToTrack, function (trackedSel) {
                    function updatePosForEdit(pos) {
                        if (CodeMirror.cmpPos(pos, sel.end) > 0) {
                            if (completeLineSel) {
                                pos.line++;
                            }
                            else if (pos.line === sel.end.line) {
                                pos.ch += suffix.length;
                            }
                        }
                        if (CodeMirror.cmpPos(pos, sel.start) >= 0) {
                            if (completeLineSel) {
                                pos.line++;
                            }
                            else if (pos.line === sel.start.line && !(isIndentLineCommand() && pos.ch < startCh)) {
                                pos.ch += prefix.length;
                            }
                        }
                    }
                    updatePosForEdit(trackedSel.start);
                    updatePosForEdit(trackedSel.end);
                });
            }
            else {
                var line = editor._codeMirror.getLine(prefixPos.line).trim(), prefixAtStart = prefixPos.ch === 0 && prefix.length === line.length, prefixIndented = indentLineComment && prefix.length === line.length, suffixAtStart = false, suffixIndented = false;
                if (suffixPos) {
                    line = editor._codeMirror.getLine(suffixPos.line).trim();
                    suffixAtStart = suffixPos.ch === 0 && suffix.length === line.length;
                    suffixIndented = indentLineComment && suffix.length === line.length;
                }
                if (suffixPos) {
                    if (suffixIndented) {
                        editGroup.push({ text: "", start: { line: suffixPos.line, ch: 0 }, end: { line: suffixPos.line + 1, ch: 0 } });
                    }
                    else if (prefixAtStart && suffixAtStart) {
                        editGroup.push({ text: "", start: suffixPos, end: { line: suffixPos.line + 1, ch: 0 } });
                    }
                    else {
                        editGroup.push({ text: "", start: suffixPos, end: { line: suffixPos.line, ch: suffixPos.ch + suffix.length } });
                    }
                }
                if (prefixIndented) {
                    editGroup.push({ text: "", start: { line: prefixPos.line, ch: 0 }, end: { line: prefixPos.line + 1, ch: 0 } });
                }
                else if (prefixAtStart && suffixAtStart) {
                    editGroup.push({ text: "", start: prefixPos, end: { line: prefixPos.line + 1, ch: 0 } });
                }
                else {
                    editGroup.push({ text: "", start: prefixPos, end: { line: prefixPos.line, ch: prefixPos.ch + prefix.length } });
                }
                _.each(selectionsToTrack, function (trackedSel) {
                    trackedSel.isBeforeEdit = true;
                });
            }
            edit = { edit: editGroup, selection: selectionsToTrack };
        }
        return edit;
    }
    function _getLineCommentPrefixSuffixEdit(editor, prefix, suffix, lineSel, command, options) {
        var sel = lineSel.selectionForEdit;
        if (sel.end.line === sel.start.line + 1 && sel.end.ch === 0) {
            sel.end = { line: sel.start.line, ch: editor._codeMirror.getLine(sel.start.line).length };
        }
        return _getBlockCommentPrefixSuffixEdit(editor, prefix, suffix, [], sel, lineSel.selectionsToTrack, command, options);
    }
    function _getLineCommentPrefixes(prefixes, defaultValue) {
        if (!prefixes) {
            return defaultValue;
        }
        if (Array.isArray(prefixes)) {
            return prefixes.length > 0 ? prefixes : defaultValue;
        }
        return [prefixes];
    }
    function _getLineCommentEdits(editor, selections, command, options) {
        var lineSelections = editor.convertToLineSelections(selections, { mergeAdjacent: false }), edits = [];
        _.each(lineSelections, function (lineSel) {
            var sel = lineSel.selectionForEdit, mode = editor.getModeForRange(sel.start, sel.end), edit;
            if (mode) {
                var cmMode = options.getMode
                    ? options.getMode(mode, sel.start)
                    : getMode(editor._codeMirror, sel.start);
                var lineCommentPrefixes = _getLineCommentPrefixes(options.lineComment || cmMode.lineComment, null);
                var blockCommentPrefix = options.blockCommentStart || cmMode.blockCommentStart;
                var blockCommentSuffix = options.blockCommentEnd || cmMode.blockCommentEnd;
                if (lineCommentPrefixes) {
                    edit = _getLineCommentPrefixEdit(editor, lineCommentPrefixes, blockCommentPrefix, blockCommentSuffix, lineSel, options);
                }
                else if (blockCommentPrefix || blockCommentSuffix) {
                    edit = _getLineCommentPrefixSuffixEdit(editor, blockCommentPrefix, blockCommentSuffix, lineSel, command, options);
                }
            }
            if (!edit) {
                edit = { selection: lineSel.selectionsToTrack };
            }
            edits.push(edit);
        });
        return edits;
    }
    function lineComment(editor, options) {
        editor.setSelections(Document.doMultipleEdits(editor, _getLineCommentEdits(editor, editor.getSelections(), "line", options)));
    }
    function blockComment(editor, options) {
        var edits = [], lineCommentSels = [];
        _.each(editor.getSelections(), function (sel) {
            var mode = editor.getModeForRange(sel.start, sel.end), edit = { edit: [], selection: [sel] };
            if (mode) {
                var cmMode = options.getMode
                    ? options.getMode(mode, sel.start)
                    : getMode(editor._codeMirror, sel.start);
                var lineCommentPrefixes = _getLineCommentPrefixes(options.lineComment || cmMode.lineComment, []);
                var blockCommentPrefix = options.blockCommentStart || cmMode.blockCommentStart;
                var blockCommentSuffix = options.blockCommentEnd || cmMode.blockCommentEnd;
                if (blockCommentPrefix || blockCommentSuffix) {
                    edit = _getBlockCommentPrefixSuffixEdit(editor, blockCommentPrefix, blockCommentSuffix, lineCommentPrefixes, sel, null, "block", options);
                    if (!edit) {
                        lineCommentSels.push(sel);
                    }
                }
            }
            if (edit) {
                edits.push(edit);
            }
        });
        edits.push.apply(edits, _getLineCommentEdits(editor, lineCommentSels, "block", options));
        editor.setSelections(Document.doMultipleEdits(editor, edits));
    }
 
    CodeMirror.defineExtension("toggleComment", function () {
    });
    CodeMirror.defineExtension("lineComment", function (options) {
        if (options === void 0) { options = {}; }
        var editor = new Editor(this);
        lineComment(editor, options);
    });
    CodeMirror.defineExtension("blockComment", function (options) {
        if (options === void 0) { options = {}; }
        var editor = new Editor(this);
        blockComment(editor, options);
    });
    CodeMirror.defineExtension("uncomment", function () {
    });
 
 })));
 //# sourceMappingURL=toggle-comment-simple.js.map
 