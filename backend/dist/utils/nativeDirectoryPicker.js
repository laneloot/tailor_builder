"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openNativeDirectoryPicker = openNativeDirectoryPicker;
const promises_1 = __importDefault(require("fs/promises"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFileAsync = (0, util_1.promisify)(child_process_1.execFile);
const DIALOG_TIMEOUT_MS = 5 * 60 * 1000;
function normalizeDialogOutput(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return null;
    return path_1.default.resolve(trimmed);
}
function isDialogCancelError(error, command) {
    if (!(error instanceof Error))
        return false;
    const message = error.message.toLowerCase();
    if (message.includes('cancel') || message.includes('canceled') || message.includes('cancelled')) {
        return true;
    }
    const execError = error;
    const code = execError.code;
    // GUI pickers commonly use exit code 1 for user cancel/close instead of
    // writing an explicit "cancelled" message to stderr.
    if (code === 1 || code === '1') {
        return ['zenity', 'qarma', 'yad', 'kdialog', 'osascript'].includes(command);
    }
    // YAD can return 252 when the dialog is closed via ESC/window close.
    if (code === 252 || code === '252') {
        return command === 'yad';
    }
    return false;
}
function isCommandMissingError(error) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
function shouldStripDialogEnvVar(key) {
    return (key.startsWith('SNAP') ||
        key.startsWith('GTK_') ||
        key.startsWith('GIO_') ||
        key === 'LD_LIBRARY_PATH' ||
        key === 'PYTHONHOME' ||
        key === 'PYTHONPATH');
}
function buildDialogEnvironment() {
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value === undefined || shouldStripDialogEnvVar(key)) {
            continue;
        }
        env[key] = value;
    }
    return env;
}
async function ensureStartingDirectory(candidate) {
    const fallback = os_1.default.homedir();
    if (!candidate?.trim())
        return fallback;
    const resolved = path_1.default.resolve(candidate.trim());
    try {
        const stats = await promises_1.default.stat(resolved);
        return stats.isDirectory() ? resolved : fallback;
    }
    catch {
        return fallback;
    }
}
async function runDialogCommand(command, args) {
    const { stdout } = await execFileAsync(command, args, {
        timeout: DIALOG_TIMEOUT_MS,
        windowsHide: false,
        env: buildDialogEnvironment(),
    });
    return normalizeDialogOutput(stdout);
}
function buildMacCommand(startDir, title) {
    return {
        command: 'osascript',
        args: [
            '-e',
            `set selectedFolder to choose folder with prompt "${title.replace(/"/g, '\\"')}" default location POSIX file "${startDir.replace(/"/g, '\\"')}"`,
            '-e',
            'POSIX path of selectedFolder',
        ],
    };
}
function buildLinuxCommands(startDir, title) {
    const normalizedStartDir = startDir.endsWith(path_1.default.sep) ? startDir : `${startDir}${path_1.default.sep}`;
    return [
        {
            command: 'zenity',
            args: ['--file-selection', '--directory', '--title', title, '--filename', normalizedStartDir],
        },
        {
            command: 'qarma',
            args: ['--file-selection', '--directory', '--title', title, '--filename', normalizedStartDir],
        },
        {
            command: 'yad',
            args: ['--file-selection', '--directory', '--title', title, '--filename', normalizedStartDir],
        },
        {
            command: 'kdialog',
            args: ['--getexistingdirectory', startDir, '--title', title],
        },
    ];
}
function buildWindowsCommands(startDir, title) {
    const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
        `$dialog.Description = '${title.replace(/'/g, "''")}'`,
        '$dialog.UseDescriptionForTitle = $true',
        `$dialog.SelectedPath = '${startDir.replace(/'/g, "''")}'`,
        'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
        '  [Console]::Out.WriteLine($dialog.SelectedPath)',
        '}',
    ].join('; ');
    return [
        {
            command: 'powershell',
            args: ['-NoProfile', '-STA', '-Command', script],
        },
        {
            command: 'pwsh',
            args: ['-NoProfile', '-STA', '-Command', script],
        },
    ];
}
async function pickWithCommands(commands) {
    let sawMissingCommand = false;
    const failures = [];
    for (const entry of commands) {
        try {
            return await runDialogCommand(entry.command, entry.args);
        }
        catch (error) {
            if (isDialogCancelError(error, entry.command)) {
                return null;
            }
            if (isCommandMissingError(error)) {
                sawMissingCommand = true;
                continue;
            }
            const execError = error;
            const stderr = execError.stderr?.trim();
            failures.push(stderr ? `${entry.command}: ${stderr}` : `${entry.command}: failed to open dialog`);
            continue;
        }
    }
    if (failures.length > 0) {
        throw new Error(failures[0]);
    }
    if (sawMissingCommand) {
        throw new Error('No supported native folder picker is available on the backend machine');
    }
    throw new Error('Failed to open native folder picker');
}
async function openNativeDirectoryPicker(currentPath) {
    const startDir = await ensureStartingDirectory(currentPath);
    const title = 'Select output directory';
    if (process.platform === 'darwin') {
        return { selectedPath: await pickWithCommands([buildMacCommand(startDir, title)]) };
    }
    if (process.platform === 'win32') {
        return { selectedPath: await pickWithCommands(buildWindowsCommands(startDir, title)) };
    }
    return { selectedPath: await pickWithCommands(buildLinuxCommands(startDir, title)) };
}
//# sourceMappingURL=nativeDirectoryPicker.js.map