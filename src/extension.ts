import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, ExecutableOptions, State } from 'vscode-languageclient/node';
import { existsSync } from 'fs';

const _clientSessions: Map<vscode.WorkspaceFolder, LanguageClient> = new Map();

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

async function stopSteep(folder: vscode.WorkspaceFolder) {
	const client = _clientSessions.get(folder)

	if (client) {
		_clientSessions.delete(folder)

		console.log(`Stopping steep in ${folder.uri}...`)

		const wait = await waitFor(() => client.state !== State.Starting, 150)

		if (!wait) {
			console.error(`Failed to stop steep in ${folder.uri} 💩`)
		} else {
			await client.stop()
		}

		return client
	}
}

async function startSteep(folder: vscode.WorkspaceFolder) {
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
		diagnosticCollectionName: "steeprb"
	};

	const client = new LanguageClient("Steep", serverOptions, clientOptions)
	_clientSessions.set(folder, client)
	await client.start()

	vscode.window.setStatusBarMessage(`Started steep in ${folder.uri.fsPath}...`, 3000);
}

async function ensureSteep() {
	if (vscode.workspace.workspaceFolders) {
		const folders: Set<vscode.WorkspaceFolder> = new Set(vscode.workspace.workspaceFolders)

		for (const [folder, client] of _clientSessions) {
			if (!folders.has(folder)) {
				await stopSteep(folder)
			}
		}

		for (const folder of vscode.workspace.workspaceFolders) {
			console.log(`Checking if steep should start in ${folder.uri}...`)
			if (folder.uri.scheme === "file") {
				const file = vscode.Uri.file(`${folder.uri.path}/Steepfile`)
				if (existsSync(file.fsPath)) {
					await startSteep(folder)
				}
			}
		}
	}
}

export async function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('steep.restartAll', () => {
			vscode.workspace.workspaceFolders?.forEach(async (folder) => {
				const client = _clientSessions.get(folder)
				if (client) {
					await client.restart()
				}
			})
		})
	)

	context.subscriptions.push(
		vscode.workspace.onDidChangeWorkspaceFolders(async () => {
			await ensureSteep()
		})
	)

	await ensureSteep()
}

export function deactivate() {
	_clientSessions.forEach(async (session, _) => {
		await session.dispose()
	})
}
