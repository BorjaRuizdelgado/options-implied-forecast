import React from 'react'

export default function ContactPage() {
  return (
    <section className="legal-page">
      <div className="section-heading">
        <h1>Contact</h1>
        <p>Questions, suggestions, or bug reports — happy to hear from you.</p>
      </div>

      <div className="terminal-card legal-card">
        <p>
          The quickest way to reach me is by email. Whether it's a feature idea, a data issue, or
          just a hello — drop me a line and I'll get back to you.
        </p>
        <p style={{ marginTop: '1rem' }}>
          <a href="mailto:borjafruizdelgado@gmail.com" className="page-link">
            borjafruizdelgado@gmail.com
          </a>
        </p>
      </div>
    </section>
  )
}
