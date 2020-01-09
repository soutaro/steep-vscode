# Steep VSCode Integration

This extension supports using Steep with Visual Studio Code.

## Installation

This extension is not published yet. Build yourself and install to your VSCode.

```
$ npm install
$ npx vsce package
$ code --install-extension steep-vscode-0.0.1.vsix    # Or install it from GUI
```

## How it works

When you open folder in VSCode, it checks if there is a `Steepfile` in the directory.
When `Steepfile` is found, it starts Steep by `bundle exec steep langserver`.

Requirements are:

1. You have to have `Steepfile` in the root of the folder.
2. You have to use Bundler.

## Acknowledgments

I want to thank [@wata727](https://github.com/wata727) for his works related to language server protocol support.
He implemented the initial version of VSCode extension ([wata727/vscode-steep-lsc](https://github.com/wata727/vscode-steep-lsc)) and [LSP support in Steep](https://github.com/soutaro/steep/pull/79).
