import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

enum Annotation {
	todo = '0',
	done = '1',
	na = '2',
	obsolete = '3',
}

const types: Record<Annotation, vscode.TextEditorDecorationType>  = {
    [Annotation.todo]: vscode.window.createTextEditorDecorationType({
        backgroundColor: 'black',
        isWholeLine: true,
    }),
    [Annotation.done]: vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(0, 200, 0, 0.5)',
        borderWidth: '0 0 0 3px',
        isWholeLine: true,
    }),
    [Annotation.na]: vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(210, 210, 210, 0.5)',
        borderWidth: '0 0 0 3px',
        isWholeLine: true,
    }),
    [Annotation.obsolete]: vscode.window.createTextEditorDecorationType({
        border: 'solid rgba(255, 0, 0, 0.5)',
        borderWidth: '0 0 0 3px',
	}),
};



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
            vscode.commands.registerCommand('code-annotator.clear', () => this.annotate(Annotation.todo))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.done', () => this.annotate(Annotation.done))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.na', () => this.annotate(Annotation.na))
        );
        context.subscriptions.push(
            vscode.commands.registerCommand('code-annotator.obsolete', () => this.annotate(Annotation.obsolete))
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

        const expectedContents = contents.replace(/^\d( |$)/gm, '');

        if (expectedContents !== fs.readFileSync(editor.document.uri.fsPath, 'utf-8')) {
            console.log('contents not same', expectedContents, fs.readFileSync(editor.document.uri.fsPath, 'utf-8'));
            return undefined;
        }

        return contents;
    }

    loadAnnotationsForEditor(editor?: vscode.TextEditor): Annotation[] | undefined {
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

        return file.match(/^\d/mg) as Annotation[] | undefined;
    }

    async annotate(type: Annotation) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return;
        }

        const file = this.loadFileForEditor(editor);

        if (!file) {
            return;
        }

        
        const lines = strToLines(file);

        const {selections} = editor;
        const isSingleLineSelected = selections.length === 1 && selections[0].start.line === selections[0].end.line;

        for (const selection of selections) {
            for (let i = selection.start.line; i <= selection.end.line; i++) {
                lines[i] = lines[i].replace(/^\d/, type);
            }
        }

        const newFile = lines.join('');

        this.showAnnotations(editor, this.getAnnotationsFromFile(newFile));

        if (isSingleLineSelected) {
            vscode.commands.executeCommand("cursorMove", { to: "down", by:'wrappedLine', value: 1});
        }

        fs.writeFileSync(this.getOutputPathForEditor(editor), newFile);
    }

    showAnnotations(editor?: vscode.TextEditor, annotations?: Annotation[]) {
        if (!editor || !annotations) {
            return;
        }

        const decorations = createRanges(annotations);
        for (const type of Object.values(Annotation)) {
            if (type !== Annotation.todo) {
                editor.setDecorations(types[type], decorations[type] || []);
            }
        }
    }

    getStoragePath() {
        return path.join(this.workspacePath, 'rewrite.json');
    }
}

function strToLines(str: string) {
	const parts = str.split(/(\r\n|\r|\n)/);

	// join every two parts
	const lines = [];
	for (let i = 0; i < parts.length; i += 2) {
		lines.push(`${parts[i]}${parts[i + 1] || ''}`);
	}

	return lines;
}

function createRanges(annotations: Annotation[]) {
    let start = -1;
    let end = -1;
    let type = Annotation.todo;
    const decorations: Record<Annotation, vscode.Range[]> = {
        [Annotation.todo] : [],
        [Annotation.done] : [],
        [Annotation.na] : [],
        [Annotation.obsolete] : [],
    };

    for (const [line, currentType] of annotations.entries()) {
        const lineNo = Number(line);
        if (start === -1) {
            start = end = lineNo;
            type = currentType;
            continue;
        }

        if (lineNo > end + 1 || type !== currentType) {
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
