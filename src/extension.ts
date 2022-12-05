import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, ExecutableOptions, State, WorkspaceFolder } from 'vscode-languageclient/node';
import { existsSync } from 'fs';

const _clientSessions: Map<vscode.WorkspaceFolder, LanguageClient> = new Map();

async function stopSteep(folder: vscode.WorkspaceFolder) {
	console.log(`Stopping steep in ${folder.uri}...`)

	const client = _clientSessions.get(folder)!

	_clientSessions.delete(folder)

	await waitFor(() => client.state !== State.Starting, 150)

	try {
		await client.dispose()
		await client.outputChannel.dispose()
	} catch {
		// Disposing client may fail
	}
}

// Start Steep if `Steepfile` exists, and register the `LanguageClient` to `_clientSessions`
//
async function startSteep(folder: vscode.WorkspaceFolder) {
	const file = vscode.Uri.file(`${folder.uri.path}/Steepfile`)
	if (!existsSync(file.fsPath)) {
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
	const jobs = vscode.workspace.getConfiguration('steep').get("jobs")
	let serverOptions: ServerOptions

	const binstub = vscode.Uri.file(`${folder.uri.path}/bin/steep`)
	const jobsOption = jobs ? [`--jobs=${jobs}`] : []
	if (existsSync(binstub.fsPath)) {
		console.log("Detected bin/steep...")
		serverOptions = {
			command: "bin/steep",
			args: ["langserver", `--log-level=${loglevel}`, ...jobsOption],
			options: options
		}
	} else {
		console.log("Using bundle exec to start steep...")
		serverOptions = {
			command: "bundle",
			args: ["exec", "steep", "langserver", `--log-level=${loglevel}`, ...jobsOption],
			options: options
		}
	}

	const clientOptions: LanguageClientOptions = {
		documentSelector: ['ruby', 'ruby-signature', 'rbs'],
		diagnosticCollectionName: "steeprb",
		outputChannel: vscode.window.createOutputChannel("Steep")
	};

	const client = new LanguageClient("Steep", serverOptions, clientOptions)
	_clientSessions.set(folder, client)
	try {
		await client.start()
	} catch {
		// Ignore start failure
	}
}

async function waitFor(predicate: () => boolean, attempts: number, interval: number = 100) {
	let count = 0

	while (true) {
		if (predicate()) {
			return count
		}

		if (count > attempts) {
			return false
		}

		await new Promise(s => setTimeout(s, interval))

		count++
	}
}

async function ensureSteepInFolder(folder: vscode.WorkspaceFolder) {
	console.log(`ensureSteepInFolder: ${folder.uri}...`)
	if (folder.uri.scheme === "file") {
		if (_clientSessions.has(folder)) {
			await stopSteep(folder)
		}

		await startSteep(folder)
	}
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('steep.restartAll', async () => {
			if (vscode.workspace.workspaceFolders) {
				for (const folder of vscode.workspace.workspaceFolders) {
					await ensureSteepInFolder(folder)
				}
			}
		})
	)

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
			console.log("onDidChangeWorkspaceFolders:", event)

			for (const folder of event.added) {
				startSteep(folder)
			}
			for (const folder of event.removed) {
				if (_clientSessions.has(folder)) {
					stopSteep(folder)
				}
			}
		})
	)

	if (vscode.workspace.workspaceFolders) {
		for (const folder of vscode.workspace.workspaceFolders) {
			await ensureSteepInFolder(folder)
		}
	}
}

export async function deactivate() {
	for (const [folder, session] of _clientSessions) {
		await stopSteep(folder)
	}
}
