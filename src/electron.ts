import * as PreferencesManager from "preferences/PreferencesManager";
import * as Strings from "strings";

PreferencesManager.definePreference("shell.blinkFeatures", "string", "", {
    description: Strings.DESCRIPTION_SHELL_BLINK_FEATURES
});

PreferencesManager.definePreference("shell.disableBlinkFeatures", "string", "", {
    description: Strings.DESCRIPTION_SHELL_DISABLE_BLINK_FEATURES
});

PreferencesManager.definePreference("shell.smoothScrolling", "boolean", true, {
    description: Strings.DESCRIPTION_SHELL_SMOOTH_SCROLLING
});

// See https://github.com/Microsoft/TypeScript/issues/20943
export {};
