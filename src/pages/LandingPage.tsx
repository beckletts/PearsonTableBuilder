import { Link } from 'react-router-dom';
import PearsonNav from '../components/layout/PearsonNav';
import './LandingPage.css';

export default function LandingPage() {
  return (
    <div>
      <PearsonNav />
      <main className="landing">
        <div className="landing__hero">
          <div className="landing__hero-inner">
            <span className="badge badge-blue" style={{ marginBottom: 16 }}>Internal Pearson tool</span>
            <h1 className="landing__title">Turn spreadsheets into<br />interactive tables</h1>
            <p className="landing__sub">
              Upload a CSV or Excel file. AI configures the table for you. Share a link — no developer needed.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <Link to="/signup" className="btn btn-primary btn-lg">Get started free</Link>
              <Link to="/login" className="btn btn-secondary btn-lg">Sign in</Link>
            </div>
          </div>
        </div>

        <div className="landing__steps">
          <h2 className="landing__section-title">How it works</h2>
          <div className="landing__steps-grid">
            {[
              { n: '1', title: 'Upload', desc: 'Drag in your CSV or Excel file. Works with any Pearson spreadsheet.' },
              { n: '2', title: 'AI configures', desc: 'Claude analyses your data and suggests the best filters, search, and display settings.' },
              { n: '3', title: 'Customise', desc: 'Review the suggestions, rename columns, toggle visibility — no code required.' },
              { n: '4', title: 'Share', desc: 'Publish your table and share the link. Your team can search and filter it instantly.' },
            ].map((step) => (
              <div key={step.n} className="landing__step card">
                <div className="landing__step-num">{step.n}</div>
                <h3 className="landing__step-title">{step.title}</h3>
                <p className="landing__step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="landing__cta">
          <h2>Ready to get started?</h2>
          <p className="text-soft mt-8">Sign up with your Pearson email address.</p>
          <Link to="/signup" className="btn btn-primary btn-lg" style={{ marginTop: 20 }}>Create your first table →</Link>
        </div>
      </main>
    </div>
  );
}
