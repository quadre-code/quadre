import "codemirror/addon/edit/closebrackets";
import "codemirror/addon/edit/closetag";
import "codemirror/addon/edit/matchbrackets";
import "codemirror/addon/edit/matchtags";
import "codemirror/addon/scroll/scrollpastend";
import "codemirror/addon/search/match-highlighter";
import "codemirror/addon/search/matchesonscrollbar";
import "codemirror/addon/selection/active-line";

declare module "codemirror" {
    // Brackets specific
    export interface TextMarker {
        tagID: number;
    }

    // Verify to upstream.
    export interface LineWidget {
        line: LineHandle;
        height: number;
    }

    // Verify to upstream.
    interface Editor {
        moveV(direction: number, unit: "line" | "page");
    }
}
