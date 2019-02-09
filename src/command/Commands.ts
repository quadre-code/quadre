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

import * as DeprecationWarning from "utils/DeprecationWarning";

/**
 * List of constants for global command IDs.
 */

// APPMENU
export const APPMENU_HIDE                = "appmenu.hide";
export const APPMENU_HIDE_OTHERS         = "appmenu.hideOthers";
export const APPMENU_SHOW_ALL            = "appmenu.showAll";

// FILE
export const FILE_NEW_UNTITLED           = "file.newDoc";                // DocumentCommandHandlers.js   handleFileNew()
export const FILE_NEW                    = "file.newFile";               // DocumentCommandHandlers.js   handleFileNewInProject()
export const FILE_NEW_FOLDER             = "file.newFolder";             // DocumentCommandHandlers.js   handleNewFolderInProject()
export const FILE_OPEN                   = "file.open";                  // DocumentCommandHandlers.js   handleDocumentOpen()
export const FILE_OPEN_FOLDER            = "file.openFolder";            // ProjectManager.js            openProject()
export const FILE_SAVE                   = "file.save";                  // DocumentCommandHandlers.js   handleFileSave()
export const FILE_SAVE_ALL               = "file.saveAll";               // DocumentCommandHandlers.js   handleFileSaveAll()
export const FILE_SAVE_AS                = "file.saveAs";                // DocumentCommandHandlers.js   handleFileSaveAs()
export const FILE_CLOSE                  = "file.close";                 // DocumentCommandHandlers.js   handleFileClose()
export const FILE_CLOSE_ALL              = "file.close_all";             // DocumentCommandHandlers.js   handleFileCloseAll()
export const FILE_CLOSE_LIST             = "file.close_list";            // DocumentCommandHandlers.js   handleFileCloseList()
export const FILE_OPEN_DROPPED_FILES     = "file.openDroppedFiles";      // DragAndDrop.js               openDroppedFiles()
export const FILE_LIVE_FILE_PREVIEW      = "file.liveFilePreview";       // LiveDevelopment/main.js      _handleGoLiveCommand()
export const TOGGLE_LIVE_PREVIEW_MB_MODE = "file.toggleLivePreviewMB";   // LiveDevelopment/main.js      _toggleLivePreviewMultiBrowser()
export const CMD_RELOAD_LIVE_PREVIEW     = "file.reloadLivePreview";     // LiveDevelopment/main.js      _handleReloadLivePreviewCommand()
export const FILE_LIVE_HIGHLIGHT         = "file.previewHighlight";      // LiveDevelopment/main.js      _handlePreviewHighlightCommand()
export const FILE_PROJECT_SETTINGS       = "file.projectSettings";       // ProjectManager.js            _projectSettings()
export const FILE_RENAME                 = "file.rename";                // DocumentCommandHandlers.js   handleFileRename()
export const FILE_DELETE                 = "file.delete";                // DocumentCommandHandlers.js   handleFileDelete()
export const FILE_EXTENSION_MANAGER      = "file.extensionManager";      // ExtensionManagerDialog.js    _showDialog()
export const FILE_REFRESH                = "file.refresh";               // ProjectManager.js            refreshFileTree()
export const FILE_OPEN_PREFERENCES       = "file.openPreferences";       // PreferencesManager.js        _handleOpenPreferences()
export const FILE_OPEN_KEYMAP            = "file.openKeyMap";            // KeyBindingManager.js         _openUserKeyMap()

// File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
export const FILE_CLOSE_WINDOW           = "file.close_window";          // DocumentCommandHandlers.js   handleFileCloseWindow()
export const FILE_QUIT                   = "file.quit";                  // DocumentCommandHandlers.js   handleFileQuit()

// EDIT
// File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
export const EDIT_UNDO                   = "edit.undo";                  // EditorCommandHandlers.js     handleUndo()
export const EDIT_REDO                   = "edit.redo";                  // EditorCommandHandlers.js     handleRedo()
export const EDIT_CUT                    = "edit.cut";                   // EditorCommandHandlers.js     ignoreCommand()
export const EDIT_COPY                   = "edit.copy";                  // EditorCommandHandlers.js     ignoreCommand()
export const EDIT_PASTE                  = "edit.paste";                 // EditorCommandHandlers.js     ignoreCommand()
export const EDIT_SELECT_ALL             = "edit.selectAll";             // EditorCommandHandlers.js     _handleSelectAll()

