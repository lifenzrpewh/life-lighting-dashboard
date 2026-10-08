import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// The faces, bundled into the build (theme.css says why).
import '@fontsource-variable/archivo/wght.css'
import './theme.css'
import { App } from './App.js'
import { PopOut } from './PopOut.js'
import { popoutViewOf } from '../shared/popout.js'

const root = document.getElementById('root')
if (root === null) throw new Error('no #root')
const popout = popoutViewOf(window.location.search)

createRoot(root).render(
	<StrictMode>
		{/* The same page is the kiosk and every pop-out window (src/main/popout.ts). */}
		{popout === null ? <App /> : <PopOut view={popout} />}
	</StrictMode>,
)
