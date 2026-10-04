// Which build is running and where it logs, shown at the foot of Connections
// so a field tester's report can name both.

export interface About {
	/** package.json's version, as built into the app. */
	version: string
	platform: string
	/** The app's own log (src/bridge/log-file.ts). */
	logPath: string
}
