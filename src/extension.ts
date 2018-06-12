import {
  window,
  workspace,
  commands,
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
} from 'vscode';

// Biorhythm?
export function activate(ctx: ExtensionContext) {
  let controller = new CodeFlowController();
  ctx.subscriptions.push(controller);
}

const enum CodeFlowStatus {
  Pause = 'Pause',
  Play = 'Play',
}

class CodeFlowController {
  private statusBarItem: StatusBarItem;
  private disposable: Disposable;

  private velocityUpdateTimer: NodeJS.Timer;
  private textChangeListener: Disposable;

  private velocityUpdateTime = 5;
  private changesSinceLastUpdate = 0;
  private minSpeed = 1;
  private speed = this.minSpeed;
  private status = CodeFlowStatus.Play;

  constructor() {
    const { velocityUpdateTime, speed } = this;

    if (this.statusBarItem == null) {
      this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);
      this.statusBarItem.text = `$(dashboard) ${speed}`;
      this.statusBarItem.tooltip = 'Pause Codeflow';
      this.statusBarItem.command = 'codeflow.pause';
      this.statusBarItem.show();
    }

    this.velocityUpdateTimer = setInterval(
      this.updateVelocity.bind(this),
      velocityUpdateTime * 1000,
    );
    this.textChangeListener = workspace.onDidChangeTextDocument(
      this.onTextChangeEvent,
      this,
    );

    let subscriptions: Disposable[] = [];

    subscriptions.push(
      commands.registerCommand('codeflow.pause', this.pause, this),
    );

    subscriptions.push(
      commands.registerCommand('codeflow.play', this.play, this),
    );

    // create a combined disposable from both event subscriptions
    this.disposable = Disposable.from(...subscriptions);
  }

  private onTextChangeEvent(event: TextDocumentChangeEvent) {
    const charsChanged = event.contentChanges.reduce(
      (acc, contentChanges: TextDocumentContentChangeEvent) => {
        const { rangeLength } = contentChanges;
        const changes = rangeLength === 0 ? 1 : rangeLength;

        return acc + changes;
      },
      0,
    );

    this.changesSinceLastUpdate += charsChanged;
  }

  private updateVelocity() {
    const { minSpeed, velocityUpdateTime } = this;

    const velocity =
      (this.changesSinceLastUpdate - this.speed) / velocityUpdateTime;

    const newSpeed = this.speed + velocity;
    this.speed = newSpeed > minSpeed ? newSpeed : minSpeed;
    this.changesSinceLastUpdate = 0;

    const speedOneSig = Math.round(this.speed * 10) / 10;
    this.statusBarItem.text = `$(dashboard) ${speedOneSig}`;
  }

  private pause() {
    this.status = CodeFlowStatus.Pause;

    clearInterval(this.velocityUpdateTimer);
    this.textChangeListener.dispose();

    this.speed = this.minSpeed;
    this.statusBarItem.tooltip = 'Start Codeflow';
    this.statusBarItem.command = 'codeflow.play';
    this.statusBarItem.text = `$(dashboard) $(mute)`;
  }

  private play() {
    this.status = CodeFlowStatus.Play;

    this.velocityUpdateTimer = setInterval(
      this.updateVelocity.bind(this),
      this.velocityUpdateTime * 1000,
    );
    this.textChangeListener = workspace.onDidChangeTextDocument(
      this.onTextChangeEvent,
      this,
    );

    this.statusBarItem.tooltip = 'Pause Codeflow';
    this.statusBarItem.command = 'codeflow.pause';
    this.statusBarItem.text = `$(dashboard) ${this.speed}`;
  }

  public dispose() {
    const { disposable, statusBarItem, textChangeListener } = this;

    disposable.dispose();
    statusBarItem.dispose();
    textChangeListener.dispose();
    clearInterval(this.velocityUpdateTimer);
  }
}
