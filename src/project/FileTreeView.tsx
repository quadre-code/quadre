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

/*unittests: FileTreeView*/

/**
 * This is the view layer (template) for the file tree in the sidebar. It takes a FileTreeViewModel
 * and renders it to the given element using React. User actions are signaled via an ActionCreator
 * (in the Flux sense).
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import Classnames = require("thirdparty/classnames");
import Immutable = require("thirdparty/immutable");
import _ = require("thirdparty/lodash");
import FileUtils = require("file/FileUtils");
import LanguageManager = require("language/LanguageManager");
import FileTreeViewModel = require("project/FileTreeViewModel");
import ViewUtils = require("utils/ViewUtils");
import KeyEvent = require("utils/KeyEvent");

interface IEvents {
    handleKeyDown: (ev: React.KeyboardEvent<HTMLInputElement>) => void;
    handleInput: (ev: React.FormEvent<HTMLInputElement>) => void;
    handleClick: (ev: React.MouseEvent<HTMLInputElement>) => void;
    handleBlur: (ev: React.FocusEvent<HTMLInputElement>) => void;
}

interface IPath {
    parentPath: string;
    name: string;
    entry: any;
}

type ISelectionViewInfo = any;

interface IFileTreeItem {
    parentPath: string;
    actions: any;
    extensions: any;
    platform: string;
    forceRender: boolean;
}

interface IFileTree extends IFileTreeItem {
    sortDirectoriesFirst?: boolean;
}

interface IFileTreeViewProps extends IFileTree {
    treeData: any;
    selectionViewInfo: ISelectionViewInfo;
}

interface ISelection {
    selectionViewInfo: ISelectionViewInfo;
    selectedClassName: string;
    visible: boolean;
    forceUpdate: boolean;
    className: string;
}

type ISelectionExtensionProps = ISelection;

interface IFileSelectionBoxProps extends ISelection {
    ref: string;
}

interface IDirectoryContentsProps extends IFileTree {
    isRoot?: boolean;
    depth: number;
    contents: any;
}

interface IFileTreeNode {
    entry: any;
    name: string;
    depth: number;
    handleMouseDown?: (ev: React.MouseEvent<HTMLLIElement>) => void;
}

interface IDirectoryNodeProps extends IFileTree, IFileTreeNode {
}

interface IDirectoryRenameInputProps extends IEvents {
    name: string;
}

interface IFileRenameInputProps extends IEvents {
    name: string;
}

interface IFileNodeProps extends IFileTree, IFileTreeNode {
    key: string;
}

interface IFileNodeState {
    clickTimer: number | null;
}

interface IWithRenameBehaviorProps extends IPath {
    actions: any;
}

interface IWithContextSettableProps extends IFileTree, IFileTreeNode {
}

/**
 * @private
 * @type {Immutable.Map}
 *
 * Stores the file tree extensions for adding classes and icons. The keys of the map
 * are the "categories" of the extensions and values are vectors of the callback functions.
 */
let _extensions = Immutable.Map();

// Constants

// Time range from first click to second click to invoke renaming.
const CLICK_RENAME_MINIMUM  = 500;
const RIGHT_MOUSE_BUTTON    = 2;
const LEFT_MOUSE_BUTTON     = 0;

const INDENTATION_WIDTH     = 10;

/**
 * @private
 *
 * Returns the name of a file without its extension.
 *
 * @param {string} fullname The complete name of the file (not including the rest of the path)
 * @param {string} extension The file extension
 * @return {string} The fullname without the extension
 */
function _getName(fullname, extension) {
    return extension !== "" ? fullname.substring(0, fullname.length - extension.length - 1) : fullname;
}

/**
 * Helper that computes the full path of an entry.
 */
function fullPath(props: IPath) {
    let result = props.parentPath + props.name;

    // Add trailing slash for directories
    if (!FileTreeViewModel.isFile(props.entry) && _.last(result) !== "/") {
        result += "/";
    }

    return result;
}

/**
 * @private
 *
 * Gets an appropriate width given the text provided.
 *
 * @param {string} text Text to measure
 * @return {int} Width to use
 */
function _measureText(text) {
    const measuringElement = $("<span />", {
        css: {
            "position": "absolute",
            "top": "-200px",
            "left": "-1000px",
            "visibility": "hidden",
            "white-space": "pre"
        }
    }).appendTo("body");
    measuringElement.text("pW" + text);
    const width = measuringElement.width();
    measuringElement.remove();
    return width;
}

/**
 * @private
 *
 * Create an appropriate div based "thickness" to indent the tree correctly.
 *
 * @param {int} depth The depth of the current node.
 * @return {ReactComponent} The resulting div.
 */
