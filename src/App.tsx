
import { useState } from 'react'
import './App.css'

type Question = {
  id: number
  question: string
  answer: string
  time: string
}

const initialQuestions: Question[] = [
  {
    id: 1,
    question: 'Tell me about yourself and your experience with AI.',
    answer:
      'I am a full-stack AI engineer focused on building practical AI products. I work with Python, FastAPI, LLMs, RAG, and modern frontend technologies. I enjoy turning complex workflows into reliable, useful applications.',
    time: '10:42 AM',
  },
  {
    id: 2,
    question: 'How would you design a reliable AI agent?',
    answer:
      'I would start by defining the agent’s task and boundaries, then connect the necessary tools through structured APIs. I would add validation, error handling, human approval for sensitive actions, and observability so every important decision can be traced.',
    time: '10:44 AM',
  },
]

function App() {
  const [activeTab, setActiveTab] = useState('Overview')
  const [isListening, setIsListening] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [questions, setQuestions] = useState(initialQuestions)
  const [copied, setCopied] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [profile, setProfile] = useState(
    'Full-stack AI engineer experienced with Python, FastAPI, LLMs, RAG, and AI agents.',
  )

  const currentQuestion = questions[activeQuestion]

  async function copyAnswer() {
    if (!currentQuestion) return

    try {
      await navigator.clipboard.writeText(currentQuestion.answer)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  function addDemoQuestion() {
    const next: Question = {
      id: Date.now(),
      question: 'How do you evaluate the quality of an AI application?',
      answer:
        'I define measurable evaluation criteria, create representative test cases, and measure accuracy, latency, and cost. For LLM applications, I also evaluate grounding and failure cases, then use production feedback to improve the system.',
      time: new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }

    setQuestions((previous) => [...previous, next])
    setActiveQuestion(questions.length)
    setActiveTab('Session')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">✳</div>
          <div>
            <div className="brand-name">Interview <span>Copilot</span></div>
            <div className="brand-caption">YOUR AI WORKSPACE</div>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>

        <nav className="navigation">
          {[
            { name: 'Overview', icon: '◫' },
            { name: 'Session', icon: '◉' },
            { name: 'History', icon: '↺' },
            { name: 'My profile', icon: '♙' },
          ].map((item) => (
            <button
              key={item.name}
              className={`nav-item ${activeTab === item.name ? 'active' : ''}`}
              onClick={() => {
                setActiveTab(item.name)
                if (item.name === 'My profile') setShowProfile(true)
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
              {item.name === 'Session' && isListening && (
                <span className="live-dot" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="upgrade-card">
            <div className="upgrade-symbol">✦</div>
            <strong>Your next big opportunity.</strong>
            <p>Prepare confidently. One question at a time.</p>
          </div>
          <div className="user-profile">
            <div className="avatar">AI</div>
            <div className="user-info">
              <strong>My workspace</strong>
              <span>Personal edition</span>
            </div>
            <button
              className="icon-button"
              aria-label="Open profile settings"
              onClick={() => setShowProfile(true)}
            >
              ⚙
            </button>
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            Workspace <span>/</span>{' '}
            <strong>{activeTab}</strong>
          </div>
          <div className="topbar-right">
            <div className="status-pill">
              <span className={`status-dot ${isListening ? 'recording' : ''}`} />
              {isListening ? 'Listening' : 'Ready to start'}
            </div>
            <button
              className="top-avatar"
              onClick={() => setShowProfile(true)}
              aria-label="Profile settings"
            >
              AI
            </button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow">
                <span className="sparkle">✳</span> YOUR PERSONAL AI ASSISTANT
              </div>
              <h1>
                Think clearly.
                <br />
                <span>Answer confidently.</span>
              </h1>
              <p className="welcome-description">
                Your interview workspace for thoughtful answers, sharper
                communication, and better preparation.
              </p>
            </div>

            <div className="welcome-decoration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit-core">✳</div>
            </div>
          </section>

          <section className="session-banner">
            <div className="session-banner-icon">
              <span>{isListening ? '◉' : '♫'}</span>
            </div>
            <div className="session-banner-copy">
              <strong>
                {isListening ? 'Your session is active' : 'Ready when you are'}
              </strong>
              <span>
                {isListening
                  ? 'Listening is enabled in the interface. Audio integration is coming next.'
                  : 'Start a practice session and keep everything in one place.'}
              </span>
            </div>
            <button
              className={`primary-button ${isListening ? 'stop-button' : ''}`}
              onClick={() => {
                setIsListening((value) => !value)
                setActiveTab('Session')
              }}
            >
              <span>{isListening ? 'Ⅱ' : '▶'}</span>
              {isListening ? 'Pause session' : 'Start session'}
            </button>
          </section>

          <div className="section-heading">
            <div>
              <h2>{activeTab === 'History' ? 'Past questions' : 'Your workspace'}</h2>
              <p>
                {activeTab === 'History'
                  ? 'Review the questions and answers in this demo.'
                  : 'Everything you need, right where you need it.'}
              </p>
            </div>
            <button className="text-button" onClick={addDemoQuestion}>
              + Add demo question
            </button>
          </div>

          <section className="dashboard-grid">
            <div className="panel question-panel">
              <div className="panel-heading">
                <div className="panel-heading-icon purple">⌘</div>
                <div>
                  <h3>Detected questions</h3>
                  <p>Questions from your practice session</p>
                </div>
                <span className="count-badge">{questions.length}</span>
              </div>

              <div className="question-list">
                {questions.map((item, index) => (
                  <button
                    key={item.id}
                    className={`question-item ${index === activeQuestion ? 'selected' : ''}`}
                    onClick={() => {
                      setActiveQuestion(index)
                      setActiveTab('Session')
                    }}
                  >
                    <span className="question-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="question-copy">
                      <strong>{item.question}</strong>
                      <span>{item.time}</span>
                    </span>
                    <span className="question-arrow">↗</span>
                  </button>
                ))}
              </div>

              <div className="panel-footer">
                <span className="footer-indicator" />
                Demo questions · Audio detection not connected yet
              </div>
            </div>

            <div className="panel answer-panel">
              <div className="panel-heading answer-heading">
                <div className="panel-heading-icon green">✳</div>
                <div>
                  <h3>Suggested answer</h3>
                  <p>Structured, natural, and to the point</p>
                </div>
                <span className="ai-label">AI CONCEPT</span>
              </div>

              {currentQuestion ? (
                <>
                  <div className="answer-question">
                    <span>QUESTION</span>
                    <p>{currentQuestion.question}</p>
                  </div>

                  <div className="answer-content">{currentQuestion.answer}</div>

                  <div className="answer-tips">
                    <span className="tip-icon">✦</span>
                    <p>
                      <strong>Delivery tip</strong>
                      <br />
                      Start with the main point, then support it with a
                      concrete example from your experience.
                    </p>
                  </div>

                  <div className="answer-actions">
                    <button className="secondary-button" onClick={copyAnswer}>
                      {copied ? '✓ Copied' : '▢ Copy answer'}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={addDemoQuestion}
                    >
                      ↻ Next example
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty-state">
                  <span>✳</span>
                  <strong>Your next answer starts here.</strong>
                  <p>Select a question to view its suggested answer.</p>
                </div>
              )}
            </div>
          </section>

          <section className="bottom-grid">
            <div className="mini-panel">
              <div className="mini-icon blue">◷</div>
              <div>
                <span className="mini-label">SESSION STATUS</span>
                <strong>{isListening ? 'In progress' : 'Not started'}</strong>
                <p>{isListening ? 'Practice mode enabled' : 'Ready for practice'}</p>
              </div>
              <span className="mini-arrow">↗</span>
            </div>
            <div className="mini-panel">
              <div className="mini-icon amber">✧</div>
              <div>
                <span className="mini-label">ANSWER LIBRARY</span>
                <strong>{questions.length} sample answers</strong>
                <p>Explore and refine your responses</p>
              </div>
              <span className="mini-arrow">↗</span>
            </div>
          </section>

          <footer className="page-footer">
            <span>INTERVIEW COPILOT <span className="footer-divider">/</span> DESKTOP PREVIEW</span>
            <span>Built for clearer thinking.</span>
          </footer>
        </div>
      </main>

      {showProfile && (
        <div className="modal-backdrop" onClick={() => setShowProfile(false)}>
          <section
            className="profile-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">PERSONALIZATION</span>
                <h2 id="profile-title">Your interview profile</h2>
              </div>
              <button
                className="icon-button close-button"
                onClick={() => setShowProfile(false)}
                aria-label="Close settings"
              >
                ×
              </button>
            </div>
            <p className="modal-description">
              Add your background so future AI suggestions can be tailored to
              your actual experience.
            </p>
            <label htmlFor="profile-text">Your experience and skills</label>
            <textarea
              id="profile-text"
              rows={6}
              value={profile}
              onChange={(event) => setProfile(event.target.value)}
              placeholder="Describe your skills, experience, and projects..."
            />
            <div className="modal-note">
              <span>ⓘ</span> This demo saves your profile in the current
              application session only.
            </div>
            <button
              className="primary-button modal-save"
              onClick={() => setShowProfile(false)}
            >
              Save profile
            </button>
          </section>
        </div>
      )}
    </div>
  )
}

export default App
