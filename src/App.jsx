import { useState, useEffect } from 'react'
import './App.css'

function StatusBadge({ changed, isNew, diffPercent }) {
  if (isNew) return <span className="badge badge-new">New Baseline</span>
  if (changed) return <span className="badge badge-changed">Changed {diffPercent}%</span>
  return <span className="badge badge-ok">Stable</span>
}

function CompetitorCard({ site }) {
  return (
    <div className={`card${site.changed ? ' card-changed' : ''}`}>
      <div className="card-header">
        <div className="card-meta">
          <h2 className="card-title">{site.name}</h2>
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card-url"
          >
            {site.url}
          </a>
        </div>
        <StatusBadge
          changed={site.changed}
          isNew={site.isNew}
          diffPercent={site.diffPercent}
        />
      </div>

      <p className="card-timestamp">
        Last checked: {new Date(site.timestamp).toLocaleString()}
      </p>

      {site.error ? (
        <div className="card-error">{site.error}</div>
      ) : (
        <div className={`card-images${site.changed ? ' card-images-split' : ''}`}>
          {site.baselineImage && (
            <div className="image-block">
              <p className="image-label">{site.changed ? 'Baseline' : 'Current'}</p>
              <img
                src={site.baselineImage}
                alt={`${site.name} baseline screenshot`}
                loading="lazy"
              />
            </div>
          )}
          {site.changed && site.diffImage && (
            <div className="image-block">
              <p className="image-label">Pixel Diff</p>
              <img
                src={site.diffImage}
                alt={`${site.name} diff`}
                loading="lazy"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function App() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [lastRun, setLastRun] = useState(null)

  useEffect(() => {
    fetch('./data.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        setSites(data)
        if (data.length > 0) {
          const latest = data.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b
          )
          setLastRun(latest.timestamp)
        }
      })
      .catch((err) => setFetchError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const changedCount = sites.filter((s) => s.changed).length
  const stableCount = sites.filter((s) => !s.changed && !s.isNew).length
  const newCount = sites.filter((s) => s.isNew).length

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="header-title">Visual Monitor</h1>
            <p className="header-sub">Automated competitor screenshot tracking</p>
          </div>
          {lastRun && (
            <p className="header-meta">
              Last run: {new Date(lastRun).toLocaleString()}
            </p>
          )}
        </div>

        {!loading && !fetchError && sites.length > 0 && (
          <div className="stats-row">
            <div className="stat">
              <span className="stat-num">{sites.length}</span>
              <span className="stat-lbl">Monitored</span>
            </div>
            <div className="stat">
              <span className={`stat-num${changedCount > 0 ? ' num-warn' : ''}`}>
                {changedCount}
              </span>
              <span className="stat-lbl">Changed</span>
            </div>
            <div className="stat">
              <span className="stat-num">{stableCount}</span>
              <span className="stat-lbl">Stable</span>
            </div>
            {newCount > 0 && (
              <div className="stat">
                <span className="stat-num num-new">{newCount}</span>
                <span className="stat-lbl">New</span>
              </div>
            )}
          </div>
        )}
      </header>

      <main className="main">
        {loading && (
          <div className="state-center">
            <div className="spinner" />
            <p>Loading monitoring data…</p>
          </div>
        )}

        {fetchError && (
          <div className="state-center">
            <p className="state-error">Could not load data.json: {fetchError}</p>
            <p className="state-hint">
              Run <code>node scraper.js</code> locally or trigger the GitHub
              Actions workflow to generate it.
            </p>
          </div>
        )}

        {!loading && !fetchError && sites.length === 0 && (
          <div className="state-center">
            <p>No monitoring data yet.</p>
            <p className="state-hint">
              Add sites to <code>competitors.json</code> and run the scraper.
            </p>
          </div>
        )}

        {!loading && !fetchError && sites.length > 0 && (
          <div className="grid">
            {sites.map((site) => (
              <CompetitorCard key={site.url} site={site} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
