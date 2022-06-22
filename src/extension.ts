// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { Annotator } from './annotator';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "code-annotator" is now active!');
	
	const annotator = new Annotator(context);
	context.subscriptions.push(
		vscode.commands.registerCommand('code-annotator.clear', () => annotator.annotate(0))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('code-annotator.done', () => annotator.annotate(1))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('code-annotator.na', () => annotator.annotate(2))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('code-annotator.obsolete', () => annotator.annotate(3))
	);
	context.subscriptions.push(
		vscode.commands.registerCommand('code-annotator.stats', () => annotator.showStats())
	);

	vscode.window.onDidChangeActiveTextEditor(
		(editor) => annotator.loadDataForEditor(editor),
		null,
		context.subscriptions
	  );
}

// this method is called when your extension is deactivated
export function deactivate() {}
