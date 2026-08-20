import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './screens.css'
import { getGame, GAMES } from './game/games'
import * as engine from './game/engine'

// QA hook: lets a harness step a game's update/draw loop deterministically,
// without depending on requestAnimationFrame (which never fires in a hidden
// tab, making the canvas otherwise impossible to inspect).
;(window as unknown as Record<string, unknown>).__opensight = { getGame, GAMES, engine }

// Start fetching the optotype face immediately so it is resident before the
// first activity draws. This kicks the load off rather than blocking on it;
// `font-display: block` keeps optotypes from painting in a fallback glyph.
void document.fonts.load('32px Sloan').catch(() => undefined)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