function _createThickness(depth): JSX.Element {
    // When running tests |depth| can be undefined.
    depth = depth || 1;
    const style = {
        display: "inline-block",
        width: INDENTATION_WIDTH * depth
    };
    return <div style={style} key="thickness"></div>;
}

/**
 * @private
 *
 * Create, and indent correctly, the arrow icons used for the folders.
 *
 * @param {int} depth The depth of the current node.
 * @return {ReactComponent} The resulting ins.
 */
function _createAlignedIns(depth): JSX.Element {
    // When running tests |depth| can be undefined.
    depth = depth || 1;
    const style = {
        marginLeft: INDENTATION_WIDTH * depth
    };
    return <ins className="jstree-icon" style={style} key="alignedIns"></ins>;
}

/**
 * This is a High Order Component that provides rename input behavior.
 * It is responsible for taking keyboard input and invoking the correct action
 * based on that input.
 */
function withRenameBehavior(RenameInputComponent) {
    class WithRenameBehavior extends React.Component<IWithRenameBehaviorProps, {}> {
        private textInput: HTMLInputElement | null;

        constructor(props: IWithRenameBehaviorProps) {
            super(props);

            this.handleClick = this.handleClick.bind(this);
            this.handleKeyDown = this.handleKeyDown.bind(this);
            this.handleInput = this.handleInput.bind(this);
            this.handleBlur = this.handleBlur.bind(this);
        }

        public setInputComponent(instance) {
            this.textInput = instance ? instance.textInput : null;
        }

        /**
         * Stop clicks from propagating so that clicking on the rename input doesn't
         * cause directories to collapse.
         */
        public handleClick(e) {
            e.stopPropagation();
            if (e.button !== LEFT_MOUSE_BUTTON) {
                e.preventDefault();
            }
        }

        /**
         * If the user presses enter or escape, we either successfully complete or cancel, respectively,
         * the rename or create operation that is underway.
         */
        public handleKeyDown(e) {
            if (e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                this.props.actions.cancelRename();
            } else if (e.keyCode === KeyEvent.DOM_VK_RETURN) {
                this.props.actions.performRename();
            }
        }

        /**
         * The rename or create operation can be completed or canceled by actions outside of
         * this component, so we keep the model up to date by sending every update via an action.
         */
        public handleInput(e) {
            if (this.textInput) {
                this.props.actions.setRenameValue(this.textInput.value.trim());

                if (e.keyCode !== KeyEvent.DOM_VK_LEFT &&
                        e.keyCode !== KeyEvent.DOM_VK_RIGHT) {
                    // update the width of the input field
                    const node = this.textInput;
                    const newWidth = _measureText(node.value);
                    $(node).width(newWidth);
                }
            }
        }

        /**
         * If we leave the field for any reason, complete the rename.
         */
        public handleBlur() {
            this.props.actions.performRename();
        }

        public render() {
            const renameProps = {
                ...this.props,
                handleClick: this.handleClick,
                handleKeyDown: this.handleKeyDown,
                handleInput: this.handleInput,
                handleBlur: this.handleBlur,
                ref: this.setInputComponent.bind(this)
            };
            return <RenameInputComponent {...renameProps}></RenameInputComponent>;
        }
    }
    return WithRenameBehavior;
}

/**
 * @private
 *
 * This component presents an input field to the user for renaming a file.
 *
 * Props:
 * * parentPath: the full path of the directory containing this file
 * * name: the name of the file, including the extension
 * * actions: the action creator responsible for communicating actions the user has taken
 */
class FileRenameInput extends React.Component<IFileRenameInputProps, {}> {
    private textInput: HTMLInputElement | null;

    constructor(props: IFileRenameInputProps) {
        super(props);
    }

    /**
     * When this component is displayed, we scroll it into view and select the portion
     * of the filename that excludes the extension.
     */
    public componentDidMount() {
        const fullname = this.props.name;
        const extension = LanguageManager.getCompoundFileExtension(fullname);

        const node = this.textInput;
        if (node) {
            node.setSelectionRange(0, _getName(fullname, extension).length);
            ViewUtils.scrollElementIntoView($("#project-files-container"), $(node), true);
        }
    }

    public render() {
        const width = _measureText(this.props.name);

        return <input
            className="jstree-rename-input"
            type="text"
            defaultValue={this.props.name}
            autoFocus={true}
            onKeyDown={this.props.handleKeyDown}
            onInput={this.props.handleInput}
            onClick={this.props.handleClick}
            onBlur={this.props.handleBlur}
            style={{
                width
            }}
            ref={(input) => {
                this.textInput = input;
            }}
            key="fileRenameInput"></input>;
    }
}

/**
 * @private
 *
 * This High Order Component handles right click (or control click on Mac) action to make a file
 * the "context" object for performing operations like rename.
 */
