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

import { execSync } from 'child_process';
import { platform } from 'process';

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
  private minSpeed = 0;
  private speed = this.minSpeed;
  private status = CodeFlowStatus.Pause;

  private minVolume = 5;
  private maxVolume = 25;

  constructor() {
    const { velocityUpdateTime, speed } = this;

    if (this.statusBarItem == null) {
      this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);

      this.statusBarItem.tooltip = 'Start Codeflow';
      this.statusBarItem.command = 'codeflow.play';
      this.statusBarItem.text = `$(dashboard) $(mute)`;
      this.statusBarItem.show();
    }

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

  private volumeFromSpeed(volume) {
    // positions
    const minP = 0;
    const maxP = 15;

    // The result range
    const minV = Math.log(this.minVolume);
    const maxV = Math.log(this.maxVolume);

    // calculate adjustment factor
    const scale = (maxV - minV) / (maxP - minP);

    const valueScaled = Math.round(Math.exp(minV + scale * (volume - minP)));

    // The result can be beyond the maxV if the value is beyond the maxP
    return Math.min(valueScaled, this.maxVolume);
  }

  private getSystemVolume(): number {
    let getSystemVolumeScript;
    switch (process.platform) {
      case 'darwin': {
        getSystemVolumeScript =
          "osascript -e 'output volume of (get volume settings)'";
        break;
      }

      case 'linux': {
        getSystemVolumeScript = 'amixer -M get Master';
        break;
      }

      default: {
        console.log('codeflow is not supported on this platform!');
        return 0;
      }
    }

    const currentVolume = execSync(getSystemVolumeScript).toString();
    return parseInt(currentVolume, 10);
  }

  private setSystemVolume(volume: number) {
    let setSystemVolumeScript;
    switch (process.platform) {
      case 'darwin': {
        setSystemVolumeScript = `osascript -e 'set volume output volume ${volume}'`;
        break;
      }

      case 'linux': {
        setSystemVolumeScript = `amixer sset 'Master' ${volume}%`;
        break;
      }

      default: {
        console.log('codeflow is not supported on this platform!');
        return 0;
      }
    }

    execSync(setSystemVolumeScript);
  }

  private updateVelocity() {
    const { minSpeed, velocityUpdateTime } = this;

    const velocity =
      (this.changesSinceLastUpdate - this.speed) / velocityUpdateTime;

    const newSpeed = this.speed + velocity;
    this.speed = newSpeed > minSpeed ? newSpeed : minSpeed;
    this.changesSinceLastUpdate = 0;

    const speedOneSig = Math.round(this.speed * 10) / 10;
    const volume = this.volumeFromSpeed(this.speed);

    this.setSystemVolume(volume);
    this.statusBarItem.text = `$(dashboard) ${speedOneSig}  $(unmute) ${volume}`;
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

    const volume = this.getSystemVolume();
    this.statusBarItem.text = `$(dashboard) ${this.speed}  $(unmute) ${volume}`;
  }

  public dispose() {
    const { disposable, statusBarItem, textChangeListener } = this;

    disposable.dispose();
    statusBarItem.dispose();
    textChangeListener.dispose();
    clearInterval(this.velocityUpdateTimer);
  }
}
