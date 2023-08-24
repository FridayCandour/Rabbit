import { button, img } from "cradova";
import { throttle } from "./tools";
import {
  ACTION_TYPES,
  BEHAVIOR_TYPES,
  DocumentAction,
  SyntheticAction,
} from "./types";

export class Rabbit {
  _el: HTMLElement;
  _undoStack: string[] = [];
  _redoStack: string[] = [];
  _STACK_SIZE: number = 1000;
  _STACKING_TIME: number = 600;
  _toolsList = {};
  _syntheticActionList = [];
  selection: string | null = null;
  selectedElement: HTMLParagraphElement | null = null;
  range: Range | null = null;
  _actionList: Record<ACTION_TYPES, ((e: any) => void)[]> = {
    input: [],
    paste: [],
    copy: [],
    contextmenu: [],
    "document-selectionchange": [],
  };
  constructor({
    STACK_SIZE,
    STACKING_TIME,
  }: { STACK_SIZE?: number; STACKING_TIME?: number } = {}) {
    if (STACK_SIZE) {
      this._STACK_SIZE = STACK_SIZE;
    }
    if (STACKING_TIME) {
      this._STACKING_TIME = STACKING_TIME;
    }
  }
  installOn(id: string = "pub") {
    const el = document.getElementById(id)!;
    if (window.innerWidth < 600) {
      el.className = "rabbit-editor-container mobile";
    } else {
      el.className = "rabbit-editor-container";
    }
    el!.contentEditable = "true";
    this._el = el;
    this._createDefaultTools();
    this._createDefaultActions();
    this._installTools();
    this._ActivateActions();
    this._el!.focus();
  }

  installTool(
    name: BEHAVIOR_TYPES,
    tool: {
      text?: string;
      tooling: (context: {
        selection: string | null;
        range: Range | null;
        selectedElement: HTMLParagraphElement | null;
      }) => void;
      image?: string;
      html?: HTMLDivElement;
    }
  ) {
    //! checking type
    this._toolsList[name] = tool;
  }
  installAction(type: ACTION_TYPES, action: (e: any) => void) {
    //! checking type
    if (this._actionList[type]) {
      this._actionList[type].push(action);
    } else {
      this._actionList[type] = [action];
    }
  }
  fireSyntheticAction(type: SyntheticAction) {
    // @ts-ignore
    this._syntheticActionList[type]?.call();
  }
  _createDefaultActions() {
    // auto format
    const autoformat = async () => {
      const selection = window.getSelection()!;
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        const lineText = node.textContent || "";
        if (lineText && node.parentNode?.nodeName !== "P") {
          const pElement = document.createElement("p");
          pElement.textContent = lineText;
          // @ts-ignore
          node.remove();
          range.deleteContents();
          range.insertNode(pElement);
          selection.removeRange(range);
          this._el.focus();
        }
      }
      this._el.focus();
    };
    // auto get selection content
    const getSelection = async () => {
      const select = window.getSelection()!;
      if (select.rangeCount > 0) {
        const range = select.getRangeAt(0);
        const node = range.startContainer;
        const lineText = node.textContent || "";
        if (lineText && node.parentNode?.nodeName === "P") {
          this.selection = range.toString() as unknown as string;
          // this.selection = lineText as unknown as string;
          this.selectedElement =
            node.parentNode as unknown as HTMLParagraphElement;
          this.range = range as typeof range;
        }
        if (lineText && node.parentNode?.nodeName === "SPAN") {
          node.parentNode as unknown as HTMLParagraphElement;
        }
      }
    };
    // auto format
    const auto_format_throttler = throttle(autoformat, 500);
    // auto save
    const auto_save_throttler = throttle(() => {
      this._saveState();
    }, this._STACKING_TIME);
    this._actionList["input"].push(auto_save_throttler, auto_format_throttler);
    this._actionList["document-selectionchange"].push(getSelection);
  }
  _createDefaultTools() {
    const ins = this;
    this._toolsList["redo"] = {
      text: "Redo",
      tooling() {
        ins._redo();
      },
    };
    this._toolsList["undo"] = {
      text: "Undo",
      tooling() {
        ins._undo();
        if (ins._undoStack.length > ins._STACK_SIZE) {
          ins._undoStack.length = ins._STACK_SIZE;
        }
      },
    };
  }
  _installTools() {
    const toolContainer = document.createElement("div");
    if (window.innerWidth < 600) {
      toolContainer.className = "rabbit-tool-container mobile";
    } else {
      toolContainer.className = "rabbit-tool-container";
    }
    for (const command in this._toolsList) {
      let l: HTMLElement | null = null;
      if (this._toolsList[command].image) {
        l = img({
          src: this._toolsList[command].image,
          className: "rabbit-tool",
        });
      }
      if (this._toolsList[command].text) {
        l = button(this._toolsList[command].text, { className: "rabbit-tool" });
      }
      if (this._toolsList[command].html) {
        this._toolsList[command].html.className = "rabbit-tool";
        l = this._toolsList[command].html;
      }
      l!.addEventListener("click", () => this._apply(command));
      toolContainer.appendChild(l!);
    }
    this._el.parentElement?.appendChild(toolContainer);
  }
  async _apply(command) {
    const fn = this._toolsList[command].tooling;
    fn({
      selectedElement: this.selectedElement,
      selection: this.selection,
      range: this.range,
    });
    this._el.focus();
  }
  // Method for saving editor state
  _saveState() {
    const content = this._el.innerHTML;
    // @ts-ignore
    if (content !== this._undoStack.at(-1)) {
      this._undoStack.push(content);
      this._redoStack = [];
    }
  }

  // Method for undoing changes
  _undo() {
    if (this._undoStack.length > 0) {
      const currentState = this._el.innerHTML;
      this._redoStack.push(currentState);
      const previousState = this._undoStack.pop();
      if (previousState) {
        this._el.innerHTML = previousState;
      }
    }
  }
  // Method for redoing changes
  _redo() {
    if (this._redoStack.length > 0) {
      const currentState = this._el.innerHTML;
      this._undoStack.push(currentState);

      const nextState = this._redoStack.pop();
      if (nextState) {
        this._el.innerHTML = nextState;
      }
    }
  }
  _ActivateActions() {
    for (const [type, actions] of Object.entries(this._actionList)) {
      for (let i = 0; i < actions.length; i++) {
        if (type.includes("document-")) {
          document.addEventListener(type.split("document-")[1], actions[i]);
        } else if (type.includes("synthetic-")) {
          this._syntheticActionList[type] = actions[0];
        } else {
          this._el.addEventListener(type, actions[i]);
        }
      }
    }
  }
}