export const EDIT_SELECT_LINE            = "edit.selectLine";            // EditorCommandHandlers.js     selectLine()
export const EDIT_SPLIT_SEL_INTO_LINES   = "edit.splitSelIntoLines";     // EditorCommandHandlers.js     splitSelIntoLines()
export const EDIT_ADD_CUR_TO_NEXT_LINE   = "edit.addCursorToNextLine";   // EditorCommandHandlers.js     addCursorToNextLine()
export const EDIT_ADD_CUR_TO_PREV_LINE   = "edit.addCursorToPrevLine";   // EditorCommandHandlers.js     addCursorToPrevLine()
export const EDIT_INDENT                 = "edit.indent";                // EditorCommandHandlers.js     indentText()
export const EDIT_UNINDENT               = "edit.unindent";              // EditorCommandHandlers.js     unindentText()
export const EDIT_DUPLICATE              = "edit.duplicate";             // EditorCommandHandlers.js     duplicateText()
export const EDIT_DELETE_LINES           = "edit.deletelines";           // EditorCommandHandlers.js     deleteCurrentLines()
export const EDIT_LINE_COMMENT           = "edit.lineComment";           // EditorCommandHandlers.js     lineComment()
export const EDIT_BLOCK_COMMENT          = "edit.blockComment";          // EditorCommandHandlers.js     blockComment()
export const EDIT_LINE_UP                = "edit.lineUp";                // EditorCommandHandlers.js     moveLineUp()
export const EDIT_LINE_DOWN              = "edit.lineDown";              // EditorCommandHandlers.js     moveLineDown()
export const EDIT_OPEN_LINE_ABOVE        = "edit.openLineAbove";         // EditorCommandHandlers.js     openLineAbove()
export const EDIT_OPEN_LINE_BELOW        = "edit.openLineBelow";         // EditorCommandHandlers.js     openLineBelow()
export const TOGGLE_CLOSE_BRACKETS       = "edit.autoCloseBrackets";     // EditorOptionHandlers.js      _getToggler()
export const SHOW_CODE_HINTS             = "edit.showCodeHints";         // CodeHintManager.js           _startNewSession()

// FIND
export const CMD_FIND                    = "cmd.find";                   // FindReplace.js               _launchFind()
export const CMD_FIND_IN_FILES           = "cmd.findInFiles";            // FindInFilesUI.js             _showFindBar()
export const CMD_FIND_IN_SUBTREE         = "cmd.findInSubtree";          // FindInFilesUI.js             _showFindBarForSubtree()
export const CMD_FIND_NEXT               = "cmd.findNext";               // FindReplace.js               _findNext()
export const CMD_FIND_PREVIOUS           = "cmd.findPrevious";           // FindReplace.js               _findPrevious()
export const CMD_FIND_ALL_AND_SELECT     = "cmd.findAllAndSelect";       // FindReplace.js               _findAllAndSelect()
export const CMD_ADD_NEXT_MATCH          = "cmd.addNextMatch";           // FindReplace.js               _expandAndAddNextToSelection()
export const CMD_SKIP_CURRENT_MATCH      = "cmd.skipCurrentMatch";       // FindReplace.js               _skipCurrentMatch()
export const CMD_REPLACE                 = "cmd.replace";                // FindReplace.js               _replace()
export const CMD_REPLACE_IN_FILES        = "cmd.replaceInFiles";         // FindInFilesUI.js             _showReplaceBar()
export const CMD_REPLACE_IN_SUBTREE      = "cmd.replaceInSubtree";       // FindInFilesUI.js             _showReplaceBarForSubtree()