function withContextSettable(NodeComponent) {
    class WithContextSettable extends React.Component<IWithContextSettableProps, {}> {
        private node: React.Component;
        constructor(props: IWithContextSettableProps) {
            super(props);

            this.handleMouseDown = this.handleMouseDown.bind(this);
        }

        public shouldComponentUpdate(nextProps, nextState, nextContext) {
            const component = this.node;
            if (component) {
                // Workaround for "Cannot invoke an object which is possibly 'undefined'"
                const method = "should" + "Component" + "Update";
                return component[method](nextProps, nextState, nextContext);
            }
            return true;
        }

        public setInner(innerComponent) {
            this.node = innerComponent;
        }

        /**
         * Send matching mouseDown events to the action creator as a setContext action.
         */
        public handleMouseDown(e) {
            e.stopPropagation();
            if (e.button === RIGHT_MOUSE_BUTTON ||
                    (this.props.platform === "mac" && e.button === LEFT_MOUSE_BUTTON && e.ctrlKey)) {
                this.props.actions.setContext(fullPath(this.props));
                e.preventDefault();
                return;
            }
            // Return true only for mouse down in rename mode.
            if (this.props.entry.get("rename")) {
                return;
            }
            e.preventDefault();
        }

        public render() {
            const nodeProps = {
                ...this.props,
                handleMouseDown: this.handleMouseDown,
                ref: this.setInner.bind(this)
            };
            return <NodeComponent {...nodeProps}></NodeComponent>;
        }
    }
    return WithContextSettable;
}

/**
 * @private
 *
 * Returns true if the value is defined (used in `.filter`)
 *
 * @param {Object} value value to test
 * @return {boolean} true if value is defined
 */
function isDefined(value) {
    return value !== undefined;
}

/**
 * Calls the icon providers to get the collection of icons (most likely just one) for
 * the current file or directory.
 *
 * @return {Array.<ReactComponent>} icon components to render
 */
function getIcons(extensions, getDataForExtension) {
    let result;

    if (extensions && extensions.get("icons")) {
        const data = getDataForExtension();
        result = extensions.get("icons").map(function (callback, index) {
            try {
                let element = callback(data);
                if (element && !React.isValidElement(element)) {
                    element = <span
                        dangerouslySetInnerHTML={{
                            __html: $(element)[0].outerHTML
                        }}
                        key={"icon-" + index}></span>;
                }
                return element;  // by this point, returns either undefined or a React object
            } catch (e) {
                console.error("Exception thrown in FileTreeView icon provider: " + e, e.stack);
            }
        }).filter(isDefined).toArray();
    }

    if (!result || result.length === 0) {
        result = [
            <ins className="jstree-icon" key="icon"> </ins>
        ];
    }
    return result;
}

/**
 * Calls the addClass providers to get the classes (in string form) to add for the current
 * file or directory.
 *
 * @param {string} classes Initial classes for this node
 * @return {string} classes for the current node
 */
function getClasses(classes, extensions, getDataForExtension) {
    if (extensions && extensions.get("addClass")) {
        const data = getDataForExtension();
        classes = classes + " " + extensions.get("addClass").map(function (callback) {
            try {
                return callback(data);
            } catch (e) {
                console.error("Exception thrown in FileTreeView addClass provider: " + e, e.stack);
            }
        }).filter(isDefined).toArray().join(" ");
    }

    return classes;
}

/**
 * @private
 *
 * Component to display a file in the tree.
 *
 * Props:
 * * parentPath: the full path of the directory containing this file
 * * name: the name of the file, including the extension
 * * entry: the object with the relevant metadata for the file (whether it's selected or is the context file)
 * * actions: the action creator responsible for communicating actions the user has taken
 * * extensions: registered extensions for the file tree
 * * forceRender: causes the component to run render
 */
class FileNode extends React.Component<IFileNodeProps, IFileNodeState> {
    constructor(props: IFileNodeProps) {
        super(props);

        this.state = {
            clickTimer: null
        };

        this.clearTimer = this.clearTimer.bind(this);
        this.startRename = this.startRename.bind(this);
        this.handleClick = this.handleClick.bind(this);
        this.handleDoubleClick = this.handleDoubleClick.bind(this);
        this.getDataForExtension = this.getDataForExtension.bind(this);
    }

    /**
     * Thanks to immutable objects, we can just do a start object identity check to know
     * whether or not we need to re-render.
     */
    public shouldComponentUpdate(nextProps, nextState) {
        return nextProps.forceRender ||
            this.props.entry !== nextProps.entry ||
            this.props.extensions !== nextProps.extensions;
    }

