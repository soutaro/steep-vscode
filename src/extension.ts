import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Disposable, ExecutableOptions } from 'vscode-languageclient';
import { existsSync } from 'fs';

const _clientSessions: Map<vscode.WorkspaceFolder, LanguageClient> = new Map();

function stopSteep(folder: vscode.WorkspaceFolder) {
	const client = _clientSessions.get(folder)

	if (client) {
		console.log(`Stopping steep in ${folder.uri}...`)

		_clientSessions.delete(folder)
		client.stop()
	}
}

function hasClient(folder: vscode.WorkspaceFolder): boolean {
	const client = _clientSessions.get(folder)
	return client !== undefined
}

function startSteep(folder: vscode.WorkspaceFolder) {
	if (_clientSessions.get(folder)) {
		return
	}

	console.log(`Starting steep in ${folder.uri}...`)

	let rubyopt = process.env.RUBYOPT
	const options: ExecutableOptions = {
		cwd: folder.uri.fsPath,
		env: { ...process.env, RUBYOPT: `${ rubyopt || "" } -EUTF-8` },
		shell: true
	}

	const loglevel = vscode.workspace.getConfiguration('steep').get("loglevel")
	let serverOptions: ServerOptions

	const binstub = vscode.Uri.file(`${folder.uri.path}/bin/steep`)
	if (existsSync(binstub.fsPath)) {
		console.log("Detected bin/steep...")
		serverOptions = {
			command: "bin/steep",
			args: ["langserver", `--log-level=${loglevel}`],
			options: options
		}
	} else {
		console.log("Using bundle exec to start steep...")
		serverOptions = {
			command: "bundle",
			args: ["exec", "steep", "langserver", `--log-level=${loglevel}`],
			options: options
		}
	}

	const clientOptions: LanguageClientOptions = {
		documentSelector: ['ruby', 'ruby-signature', 'rbs'],
		diagnosticCollectionName: "steeprb"
	};

	const client = new LanguageClient("Steep", serverOptions, clientOptions)
	_clientSessions.set(folder, client)
	client.start()

	vscode.window.setStatusBarMessage(`Started steep in ${folder.uri.fsPath}...`, 3000);
}

function ensureSteep() {
	if (vscode.workspace.workspaceFolders) {
		const folders: Set<vscode.WorkspaceFolder> = new Set(vscode.workspace.workspaceFolders)
		_clientSessions.forEach((client, folder) => {
			if (!folders.has(folder)) {
				stopSteep(folder)
			}
		})

		vscode.workspace.workspaceFolders.forEach(folder => {
			console.log(`Checking if steep should start in ${folder.uri}...`)
			if (folder.uri.scheme === "file") {
				const file = vscode.Uri.file(`${folder.uri.path}/Steepfile`)
				if (existsSync(file.fsPath)) {
					startSteep(folder)
				}
			}
		})
	}
}

export function activate(context: vscode.ExtensionContext) {
	let disposable = vscode.commands.registerCommand('steep.restartAll', () => {
		vscode.workspace.workspaceFolders?.forEach((folder) => {
			stopSteep(folder)
			startSteep(folder)
		})
	});

	context.subscriptions.push(disposable);

	vscode.workspace.onDidChangeWorkspaceFolders(() => {
		ensureSteep()
	})

	ensureSteep()
}

export function deactivate() {
	_clientSessions.forEach((session, _) => {
		session.stop()
	})
}

export function restartAll() {
	console.log(`restartAll`);
}
