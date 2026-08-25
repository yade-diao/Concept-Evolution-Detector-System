/**
 * The shell: a title, two pages, and a note about where the computation runs.
 *
 * Two pages and no more. The tool does one thing - run the detector on a
 * benchmark and show what it found - and the second page is there because the
 * premise of the method is unusual enough that a user who does not read it will
 * misread the result.
 */

import { NavLink, Route, Routes } from 'react-router-dom'

import { MethodView } from './views/MethodView'
import { RunView } from './views/RunView'

export function App() {
  return (
    <div className="shell">
      <header>
        <div>
          <p className="eyebrow">CED-FS · feature stream</p>
          <h1>Concept Evolution Detector</h1>
          <p className="subtitle">
            The stream runs along the feature axis: the samples stay, the
            features arrive. This watches concepts appear, move and disappear as
            they do — clustered in this browser, not on a server.
          </p>
        </div>
        <nav>
          <NavLink to="/" end>Run</NavLink>
          <NavLink to="/method">Method</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<RunView />} />
          <Route path="/method" element={<MethodView />} />
          <Route path="*" element={<RunView />} />
        </Routes>
      </main>

      <footer>
        <a href="https://github.com/yade-diao/Concept-Evolution-Detector-System">
          Source, and the tests that hold this port to the Python reference
        </a>
      </footer>
    </div>
  )
}
