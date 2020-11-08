"use strict";
import * as vscode from "vscode";
import * as escapeStringRegexp from "escape-string-regexp";
import { InlineInput } from "./inline-input";
import { Selection, Position } from "vscode";
var balanced = require("balanced-match");

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
      charIndex: lastIndex,
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

    lineText = lineText.split("").reverse().join("");

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
      charIndex: lineLength - lastIndex + 1,
    };
  }

  return null;
}

type hitMatch = { startPos: Position; endPos: Position; fromBottomCount: number } | null;

function getHit(
  findPrev: string,
  findNext: string,
  text: string,
  hitLengthOriginal: number,
  offsetOriginal: number,
  editor: vscode.TextEditor,
  depth: number,
  maxDepth: number
): hitMatch {
  let hit;
  let hitLength = hitLengthOriginal;
  let active = editor.selection.active;

  let offset = 0;
  if (offsetOriginal) {
    offset = offsetOriginal;
  }

  while ((hit = balanced(findPrev, findNext, text))) {
    offset += 1;
    let startPos = editor.document.positionAt(hit.start + hitLength + offset);
    let endPos = editor.document.positionAt(hit.end + hitLength + offset);
    if (active.isAfterOrEqual(startPos) && active.isBeforeOrEqual(endPos.translate(0, -1))) {
      let bodyMatch = getHit(
        findPrev,
        findNext,
        hit.body,
        hit.pre.length + hitLength,
        offset,
        editor,
        depth + 1,
        maxDepth
      );

      let fromBottomCount = 1;
      if (bodyMatch) {
        if (bodyMatch.fromBottomCount >= maxDepth) {
          return bodyMatch;
        }

        fromBottomCount += 1;
      }

      return { startPos: startPos, endPos: endPos, fromBottomCount: fromBottomCount };
    }

    hitLength += hit.end;
    text = hit.post;
  }

  return null;
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.selectBetween", () => {
    let editor = vscode.window.activeTextEditor!;

    if (!editor) {
      return;
    }

    let numParentBrackets: number = 1;

    new InlineInput()
      .show(editor, (v) => v)
      .then(async (value: string) => {
        if (!value) {
          return;
        }

        let inputAsNumber = Number(value);
        if (inputAsNumber) {
          numParentBrackets = inputAsNumber;
          value = String(
            await new InlineInput()
              .show(editor!, (v) => v)
              .then((value: string) => {
                return value;
              })
          );

          if (!value) {
            return;
          }
        }

        let findPrev = value;
        let findNext = value;

        if (!value.search(escapeStringRegexp(`"'[](){}<>`))) {
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
        if (/[<>]/.test(value)) {
          findPrev = "<";
          findNext = ">";
        }

        let text = editor.document.getText();

        if (value === `'` || value === `"`) {
          let prevMatch = findPrevMatch(editor, findPrev, numParentBrackets);
          let nextMatch = findNextMatch(editor, findNext, numParentBrackets);
          if (prevMatch && nextMatch) {
            editor!.selection = new Selection(
              new Position(prevMatch.lineNum, prevMatch.charIndex),
              new Position(nextMatch.lineNum, nextMatch.charIndex - 1)
            );
          }
        } else {
          let hit = <hitMatch>getHit(findPrev, findNext, text, 0, 0, editor, 1, numParentBrackets);
          if (hit) {
            let lineDelta = 0;
            let charDelta = -1;
            editor!.selection = new Selection(hit.startPos, hit.endPos.translate(lineDelta, charDelta));
          }
        }
      })
      .then(() => {})
      .catch(() => {});
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}
