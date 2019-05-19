# Release Notes

## [1.1.1]

- Turn off debugging mode in release

## [1.1.0]

- Changed volume to change based on a range based on system volume when codeflow starts
- Added `codeflow.volumeRange` settings to change volume range
- Pause codeflow when debugging or executing tasks
- Removed `codeflow.minVolume` and `codeflow.maxVolume` settings as new range system better covers this use case
- `codeflow.backgroundPauseMins` setting changed default to 5 from 20
- `codeflow.volumeUpdateInterval` setting changed default to 10 from 5
- Changed minimum VS Code version to 1.31.0

## [1.0.1]

- Fix README images
- Add banner theme

## [1.0.0]

- Initial release