    /**
     * If this node is newly selected, scroll it into view. Also, move the selection or
     * context boxes as appropriate.
     */
    public componentDidUpdate(prevProps, prevState) {
        const wasSelected = prevProps.entry.get("selected");
        const isSelected  = this.props.entry.get("selected");

        if (isSelected && !wasSelected) {
            // TODO: This shouldn't really know about project-files-container
            // directly. It is probably the case that our React tree should actually
            // start with project-files-container instead of just the interior of
            // project-files-container and then the file tree will be one self-contained
            // functional unit.
            ViewUtils.scrollElementIntoView($("#project-files-container"), $(ReactDOM.findDOMNode(this)), true);
        } else if (!isSelected && wasSelected && this.state.clickTimer !== null) {
            this.clearTimer();
        }
    }

    private clearTimer() {
        if (this.state.clickTimer !== null) {
            window.clearTimeout(this.state.clickTimer);
            this.setState({
                clickTimer: null
            });
        }
    }

    private startRename() {
        if (!this.props.entry.get("rename")) {
            this.props.actions.startRename(fullPath(this.props));
        }
        this.clearTimer();
    }

    /**
     * When the user clicks on the node, we'll either select it or, if they've clicked twice
     * with a bit of delay in between, we'll invoke the `startRename` action.
     */
    public handleClick(e) {
        // If we're renaming, allow the click to go through to the rename input.
        if (this.props.entry.get("rename")) {
            e.stopPropagation();
            return;
        }

        if (e.button !== LEFT_MOUSE_BUTTON) {
            return;
        }

        if (this.props.entry.get("selected") && !e.ctrlKey) {
            if (this.state.clickTimer === null && !this.props.entry.get("rename")) {
                const timer = window.setTimeout(this.startRename, CLICK_RENAME_MINIMUM);
                this.setState({
                    clickTimer: timer
                });
            }
        } else {
            this.props.actions.setSelected(fullPath(this.props));
        }
        e.stopPropagation();
        e.preventDefault();
    }

    /**
     * When the user double clicks, we will select this file and add it to the working
     * set (via the `selectInWorkingSet` action.)
     */
    public handleDoubleClick() {
        if (!this.props.entry.get("rename")) {
            if (this.state.clickTimer !== null) {
                this.clearTimer();
            }
            this.props.actions.selectInWorkingSet(fullPath(this.props));
        }
    }

    /**
     * Create the data object to pass to extensions.
     *
     * @return {!{name:string, isFile:boolean, fullPath:string}} Data for extensions
     */
    public getDataForExtension() {
        return {
            name: this.props.name,
            isFile: true,
            fullPath: fullPath(this.props)
        };
    }

    public render() {
        const fullname = this.props.name;
        let extension = LanguageManager.getCompoundFileExtension(fullname);
        const name = _getName(fullname, extension);

        if (extension) {
            extension = <span className="extension" key="extension">{"." + extension}</span>;
        }

        let nameDisplay;
        const cx = Classnames;

        const fileClasses = cx({
            "jstree-clicked selected-node": this.props.entry.get("selected"),
            "context-node": this.props.entry.get("context")
        });

        const liProps = {
            className: getClasses("jstree-leaf", this.props.extensions, this.getDataForExtension),
            onClick: this.handleClick,
            onMouseDown: this.props.handleMouseDown,
            onDoubleClick: this.handleDoubleClick
        };
        const liChildren: [JSX.Element] = [
            <ins className="jstree-icon" key="ins"></ins>
        ];

        const thickness = _createThickness(this.props.depth);

        if (this.props.entry.get("rename")) {
            liChildren.push(thickness);
            const WithRenameBehavior = withRenameBehavior(FileRenameInput);
            nameDisplay = <WithRenameBehavior
                actions={this.props.actions}
                entry={this.props.entry}
                name={this.props.name}
                parentPath={this.props.parentPath}
                key="fileRename"></WithRenameBehavior>;
        } else {
            const aProps = {
                href: "#",
                className: fileClasses,
                key: "file"
            };
            // Need to flatten the argument list because getIcons returns an array
            const aChildren = _.flatten([
                thickness,
                getIcons(this.props.extensions, this.getDataForExtension),
                name,
                extension
            ]);
            nameDisplay = <a {...aProps}>{aChildren}</a>;
        }

        liChildren.push(nameDisplay);

        return <li {...liProps}>{liChildren}</li>;
    }
}

/**
 * @private
 *
 * Creates a comparison function for sorting a directory's contents with directories
 * appearing before files.
 *
 * We're sorting the keys of the directory (the names) based partly on the values,
 * so we use a closure to capture the map itself so that we can look up the
 * values as needed.
 *
 * @param {Immutable.Map} contents The directory's contents
 * @return {function(string,string)} Comparator that sorts directories first.
 */
