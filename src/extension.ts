import * as vscode from 'vscode';
import { DiagnosticSeverity } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, ExecutableOptions, State, WorkspaceFolder } from 'vscode-languageclient/node';
import { existsSync } from 'fs';
import { shellParse } from 'shell-args';

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
	const steepfileName = vscode.workspace.getConfiguration('steep').get<string>("steepfile") ?? 'Steepfile'
	const file = vscode.Uri.file(`${folder.uri.path}/${steepfileName}`)
	if (!existsSync(file.fsPath)) {
		return
	}

	const gemfileName = vscode.workspace.getConfiguration('steep').get<string>("gemfile")
	const loglevel = vscode.workspace.getConfiguration('steep').get("loglevel")
	const jobs = vscode.workspace.getConfiguration('steep').get("jobs")
	const enabled = vscode.workspace.getConfiguration('steep').get('enabled')
	const command = vscode.workspace.getConfiguration('steep').get('command') as string
	const yjit = vscode.workspace.getConfiguration('steep').get('enableYJIT', true)
	const severityFilter = vscode.workspace.getConfiguration('steep').get('hideDiagnostics') as string

	if (!enabled) {
		vscode.window.setStatusBarMessage(`Steep is disabled: ${folder.uri.fsPath}`, 3000);
		return
	}

	let severityThreshold: DiagnosticSeverity | undefined = undefined
	switch (severityFilter) {
		case "Error":
			severityThreshold = DiagnosticSeverity.Error
			break
		case "Warning":
			severityThreshold = DiagnosticSeverity.Warning
			break
		case "Information":
			severityThreshold = DiagnosticSeverity.Information
			break
		case "Hint":
			severityThreshold = DiagnosticSeverity.Hint
			break
	}

	console.log(`Starting steep in ${folder.uri}...`)

	let rubyopt = process.env.RUBYOPT

	const env = { ...process.env }
	env.RUBYOPT = `${ rubyopt || "" } -EUTF-8`
	if (gemfileName) {
		env.BUNDLE_GEMFILE = gemfileName
	}
	if (yjit) {
		env.RUBY_YJIT_ENABLE = "true"
	}
	const options: ExecutableOptions = {
		cwd: folder.uri.fsPath,
		env: env,
		shell: true
	}

	let serverOptions: ServerOptions

	const binstub = vscode.Uri.file(`${folder.uri.path}/bin/steep`)
	const jobsOption = jobs ? [`--jobs=${jobs}`] : []
	const cmdOptions = ["langserver", `--log-level=${loglevel}`, `--steepfile=${steepfileName}`, ...jobsOption]
	if (command.length > 0) {
		const [cmd, ...cmds] = shellParse(command)
		console.log(`Command is specified:`, [cmd, ...cmds])
		serverOptions = {
			command: cmd,
			args: [...cmds, ...cmdOptions],
			options: options
		}
	} else {
		if (existsSync(binstub.fsPath)) {
			console.log("Detected bin/steep...")
			serverOptions = {
				command: "bin/steep",
				args: cmdOptions,
				options: options
			}
		} else {
			console.log("Using bundle exec to start steep...")
			serverOptions = {
				command: "bundle",
				args: ["exec", "steep", ...cmdOptions],
				options: options
			}
		}
	}

	const clientOptions: LanguageClientOptions = {
		documentSelector: ['ruby', 'ruby-signature', 'rbs'],
		diagnosticCollectionName: "steeprb",
		outputChannel: vscode.window.createOutputChannel("Steep"),
		middleware: {
			handleDiagnostics(uri, diagnostics, next) {
				const threshold = severityThreshold
				if (threshold !== undefined) {
					diagnostics = diagnostics.filter(diagnostic => diagnostic.severity < threshold)
				}
				next(uri, diagnostics)
			},
		}
	};

	const client = new LanguageClient("Steep", serverOptions, clientOptions)

	_clientSessions.set(folder, client)
	try {
		await client.start()

		const steepVersion = client.initializeResult?.serverInfo?.version

		if (steepVersion) {
			const components = steepVersion.split(".")
			vscode.commands.executeCommand('setContext', 'steep.serverVersion', steepVersion)
			vscode.commands.executeCommand('setContext', 'steep.serverMajorVersion', parseInt(components[0], 10))
			vscode.commands.executeCommand('setContext', 'steep.serverMinorVersion', parseInt(components[1], 10))
		} else {
			vscode.commands.executeCommand('setContext', 'steep.serverVersion', undefined)
			vscode.commands.executeCommand('setContext', 'steep.serverMajorVersion', 0)
			vscode.commands.executeCommand('setContext', 'steep.serverMinorVersion', 0)
		}
	} catch {
		// Ignore start failure
		vscode.window.setStatusBarMessage(`Failed to start steep. See OUTPUT for trouble shooting: ${folder.uri.fsPath}`, 3000);
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
		vscode.commands.registerCommand('steep.typecheckAll', async () => {
			if (vscode.workspace.workspaceFolders) {
				for (const folder of vscode.workspace.workspaceFolders) {
					const client = _clientSessions.get(folder)
					if (client) {
						await client.sendNotification("$/steep/typecheck/groups", { groups: [] })
					}
				}
			}
		})
	)

	context.subscriptions.push(
		vscode.commands.registerCommand('steep.typecheckGroups', async () => {
			const groups = [] as string[]

			if (vscode.workspace.workspaceFolders) {
				for (const folder of vscode.workspace.workspaceFolders) {
					const client = _clientSessions.get(folder)
					if (client) {
						const result = await client.sendRequest<string[]>("$/steep/groups")
						for (const g of result) {
							if (groups.indexOf(g) == -1) {
								groups.push(g)
							}
						}
					}
				}
			}

			if (groups.length == 0) {
				return
			}

			const items: vscode.QuickPickItem[] = groups.map(group => {
				const title = group.indexOf(".") == -1 ? "target" : "group"
				return { label: group, description: title }
			})

			const selectedItems = await vscode.window.showQuickPick(items, {
					canPickMany: true,
					placeHolder: "Select the targets/groups to type check",
			});

			if (selectedItems) {
				if (selectedItems.length > 0) {
					if (vscode.workspace.workspaceFolders) {
						for (const folder of vscode.workspace.workspaceFolders) {
							const client = _clientSessions.get(folder)
							if (client) {
								await client.sendNotification("$/steep/typecheck/groups", { groups: selectedItems.map(item => item.label) })
							}
						}
					}
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
