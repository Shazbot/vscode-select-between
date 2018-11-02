"use strict";
import * as vscode from "vscode";
import * as escapeStringRegexp from "escape-string-regexp";
import { Selection, Position } from "vscode";
import { InlineInput } from "./inline-input";

function findNextMatch(editor: vscode.TextEditor, input: string, numParentBrackets: number) {
  let lastIndex: number | null = null;
  let currentLineNum = editor.selection.active.line;
  let lineNum: number;
  for (lineNum = currentLineNum; lineNum <= editor.document.lineCount; lineNum++) {
    lastIndex = null;

    let lineText = editor.document.lineAt(lineNum).text;
    let regex = new RegExp(escapeStringRegexp(input), "g");

    while (regex.exec(lineText) !== null) {
      if (lineNum === currentLineNum) {
        if (regex.lastIndex <= editor.selection.active.character) {
          continue;
        }
      }

      lastIndex = regex.lastIndex;

      --numParentBrackets;

      if (numParentBrackets < 1) {
        break;
      }
    }

    if (lastIndex) {
      if (numParentBrackets < 1) {
        break;
      }
    }
  }

  if (lastIndex) {
    return {
      lineNum: lineNum,
      charIndex: lastIndex
    };
  }

  return null;
}

function findPrevMatch(editor: vscode.TextEditor, input: string, numParentBrackets: number) {
  let lastIndex: number | null = null;
  let currentLineNum = editor.selection.active.line;
  let lineNum: number;
  let lineLength = 0;
  for (lineNum = currentLineNum; lineNum >= 0; lineNum--) {
    lastIndex = null;
    let lineText = editor.document.lineAt(lineNum).text;
    lineLength = editor.document.lineAt(lineNum).range.end.character;
    let regex = new RegExp(escapeStringRegexp(input), "g");

    lineText = lineText
      .split("")
      .reverse()
      .join("");

    while (regex.exec(lineText) !== null) {
      if (lineNum === currentLineNum) {
        if (regex.lastIndex <= lineLength - editor.selection.active.character) {
          continue;
        }
      }

      lastIndex = regex.lastIndex;

      --numParentBrackets;

      if (numParentBrackets < 1) {
        break;
      }
    }

    if (lastIndex) {
      if (numParentBrackets < 1) {
        break;
      }
    }
  }

  if (lastIndex) {
    return {
      lineNum: lineNum,
      charIndex: lineLength - lastIndex + 1
    };
  }

  return null;
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.sayHello", () => {
    let editor = vscode.window.activeTextEditor!;

    if (!editor) {
      return;
    }

    let numParentBrackets: number = 1;

    new InlineInput()
      .show(editor, v => v)
      .then(async (value: string) => {
        if (!value) {
          return;
        }

        let inputAsNumber = Number(value);
        if (inputAsNumber) {
          numParentBrackets = inputAsNumber;
          value = String(
            await new InlineInput().show(editor!, v => v).then((value: string) => {
              return value;
            })
          );

          if (!value) {
            return;
          }
        }

        let findPrev = value;
        let findNext = value;

        if (!value.search(escapeStringRegexp(`"'[](){}`))) {
          return;
        }

        if (/[\(\)]/.test(value)) {
          findPrev = "(";
          findNext = ")";
        }
        if (/[{}]/.test(value)) {
          findPrev = "{";
          findNext = "}";
        }
        if (/[\[\]]/.test(value)) {
          findPrev = "[";
          findNext = "]";
        }

        let prevMatch = findPrevMatch(editor, findPrev, numParentBrackets);
        let nextMatch = findNextMatch(editor, findNext, numParentBrackets);
        if (prevMatch && nextMatch) {
          editor!.selection = new Selection(
            new Position(prevMatch.lineNum, prevMatch.charIndex),
            new Position(nextMatch.lineNum, nextMatch.charIndex - 1)
          );
        }
      })
      .then(() => {})
      .catch(() => {});
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
