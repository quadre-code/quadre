export enum CodeInspectionResultType {
    ERROR = "problem_type_error",
    WARNING = "problem_type_warning",
    META = "problem_type_meta",
}

export interface CodeInspectionPosition {
    line: number;
    ch: number;
}

export interface CodeInspectionResult {
    type: CodeInspectionResultType;
    message: string;
    pos: CodeInspectionPosition;
}

export interface CodeInspectionReport {
    errors: Array<CodeInspectionResult>;
}

export interface GutterOptions {
    error: boolean;
    warning: boolean;
    meta: boolean;
}
