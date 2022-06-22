import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';

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

    constructor(_context: vscode.ExtensionContext) {
        const folder = vscode.workspace.workspaceFolders?.[0];

        if (!folder) {
            throw new Error("Workspace not found");
        }


        this.workspacePath = folder.uri.fsPath;

        if (!fs.existsSync(this.getStoragePath())) {
            this.storeData({});
        }

        this.loadDataForEditor(vscode.window.activeTextEditor);
    }

    loadDataForEditor(editor?: vscode.TextEditor) {
        if (!editor) {
            return;
        }

        const allData = this.loadFullData();
        const file = path.relative(this.workspacePath, editor.document.uri.fsPath).split(path.sep).join(path.posix.sep);
        const selectedLines = allData[file] || {};

        this.showAnnotations(editor, selectedLines);
    }

    async annotate(type: number) {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            return;
        }

        const allData = this.loadFullData();
        const file = path.relative(this.workspacePath, editor.document.uri.fsPath).split(path.sep).join(path.posix.sep);
        const selectedLines = allData[file] || {};

        const {selections} = editor;
        const isSingleLineSelected = selections.length === 1 && selections[0].start.line === selections[0].end.line;

        for (const selection of selections) {
            for (let i = selection.start.line; i <= selection.end.line; i++) {
                if (type === 0) {
                    delete selectedLines[i];
                } else {
                    selectedLines[i] = type;
                }
            }
        }

        this.showAnnotations(editor, selectedLines);

        if (isSingleLineSelected) {
            vscode.commands.executeCommand("cursorMove", { to: "down", by:'wrappedLine', value: 1});
        }
        this.storeData({
            ...allData,
            [file]: selectedLines,
        });
    }

    async showStats() {
        const data = this.loadFullData();

        const stats = [0, 0, 0, 0];

        const files = await this.getMatchingFiles();
        await Promise.all(files.map(async (file) => {
            const lines = await this.getLineCount(file);
            const fileStat = data[file] || {};
            for (let i = 0; i < lines; i++) {
                stats[fileStat[i] || 0]++;
            }
        }));



        const sum = stats.reduce((prev, curr) => prev + curr, 0);

        function getStat(value: number) {
            return `${value} (${Math.round(value / sum * 1000)/10}%)`;
        }

        const message = `Done: ${getStat(stats[1])}\nNot applicable: ${getStat(stats[2])}\nObsolete: ${getStat(stats[3])}\nTodo: ${getStat(stats[0])}`;
        vscode.window.showInformationMessage(message, {modal: true});

        console.log({
            done: getStat(stats[1]),
            na: getStat(stats[2]),
            obsolete: getStat(stats[3]),
            todo: getStat(stats[0]),
        });
    }

    showAnnotations(editor: vscode.TextEditor, selectedLines: Record<number, number>) {
        const decorations = createRanges(selectedLines);
        for (let i = 1; i < 4; i++) {
            editor.setDecorations(types[i], decorations[i] || []);
        }
    }

    loadFullData(): Storage {
        return JSON.parse(fs.readFileSync(this.getStoragePath(), "utf-8"));
    }

    storeData(data: Storage) {
        fs.writeFileSync(this.getStoragePath(), JSON.stringify(data, null, '  '));
    }

    getStoragePath() {
        return path.join(this.workspacePath, 'rewrite.json');
    }

    getMatchingFiles(): Promise<string[]> {
        return new Promise((resolve, reject) => {
            glob(pattern, {cwd: this.workspacePath}, function(err, files) {
                if (err) {
                    return reject(err);
                }

                resolve(files);
            });
        });
    }

    getLineCount(filePath: string): Promise<number> {
        return new Promise(resolve => {
            let count = 0;

            fs.createReadStream(path.join(this.workspacePath, filePath))
                .on('data', function(chunk) {
                    for (let i=0; i < chunk.length; ++i) {
                        if (chunk[i] === 10) {
                            count++;
                        }
                    }
                })
                .on('end', function() {
                    resolve(count);
                });
        });
    }
}

function createRanges(selectedLines: Record<number, number>) {
    let start = -1;
    let end = -1;
    let type = -1;
    const decorations: vscode.Range[][] = [];

    for (const [line, currentType] of Object.entries(selectedLines)) {
        const lineNo = Number(line);
        if (start === -1) {
            start = end = lineNo;
            type = currentType;
            continue;
        }

        console.log(start, end, line);
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
