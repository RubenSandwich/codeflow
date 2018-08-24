import {
  window,
  workspace,
  commands,
  Disposable,
  ExtensionContext,
  StatusBarAlignment,
  StatusBarItem,
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

const DEBUG = false;

const enum CodeFlowStatus {
  Off,
  On,
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
  private status = CodeFlowStatus.Off;

  constructor() {
    if (this.statusBarItem == null) {
      this.statusBarItem = window.createStatusBarItem(StatusBarAlignment.Left);

      this.updateStatusBar();
      this.statusBarItem.show();
    }

    if (platform === 'win32') {
      // chdir to run our custom volume controlling command
      process.chdir(__dirname);
    }

    let subscriptions: Disposable[] = [];

    subscriptions.push(
      commands.registerCommand('codeflow.stop', this.stop, this),
    );

    subscriptions.push(
      commands.registerCommand('codeflow.start', this.start, this),
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
    if (this.status === CodeFlowStatus.On && newState.focused === false) {
      this.backgroundPauseTimeout = setTimeout(() => {
        this.stop();
        this.backgroundPaused = true;
      }, backgroundPauseMins * 1000 * 60);
    } else if (
      this.status === CodeFlowStatus.Off &&
      newState.focused &&
      this.backgroundPaused
    ) {
      this.start();
      this.backgroundPaused = false;
    } else if (this.status === CodeFlowStatus.On && newState.focused) {
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

    // speed range
    const minS = this.minSpeed;
    const maxS = 15; // TODO: Should this be hard coded?

    // volume range
    // log 0 is -Inf, which 0 is greater then
    const minV = Math.max(Math.log(minVolume), 0);
    const maxV = Math.max(Math.log(maxVolume), 0);

    // calculate adjustment factor
    const scale = (maxV - minV) / (maxS - minS);

    const volumeScaled = Math.round(Math.exp(minV + scale * (volume - minS)));

    // Prevent the volume from jumping over 20% in one update
    const volumeDiff = maxVolume - minVolume;
    const currentVolume = this.getSystemVolume();
    const volume20Higher = Math.round(currentVolume + volumeDiff * 0.2);
    const newVolume = Math.min(volumeScaled, volume20Higher);

    // The result can be beyond the maxV if the value is beyond the maxS
    return Math.min(newVolume, maxVolume);
  }

  private getSystemVolume(): number {
    let getSystemVolumeScript;
    switch (platform) {
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

      case 'win32': {
        getSystemVolumeScript = `.\\winVolume.exe`;
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

      case 'win32': {
        setSystemVolumeScript = `.\\winVolume.exe ${volume}`;
        break;
      }

      default: {
        console.log('codeflow is not supported on this platform!');
        return;
      }
    }

    execSync(setSystemVolumeScript);
  }

  private updateVelocity() {
    const { minSpeed } = this;

    const { volumeUpdateInterval } = workspace.getConfiguration('codeflow');
    const nonZeroVolumeUpdateInterval = Math.max(volumeUpdateInterval, 1);

    const velocity =
      (this.changesSinceLastUpdate - this.speed) / nonZeroVolumeUpdateInterval;

    const newSpeed = this.speed + velocity;
    this.speed = Math.max(newSpeed, minSpeed);
    this.changesSinceLastUpdate = 0;

    const volume = this.volumeFromSpeed(this.speed);

    this.setSystemVolume(volume);
    this.updateStatusBar(volume);
  }

  private stop() {
    this.status = CodeFlowStatus.Off;

    clearInterval(this.velocityUpdateTimer);
    this.textChangeListener.dispose();

    this.speed = this.minSpeed;
    this.updateStatusBar();
  }

  private start() {
    const { volumeUpdateInterval } = workspace.getConfiguration('codeflow');
    const nonZeroVolumeUpdateInterval = Math.max(volumeUpdateInterval, 1);

    this.status = CodeFlowStatus.On;

    this.velocityUpdateTimer = setInterval(
      this.updateVelocity.bind(this),
      nonZeroVolumeUpdateInterval * 1000,
    );
    this.textChangeListener = workspace.onDidChangeTextDocument(
      this.onTextChangeEvent,
      this,
    );

    this.updateStatusBar(this.getSystemVolume());
  }

  private updateStatusBar(volume?: number) {
    let statusBarStartText = `$(dashboard)`;
    if (DEBUG) {
      const speedOneSig = Math.round(this.speed * 10) / 10;
      statusBarStartText = `$(dashboard) ${speedOneSig} `;
    }

    let statusBarEndText = `$(mute)`;
    if (this.status === CodeFlowStatus.On) {
      this.statusBarItem.tooltip = 'Stop codeflow';
      this.statusBarItem.command = 'codeflow.stop';

      const newVolume = volume == null ? this.getSystemVolume() : volume;
      statusBarEndText = `$(unmute) ${newVolume}`;
    } else if (this.status === CodeFlowStatus.Off) {
      this.statusBarItem.tooltip = 'Start codeflow';
      this.statusBarItem.command = 'codeflow.start';
    }

    this.statusBarItem.text = `${statusBarStartText} ${statusBarEndText}`;
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