function _buildDirsFirstComparator(contents) {
    function _dirsFirstCompare(a, b) {
        const aIsFile = FileTreeViewModel.isFile(contents.get(a));
        const bIsFile = FileTreeViewModel.isFile(contents.get(b));

        if (!aIsFile && bIsFile) {
            return -1;
        }

        if (aIsFile && !bIsFile) {
            return 1;
        }

        return FileUtils.compareFilenames(a, b);
    }
    return _dirsFirstCompare;
}

/**
 * @private
 *
 * Sort a directory either alphabetically or with subdirectories listed first.
 *
 * @param {Immutable.Map} contents the directory's contents
 * @param {boolean} dirsFirst true to sort subdirectories first
 * @return {Immutable.Map} sorted mapping
 */
function _sortDirectoryContents(contents, dirsFirst) {
    if (dirsFirst) {
        return contents.keySeq().sort(_buildDirsFirstComparator(contents));
    }

    return contents.keySeq().sort(FileUtils.compareFilenames);
}

/**
 * @private
 *
 * Component that provides the input for renaming a directory.
 *
 * Props:
 * * parentPath: the full path of the directory containing this file
 * * name: the name of the file, including the extension
 * * actions: the action creator responsible for communicating actions the user has taken
 */
class DirectoryRenameInput extends React.Component<IDirectoryRenameInputProps, {}> {
    private textInput: HTMLInputElement | null;

    constructor(props: IDirectoryRenameInputProps) {
        super(props);
    }

    /**
     * When this component is displayed, we scroll it into view and select the folder name.
     */
    public componentDidMount() {
        const fullname = this.props.name;

        const node = this.textInput;
        if (node) {
            node.setSelectionRange(0, fullname.length);
            ViewUtils.scrollElementIntoView($("#project-files-container"), $(node), true);
        }
    }

    public render() {
        const width = _measureText(this.props.name);

        return <input
            className="jstree-rename-input"
            type="text"
            defaultValue={this.props.name}
            autoFocus={true}
            onKeyDown={this.props.handleKeyDown}
            onInput={this.props.handleInput}
            onBlur={this.props.handleBlur}
            style= {{
                width
            }}
            onClick={this.props.handleClick}
            ref={(input) => {
                this.textInput = input;
            }}
            key="directoryRenameInput"></input>;
    }
}

/**
 * @private
 *
 * Displays a directory (but not its contents) in the tree.
 *
 * Props:
 * * parentPath: the full path of the directory containing this file
 * * name: the name of the directory
 * * entry: the object with the relevant metadata for the file (whether it's selected or is the context file)
 * * actions: the action creator responsible for communicating actions the user has taken
 * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
 * * extensions: registered extensions for the file tree
 * * forceRender: causes the component to run render
 */
class DirectoryNode extends React.Component<IDirectoryNodeProps, {}> {
    constructor(props: IDirectoryNodeProps) {
        super(props);

        this.handleClick = this.handleClick.bind(this);
        this.getDataForExtension = this.getDataForExtension.bind(this);
    }

    /**
     * We need to update this component if the sort order changes or our entry object
     * changes. Thanks to immutability, if any of the directory contents change, our
     * entry object will change.
     */
    public shouldComponentUpdate(nextProps, nextState) {
        return nextProps.forceRender ||
            this.props.entry !== nextProps.entry ||
            this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
            this.props.extensions !== nextProps.extensions;
    }

    /**
     * If you click on a directory, it will toggle between open and closed.
     */
    public handleClick(event) {
        if (this.props.entry.get("rename")) {
            event.stopPropagation();
            return;
        }

        if (event.button !== LEFT_MOUSE_BUTTON) {
            return;
        }

        const isOpen = this.props.entry.get("open");
        const setOpen = isOpen ? false : true;

        if (event.metaKey || event.ctrlKey) {
            // ctrl-alt-click toggles this directory and its children
            if (event.altKey) {
                if (setOpen) {
                    // when opening, we only open the immediate children because
                    // opening a whole subtree could be really slow (consider
                    // a `node_modules` directory, for example).
                    this.props.actions.toggleSubdirectories(fullPath(this.props), setOpen);
                    this.props.actions.setDirectoryOpen(fullPath(this.props), setOpen);
                } else {
                    // When closing, we recursively close the whole subtree.
                    this.props.actions.closeSubtree(fullPath(this.props));
                }
            } else {
                // ctrl-click toggles the sibling directories
                this.props.actions.toggleSubdirectories(this.props.parentPath, setOpen);
            }
        } else {
            // directory toggle with no modifier
            this.props.actions.setDirectoryOpen(fullPath(this.props), setOpen);
        }
        event.stopPropagation();
        event.preventDefault();
    }