// VIEW
export const CMD_THEMES_OPEN_SETTINGS    = "view.themesOpenSetting";     // MenuCommands.js              Settings.open()
export const VIEW_HIDE_SIDEBAR           = "view.toggleSidebar";         // SidebarView.js               toggle()
export const VIEW_INCREASE_FONT_SIZE     = "view.increaseFontSize";      // ViewCommandHandlers.js       _handleIncreaseFontSize()
export const VIEW_DECREASE_FONT_SIZE     = "view.decreaseFontSize";      // ViewCommandHandlers.js       _handleDecreaseFontSize()
export const VIEW_RESTORE_FONT_SIZE      = "view.restoreFontSize";       // ViewCommandHandlers.js       _handleRestoreFontSize()
export const VIEW_SCROLL_LINE_UP         = "view.scrollLineUp";          // ViewCommandHandlers.js       _handleScrollLineUp()
export const VIEW_SCROLL_LINE_DOWN       = "view.scrollLineDown";        // ViewCommandHandlers.js       _handleScrollLineDown()
export const VIEW_TOGGLE_INSPECTION      = "view.toggleCodeInspection";  // CodeInspection.js            toggleEnabled()
export const TOGGLE_LINE_NUMBERS         = "view.toggleLineNumbers";     // EditorOptionHandlers.js      _getToggler()
export const TOGGLE_ACTIVE_LINE          = "view.toggleActiveLine";      // EditorOptionHandlers.js      _getToggler()
export const TOGGLE_WORD_WRAP            = "view.toggleWordWrap";        // EditorOptionHandlers.js      _getToggler()
export const TOGGLE_SEARCH_AUTOHIDE      = "view.toggleSearchAutoHide";  // EditorOptionHandlers.js      _getToggler()

export const CMD_OPEN                        = "cmd.open";
export const CMD_ADD_TO_WORKINGSET_AND_OPEN  = "cmd.addToWorkingSetAndOpen";          // DocumentCommandHandlers.js   handleOpenDocumentInNewPane()

// NAVIGATE
export const NAVIGATE_NEXT_DOC           = "navigate.nextDoc";           // DocumentCommandHandlers.js   handleGoNextDoc()
export const NAVIGATE_PREV_DOC           = "navigate.prevDoc";           // DocumentCommandHandlers.js   handleGoPrevDoc()
export const NAVIGATE_NEXT_DOC_LIST_ORDER    = "navigate.nextDocListOrder";           // DocumentCommandHandlers.js   handleGoNextDocListOrder()
export const NAVIGATE_PREV_DOC_LIST_ORDER    = "navigate.prevDocListOrder";           // DocumentCommandHandlers.js   handleGoPrevDocListOrder()
export const NAVIGATE_SHOW_IN_FILE_TREE  = "navigate.showInFileTree";    // DocumentCommandHandlers.js   handleShowInTree()
export const NAVIGATE_SHOW_IN_OS         = "navigate.showInOS";          // DocumentCommandHandlers.js   handleShowInOS()
export const NAVIGATE_QUICK_OPEN         = "navigate.quickOpen";         // QuickOpen.js                 doFileSearch()
export const NAVIGATE_JUMPTO_DEFINITION  = "navigate.jumptoDefinition";  // EditorManager.js             _doJumpToDef()
export const NAVIGATE_GOTO_DEFINITION    = "navigate.gotoDefinition";    // QuickOpen.js                 doDefinitionSearch()
export const NAVIGATE_GOTO_LINE          = "navigate.gotoLine";          // QuickOpen.js                 doGotoLine()
export const NAVIGATE_GOTO_FIRST_PROBLEM = "navigate.gotoFirstProblem";  // CodeInspection.js            handleGotoFirstProblem()
export const TOGGLE_QUICK_EDIT           = "navigate.toggleQuickEdit";   // EditorManager.js             _toggleInlineWidget()
export const TOGGLE_QUICK_DOCS           = "navigate.toggleQuickDocs";   // EditorManager.js             _toggleInlineWidget()
export const QUICK_EDIT_NEXT_MATCH       = "navigate.nextMatch";         // MultiRangeInlineEditor.js    _nextRange()
export const QUICK_EDIT_PREV_MATCH       = "navigate.previousMatch";     // MultiRangeInlineEditor.js    _previousRange()
export const CSS_QUICK_EDIT_NEW_RULE     = "navigate.newRule";           // CSSInlineEditor.js           _handleNewRule()

