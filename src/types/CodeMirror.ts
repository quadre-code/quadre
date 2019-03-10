declare namespace CodeMirror  {
    // TODO: upstream these definitions. (Revisit names, types where necessary)

    interface ModeMap {
        [name: string]: CodeMirror.Mode<any>;
    }

    const modes: ModeMap;

    interface MimeModeMap {
        [name: string]: CodeMirror.Mode<any>;
    }

    const mimeModes: MimeModeMap;

    interface StringStreamConstructor {
        new (text: string);
    }
    const StringStream: StringStreamConstructor;

    interface Mode<T> {
        name: string;
    }

    interface Commands {
        singleSelection(cm: CodeMirror.Editor);
        indentAuto(cm: CodeMirror.Editor);
        indentMore(cm: CodeMirror.Editor);
    }

    const commands: Commands;

    function isWordChar(ch: string): boolean;

    function defineMIME(mime: string, modeConfig: string | any);

    function startState(mode: CodeMirror.Mode<any>): any;

    function splitLines(text: string): Array<string>;

    interface Editor {
        cursorCoords(): { left: number, top: number, bottom: number };
        cursorCoords(pos: null, mode: "local" | "page"): { bottom: number };

        scrollIntoView(pos: { left: number, top: number, right: number, bottom: number }): void;

        toggleOverwrite(overwrite: boolean | null);

        removeLineWidget(info: any);

        on(eventName: "overwriteToggle", handler: (instance, newstate) => void);
    }

    interface EditorConfiguration {
        autoCloseBrackets?: boolean | {};
        autoCloseTags?: boolean | {};
        coverGutterNextToScrollbar?: boolean;
        cursorScrollMargin?: number;
        highlightSelectionMatches?: boolean;
        inputStyle?: "textarea" | string;
        lineWiseCopyCut?: boolean;
        matchBrackets?: { maxScanLineLength: number, maxScanLines: number };
        matchTags?: { bothTags: boolean };
        scrollPastEnd?: boolean;
        styleActiveLine?: boolean;
    }

    // Brackets specific
    interface TextMarker {
        tagID: number;
    }
}