    /**
     * Create the data object to pass to extensions.
     *
     * @return {{name: {string}, isFile: {boolean}, fullPath: {string}}} Data for extensions
     */
    public getDataForExtension() {
        return {
            name: this.props.name,
            isFile: false,
            fullPath: fullPath(this.props)
        };
    }

    public render() {
        const entry = this.props.entry;
        let nodeClass;
        let childNodes;
        const children = entry.get("children");
        const isOpen = entry.get("open");

        if (isOpen && children) {
            nodeClass = "open";
            childNodes = <DirectoryContents
                depth={this.props.depth + 1}
                parentPath={fullPath(this.props)}
                contents={children}
                extensions={this.props.extensions}
                actions={this.props.actions}
                forceRender={this.props.forceRender}
                platform={this.props.platform}
                sortDirectoriesFirst={this.props.sortDirectoriesFirst}
                key="directoryContents"></DirectoryContents>;
        } else {
            nodeClass = "closed";
        }

        let nameDisplay;
        const cx = Classnames;

        const directoryClasses = cx({
            "jstree-clicked sidebar-selection": entry.get("selected"),
            "context-node": entry.get("context")
        });

        const liProps = {
            className: getClasses("jstree-" + nodeClass, this.props.extensions, this.getDataForExtension),
            onClick: this.handleClick,
            onMouseDown: this.props.handleMouseDown
        };
        const liChildren: [JSX.Element] = [
            _createAlignedIns(this.props.depth)
        ];

        const thickness = _createThickness(this.props.depth);

        if (entry.get("rename")) {
            liChildren.push(thickness);
            const WithRenameBehavior = withRenameBehavior(DirectoryRenameInput);
            nameDisplay = <WithRenameBehavior
                actions={this.props.actions}
                entry={entry}
                name={this.props.name}
                parentPath={this.props.parentPath}
                key="directoryRename"></WithRenameBehavior>;
        } else {
            const aProps = {
                href: "#",
                className: directoryClasses,
                key: "directory"
            };
            // Need to flatten the arguments because getIcons returns an array
            const aChildren = _.flatten([
                thickness,
                getIcons(this.props.extensions, this.getDataForExtension),
                this.props.name
            ]);
            nameDisplay = <a {...aProps}>{aChildren}</a>;
        }

        liChildren.push(nameDisplay);
        liChildren.push(childNodes);

        return <li {...liProps}>{liChildren}</li>;
    }
}

/**
 * @private
 *
 * Displays the contents of a directory.
 *
 * Props:
 * * isRoot: whether this directory is the root of the tree
 * * parentPath: the full path of the directory containing this file
 * * contents: the map of name/child entry pairs for this directory
 * * actions: the action creator responsible for communicating actions the user has taken
 * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
 * * extensions: registered extensions for the file tree
 * * forceRender: causes the component to run render
 */
class DirectoryContents extends React.Component<IDirectoryContentsProps, {}> {
    constructor(props: IDirectoryContentsProps) {
        super(props);
    }

    /**
     * Need to re-render if the sort order or the contents change.
     */
    public shouldComponentUpdate(nextProps, nextState) {
        return nextProps.forceRender ||
            this.props.contents !== nextProps.contents ||
            this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
            this.props.extensions !== nextProps.extensions;
    }

    public render() {
        const extensions = this.props.extensions;
        const iconClass = extensions && extensions.get("icons") ? "jstree-icons" : "jstree-no-icons";
        const ulProps: React.HTMLProps<HTMLUListElement> = { key: "children" };
        if (this.props.isRoot) {
            ulProps.className = "jstree-brackets jstree-no-dots " + iconClass;
        }

        const contents = this.props.contents;
        const namesInOrder = _sortDirectoryContents(contents, this.props.sortDirectoriesFirst);
        const self: DirectoryContents = this;
        // tslint:disable-next-line:unnecessary-bind
        const children = namesInOrder.map(function (name) {
            const entry = contents.get(name);

            if (FileTreeViewModel.isFile(entry)) {
                const WithContextSettable = withContextSettable(FileNode);
                return <WithContextSettable
                    depth={self.props.depth}
                    parentPath={self.props.parentPath}
                    name={name}
                    entry={entry}
                    actions={self.props.actions}
                    extensions={self.props.extensions}
                    forceRender={self.props.forceRender}
                    platform={self.props.platform}
                    key={name}></WithContextSettable>;
            }

            const WithContextSettable = withContextSettable(DirectoryNode);
            return <WithContextSettable
                depth={self.props.depth}
                parentPath={self.props.parentPath}
                name={name}
                entry={entry}
                actions={self.props.actions}
                extensions={self.props.extensions}
                sortDirectoriesFirst={self.props.sortDirectoriesFirst}
                forceRender={self.props.forceRender}
                platform={self.props.platform}
                key={name}></WithContextSettable>;
        }.bind(this)).toArray();

        return <ul {...ulProps}>{children}</ul>;
    }
}

