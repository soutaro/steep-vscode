# Steep VSCode Integration

This extension is to integrate [Steep](https://github.com/soutaro/steep) to Visual Studio Code.
It has LSP features including:

* On-the-fly error reporting
* Hover for method calls and variables
* Completion for method names and variables

## Commands and options

* *Restart all* command restarts all Steep processes running for the VSCode. Try this command if something is not working correctly.
* *Loglevel* option allows to control log level of Steep command. If you set `debug`, many debug prints will be printed and will help you debugging Steep.
* *Steepfile* option allows to change the `Steepfile` path.
* *Gemfile* option allows to change the `Gemfile` path.

## How it works

When you open folder in VSCode, it checks if there is a `Steepfile` in the directory.
When `Steepfile` is found, it starts Steep by `bundle exec steep langserver`.

If you have a binstub `bin/steep`, it will be used instead of `bundle exec steep`. (`bin/steep langserver`)

Requirements are:

1. You have to have `Steepfile` in the root of the folder. You can change the filename via `steepfile` option.
2. You have to use Bundler.

## Acknowledgments

I want to thank [@wata727](https://github.com/wata727) for his works related to language server protocol support.
He implemented the initial version of VSCode extension ([wata727/vscode-steep-lsc](https://github.com/wata727/vscode-steep-lsc)) and [LSP support in Steep](https://github.com/soutaro/steep/pull/79).
