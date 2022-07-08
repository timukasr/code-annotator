import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const types = [
    vscode.window.createTextEditorDecorationType({
        backgroundColor: 'black',
        isWholeLine: true,
    }),
    vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(0, 200, 0, 0.5)',
        borderWidth: '0 0 0 3px',
        isWholeLine: true,
    }),
    vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(210, 210, 210, 0.5)',
        borderWidth: '0 0 0 3px',
        isWholeLine: true,
    }),
    vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(255, 0, 0, 0.5)',
        borderWidth: '0 0 0 3px',
	}),
];

type Storage = Record<string, Record<number, number>>;

const pattern = 'todo';

export class Annotator {
    readonly workspacePath: string;
    readonly outputPath: string = '';

    constructor(context: vscode.ExtensionContext) {
        const folder = vscode.workspace.workspaceFolders?.[0];

        if (!folder) {
            throw new Error("Workspace not found");
        }


        this.workspacePath = folder.uri.fsPath;

        try {
            this.outputPath = this.loadConfig();
        } catch (e) {
            vscode.window.showInformationMessage(`Failed to initialize: ${e}`);
            return;
        }

        this.initialize(context);

        this.loadDataForEditor(vscode.window.activeTextEditor);
    }

    loadConfig() {
        const configFile = path.join(this.workspacePath, 'rewrite.json');
        if (!fs.existsSync(configFile)) {
            throw new Error("Config file 'rewrite.json' does not exist: " + configFile);
        }

        const config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
        const rewriteDir = config?.rewriteDir;

        if (typeof rewriteDir !== 'string') {
            throw new Error("Config does not containt 'rewriteDir'");
        }

        return path.join(this.workspacePath, rewriteDir);
    }

    initialize(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.clear', () => this.annotate(0))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.done', () => this.annotate(1))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.na', () => this.annotate(2))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.obsolete', () => this.annotate(3))
        );
    
        vscode.window.onDidChangeActiveTextEditor(
            (editor) => this.loadDataForEditor(editor),
            null,
            context.subscriptions
          );
    }

    loadDataForEditor(editor?: vscode.TextEditor) {
        const annotations = this.loadAnnotationsForEditor(editor);

        this.showAnnotations(editor, annotations);
    }

    loadFileForEditor(editor: vscode.TextEditor) {
        const outputFile = this.getOutputPathForEditor(editor);
        
        if (!fs.existsSync(outputFile)) {
            return;
        }

        const contents = fs.readFileSync(outputFile, 'utf-8');

        const expectedContents = contents.replace(/\d$/gm, '');

        if (expectedContents !== fs.readFileSync(editor.document.uri.fsPath, 'utf-8')) {
            console.log('contents not same');
            return undefined;
        }

        return contents;
    }

    loadAnnotationsForEditor(editor?: vscode.TextEditor): number[] | undefined {
        if (!editor) {
            return;
        }

        return this.getAnnotationsFromFile(this.loadFileForEditor(editor));
    }

    getOutputPathForEditor(editor: vscode.TextEditor) {
        return path.join(this.outputPath, path.relative(this.workspacePath, editor.document.uri.fsPath));
    }

    getAnnotationsFromFile(file?: string) {
        if (!file) {
            return;
        }

        const annotations = file.match(/\d$/mg);

        return annotations?.map(number => Number(number));
    }

    async annotate(type: number) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return;
        }

        const file = this.loadFileForEditor(editor);

        if (!file) {
            return;
        }

        
        const lines = file.split(/(\r?\n)/);

        const {selections} = editor;
        const isSingleLineSelected = selections.length === 1 && selections[0].start.line === selections[0].end.line;

        for (const selection of selections) {
            for (let i = selection.start.line; i <= selection.end.line; i++) {
                const lineNumber = i * 2;
                lines[lineNumber] = lines[lineNumber].replace(/\d?$/, String(type));
            }
        }

        const newFile = lines.join('');

        this.showAnnotations(editor, this.getAnnotationsFromFile(newFile));

        if (isSingleLineSelected) {
            vscode.commands.executeCommand("cursorMove", { to: "down", by:'wrappedLine', value: 1});
        }

        fs.writeFileSync(this.getOutputPathForEditor(editor), newFile);
    }

    showAnnotations(editor?: vscode.TextEditor, annotations?: number[]) {
        if (!editor || !annotations) {
            return;
        }

        const decorations = createRanges(annotations);
        for (let i = 1; i < 4; i++) {
            editor.setDecorations(types[i], decorations[i] || []);
        }
    }

    getStoragePath() {
        return path.join(this.workspacePath, 'rewrite.json');
    }
}

function createRanges(annotations: number[]) {
    let start = -1;
    let end = -1;
    let type = -1;
    const decorations: vscode.Range[][] = [];

    for (const [line, currentType] of annotations.entries()) {
        const lineNo = Number(line);
        if (start === -1) {
            start = end = lineNo;
            type = currentType;
            continue;
        }

        if (lineNo > end + 1 || type !== currentType) {
            if (!decorations[type]) {
                decorations[type] = [];
            }
            decorations[type].push(new vscode.Range(start, 0, end, 0));

            start = end = lineNo;
            type = currentType;
        } else {
            end = lineNo;
        }
    }

    if (start === -1) {
        return decorations;
    }

    if (!decorations[type]) {
        decorations[type] = [];
    }
    decorations[type].push(new vscode.Range(start, 0, end, 0));

    return decorations;
}