/**
 * Displays the absolutely positioned box for the selection or context in the
 * file tree. Its position is determined by passed-in info about the scroller in which
 * the tree resides and the top of the selected node (as reported by the node itself).
 *
 * Props:
 * * selectionViewInfo: Immutable.Map with width, scrollTop, scrollLeft and offsetTop for the tree container
 * * visible: should this be visible now
 * * selectedClassName: class name applied to the element that is selected
 */
class FileSelectionBox extends React.Component<IFileSelectionBoxProps, {}> {
    constructor(props) {
        super(props);
    }

    /**
     * When the component has updated in the DOM, reposition it to where the currently
     * selected node is located now.
     */
    public componentDidUpdate() {
        if (!this.props.visible) {
            return;
        }

        const node = ReactDOM.findDOMNode(this);
        const selectedNode = $(node.parentNode as HTMLElement).find(this.props.selectedClassName);
        const selectionViewInfo = this.props.selectionViewInfo;

        if (selectedNode.length === 0) {
            return;
        }

        (node as HTMLElement).style.top =
            selectedNode.offset().top -
            selectionViewInfo.get("offsetTop") +
            selectionViewInfo.get("scrollTop") -
            selectedNode.position().top + "px";
    }

    public render() {
        const selectionViewInfo = this.props.selectionViewInfo;
        const left = selectionViewInfo.get("scrollLeft");
        const style: React.CSSProperties = {
            overflow: "auto",
            left,
            display: this.props.visible ? "block" : "none"
        };

        return <div style={style} className={this.props.className}></div>;
    }
}

/**
 * On Windows and Linux, the selection bar in the tree does not extend over the scroll bar.
 * The SelectionExtension sits on top of the scroll bar to make the selection bar appear to span the
 * whole width of the sidebar.
 *
 * Props:
 * * selectionViewInfo: Immutable.Map with width, scrollTop, scrollLeft and offsetTop for the tree container
 * * visible: should this be visible now
 * * selectedClassName: class name applied to the element that is selected
 * * className: class to be applied to the extension element
 */
class SelectionExtension extends React.Component<ISelectionExtensionProps, {}> {
    constructor(props: ISelectionExtensionProps) {
        super(props);
    }

    /**
     * When the component has updated in the DOM, reposition it to where the currently
     * selected node is located now.
     */
    public componentDidUpdate() {
        if (!this.props.visible) {
            return;
        }

        const node = ReactDOM.findDOMNode(this);
        const selectedNode = $(node.parentNode as HTMLElement).find(this.props.selectedClassName).closest("li");
        const selectionViewInfo = this.props.selectionViewInfo;

        if (selectedNode.length === 0) {
            return;
        }

        const element = node as HTMLElement;
        let top = selectedNode.offset().top;
        let baselineHeight = parseInt(element.dataset.initialHeight || "0", 10);
        let height = baselineHeight;
        const scrollerTop = selectionViewInfo.get("offsetTop");

        if (!baselineHeight) {
            baselineHeight = $(element).outerHeight();
            element.dataset.initialHeight = "" + baselineHeight;
            height = baselineHeight;
        }

        // Check to see if the selection is completely scrolled out of view
        // to prevent the extension from appearing in the working set area.
        if (top < scrollerTop - baselineHeight) {
            element.style.display = "none";
            return;
        }

        element.style.display = "block";

        // The SelectionExtension sits on top of the other nodes
        // so we need to shrink it if only part of the selection node is visible
        if (top < scrollerTop) {
            const difference = scrollerTop - top;
            top += difference;
            height = parseInt("" + height, 10);
            height -= difference;
        }

        element.style.top = top + "px";
        element.style.height = height + "px";
        element.style.left = selectionViewInfo.get("width") - $(element).outerWidth() + "px";
    }

    public render() {
        const style = {
            display: this.props.visible ? "block" : "none"
        };
        return <div style={style} className={this.props.className}></div>;
    }
}

/**
 * @private
 *
 * This is the root component of the file tree.
 *
 * Props:
 * * treeData: the root of the tree (an Immutable.Map with the contents of the project root)
 * * sortDirectoriesFirst: whether the directories should be displayed first when listing the contents of a directory
 * * parentPath: the full path of the directory containing this file
 * * actions: the action creator responsible for communicating actions the user has taken
 * * extensions: registered extensions for the file tree
 * * forceRender: causes the component to run render
 * * platform: platform that Brackets is running on
 */
class FileTreeView extends React.Component<IFileTreeViewProps, {}> {
    constructor(props: IFileTreeViewProps) {
        super(props);
    }

