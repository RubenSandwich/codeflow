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
  WindowState,
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

  private backgroundPaused: boolean = false;
  private backgroundPauseTimeout: NodeJS.Timer;

  private velocityUpdateTimer: NodeJS.Timer;
  private textChangeListener: Disposable;

  private changesSinceLastUpdate = 0;
  private minSpeed = 0;
  private speed = this.minSpeed;
  private volume = 0;
  private status = CodeFlowStatus.Pause;

  constructor() {
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

    subscriptions.push(
      window.onDidChangeWindowState(this.onDidChangeWindowState, this),
    );

    // create a combined disposable from both event subscriptions
    this.disposable = Disposable.from(...subscriptions);
  }

  private onDidChangeWindowState(newState: WindowState) {
    const {
      backgroundPauseMins,
      backgroundPauseEnabled,
    } = workspace.getConfiguration('codeflow');

    if (backgroundPauseEnabled === false) {
      return;
    }

    // 1. If playing and not focused, start background pause timer
    // 2. If background paused and refocused, restart adjusting volume
    // 3. If refocused and not background paused then background kill pause timer
    if (this.status === CodeFlowStatus.Play && newState.focused === false) {
      this.backgroundPauseTimeout = setTimeout(() => {
        this.pause();
        this.backgroundPaused = true;
      }, backgroundPauseMins * 1000 * 60);
    } else if (
      this.status === CodeFlowStatus.Pause &&
      newState.focused &&
      this.backgroundPaused
    ) {
      this.play();
      this.backgroundPaused = false;
    } else if (this.status === CodeFlowStatus.Play && newState.focused) {
      clearTimeout(this.backgroundPauseTimeout);
      this.backgroundPauseTimeout = null;
      this.backgroundPaused = false;
    }
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
    const { minVolume, maxVolume } = workspace.getConfiguration('codeflow');

    // positions
    const minP = this.minSpeed;
    const maxP = 15; // TODO: Should this be hard coded?

    // The result range
    // log 0 is -Inf, which 0 is greater then
    const minV = Math.max(Math.log(minVolume), 0);
    const maxV = Math.max(Math.log(maxVolume), 0);

    // calculate adjustment factor
    const scale = (maxV - minV) / (maxP - minP);

    const volumeScaled = Math.round(Math.exp(minV + scale * (volume - minP)));

    // Prevent the volume from jumping over 20% in one update
    const volumeDiff = maxVolume - minVolume;
    const volume20Higher = Math.round(this.volume + volumeDiff * 0.2);
    const newVolume = Math.min(volumeScaled, volume20Higher);

    // The result can be beyond the maxV if the value is beyond the maxP
    return Math.min(newVolume, maxVolume);
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
        getSystemVolumeScript =
          "amixer -M get Master | awk '$0~/%/{print $4; exit;}' | tr -d '[]%'";
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
        setSystemVolumeScript = `amixer -M sset Master ${volume}%`;
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
    const { minSpeed } = this;

    const { volumeUpdateInterval } = workspace.getConfiguration('codeflow');
    const nonZeroVolumeUpdateInterval =
      0 > volumeUpdateInterval ? 1 : volumeUpdateInterval;

    const velocity =
      (this.changesSinceLastUpdate - this.speed) / nonZeroVolumeUpdateInterval;

    const newSpeed = this.speed + velocity;
    this.speed = newSpeed > minSpeed ? newSpeed : minSpeed;
    this.changesSinceLastUpdate = 0;

    const speedOneSig = Math.round(this.speed * 10) / 10;
    this.volume = this.volumeFromSpeed(this.speed);

    this.setSystemVolume(this.volume);
    this.statusBarItem.text = `$(dashboard) ${speedOneSig}  $(unmute) ${
      this.volume
    }`;
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
    const { volumeUpdateInterval } = workspace.getConfiguration('codeflow');
    const nonZeroVolumeUpdateInterval =
      0 > volumeUpdateInterval ? 1 : volumeUpdateInterval;

    this.status = CodeFlowStatus.Play;

    this.velocityUpdateTimer = setInterval(
      this.updateVelocity.bind(this),
      nonZeroVolumeUpdateInterval * 1000,
    );
    this.textChangeListener = workspace.onDidChangeTextDocument(
      this.onTextChangeEvent,
      this,
    );

    this.statusBarItem.tooltip = 'Pause Codeflow';
    this.statusBarItem.command = 'codeflow.pause';

    this.volume = this.getSystemVolume();
    this.statusBarItem.text = `$(dashboard) ${this.speed}  $(unmute) ${
      this.volume
    }`;
  }

  public dispose() {
    const { disposable, statusBarItem, textChangeListener } = this;

    disposable.dispose();
    statusBarItem.dispose();
    textChangeListener.dispose();
    clearInterval(this.velocityUpdateTimer);
    clearTimeout(this.backgroundPauseTimeout);
  }
}