// HELP
export const HELP_CHECK_FOR_UPDATE       = "help.checkForUpdate";        // HelpCommandHandlers.js       _handleCheckForUpdates()
export const HELP_HOW_TO_USE_BRACKETS    = "help.howToUseBrackets";      // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_SUPPORT                = "help.support";               // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_SUGGEST                = "help.suggest";               // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_RELEASE_NOTES          = "help.releaseNotes";          // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_GET_INVOLVED           = "help.getInvolved";           // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_SHOW_EXT_FOLDER        = "help.showExtensionsFolder";  // HelpCommandHandlers.js       _handleShowExtensionsFolder()
export const HELP_HOMEPAGE               = "help.homepage";              // HelpCommandHandlers.js       _handleLinkMenuItem()
export const HELP_TWITTER                = "help.twitter";               // HelpCommandHandlers.js       _handleLinkMenuItem()

// Working Set Configuration
export const CMD_WORKINGSET_SORT_BY_ADDED  = "cmd.sortWorkingSetByAdded";     // WorkingSetSort.js       _handleSort()
export const CMD_WORKINGSET_SORT_BY_NAME   = "cmd.sortWorkingSetByName";      // WorkingSetSort.js       _handleSort()
export const CMD_WORKINGSET_SORT_BY_TYPE   = "cmd.sortWorkingSetByType";      // WorkingSetSort.js       _handleSort()
export const CMD_WORKING_SORT_TOGGLE_AUTO  = "cmd.sortWorkingSetToggleAuto";  // WorkingSetSort.js       _handleToggleAutoSort()

// Split View
export const CMD_SPLITVIEW_NONE          = "cmd.splitViewNone";          // SidebarView.js               _handleSplitNone()
export const CMD_SPLITVIEW_VERTICAL      = "cmd.splitViewVertical";      // SidebarView.js               _handleSplitVertical()
export const CMD_SPLITVIEW_HORIZONTAL    = "cmd.splitViewHorizontal";    // SidebarView.js               _handleSplitHorizontal()
export const CMD_SWITCH_PANE_FOCUS       = "cmd.switchPaneFocus";        // MainViewManager.js           _switchPaneFocus()

// File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
export const HELP_ABOUT                  = "help.about";                 // HelpCommandHandlers.js       _handleAboutDialog()

// APP
export const APP_RELOAD                  = "app.reload";                 // DocumentCommandHandlers.js   handleReload()
export const APP_RELOAD_WITHOUT_EXTS     = "app.reload_without_exts";    // DocumentCommandHandlers.js   handleReloadWithoutExts()

// File shell callbacks - string must MATCH string in native code (appshell/command_callbacks.h)
export const APP_ABORT_QUIT              = "app.abort_quit";             // DocumentCommandHandlers.js   handleAbortQuit()
export const APP_BEFORE_MENUPOPUP        = "app.before_menupopup";       // DocumentCommandHandlers.js   handleBeforeMenuPopup()

// ADD_TO_WORKING_SET is deprectated but we need a handler for it because the new command doesn't return the same result as the legacy command
export const FILE_ADD_TO_WORKING_SET     = "file.addToWorkingSet";       // Deprecated through DocumentCommandHandlers.js handleFileAddToWorkingSet

// Show or Hide sidebar
export const HIDE_SIDEBAR                = "view.hideSidebar";           // SidebarView.js               hide()
export const SHOW_SIDEBAR                = "view.showSidebar";           // SidebarView.js               show()

// DEPRECATED: Working Set Commands
DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_ADDED",   "CMD_WORKINGSET_SORT_BY_ADDED");
DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_NAME",    "CMD_WORKINGSET_SORT_BY_NAME");
DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_BY_TYPE",    "CMD_WORKINGSET_SORT_BY_TYPE");
DeprecationWarning.deprecateConstant(exports, "SORT_WORKINGSET_AUTO",       "CMD_WORKING_SORT_TOGGLE_AUTO");