    /**
     * Update for any change in the tree data or directory sorting preference.
     */
    public shouldComponentUpdate(nextProps, nextState) {
        return nextProps.forceRender ||
            this.props.treeData !== nextProps.treeData ||
            this.props.sortDirectoriesFirst !== nextProps.sortDirectoriesFirst ||
            this.props.extensions !== nextProps.extensions ||
            this.props.selectionViewInfo !== nextProps.selectionViewInfo;
    }

    public render() {
        const selectionBackground = <FileSelectionBox
            ref="selectionBackground"
            selectionViewInfo={this.props.selectionViewInfo}
            className="filetree-selection"
            visible={this.props.selectionViewInfo.get("hasSelection")}
            selectedClassName=".selected-node"
            forceUpdate={true}></FileSelectionBox>;
        const contextBackground = <FileSelectionBox
            ref="contextBackground"
            selectionViewInfo={this.props.selectionViewInfo}
            className="filetree-context"
            visible={this.props.selectionViewInfo.get("hasContext")}
            selectedClassName=".context-node"
            forceUpdate={true}></FileSelectionBox>;
        const extensionForSelection = <SelectionExtension
            selectionViewInfo={this.props.selectionViewInfo}
            selectedClassName=".selected-node"
            visible={this.props.selectionViewInfo.get("hasSelection")}
            forceUpdate={true}
            className="filetree-selection-extension"></SelectionExtension>;
        const extensionForContext = <SelectionExtension
            selectionViewInfo={this.props.selectionViewInfo}
            selectedClassName=".context-node"
            visible={this.props.selectionViewInfo.get("hasContext")}
            forceUpdate={true}
            className="filetree-context-extension"></SelectionExtension>;
        const contents = <DirectoryContents
            isRoot={true}
            depth={1}
            parentPath={this.props.parentPath}
            sortDirectoriesFirst={this.props.sortDirectoriesFirst}
            contents={this.props.treeData}
            extensions={this.props.extensions}
            actions={this.props.actions}
            forceRender={this.props.forceRender}
            platform={this.props.platform}></DirectoryContents>;

        return <div>
            {selectionBackground}
            {contextBackground}
            {extensionForSelection}
            {extensionForContext}
            {contents}</div>;
    }
}

/**
 * Renders the file tree to the given element.
 *
 * @param {DOMNode|jQuery} element Element in which to render this file tree
 * @param {FileTreeViewModel} viewModel the data container
 * @param {Directory} projectRoot Directory object from which the fullPath of the project root is extracted
 * @param {ActionCreator} actions object with methods used to communicate events that originate from the user
 * @param {boolean} forceRender Run render on the entire tree
 *   (useful if an extension has new data that it needs rendered)
 * @param {string} platform mac, win, linux
 */
function render(element, viewModel, projectRoot, actions, forceRender, platform) {
    if (!projectRoot) {
        return;
    }

    ReactDOM.render(
        <FileTreeView
            treeData={viewModel.treeData}
            selectionViewInfo={viewModel.selectionViewInfo}
            sortDirectoriesFirst={viewModel.sortDirectoriesFirst}
            parentPath={projectRoot.fullPath}
            actions={actions}
            extensions={_extensions}
            platform={platform}
            forceRender={forceRender}>
        </FileTreeView>,
        element
    );
}

/**
 * @private
 *
 * Add an extension for the given category (icons, addClass).
 *
 * @param {string} category Category to which the extension is being added
 * @param {function} callback The extension function itself
 */
function _addExtension(category, callback) {
    if (!callback || typeof callback !== "function") {
        console.error("Attempt to add FileTreeView", category, "extension without a callback function");
        return;
    }
    let callbackList = _extensions.get(category);
    if (!callbackList) {
        callbackList = Immutable.List();
    }
    callbackList = callbackList.push(callback);
    _extensions = _extensions.set(category, callbackList);
}

/**
 * @see {@link ProjectManager::#addIconProvider}
 */
function addIconProvider(callback) {
    _addExtension("icons", callback);
}

/**
 * @see {@link ProjectManager::#addClassesProvider}
 */
function addClassesProvider(callback) {
    _addExtension("addClass", callback);
}

// Private API for testing
exports._fullPath = fullPath;
exports._sortFormattedDirectory = _sortDirectoryContents;
exports._fileNode = function (props) {
    const WithContextSettable = withContextSettable(FileNode);
    return <WithContextSettable {...props}></WithContextSettable>;
};
exports._directoryNode = function (props) {
    const WithContextSettable = withContextSettable(DirectoryNode);
    return <WithContextSettable {...props}></WithContextSettable>;
};
exports._directoryContents = React.createFactory(DirectoryContents);
exports._fileTreeView = React.createFactory(FileTreeView);

// Public API
exports.addIconProvider = addIconProvider;
exports.addClassesProvider = addClassesProvider;
exports.render = render;
