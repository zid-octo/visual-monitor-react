import { useState, useEffect } from 'react'
import './App.css'

/* ── GitHub API helpers ─────────────────────────────────────── */

const GH_OWNER = 'zid-octo'
const GH_REPO  = 'visual-monitor-react'

async function ghRequest(pat, endpoint, init = {}) {
  const res = await fetch(
    `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/${endpoint}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        ...init.headers,
      },
    }
  )
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message || `GitHub API ${res.status}`)
  }
  return res.status === 204 ? null : res.json()
}

function toBase64(str) {
  let binary = ''
  new TextEncoder().encode(str).forEach(b => (binary += String.fromCharCode(b)))
  return btoa(binary)
}

async function fetchCompetitors(pat) {
  const data = await ghRequest(pat, 'contents/competitors.json')
  return {
    entries: JSON.parse(atob(data.content.replace(/\s/g, ''))),
    sha: data.sha,
  }
}

async function commitCompetitors(pat, entries, sha, message) {
  await ghRequest(pat, 'contents/competitors.json', {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: toBase64(JSON.stringify(entries, null, 2) + '\n'),
      sha,
    }),
  })
}

async function triggerWorkflow(pat) {
  await ghRequest(pat, 'actions/workflows/deploy.yml/dispatches', {
    method: 'POST',
    body: JSON.stringify({ ref: 'main' }),
  })
}

/* ── StatusBadge ────────────────────────────────────────────── */

function StatusBadge({ changed, isNew, diffPercent }) {
  if (isNew)   return <span className="badge badge-new">New Baseline</span>
  if (changed) return <span className="badge badge-changed">Changed {diffPercent}%</span>
  return <span className="badge badge-ok">Stable</span>
}

/* ── ManagePanel ────────────────────────────────────────────── */

function ManagePanel({ pat, onSaveToken, onAdd, busy, notice }) {
  const [patDraft, setPatDraft] = useState(pat)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')

  function handleSaveToken(e) {
    e.preventDefault()
    onSaveToken(patDraft.trim())
  }

  function handleAdd(e) {
    e.preventDefault()
    onAdd(name.trim(), url.trim())
  }

  return (
    <div className="manage-panel">
      <div className="manage-inner">
        {notice && (
          <div className={`notice ${notice.ok ? 'notice-ok' : 'notice-err'}`}>
            {notice.msg}
          </div>
        )}

        <div className="manage-section">
          <h3>GitHub Token</h3>
          <form className="manage-row" onSubmit={handleSaveToken}>
            <div className="input-group">
              <label htmlFor="pat-input">
                Personal Access Token — needs <code>repo</code> and <code>workflow</code> scopes
              </label>
              <input
                id="pat-input"
                type="password"
                className="input input-wide"
                placeholder="github_pat_…"
                value={patDraft}
                onChange={e => setPatDraft(e.target.value)}
                autoComplete="current-password"
                spellCheck={false}
              />
            </div>
            <button type="submit" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }}>
              Save token
            </button>
          </form>
        </div>

        <div className="manage-section">
          <h3>Add Competitor</h3>
          <form className="manage-row" onSubmit={handleAdd}>
            <div className="input-group">
              <label htmlFor="new-name">Name</label>
              <input
                id="new-name"
                type="text"
                className="input"
                placeholder="Acme Corp"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="input-group">
              <label htmlFor="new-url">URL</label>
              <input
                id="new-url"
                type="url"
                className="input input-wide"
                placeholder="https://example.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !pat}
              style={{ alignSelf: 'flex-end' }}
            >
              {busy ? 'Working…' : 'Add'}
            </button>
          </form>
          {!pat && (
            <p className="manage-hint">Save a GitHub token above to enable adds and removals.</p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── CompetitorCard ─────────────────────────────────────────── */

function CompetitorCard({ site, managing, onDelete }) {
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
        <div className="card-header-right">
          <StatusBadge
            changed={site.changed}
            isNew={site.isNew}
            diffPercent={site.diffPercent}
          />
          {managing && (
            <button
              className="btn btn-danger"
              onClick={() => onDelete(site.url, site.name)}
            >
              Remove
            </button>
          )}
        </div>
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

/* ── App ────────────────────────────────────────────────────── */

export default function App() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [lastRun, setLastRun] = useState(null)

  const [managing, setManaging] = useState(false)
  const [pat, setPat] = useState(() => localStorage.getItem('vm_pat') ?? '')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    fetch('./data.json')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setSites(data)
        if (data.length > 0) {
          const latest = data.reduce((a, b) =>
            new Date(a.timestamp) > new Date(b.timestamp) ? a : b
          )
          setLastRun(latest.timestamp)
        }
      })
      .catch(err => setFetchError(err.message))
      .finally(() => setLoading(false))
  }, [])

  // Auto-dismiss notice after 6 s
  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  function showNotice(ok, msg) { setNotice({ ok, msg }) }

  function handleSaveToken(newPat) {
    setPat(newPat)
    if (newPat) {
      localStorage.setItem('vm_pat', newPat)
      showNotice(true, 'Token saved.')
    } else {
      localStorage.removeItem('vm_pat')
      showNotice(true, 'Token cleared.')
    }
  }

  async function handleAdd(name, url) {
    if (!pat) return showNotice(false, 'No token saved — enter one above.')
    setBusy(true)
    try {
      const { entries, sha } = await fetchCompetitors(pat)
      if (entries.some(e => e.url === url)) {
        return showNotice(false, 'That URL is already in competitors.json.')
      }
      await commitCompetitors(
        pat,
        [...entries, { name, url }],
        sha,
        `feat: add ${name} to competitors`
      )
      await triggerWorkflow(pat)
      showNotice(true, `"${name}" added. Scraper workflow triggered — dashboard updates shortly.`)
    } catch (err) {
      showNotice(false, err.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(url, name) {
    if (!pat) return showNotice(false, 'No token saved — enter one above.')
    if (!window.confirm(`Remove "${name}" from competitors.json?`)) return
    setBusy(true)
    try {
      const { entries, sha } = await fetchCompetitors(pat)
      await commitCompetitors(
        pat,
        entries.filter(e => e.url !== url),
        sha,
        `feat: remove ${name} from competitors`
      )
      await triggerWorkflow(pat)
      showNotice(true, `"${name}" removed. Scraper workflow triggered.`)
    } catch (err) {
      showNotice(false, err.message)
    } finally {
      setBusy(false)
    }
  }

  const changedCount = sites.filter(s => s.changed).length
  const stableCount  = sites.filter(s => !s.changed && !s.isNew).length
  const newCount     = sites.filter(s => s.isNew).length

  return (
    <div className="app">
      <header className="header">
        <div className="header-top">
          <div>
            <h1 className="header-title">Visual Monitor</h1>
            <p className="header-sub">Automated competitor screenshot tracking</p>
          </div>
          <div className="header-actions">
            {lastRun && (
              <p className="header-meta">
                Last run: {new Date(lastRun).toLocaleString()}
              </p>
            )}
            <button
              className={`btn-manage${managing ? ' btn-manage-active' : ''}`}
              onClick={() => setManaging(m => !m)}
            >
              {managing ? '✕ Close' : '⚙ Manage'}
            </button>
          </div>
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

      {managing && (
        <ManagePanel
          pat={pat}
          onSaveToken={handleSaveToken}
          onAdd={handleAdd}
          busy={busy}
          notice={notice}
        />
      )}

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
            {sites.map(site => (
              <CompetitorCard
                key={site.url}
                site={site}
                managing={managing}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
