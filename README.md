# codeflow

![logo](https://raw.githubusercontent.com/RubenSandwich/codeflow/master/images/logo@2x.png)

Typing speed controlled volume to increase your flow

## Usage

codeflow aims to keep you in the state of flow by tying your music's volume to your typing speed. So if your really in the state of flow typing lots of characters hopefully the sound of your music's volume increasing will keep you in that state of flow.

(Note: As a side effect this might encourage overly verbose writing. The previous sentence being an example of this as overly is unnecessary; as is this sentence.)

codeflow adds a section to your status bar:  
![codeflow off](https://raw.githubusercontent.com/RubenSandwich/codeflow/master/images/off.png)

Clicking on the status bar section will turn codeflow on:  
![codeflow on](https://raw.githubusercontent.com/RubenSandwich/codeflow/master/images/on.png)

The number next to the volume icon is your current volume.

Some of codeflow's other little details:

- Turns off if the code editor is not focused for 20 minutes and resumes when the code editor is focused again, because everyone takes YouTube breaks
- Increases volume faster when deleting compared to adding characters

## Actions

codeflow defaults to off. To turn it on you must fire the `Start codeflow` action.

- `Start codeflow`: Start codeflow for the current workspace
- `Stop codeflow`: Stop codeflow for the current workspace

## Settings

- `codeflow.volumeRange`: From your start volume how much higher and lower codeflow can change the volume
- `codeflow.volumeUpdateInterval`: How many seconds to wait before updating the volume, defaults to 10 seconds.
- `codeflow.backgroundPauseEnabled`: Should codeflow restart when background paused and refocused? Defaults to true.
- `codeflow.backgroundPauseMins`: How many minutes to wait while VS Code is not focused to background pause, defaults to 5 minutes.

## FAQ

**Q: How does codeflow change system volume?**  
A: It uses shell commands that can control system volume. This depends on the OS but here are the commands used:

- Linux: `amixer`
- OS X: AppleScript run with `osascript`
- Windows: `winVolume.exe`, this is a custom program because Windows has no default way to set system volume from the command line. Here is the source code for [winVolume.exe](https://gist.github.com/RubenSandwich/54a84db6765a1c355a9c91523220041b). A VS project that builds this code will be included in future release of codeflow. (In cause you want to build it by hand.)

**Q: Does codeflow log key presses?**  
A: No, codeflow only uses number of character changed in the active document to determine 'velocity' to update the volume. It never peeks at the actual characters changed. codeflow is open source and always will be, this is the code that watches characters [changed](https://github.com/RubenSandwich/codeflow/blob/master/src/extension.ts#L108). Your privacy and security will _never_ be abused by codeflow.

**Q: Why does codeflow have winVolume.exe?**  
A: `winVolume.exe` exists because Windows has no default way to set system volume from the command line. Here is the source code for [winVolume.exe](https://gist.github.com/RubenSandwich/54a84db6765a1c355a9c91523220041b). A VS project that builds this code will be included in future release of codeflow. (In cause you want to build it by hand.)
